import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';
import { StockXSale } from '@/lib/types/stockx';

// Process sales data helper (same as in sales route)
function processSalesData(rawData: any): StockXSale[] {
  console.log(`🔄 Processing seller orders data`);
  
  // Handle different response formats
  let orders = [];
  if (rawData.orders && Array.isArray(rawData.orders)) {
    orders = rawData.orders;
  } else if (rawData.data && Array.isArray(rawData.data)) {
    orders = rawData.data;
  } else if (Array.isArray(rawData)) {
    orders = rawData;
  }

  return orders.map((order: any): StockXSale => {
    // Determine order type based on order number format
    let orderType: 'STANDARD' | 'FLEX' | 'DIRECT' | 'DFS' = 'STANDARD';
    if (order.orderNumber?.startsWith('02-')) {
      orderType = 'FLEX';
    } else if (order.orderNumber?.startsWith('06-')) {
      orderType = 'DIRECT';
    }

    // Map status to our TypeScript enum
    const mapStatus = (status: string) => {
      const statusMap: Record<string, any> = {
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

    // Extract payout data if available per StockX documentation
    const payoutData = order.payout || order.payoutDetails || {};
    
    // Calculate fees - prefer totalAdjustments from payout object
    let sellerFees = 0;
    
    if (payoutData.totalAdjustments !== undefined) {
      sellerFees = Math.abs(parseFloat(payoutData.totalAdjustments || '0'));
    } else {
      const processingFee = parseFloat(order.processingFee || '0');
      const transactionFee = parseFloat(order.transactionFee || '0');
      const shippingFee = parseFloat(order.shippingFee || '0');
      const paymentProcessingFee = parseFloat(order.paymentProcessingFee || '0');
      sellerFees = processingFee + transactionFee + shippingFee + paymentProcessingFee;
      
      if (sellerFees === 0 && order.totalFees) {
        sellerFees = parseFloat(order.totalFees || '0');
      }
    }

    const saleData: StockXSale = {
      id: order.id || order.orderId || order.orderNumber,
      orderNumber: order.orderNumber || order.id,
      orderType,
      status: mapStatus(order.status),
      product: {
        productId: order.product?.id || order.productId || '',
        productName: order.product?.productName || order.product?.name || order.productName || 'Unknown Product',
        brand: order.product?.brand || order.brand || 'Unknown Brand',
        styleId: order.product?.sku || order.sku || order.styleId,
        retailPrice: order.product?.retailPrice,
        imageUrl: order.product?.imageUrl || order.imageUrl,
        category: order.product?.category,
        urlKey: order.product?.urlKey
      },
      variant: {
        variantId: order.variant?.id || order.variantId || '',
        size: order.variant?.size || order.size || 'Unknown',
        sizeType: order.variant?.sizeType
      },
      pricing: {
        salePrice: parseFloat(order.amount || order.salePrice || order.price || '0'),
        buyerPaid: parseFloat(order.amount || order.buyerPaid || order.salePrice || order.price || '0'),
        sellerFees,
        processingFee: parseFloat(order.processingFee || '0'),
        shippingFee: parseFloat(order.shippingFee || '0'),
        transactionFee: parseFloat(order.transactionFee || '0'),
        paymentProcessingFee: parseFloat(order.paymentProcessingFee || '0'),
        totalPayout: payoutData.totalPayout !== undefined 
          ? parseFloat(payoutData.totalPayout || '0')
          : (parseFloat(order.amount || order.salePrice || order.price || '0') - sellerFees),
        currency: order.currency || 'USD',
        sellerLevel: order.sellerLevel,
        feePercentage: order.feePercentage
      },
      authentication: order.authenticationDetails ? {
        status: order.authenticationDetails.status || 'PENDING',
        verificationDate: order.authenticationDetails.verifiedAt,
        failureReason: order.authenticationDetails.failureReason
      } : undefined,
      shipping: order.shipping || order.shipment ? {
        trackingNumber: order.tracking || order.shipment?.trackingNumber,
        carrier: order.carrier || order.shipment?.carrier,
        shippedDate: order.shippedAt || order.shipment?.shippedAt,
        deliveredDate: order.deliveredAt || order.shipment?.deliveredAt,
        shippingLabel: order.shippingLabel,
        isDirectShip: orderType === 'DIRECT'
      } : undefined,
      createdAt: order.createdAt || order.created,
      updatedAt: order.updatedAt || order.updated,
      payoutDate: order.payoutDate,
      source: 'stockx_api'
    };

    return saleData;
  });
}

export async function GET(request: NextRequest) {
  console.log('📊 StockX Export All Sales API Request');

  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken) {
    return NextResponse.json(
      { 
        error: 'No access token found', 
        message: 'Please authenticate with StockX first',
        authRequired: true
      },
      { status: 401 }
    );
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing StockX API key configuration' },
      { status: 500 }
    );
  }

  // Set up SSE response for progress updates
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let currentAccessToken = accessToken;
      
      // Send initial connection message
      controller.enqueue(encoder.encode('data: {"type":"connected","message":"Starting export of all StockX sales..."}\n\n'));

      try {
        let allSales: StockXSale[] = [];
        
        // Fetch completed sales
        let pageNumber = 1;
        let hasNextPage = true;
        const pageSize = 100; // Maximum allowed per API docs
        
        console.log('📦 Starting to fetch completed sales...');
        controller.enqueue(encoder.encode('data: {"type":"status","message":"Fetching completed sales..."}\n\n'));
        
        while (hasNextPage) {
          const queryParams = new URLSearchParams({
            pageNumber: pageNumber.toString(),
            pageSize: pageSize.toString(),
            orderStatus: 'COMPLETED'
          });
          
          const apiUrl = `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`;
          console.log(`🛒 Fetching page ${pageNumber}: ${apiUrl}`);
          
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'x-api-key': apiKey,
              'Authorization': `Bearer ${currentAccessToken}`,
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
          });

          // Handle token refresh if needed
          if (response.status === 401 && refreshToken) {
            console.log('🔄 Token expired, attempting refresh...');
            const refreshResult = await refreshStockXTokens(refreshToken);
            
            if (refreshResult.success && refreshResult.accessToken) {
              currentAccessToken = refreshResult.accessToken;
              // Retry the request with new token
              const retryResponse = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                  'x-api-key': apiKey,
                  'Authorization': `Bearer ${refreshResult.accessToken}`,
                  'Accept': 'application/json',
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                }
              });
              
              if (retryResponse.ok) {
                const data = await retryResponse.json();
                const processedSales = processSalesData(data);
                allSales = allSales.concat(processedSales);
                
                console.log(`✅ Page ${pageNumber}: Retrieved ${processedSales.length} sales (Total: ${allSales.length})`);
                controller.enqueue(encoder.encode(`data: {"type":"progress","pageNumber":${pageNumber},"salesInPage":${processedSales.length},"totalSales":${allSales.length},"status":"completed"}\n\n`));
                
                hasNextPage = data.hasNextPage || false;
                pageNumber++;
              } else {
                throw new Error(`Failed to fetch page ${pageNumber} after token refresh`);
              }
            } else {
              throw new Error('Token refresh failed');
            }
          } else if (response.ok) {
            const data = await response.json();
            const processedSales = processSalesData(data);
            allSales = allSales.concat(processedSales);
            
            console.log(`✅ Page ${pageNumber}: Retrieved ${processedSales.length} sales (Total: ${allSales.length})`);
            controller.enqueue(encoder.encode(`data: {"type":"progress","pageNumber":${pageNumber},"salesInPage":${processedSales.length},"totalSales":${allSales.length},"status":"completed"}\n\n`));
            
            hasNextPage = data.hasNextPage || false;
            pageNumber++;
          } else {
            const errorText = await response.text();
            console.error(`❌ Error fetching page ${pageNumber}:`, response.status, errorText);
            throw new Error(`Failed to fetch page ${pageNumber}: ${response.status}`);
          }
          
          // Small delay between requests to avoid rate limiting
          if (hasNextPage) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        // Now fetch active sales
        pageNumber = 1;
        hasNextPage = true;
        const activeSalesStart = allSales.length;
        
        console.log('📦 Starting to fetch active sales...');
        controller.enqueue(encoder.encode('data: {"type":"status","message":"Fetching active sales..."}\n\n'));
        
        while (hasNextPage) {
          const queryParams = new URLSearchParams({
            pageNumber: pageNumber.toString(),
            pageSize: pageSize.toString()
          });
          
          const apiUrl = `https://api.stockx.com/v2/selling/orders/active?${queryParams.toString()}`;
          console.log(`🛒 Fetching active sales page ${pageNumber}`);
          
          try {
            const response = await fetch(apiUrl, {
              method: 'GET',
              headers: {
                'x-api-key': apiKey,
                'Authorization': `Bearer ${currentAccessToken}`,
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
              }
            });

            if (response.ok) {
              const data = await response.json();
              const processedSales = processSalesData(data);
              allSales = allSales.concat(processedSales);
              
              console.log(`✅ Active page ${pageNumber}: Retrieved ${processedSales.length} sales (Total: ${allSales.length})`);
              controller.enqueue(encoder.encode(`data: {"type":"progress","pageNumber":${pageNumber},"salesInPage":${processedSales.length},"totalSales":${allSales.length},"status":"active"}\n\n`));
              
              hasNextPage = data.hasNextPage || false;
              pageNumber++;
            } else {
              // Active sales might fail if user has none, which is ok
              console.log('No active sales found or error fetching active sales');
              hasNextPage = false;
            }
          } catch (error) {
            console.log('Error fetching active sales:', error);
            hasNextPage = false;
          }
          
          // Small delay between requests
          if (hasNextPage) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        // Send completion message with all sales data
        const completionData = {
          type: 'complete',
          totalSales: allSales.length,
          completedSales: activeSalesStart,
          activeSales: allSales.length - activeSalesStart,
          sales: allSales
        };
        
        console.log(`🎉 Export complete! Total sales: ${allSales.length}`);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(completionData)}\n\n`));
        
      } catch (error) {
        console.error('❌ Export error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        controller.enqueue(encoder.encode(`data: {"type":"error","message":"${errorMessage}"}\n\n`));
      } finally {
        controller.close();
      }
    }
  });

  // Return SSE response
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}