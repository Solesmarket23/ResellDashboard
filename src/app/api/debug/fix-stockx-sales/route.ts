import { NextRequest, NextResponse } from 'next/server';
import { getDocuments } from '@/lib/firebase/firebaseUtils';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId');
  
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  try {
    console.log('🔧 Checking StockX sales data for user:', userId);
    
    // Check all Firebase collections that might contain StockX data
    const collections = ['stockxSales', 'sales', 'user_sales'];
    const results: any = {};
    
    for (const collection of collections) {
      try {
        const docs = await getDocuments(collection);
        const userDocs = docs.filter(doc => doc.userId === userId);
        
        results[collection] = {
          totalDocs: docs.length,
          userDocs: userDocs.length,
          samples: userDocs.slice(0, 2).map(doc => ({
            id: doc.id,
            userId: doc.userId,
            hasStockxData: !!(doc.stockxOrderId || doc.saleData?.orderNumber),
            orderNumber: doc.saleData?.orderNumber || doc.stockxOrderId || doc.orderNumber,
            source: doc.source,
            platform: doc.platform,
            createdAt: doc.createdAt
          }))
        };
        
        // Check for StockX sales in the main sales collection
        if (collection === 'sales' || collection === 'user_sales') {
          const stockxSales = userDocs.filter(doc => 
            doc.platform === 'StockX' || doc.source === 'stockx_api'
          );
          results[collection].stockxSalesCount = stockxSales.length;
        }
      } catch (error) {
        results[collection] = { error: `Collection not found or error: ${error.message}` };
      }
    }
    
    // Summary and recommendations
    const summary = {
      hasStockXSalesCollection: results.stockxSales?.userDocs > 0,
      totalStockXSales: results.stockxSales?.userDocs || 0,
      needsSync: results.stockxSales?.userDocs === 0,
      recommendation: results.stockxSales?.userDocs === 0 
        ? 'No StockX sales found. User needs to sync StockX sales first.'
        : 'StockX sales found. Payout refresh should work.'
    };
    
    return NextResponse.json({
      userId,
      collections: results,
      summary,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ 
      error: 'Debug failed',
      details: error.message 
    }, { status: 500 });
  }
}