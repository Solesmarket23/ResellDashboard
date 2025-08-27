import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { getDocuments, updateDocument } from '@/lib/firebase/firebaseUtils';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId');
  
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json({ error: 'Missing authentication' }, { status: 401 });
  }

  console.log('🔄 Simple payout refresh starting for user:', userId);

  try {
    // Get user's StockX sales from Firebase
    const allSales = await getDocuments('stockxSales');
    const userSales = allSales.filter(sale => sale.userId === userId);
    
    console.log(`Found ${userSales.length} sales to refresh`);
    
    // Filter only sales that need payout refresh
    const salesNeedingRefresh = userSales.filter(sale => 
      sale.saleData?.needsPayoutRefresh || !sale.saleData?.pricing?.totalPayout
    );
    
    console.log(`${salesNeedingRefresh.length} sales need payout refresh`);
    
    let updated = 0;
    let failed = 0;
    
    // Process each sale that needs refresh
    for (const sale of salesNeedingRefresh) {
      const orderNumber = sale.saleData?.orderNumber || sale.stockxOrderId;
      
      if (!orderNumber) {
        console.warn('⚠️ Sale missing order number:', sale.id);
        failed++;
        continue;
      }

      try {
        // Fetch individual order details
        const response = await fetch(
          `https://api.stockx.com/v2/selling/orders/${orderNumber}`,
          {
            headers: {
              'x-api-key': apiKey,
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          }
        );

        if (response.ok) {
          const orderData = await response.json();
          
          // Update the sale data with fresh payout information
          // Log the payout data we're getting
          if (orderData.payout) {
            console.log(`📊 Order ${orderNumber} payout data:`, {
              totalPayout: orderData.payout.totalPayout,
              totalAdjustments: orderData.payout.totalAdjustments,
              adjustments: orderData.payout.adjustments
            });
          } else {
            console.warn(`⚠️ Order ${orderNumber} has no payout data in response`);
          }
          
          const updatedSaleData = {
            ...sale.saleData,
            pricing: {
              ...sale.saleData.pricing,
              totalPayout: orderData.payout?.totalPayout || sale.saleData.pricing.totalPayout,
              sellerFees: orderData.payout?.totalAdjustments ? 
                Math.abs(parseFloat(orderData.payout.totalAdjustments)) : 
                sale.saleData.pricing.sellerFees,
              // Update individual fees if available
              transactionFee: orderData.transactionFee || sale.saleData.pricing.transactionFee,
              paymentProcessingFee: orderData.paymentProcessingFee || sale.saleData.pricing.paymentProcessingFee,
              shippingFee: orderData.shippingFee || sale.saleData.pricing.shippingFee
            },
            needsPayoutRefresh: !orderData.payout?.totalPayout, // Only clear flag if we got payout data
            payoutLastRefreshed: new Date().toISOString()
          };

          // Update in Firebase
          await updateDocument('stockxSales', sale.id, {
            saleData: updatedSaleData,
            updatedAt: new Date().toISOString()
          });

          updated++;
          console.log(`✅ Updated order ${orderNumber}`);
        } else {
          console.warn(`⚠️ Failed to fetch order ${orderNumber}: ${response.status}`);
          failed++;
        }
        
        // Add small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Error processing order ${orderNumber}:`, error);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Refreshed ${updated} payouts, ${failed} failed`,
      updated,
      failed,
      total: userSales.length
    });

  } catch (error) {
    console.error('❌ Payout refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh payouts', details: error.message },
      { status: 500 }
    );
  }
}