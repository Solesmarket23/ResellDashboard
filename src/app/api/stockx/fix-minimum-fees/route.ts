import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, updateDocument } from '@/lib/firebase/firebaseUtils';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId');
  
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  console.log('🔧 Fixing minimum fees for user:', userId);

  try {
    // Get user's StockX sales from Firebase
    const allSales = await getDocuments('stockxSales');
    const userSales = allSales.filter(sale => sale.userId === userId);
    
    console.log(`📊 Found ${userSales.length} sales for user ${userId}`);
    
    let updated = 0;
    let needsUpdate = 0;
    
    // Process each sale
    for (const sale of userSales) {
      if (!sale.saleData?.pricing) continue;
      
      const salePrice = sale.saleData.pricing.salePrice;
      const currentPayout = sale.saleData.pricing.totalPayout;
      
      // Check if this sale qualifies for minimum fee and needs correction
      if (salePrice > 0 && salePrice <= 71 && currentPayout > 0) {
        const expectedMinimumFee = 5.00;
        const currentFees = salePrice - currentPayout;
        
        // If current fees are less than $5, we need to update
        if (currentFees < expectedMinimumFee) {
          needsUpdate++;
          const correctPayout = salePrice - expectedMinimumFee;
          
          console.log(`💵 Order ${sale.saleData.orderNumber}: Fixing payout for $${salePrice} sale`);
          console.log(`   Current payout: $${currentPayout.toFixed(2)} (fees: $${currentFees.toFixed(2)})`);
          console.log(`   Correct payout: $${correctPayout.toFixed(2)} (fees: $${expectedMinimumFee.toFixed(2)})`);
          
          // Update the sale data
          const updatedSaleData = {
            ...sale.saleData,
            pricing: {
              ...sale.saleData.pricing,
              totalPayout: correctPayout,
              sellerFees: expectedMinimumFee,
              // Add a note about the correction
              minimumFeeApplied: true
            },
            payoutCorrectedAt: new Date().toISOString()
          };
          
          try {
            await updateDocument('stockxSales', sale.id, {
              saleData: updatedSaleData,
              updatedAt: new Date().toISOString()
            });
            updated++;
            console.log(`✅ Updated order ${sale.saleData.orderNumber}`);
          } catch (error) {
            console.error(`❌ Failed to update order ${sale.saleData.orderNumber}:`, error);
          }
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Fixed ${updated} sales with minimum fee corrections`,
      stats: {
        totalSales: userSales.length,
        salesUnder71: userSales.filter(s => s.saleData?.pricing?.salePrice <= 71).length,
        needingCorrection: needsUpdate,
        updated: updated
      }
    });

  } catch (error) {
    console.error('❌ Fix minimum fees error:', error);
    return NextResponse.json(
      { error: 'Failed to fix minimum fees', details: error.message },
      { status: 500 }
    );
  }
}