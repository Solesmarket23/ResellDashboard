import { NextRequest, NextResponse } from 'next/server';
import { getDocuments } from '@/lib/firebase/firebaseUtils';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    console.log('🔍 Debugging StockX sales for user:', userId);
    
    // Get all documents from stockxSales collection
    const allSales = await getDocuments('stockxSales');
    console.log('📊 Total documents in stockxSales collection:', allSales.length);
    
    // Filter for this user
    const userSales = allSales.filter(sale => sale.userId === userId);
    console.log('👤 Sales for this user:', userSales.length);
    
    // Check structure of first few sales
    if (userSales.length > 0) {
      console.log('🔍 First sale structure:', {
        id: userSales[0].id,
        userId: userSales[0].userId,
        hasStockxOrderId: !!userSales[0].stockxOrderId,
        hasSaleData: !!userSales[0].saleData,
        orderNumber: userSales[0].saleData?.orderNumber || userSales[0].stockxOrderId,
        needsRefresh: userSales[0].saleData?.needsPayoutRefresh,
        payout: userSales[0].saleData?.pricing?.totalPayout
      });
    }
    
    // Count sales needing refresh
    const needingRefresh = userSales.filter(sale => 
      sale.saleData?.needsPayoutRefresh || !sale.saleData?.pricing?.totalPayout
    );
    
    // Also check other possible collection names
    let otherCollections = {};
    try {
      const sales = await getDocuments('sales');
      otherCollections['sales'] = sales.length;
    } catch (e) {
      otherCollections['sales'] = 'not found';
    }
    
    try {
      const userSalesCol = await getDocuments('user_sales');
      otherCollections['user_sales'] = userSalesCol.length;
    } catch (e) {
      otherCollections['user_sales'] = 'not found';
    }

    return NextResponse.json({
      userId,
      collections: {
        stockxSales: {
          total: allSales.length,
          forUser: userSales.length,
          needingRefresh: needingRefresh.length
        },
        otherCollections
      },
      sampleData: userSales.slice(0, 3).map(sale => ({
        id: sale.id,
        orderNumber: sale.saleData?.orderNumber || sale.stockxOrderId,
        needsRefresh: sale.saleData?.needsPayoutRefresh,
        hasPayout: !!sale.saleData?.pricing?.totalPayout,
        payout: sale.saleData?.pricing?.totalPayout
      }))
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ 
      error: 'Debug failed',
      details: error.message 
    }, { status: 500 });
  }
}