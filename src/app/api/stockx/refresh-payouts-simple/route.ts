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
    let allSales: any[] = [];
    try {
      allSales = await getDocuments('stockxSales');
      console.log(`📊 Total documents in stockxSales collection: ${allSales.length}`);
    } catch (error) {
      console.warn('⚠️ stockxSales collection might not exist yet:', error.message);
      // Return early with helpful message
      return NextResponse.json({
        success: false,
        message: 'No StockX sales found. Please sync your StockX sales first.',
        updated: 0,
        failed: 0,
        total: 0,
        needsSync: true
      });
    }
    
    // Debug: Log structure of first sale
    if (allSales.length > 0) {
      console.log('🔍 First sale structure:', {
        userId: allSales[0].userId,
        hasStockxOrderId: !!allSales[0].stockxOrderId,
        hasSaleData: !!allSales[0].saleData,
        saleDataKeys: allSales[0].saleData ? Object.keys(allSales[0].saleData) : []
      });
    }
    
    const userSales = allSales.filter(sale => sale.userId === userId);
    console.log(`👤 Found ${userSales.length} sales for user ${userId}`);
    
    // If no sales found for user, return helpful message
    if (userSales.length === 0) {
      console.log('🚨 No sales found for user. Checking why...');
      console.log('🔍 All user IDs in collection:', [...new Set(allSales.map(s => s.userId))]);
      console.log('🔍 Looking for userId:', userId);
      
      return NextResponse.json({
        success: false,
        message: 'No StockX sales found for your account. Please click "Sync StockX Sales" first to import your sales.',
        updated: 0,
        failed: 0,
        total: 0,
        needsSync: true,
        debug: {
          totalSalesInDB: allSales.length,
          uniqueUserIds: [...new Set(allSales.map(s => s.userId))].length,
          requestedUserId: userId
        }
      });
    }
    
    // Debug: Log a few sales to understand data structure
    if (userSales.length > 0) {
      console.log('🔍 Sample user sales:', userSales.slice(0, 2).map(sale => ({
        id: sale.id,
        orderNumber: sale.saleData?.orderNumber || sale.stockxOrderId,
        needsRefresh: sale.saleData?.needsPayoutRefresh,
        hasTotalPayout: !!sale.saleData?.pricing?.totalPayout,
        totalPayout: sale.saleData?.pricing?.totalPayout,
        status: sale.saleData?.status
      })));
    }
    
    // Filter only sales that need payout refresh
    const salesNeedingRefresh = userSales.filter(sale => {
      // Check both needsPayoutRefresh flag and missing totalPayout
      const needsRefresh = sale.saleData?.needsPayoutRefresh === true;
      const missingPayout = !sale.saleData?.pricing?.totalPayout || sale.saleData?.pricing?.totalPayout === 0;
      const eligibleStatus = ['PAYOUT_COMPLETED', 'AUTHENTICATED', 'SHIPPED', 'RECEIVED'].includes(sale.saleData?.status);
      
      return (needsRefresh || missingPayout) && eligibleStatus;
    });
    
    console.log(`🎯 ${salesNeedingRefresh.length} sales need payout refresh (needsRefresh flag or missing payout)`);
    
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
          
          // Log full response structure to understand what we're getting
          console.log(`📦 Full response for order ${orderNumber}:`, {
            hasOrderData: !!orderData,
            keys: Object.keys(orderData || {}),
            hasPayout: !!orderData.payout,
            hasSellerPayout: !!orderData.sellerPayout,
            hasTotalPayout: !!orderData.totalPayout,
            hasAdjustments: !!orderData.adjustments,
            status: orderData.status
          });
          
          // Update the sale data with fresh payout information
          // Log the payout data we're getting
          if (orderData.payout) {
            console.log(`📊 Order ${orderNumber} payout data:`, {
              totalPayout: orderData.payout.totalPayout,
              totalAdjustments: orderData.payout.totalAdjustments,
              adjustments: orderData.payout.adjustments
            });
          } else if (orderData.sellerPayout) {
            console.log(`💰 Order ${orderNumber} has sellerPayout:`, orderData.sellerPayout);
          } else if (orderData.totalPayout) {
            console.log(`💵 Order ${orderNumber} has totalPayout:`, orderData.totalPayout);
          } else {
            console.warn(`⚠️ Order ${orderNumber} has no payout data in response`);
          }
          
          // Extract payout data from various possible locations in the response
          let totalPayout = null;
          let totalAdjustments = null;
          
          if (orderData.payout?.totalPayout !== undefined) {
            totalPayout = parseFloat(orderData.payout.totalPayout);
            totalAdjustments = orderData.payout.totalAdjustments;
          } else if (orderData.sellerPayout !== undefined) {
            totalPayout = parseFloat(orderData.sellerPayout);
          } else if (orderData.totalPayout !== undefined) {
            totalPayout = parseFloat(orderData.totalPayout);
          }
          
          // Look for adjustments/fees in different locations
          if (!totalAdjustments && orderData.adjustments) {
            totalAdjustments = orderData.adjustments;
          } else if (!totalAdjustments && orderData.totalAdjustments) {
            totalAdjustments = orderData.totalAdjustments;
          } else if (!totalAdjustments && orderData.totalFees) {
            totalAdjustments = orderData.totalFees;
          }
          
          // Apply StockX $5 minimum transaction fee for sales ≤$71
          let adjustedPayout = totalPayout;
          const salePrice = sale.saleData.pricing.salePrice;
          
          if (adjustedPayout !== null && salePrice > 0 && salePrice <= 71) {
            const expectedMinimumFee = 5.00;
            const currentFees = salePrice - adjustedPayout;
            
            // If current fees are less than $5, adjust payout
            if (currentFees < expectedMinimumFee) {
              adjustedPayout = salePrice - expectedMinimumFee;
              console.log(`💵 Order ${orderNumber}: Applied $5 minimum fee for $${salePrice} sale. Adjusted payout from $${totalPayout} to $${adjustedPayout.toFixed(2)}`);
            }
          }
          
          const updatedSaleData = {
            ...sale.saleData,
            pricing: {
              ...sale.saleData.pricing,
              totalPayout: adjustedPayout !== null ? adjustedPayout : sale.saleData.pricing.totalPayout,
              sellerFees: totalAdjustments ? 
                Math.abs(parseFloat(totalAdjustments)) : 
                sale.saleData.pricing.sellerFees,
              // Update individual fees if available
              transactionFee: orderData.transactionFee || sale.saleData.pricing.transactionFee,
              paymentProcessingFee: orderData.paymentProcessingFee || sale.saleData.pricing.paymentProcessingFee,
              shippingFee: orderData.shippingFee || sale.saleData.pricing.shippingFee
            },
            needsPayoutRefresh: adjustedPayout === null, // Only clear flag if we got payout data
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