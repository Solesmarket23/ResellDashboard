import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';
import { getDocuments, updateDocument } from '@/lib/firebase/firebaseUtils';
import { auth } from '@/lib/firebase/firebase-admin';
import { StockXSale } from '@/lib/types/stockx';

// Use Server-Sent Events (SSE) for real-time progress updates
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const skipCompleted = searchParams.get('skipCompleted') === 'true';
  
  console.log('🔄 StockX Payout Refresh API Request');

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

  // Get authorization header to identify user
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing authorization header' },
      { status: 401 }
    );
  }

  try {
    // Verify the Firebase ID token
    const idToken = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Set up SSE response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send initial connection message
        controller.enqueue(encoder.encode('data: {"type":"connected","message":"Starting payout refresh..."}\n\n'));

        try {
          // Get all StockX sales from Firebase for this user
          const allSales = await getDocuments('stockxSales');
          const userSales = allSales.filter(sale => sale.userId === userId);
          
          // Filter sales that need payout updates
          const salesToUpdate = userSales.filter(sale => {
            const saleData = sale.saleData as StockXSale;
            // Skip if already has accurate payout and skipCompleted is true
            if (skipCompleted && saleData.pricing.totalPayout > 0) {
              return false;
            }
            // Include sales that might need payout updates
            return saleData.status === 'PAYOUT_COMPLETED' || 
                   saleData.status === 'PAYOUT_PENDING' ||
                   saleData.status === 'AUTHENTICATED' ||
                   saleData.status === 'SHIPPED' ||
                   saleData.status === 'RECEIVED';
          });

          const totalToUpdate = salesToUpdate.length;
          console.log(`📊 Found ${totalToUpdate} sales to refresh payouts for`);

          // Send total count
          controller.enqueue(encoder.encode(`data: {"type":"total","count":${totalToUpdate}}\n\n`));

          if (totalToUpdate === 0) {
            controller.enqueue(encoder.encode('data: {"type":"complete","message":"No sales need payout updates"}\n\n'));
            controller.close();
            return;
          }

          let successCount = 0;
          let errorCount = 0;
          let currentAccessToken = accessToken;

          // Process each sale one by one with delays
          for (let i = 0; i < salesToUpdate.length; i++) {
            const sale = salesToUpdate[i];
            const saleData = sale.saleData as StockXSale;
            const orderNumber = saleData.orderNumber;

            try {
              // Send progress update
              controller.enqueue(encoder.encode(
                `data: {"type":"progress","current":${i + 1},"total":${totalToUpdate},"orderNumber":"${orderNumber}","status":"fetching"}\n\n`
              ));

              // Fetch detailed order information
              const detailUrl = `https://api.stockx.com/v2/selling/orders/${orderNumber}`;
              
              const response = await fetch(detailUrl, {
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
                console.log('🔄 Token expired during refresh, attempting to refresh token...');
                const refreshResult = await refreshStockXTokens(refreshToken);
                
                if (refreshResult.success && refreshResult.accessToken) {
                  currentAccessToken = refreshResult.accessToken;
                  
                  // Retry with new token
                  const retryResponse = await fetch(detailUrl, {
                    method: 'GET',
                    headers: {
                      'x-api-key': apiKey,
                      'Authorization': `Bearer ${refreshResult.accessToken}`,
                      'Accept': 'application/json',
                      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                    }
                  });

                  if (retryResponse.ok) {
                    const detailData = await retryResponse.json();
                    await updateSaleWithPayoutData(sale, saleData, detailData);
                    successCount++;
                    
                    controller.enqueue(encoder.encode(
                      `data: {"type":"progress","current":${i + 1},"total":${totalToUpdate},"orderNumber":"${orderNumber}","status":"success","payout":${detailData.payout?.amount || detailData.totalPayout || 0}}\n\n`
                    ));
                  } else {
                    throw new Error(`Failed to fetch details: ${retryResponse.status}`);
                  }
                } else {
                  throw new Error('Token refresh failed');
                }
              } else if (response.ok) {
                const detailData = await response.json();
                await updateSaleWithPayoutData(sale, saleData, detailData);
                successCount++;
                
                controller.enqueue(encoder.encode(
                  `data: {"type":"progress","current":${i + 1},"total":${totalToUpdate},"orderNumber":"${orderNumber}","status":"success","payout":${detailData.payout?.amount || detailData.totalPayout || 0}}\n\n`
                ));
              } else {
                throw new Error(`Failed to fetch details: ${response.status}`);
              }

              // Delay between requests to avoid rate limits (1-2 requests per second)
              await new Promise(resolve => setTimeout(resolve, 750)); // 750ms = ~1.3 requests/second

            } catch (error) {
              console.error(`❌ Error updating payout for order ${orderNumber}:`, error);
              errorCount++;
              
              controller.enqueue(encoder.encode(
                `data: {"type":"progress","current":${i + 1},"total":${totalToUpdate},"orderNumber":"${orderNumber}","status":"error","error":"${error instanceof Error ? error.message : 'Unknown error'}"}\n\n`
              ));

              // Continue processing other orders
            }
          }

          // Send completion message
          const completionMessage = `Payout refresh complete. Success: ${successCount}, Errors: ${errorCount}`;
          controller.enqueue(encoder.encode(
            `data: {"type":"complete","message":"${completionMessage}","successCount":${successCount},"errorCount":${errorCount}}\n\n`
          ));

        } catch (error) {
          console.error('Error in payout refresh:', error);
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

  } catch (error: any) {
    console.error('Error in payout refresh endpoint:', error);
    return NextResponse.json(
      { 
        error: 'Failed to refresh payouts',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper function to update sale with accurate payout data
async function updateSaleWithPayoutData(
  firestoreSale: any,
  currentSaleData: StockXSale,
  detailData: any
): Promise<void> {
  console.log(`💰 Updating payout for order ${currentSaleData.orderNumber}:`, {
    oldPayout: currentSaleData.pricing.totalPayout,
    newPayout: detailData.payout?.amount || detailData.totalPayout,
    adjustments: detailData.adjustments?.length || 0
  });

  // Update the sale data with accurate payout information
  const updatedSaleData: StockXSale = {
    ...currentSaleData,
    pricing: {
      ...currentSaleData.pricing,
      // Use the accurate payout data from the detail endpoint
      totalPayout: parseFloat(
        detailData.payout?.amount || 
        detailData.totalPayout || 
        detailData.sellerPayout || 
        currentSaleData.pricing.totalPayout.toString()
      ),
      // Update fees if more detailed info is available
      sellerFees: parseFloat(
        detailData.totalAdjustments || 
        detailData.totalFees || 
        currentSaleData.pricing.sellerFees.toString()
      ),
      // Add any additional fee breakdown from adjustments
      adjustments: detailData.adjustments
    }
  };

  // Add any additional payout details
  if (detailData.payout) {
    (updatedSaleData as any).payoutDetails = {
      amount: detailData.payout.amount,
      currency: detailData.payout.currency || 'USD',
      status: detailData.payout.status,
      date: detailData.payout.date || detailData.payoutDate,
      method: detailData.payout.method,
      adjustments: detailData.adjustments || []
    };
  }

  // Update in Firebase
  await updateDocument('stockxSales', firestoreSale.id, {
    saleData: updatedSaleData,
    updatedAt: new Date().toISOString(),
    payoutRefreshedAt: new Date().toISOString()
  });
}