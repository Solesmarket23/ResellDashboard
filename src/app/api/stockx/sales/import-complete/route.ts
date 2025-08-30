import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';
import { StockXSale } from '@/lib/types/stockx';

// Use Server-Sent Events (SSE) for real-time progress updates
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status') || 'completed';
  const fromDate = searchParams.get('fromDate');
  const toDate = searchParams.get('toDate');
  
  console.log('🚀 StockX Complete Sales Import Request:', { status, fromDate, toDate });

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

  // Set up SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let currentAccessToken = accessToken;
      let allSales: StockXSale[] = [];
      
      try {
        // Send initial connection message
        controller.enqueue(encoder.encode('data: {"type":"connected","message":"Starting complete sales import..."}\n\n'));

        // First, fetch all sales using pagination
        let hasNextPage = true;
        let pageNumber = 1;
        const pageSize = 100; // Max allowed per StockX API
        
        controller.enqueue(encoder.encode('data: {"type":"phase","phase":"fetching","message":"Fetching sales from StockX..."}\n\n'));
        
        while (hasNextPage) {
          const queryParams = new URLSearchParams({
            pageNumber: pageNumber.toString(),
            pageSize: pageSize.toString()
          });
          
          if (status === 'completed') {
            queryParams.set('orderStatus', 'COMPLETED');
          }
          
          const apiUrl = status === 'completed' 
            ? `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`
            : `https://api.stockx.com/v2/selling/orders/active?${queryParams.toString()}`;
            
          console.log(`📄 Fetching page ${pageNumber}: ${apiUrl}`);
          
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
            
            if (response.status === 401 && refreshToken) {
              // Token expired, refresh and retry
              const refreshResult = await refreshStockXTokens(refreshToken);
              if (refreshResult.success && refreshResult.accessToken) {
                currentAccessToken = refreshResult.accessToken;
                
                // Retry with new token
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
                  const pageSales = processSalesData(data);
                  allSales.push(...pageSales);
                  hasNextPage = data.hasNextPage || false;
                  
                  controller.enqueue(encoder.encode(
                    `data: {"type":"progress","phase":"fetching","page":${pageNumber},"salesFetched":${allSales.length},"hasNextPage":${hasNextPage}}\n\n`
                  ));
                } else {
                  throw new Error(`Failed to fetch sales: ${retryResponse.status}`);
                }
              } else {
                throw new Error('Token refresh failed');
              }
            } else if (response.ok) {
              const data = await response.json();
              const pageSales = processSalesData(data);
              allSales.push(...pageSales);
              hasNextPage = data.hasNextPage || false;
              
              controller.enqueue(encoder.encode(
                `data: {"type":"progress","phase":"fetching","page":${pageNumber},"salesFetched":${allSales.length},"hasNextPage":${hasNextPage}}\n\n`
              ));
            } else {
              throw new Error(`Failed to fetch sales: ${response.status}`);
            }
            
            pageNumber++;
            
            // Small delay between pages to avoid rate limits
            if (hasNextPage) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            
          } catch (error) {
            console.error(`Error fetching page ${pageNumber}:`, error);
            controller.enqueue(encoder.encode(
              `data: {"type":"error","phase":"fetching","page":${pageNumber},"error":"${error instanceof Error ? error.message : 'Unknown error'}"}\n\n`
            ));
            hasNextPage = false; // Stop pagination on error
          }
        }
        
        controller.enqueue(encoder.encode(
          `data: {"type":"phase_complete","phase":"fetching","totalSales":${allSales.length},"message":"Finished fetching sales. Now enriching with payout data..."}\n\n`
        ));
        
        // Filter sales by date if provided
        if (fromDate || toDate) {
          const from = fromDate ? new Date(fromDate) : new Date('1970-01-01');
          const to = toDate ? new Date(toDate) : new Date();
          allSales = allSales.filter(sale => {
            const saleDate = new Date(sale.createdAt);
            return saleDate >= from && saleDate <= to;
          });
          
          controller.enqueue(encoder.encode(
            `data: {"type":"info","message":"Filtered to ${allSales.length} sales within date range"}\n\n`
          ));
        }
        
        // Now fetch complete payout data for all sales
        controller.enqueue(encoder.encode('data: {"type":"phase","phase":"enriching","message":"Fetching complete payout data..."}\n\n'));
        
        const batchSize = 10;
        let processedCount = 0;
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < allSales.length; i += batchSize) {
          const batch = allSales.slice(i, i + batchSize);
          const batchNumber = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(allSales.length / batchSize);
          
          controller.enqueue(encoder.encode(
            `data: {"type":"batch_start","batch":${batchNumber},"totalBatches":${totalBatches},"batchSize":${batch.length}}\n\n`
          ));
          
          // Process batch in parallel
          const batchPromises = batch.map(async (sale, index) => {
            // Stagger requests within batch
            await new Promise(resolve => setTimeout(resolve, index * 200));
            
            try {
              const detailUrl = `https://api.stockx.com/v2/selling/orders/${sale.orderNumber}`;
              
              const response = await fetch(detailUrl, {
                method: 'GET',
                headers: {
                  'x-api-key': apiKey,
                  'Authorization': `Bearer ${currentAccessToken}`,
                  'Accept': 'application/json',
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                }
              });
              
              if (response.ok) {
                const detailData = await response.json();
                successCount++;
                return enhanceSaleWithPayoutData(sale, detailData);
              } else {
                errorCount++;
                console.warn(`Failed to fetch details for ${sale.orderNumber}: ${response.status}`);
                return sale; // Return original sale on error
              }
            } catch (error) {
              errorCount++;
              console.error(`Error fetching details for ${sale.orderNumber}:`, error);
              return sale;
            }
          });
          
          // Wait for batch to complete
          const batchResults = await Promise.all(batchPromises);
          
          // Update the sales with enriched data
          for (let j = 0; j < batchResults.length; j++) {
            allSales[i + j] = batchResults[j];
          }
          
          processedCount += batch.length;
          
          controller.enqueue(encoder.encode(
            `data: {"type":"batch_complete","batch":${batchNumber},"totalBatches":${totalBatches},"processedCount":${processedCount},"totalCount":${allSales.length},"successCount":${successCount},"errorCount":${errorCount}}\n\n`
          ));
          
          // Delay between batches
          if (i + batchSize < allSales.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // Send completion message
        const salesWithPayouts = allSales.filter(s => s.pricing.totalPayout > 0).length;
        controller.enqueue(encoder.encode(
          `data: {"type":"complete","totalSales":${allSales.length},"salesWithPayouts":${salesWithPayouts},"successCount":${successCount},"errorCount":${errorCount},"message":"Import complete!"}\n\n`
        ));
        
        // Also send the complete data as a final message
        controller.enqueue(encoder.encode(
          `data: {"type":"data","sales":${JSON.stringify(allSales)}}\n\n`
        ));
        
      } catch (error) {
        console.error('Error in complete import:', error);
        controller.enqueue(encoder.encode(
          `data: {"type":"error","message":"${error instanceof Error ? error.message : 'Unknown error'}"}\n\n`
        ));
      } finally {
        controller.close();
      }
    }
  });

  // Return SSE response
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
    },
  });
}

