import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { getDocuments, addDocument, updateDocument } from '@/lib/firebase/firebaseUtils';
import { StockXSale } from '@/lib/types/stockx';

export async function POST(request: NextRequest) {
  const { userId, maxSales = 2000 } = await request.json();

  console.log('🚀 Starting bulk StockX sales import for user:', userId);

  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { 
        error: 'Missing authentication', 
        message: 'Please authenticate with StockX first'
      },
      { status: 401 }
    );
  }

  try {
    let currentAccessToken = accessToken;
    let allSales: StockXSale[] = [];
    let pageNumber = 1;
    let hasNextPage = true;
    const pageSize = 100; // Maximum allowed by StockX API

    // Phase 1: Fetch all sales with aggressive pagination
    while (hasNextPage && allSales.length < maxSales) {
      console.log(`📄 Fetching page ${pageNumber} (found ${allSales.length} sales so far)`);

      const queryParams = new URLSearchParams({
        pageNumber: pageNumber.toString(),
        pageSize: pageSize.toString(),
        orderStatus: 'COMPLETED' // Focus on completed sales first
      });

      const apiUrl = `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`;

      try {
        const response = await fetch(apiUrl, {
          headers: {
            'x-api-key': apiKey,
            'Authorization': `Bearer ${currentAccessToken}`,
            'Accept': 'application/json'
          }
        });

        if (response.status === 401 && refreshToken) {
          console.log('🔄 Access token expired, refreshing...');
          const refreshResult = await refreshStockXTokens(refreshToken);
          
          if (refreshResult.success) {
            currentAccessToken = refreshResult.accessToken;
            continue; // Retry with new token
          } else {
            throw new Error('Token refresh failed');
          }
        }

        if (response.ok) {
          const data = await response.json();
          console.log(`📦 Page ${pageNumber} response:`, {
            ordersCount: data.orders?.length || 0,
            hasNextPage: data.hasNextPage,
            totalInThisPage: data.orders?.length || 0
          });

          if (data.orders && Array.isArray(data.orders)) {
            const pageSales = processSalesData(data.orders);
            allSales.push(...pageSales);
            
            console.log(`✅ Processed ${pageSales.length} sales from page ${pageNumber}. Total: ${allSales.length}`);
            
            // Check if we have more pages
            hasNextPage = data.hasNextPage && data.orders.length > 0;
          } else {
            console.log('⚠️ No orders found in response or invalid format');
            hasNextPage = false;
          }
        } else {
          console.error(`❌ API request failed: ${response.status} ${response.statusText}`);
          const errorText = await response.text();
          console.error('Error details:', errorText);
          hasNextPage = false;
        }

        pageNumber++;
        
        // Small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (error) {
        console.error(`❌ Error fetching page ${pageNumber}:`, error);
        hasNextPage = false;
      }
    }

    console.log(`🎯 Finished fetching. Found ${allSales.length} total sales`);

    if (allSales.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No sales found',
        message: 'Could not find any completed sales. Check your StockX account or try again.'
      });
    }

    // Phase 2: Save to Firebase in both collections
    console.log('💾 Saving sales to Firebase...');
    
    await Promise.all([
      saveSalesToStockxCollection(allSales, userId),
      saveSalesToMainCollection(allSales, userId)
    ]);

    console.log(`✅ Successfully imported ${allSales.length} sales`);

    return NextResponse.json({
      success: true,
      totalSales: allSales.length,
      message: `Successfully imported ${allSales.length} StockX sales`,
      breakdown: {
        completed: allSales.filter(s => s.status === 'PAYOUT_COMPLETED').length,
        authenticated: allSales.filter(s => s.status === 'AUTHENTICATED').length,
        other: allSales.filter(s => !['PAYOUT_COMPLETED', 'AUTHENTICATED'].includes(s.status)).length
      }
    });

  } catch (error: any) {
    console.error('❌ Bulk import failed:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}

function processSalesData(orders: any[]): StockXSale[] {
  return orders.map((order: any): StockXSale => {
    // Determine order type
    let orderType: 'STANDARD' | 'FLEX' | 'DIRECT' | 'DFS' = 'STANDARD';
    if (order.orderNumber?.startsWith('02-')) {
      orderType = 'FLEX';
    } else if (order.orderNumber?.startsWith('06-')) {
      orderType = 'DIRECT';
    }

    // Map status
    const mapStatus = (status: string) => {
      const statusMap: Record<string, string> = {
        'MATCHED': 'PENDING',
        'SHIPPED': 'SHIPPED',
        'RECEIVED': 'RECEIVED',
        'AUTHENTICATING': 'AUTHENTICATING',
        'AUTHENTICATED': 'AUTHENTICATED',
        'PAYOUTPENDING': 'PAYOUT_PENDING',
        'PAYOUTCOMPLETED': 'PAYOUT_COMPLETED',
        'CANCELED': 'CANCELLED',
        'AUTHFAILED': 'AUTHENTICATION_FAILED',
        'RETURNED': 'RETURNED'
      };
      return statusMap[status] || status;
    };

    const salePrice = parseFloat(order.amount || order.salePrice || order.price || '0');
    
    // Extract payout data
    const payoutData = order.payout || order.payoutDetails || {};
    const sellerFees = Math.abs(parseFloat(payoutData.totalAdjustments || '0'));
    const totalPayout = parseFloat(payoutData.totalPayout || payoutData.payout || '0');

    return {
      id: order.id || order.orderId || order.orderNumber,
      orderNumber: order.orderNumber || order.id,
      orderType,
      status: mapStatus(order.status),
      product: {
        productId: order.product?.id || order.productId || '',
        productName: order.product?.productName || order.product?.name || order.productName || 'Unknown Product',
        brand: order.product?.brand || order.brand || extractBrandFromName(order.product?.productName || order.product?.name || ''),
        styleId: order.product?.sku || order.sku || order.styleId,
        retailPrice: order.product?.retailPrice,
        imageUrl: order.product?.imageUrl || order.imageUrl,
        category: order.product?.category,
        urlKey: order.product?.urlKey
      },
      variant: {
        variantId: order.variant?.variantId || order.variant?.id || order.variantId || '',
        size: order.variant?.variantValue || order.size || order.variant?.size || 'Unknown',
        sizeType: order.variant?.sizeType || order.sizeType,
        variantName: order.variant?.variantName
      },
      pricing: {
        salePrice: salePrice,
        buyerPaid: salePrice,
        sellerFees,
        processingFee: parseFloat(order.processingFee || '0'),
        shippingFee: parseFloat(order.shippingFee || '0'),
        transactionFee: parseFloat(order.transactionFee || '0'),
        paymentProcessingFee: parseFloat(order.paymentProcessingFee || '0'),
        totalPayout: totalPayout || (salePrice - sellerFees), // Calculate if not provided
        currency: order.currency || 'USD',
        sellerLevel: order.sellerLevel,
        feePercentage: order.feePercentage
      },
      createdAt: order.createdAt || order.created,
      updatedAt: order.updatedAt || order.updated,
      payoutDate: order.payoutDate,
      source: 'stockx_bulk_import',
      needsPayoutRefresh: false // We'll enrich in a separate process if needed
    };
  });
}

function extractBrandFromName(productName: string): string {
  const brands = ['Nike', 'Jordan', 'Adidas', 'Yeezy', 'New Balance', 'Puma', 'Vans', 'Converse', 'Reebok', 'ASICS'];
  const upperName = productName.toUpperCase();
  
  for (const brand of brands) {
    if (upperName.includes(brand.toUpperCase())) {
      return brand;
    }
  }
  
  // Try to extract first word as brand
  const firstWord = productName.split(' ')[0];
  return firstWord || 'Unknown Brand';
}

async function saveSalesToStockxCollection(sales: StockXSale[], userId: string) {
  console.log('💾 Saving to stockxSales collection...');
  
  // Get existing sales to avoid duplicates
  const existingSales = await getDocuments('stockxSales');
  const userSalesMap = new Map(
    existingSales
      .filter((sale: any) => sale.userId === userId)
      .map((sale: any) => [sale.stockxOrderId, sale])
  );

  let savedCount = 0;
  let updatedCount = 0;

  for (const sale of sales) {
    const existingSale = userSalesMap.get(sale.orderNumber);
    
    if (existingSale) {
      // Update if status or payout changed
      if (existingSale.saleData.status !== sale.status || 
          existingSale.saleData.pricing.totalPayout !== sale.pricing.totalPayout) {
        await updateDocument('stockxSales', existingSale.id, {
          saleData: sale,
          updatedAt: new Date().toISOString()
        });
        updatedCount++;
      }
    } else {
      // Add new sale
      await addDocument('stockxSales', {
        userId: userId,
        stockxOrderId: sale.orderNumber,
        saleData: sale,
        createdAt: new Date().toISOString(),
        source: 'stockx_bulk_import'
      });
      savedCount++;
    }
  }

  console.log(`✅ StockX collection: ${savedCount} new, ${updatedCount} updated`);
}

async function saveSalesToMainCollection(sales: StockXSale[], userId: string) {
  console.log('💾 Saving to main sales collection...');
  
  // Get existing sales to avoid duplicates  
  const existingSales = await getDocuments('sales');
  const userSalesMap = new Map(
    existingSales
      .filter((sale: any) => sale.userId === userId)
      .map((sale: any) => [sale.orderNumber, sale])
  );

  let savedCount = 0;
  let updatedCount = 0;

  for (const sale of sales) {
    const existingSale = userSalesMap.get(sale.orderNumber);
    
    // Convert StockX sale to main sales format
    const mainSaleData = {
      userId: userId,
      product: sale.product.productName,
      brand: sale.product.brand,
      size: sale.variant.size,
      orderNumber: sale.orderNumber,
      salePrice: sale.pricing.salePrice,
      purchasePrice: 0, // User can add this manually later
      fees: sale.pricing.sellerFees,
      profit: sale.pricing.totalPayout, // Net payout as profit
      date: sale.createdAt,
      platform: 'stockx',
      market: 'StockX',
      status: sale.status === 'PAYOUT_COMPLETED' ? 'completed' : 'pending',
      imageUrl: sale.product.imageUrl || '',
      source: 'stockx_bulk_import',
      stockxData: {
        orderType: sale.orderType,
        productId: sale.product.productId,
        variantId: sale.variant.variantId,
        totalPayout: sale.pricing.totalPayout,
        originalStatus: sale.status
      }
    };
    
    if (existingSale) {
      // Update if status changed
      if (existingSale.status !== mainSaleData.status) {
        await updateDocument('sales', existingSale.id, {
          ...mainSaleData,
          updatedAt: new Date().toISOString()
        });
        updatedCount++;
      }
    } else {
      // Add new sale
      await addDocument('sales', {
        ...mainSaleData,
        createdAt: new Date().toISOString()
      });
      savedCount++;
    }
  }

  console.log(`✅ Main collection: ${savedCount} new, ${updatedCount} updated`);
}
