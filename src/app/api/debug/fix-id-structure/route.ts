import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, updateDocument } from '../../../../lib/firebase/firebaseUtils';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    
    console.log('🔧 Starting ID structure fix for user:', userId);
    
    // Get all sales from the database
    const allSales = await getDocuments('sales');
    console.log('📊 Total sales in database:', allSales.length);
    
    // Find user's sales that have problematic internal ID fields
    const userSales = allSales.filter((sale: any) => sale.userId === userId);
    console.log('📊 User sales found:', userSales.length);
    
    if (userSales.length === 0) {
      return NextResponse.json({ 
        message: 'No sales found for this user',
        processed: 0
      });
    }
    
    // Fix each sale by removing internal ID field
    let processed = 0;
    const results = [];
    
    for (const sale of userSales) {
      try {
        console.log('🔧 Fixing sale ID structure for doc:', sale.id);
        
        // Create clean sale data without internal ID conflicts
        const cleanSaleData = {
          userId: sale.userId,
          product: sale.product,
          brand: sale.brand,
          orderNumber: sale.orderNumber,
          size: sale.size,
          market: sale.market,
          salePrice: sale.salePrice,
          purchasePrice: sale.purchasePrice,
          fees: sale.fees,
          payout: sale.payout,
          profit: sale.profit,
          date: sale.date,
          isTest: sale.isTest,
          type: sale.type || 'manual',
          createdAt: sale.createdAt || new Date().toISOString()
          // Explicitly NOT including any 'id' field - Firebase will use doc.id
        };
        
        // Update the document with clean data
        await updateDocument('sales', sale.id, cleanSaleData);
        
        processed++;
        results.push({ 
          firebaseId: sale.id, 
          internalId: sale.id, // This was the conflicting field
          status: 'success' 
        });
        console.log('✅ Fixed sale ID structure for:', sale.id);
        
      } catch (error) {
        console.error('❌ Error fixing sale:', sale.id, error);
        results.push({ 
          firebaseId: sale.id, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
    
    console.log('✅ ID structure fix completed. Processed:', processed, 'out of', userSales.length);
    
    return NextResponse.json({
      message: 'ID structure fix completed',
      totalSales: allSales.length,
      userSales: userSales.length,
      processed: processed,
      results: results.slice(0, 10) // Show first 10 results
    });
    
  } catch (error) {
    console.error('❌ ID structure fix error:', error);
    return NextResponse.json({ 
      error: 'ID structure fix failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 