// Function to process and format sales data
function processSalesData(rawData: any): StockXSale[] {
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
    // Determine order type
    let orderType: 'STANDARD' | 'FLEX' | 'DIRECT' | 'DFS' = 'STANDARD';
    if (order.orderNumber?.startsWith('02-')) {
      orderType = 'FLEX';
    } else if (order.orderNumber?.startsWith('06-')) {
      orderType = 'DIRECT';
    }

    // Map status
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

    const salePrice = parseFloat(order.amount || order.salePrice || order.price || '0');
    let sellerFees = 0;
    let hasFeeData = false;
    
    const payoutData = order.payout || order.payoutDetails || {};
    if (payoutData.totalAdjustments !== undefined) {
      sellerFees = Math.abs(parseFloat(payoutData.totalAdjustments || '0'));
      hasFeeData = true;
    }

    return {
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
        variantId: order.variant?.variantId || order.variant?.id || order.variantId || '',
        size: order.variant?.variantValue || order.size || 'Size not available',
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
        totalPayout: 0, // Will be filled by detail fetch
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
      source: 'stockx_api',
      needsPayoutRefresh: !hasFeeData && salePrice > 0
    };
  });
}

// Helper function to enhance sale with payout data
function enhanceSaleWithPayoutData(sale: StockXSale, detailData: any): StockXSale {
  const payoutData = detailData.payout || detailData.payoutDetails || {};
  
  // Extract accurate payout and fee data
  const totalPayout = parseFloat(
    payoutData.amount || 
    payoutData.totalPayout || 
    detailData.totalPayout || 
    detailData.sellerPayout || 
    '0'
  );
  
  const totalFees = parseFloat(
    payoutData.totalAdjustments || 
    detailData.totalAdjustments || 
    detailData.totalFees || 
    '0'
  );
  
  // Apply minimum fee rules for sales ≤$71
  let finalPayout = totalPayout;
  if (sale.pricing.salePrice > 0 && sale.pricing.salePrice <= 71 && totalPayout > 0) {
    const minimumTransactionFee = 5.00;
    const processingFee = sale.pricing.salePrice * 0.03;
    const shippingFee = sale.pricing.shippingFee || 0;
    const minimumTotalFees = minimumTransactionFee + processingFee + shippingFee;
    
    const currentFees = sale.pricing.salePrice - totalPayout;
    if (currentFees < minimumTotalFees) {
      finalPayout = sale.pricing.salePrice - minimumTotalFees;
    }
  }
  
  return {
    ...sale,
    pricing: {
      ...sale.pricing,
      totalPayout: finalPayout > 0 ? finalPayout : sale.pricing.totalPayout,
      sellerFees: totalFees > 0 ? Math.abs(totalFees) : sale.pricing.sellerFees,
      adjustments: detailData.adjustments || payoutData.adjustments
    },
    payoutDetails: payoutData.amount ? {
      amount: payoutData.amount,
      currency: payoutData.currency || 'USD',
      status: payoutData.status,
      date: payoutData.date || detailData.payoutDate,
      method: payoutData.method,
      adjustments: detailData.adjustments || []
    } : undefined,
    needsPayoutRefresh: false
  };
}