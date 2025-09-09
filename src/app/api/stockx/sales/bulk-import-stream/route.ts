import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { getDocuments, addDocument, updateDocument } from '@/lib/firebase/firebaseUtils';
import { StockXSale } from '@/lib/types/stockx';

export async function POST(request: NextRequest) {
  const { userId, maxSales = 2000 } = await request.json();

  console.log('🚀 Starting streaming bulk StockX sales import for user:', userId);

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

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      const sendUpdate = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendUpdate({
          type: 'status',
          phase: 'starting',
          message: 'Connecting to StockX API...',
          progress: 5
        });

        let currentAccessToken = accessToken;
        let allSales: StockXSale[] = [];
        let pageNumber = 1;
        let hasNextPage = true;
        const pageSize = 100;

        sendUpdate({
          type: 'status',
          phase: 'fetching',
          message: 'Starting to fetch sales data...',
          progress: 10
        });

        // Phase 1: Fetch all sales with real-time updates
        while (hasNextPage && allSales.length < maxSales) {
          sendUpdate({
            type: 'progress',
            phase: 'fetching',
            message: `Fetching page ${pageNumber}... (${allSales.length} sales found so far)`,
            currentPage: pageNumber,
            salesFound: allSales.length,
            progress: Math.min(10 + (pageNumber * 2), 60)
          });

          const queryParams = new URLSearchParams({
            pageNumber: pageNumber.toString(),
            pageSize: pageSize.toString(),
            orderStatus: 'COMPLETED'
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
              sendUpdate({
                type: 'status',
                phase: 'refreshing',
                message: 'Refreshing authentication...',
                progress: Math.min(10 + (pageNumber * 2), 60)
              });

              const refreshResult = await refreshStockXTokens(refreshToken);
              
              if (refreshResult.success) {
                currentAccessToken = refreshResult.accessToken;
                continue;
              } else {
                throw new Error('Token refresh failed');
              }
            }

            if (response.ok) {
              const data = await response.json();
              
              if (data.orders && Array.isArray(data.orders)) {
                const pageSales = processSalesData(data.orders);
                allSales.push(...pageSales);
                
                sendUpdate({
                  type: 'progress',
                  phase: 'fetching',
                  message: `Page ${pageNumber} processed: +${pageSales.length} sales (Total: ${allSales.length})`,
                  currentPage: pageNumber,
                  salesFound: allSales.length,
                  pageResults: pageSales.length,
                  progress: Math.min(10 + (pageNumber * 2), 60)
                });
                
                hasNextPage = data.hasNextPage && data.orders.length > 0;
              } else {
                sendUpdate({
                  type: 'warning',
                  message: `Page ${pageNumber}: No orders found or invalid format`,
                  progress: Math.min(10 + (pageNumber * 2), 60)
                });
                hasNextPage = false;
              }
            } else {
              throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            pageNumber++;
            
            // Small delay to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));

          } catch (error) {
            sendUpdate({
              type: 'error',
              phase: 'fetching',
              message: `Error on page ${pageNumber}: ${error.message}`,
              progress: Math.min(10 + (pageNumber * 2), 60)
            });
            hasNextPage = false;
          }
        }

        sendUpdate({
          type: 'status',
          phase: 'saving',
          message: `Fetching complete! Found ${allSales.length} sales. Now saving to database...`,
          totalSales: allSales.length,
          progress: 70
        });

        if (allSales.length === 0) {
          sendUpdate({
            type: 'complete',
            success: false,
            message: 'No sales found. Check your StockX account or try again.',
            totalSales: 0,
            progress: 100
          });
          controller.close();
          return;
        }

        // Phase 2: Save to Firebase with progress updates
        sendUpdate({
          type: 'status',
          phase: 'saving',
          message: 'Saving to StockX collection...',
          progress: 75
        });

        await saveSalesToStockxCollection(allSales, userId, sendUpdate);

        sendUpdate({
          type: 'status',
          phase: 'saving',
          message: 'Saving to main sales table...',
          progress: 85
        });

        await saveSalesToMainCollection(allSales, userId, sendUpdate);

        const breakdown = {
          completed: allSales.filter(s => s.status === 'PAYOUT_COMPLETED').length,
          authenticated: allSales.filter(s => s.status === 'AUTHENTICATED').length,
          other: allSales.filter(s => !['PAYOUT_COMPLETED', 'AUTHENTICATED'].includes(s.status)).length
        };

        sendUpdate({
          type: 'complete',
          success: true,
          message: `✅ Successfully imported ${allSales.length} StockX sales!`,
          totalSales: allSales.length,
          breakdown,
          progress: 100
        });

      } catch (error: any) {
        console.error('❌ Streaming import failed:', error);
        sendUpdate({
          type: 'error',
          phase: 'failed',
          message: error.message || 'Import failed',
          error: error.stack,
          progress: 100
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
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
        totalPayout: totalPayout || (salePrice - sellerFees),
        currency: order.currency || 'USD',
        sellerLevel: order.sellerLevel,
        feePercentage: order.feePercentage
      },
      createdAt: order.createdAt || order.created,
      updatedAt: order.updatedAt || order.updated,
      payoutDate: order.payoutDate,
      source: 'stockx_bulk_import_stream',
      needsPayoutRefresh: false
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
  
  const firstWord = productName.split(' ')[0];
  return firstWord || 'Unknown Brand';
}

async function saveSalesToStockxCollection(sales: StockXSale[], userId: string, sendUpdate: Function) {
  const existingSales = await getDocuments('stockxSales');
  const userSalesMap = new Map(
    existingSales
      .filter((sale: any) => sale.userId === userId)
      .map((sale: any) => [sale.stockxOrderId, sale])
  );

  let savedCount = 0;
  let updatedCount = 0;
  const total = sales.length;

  for (let i = 0; i < sales.length; i++) {
    const sale = sales[i];
    const existingSale = userSalesMap.get(sale.orderNumber);
    
    if (existingSale) {
      if (existingSale.saleData.status !== sale.status || 
          existingSale.saleData.pricing.totalPayout !== sale.pricing.totalPayout) {
        await updateDocument('stockxSales', existingSale.id, {
          saleData: sale,
          updatedAt: new Date().toISOString()
        });
        updatedCount++;
      }
    } else {
      await addDocument('stockxSales', {
        userId: userId,
        stockxOrderId: sale.orderNumber,
        saleData: sale,
        createdAt: new Date().toISOString(),
        source: 'stockx_bulk_import_stream'
      });
      savedCount++;
    }

    // Send progress update every 10 sales
    if (i % 10 === 0 || i === sales.length - 1) {
      sendUpdate({
        type: 'progress',
        phase: 'saving',
        message: `Saving to StockX collection: ${i + 1}/${total} (${savedCount} new, ${updatedCount} updated)`,
        progress: 75 + Math.floor((i / total) * 5)
      });
    }
  }
}

async function saveSalesToMainCollection(sales: StockXSale[], userId: string, sendUpdate: Function) {
  const existingSales = await getDocuments('sales');
  const userSalesMap = new Map(
    existingSales
      .filter((sale: any) => sale.userId === userId)
      .map((sale: any) => [sale.orderNumber, sale])
  );

  let savedCount = 0;
  let updatedCount = 0;
  const total = sales.length;

  for (let i = 0; i < sales.length; i++) {
    const sale = sales[i];
    const existingSale = userSalesMap.get(sale.orderNumber);
    
    const mainSaleData = {
      userId: userId,
      product: sale.product.productName,
      brand: sale.product.brand,
      size: sale.variant.size,
      orderNumber: sale.orderNumber,
      salePrice: sale.pricing.salePrice,
      purchasePrice: 0,
      fees: sale.pricing.sellerFees,
      profit: sale.pricing.totalPayout,
      date: sale.createdAt,
      platform: 'stockx',
      market: 'StockX',
      status: sale.status === 'PAYOUT_COMPLETED' ? 'completed' : 'pending',
      imageUrl: sale.product.imageUrl || '',
      source: 'stockx_bulk_import_stream',
      stockxData: {
        orderType: sale.orderType,
        productId: sale.product.productId,
        variantId: sale.variant.variantId,
        totalPayout: sale.pricing.totalPayout,
        originalStatus: sale.status
      }
    };
    
    if (existingSale) {
      if (existingSale.status !== mainSaleData.status) {
        await updateDocument('sales', existingSale.id, {
          ...mainSaleData,
          updatedAt: new Date().toISOString()
        });
        updatedCount++;
      }
    } else {
      await addDocument('sales', {
        ...mainSaleData,
        createdAt: new Date().toISOString()
      });
      savedCount++;
    }

    // Send progress update every 10 sales
    if (i % 10 === 0 || i === sales.length - 1) {
      sendUpdate({
        type: 'progress',
        phase: 'saving',
        message: `Saving to main sales table: ${i + 1}/${total} (${savedCount} new, ${updatedCount} updated)`,
        progress: 85 + Math.floor((i / total) * 10)
      });
    }
  }
}
