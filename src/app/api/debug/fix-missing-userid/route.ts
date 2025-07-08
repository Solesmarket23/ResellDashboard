import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, updateDocument } from '../../../../lib/firebase/firebaseUtils';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    
    console.log('🔧 Starting migration to fix missing userId for user:', userId);
    
    // Get all sales from the database
    const allSales = await getDocuments('sales');
    console.log('📊 Total sales in database:', allSales.length);
    
    // Find sales that don't have userId but should belong to this user
    // We'll identify them by checking if they have the typical sale structure
    const salesMissingUserId = allSales.filter((sale: any) => {
      // If it already has userId, skip it
      if (sale.userId) return false;
      
      // Check if it looks like a valid sale (has required fields)
      return sale.product && sale.brand && sale.salePrice && sale.profit;
    });
    
    console.log('🔍 Found', salesMissingUserId.length, 'sales missing userId');
    
    if (salesMissingUserId.length === 0) {
      return NextResponse.json({ 
        message: 'No sales found that are missing userId',
        processed: 0
      });
    }
    
    // Update each sale to include the userId
    let processed = 0;
    const results = [];
    
    for (const sale of salesMissingUserId) {
      try {
        console.log('🔧 Adding userId to sale:', sale.id);
        
        // Update the document with the userId
        await updateDocument('sales', sale.id, {
          ...sale,
          userId: userId
        });
        
        processed++;
        results.push({ id: sale.id, status: 'success' });
        console.log('✅ Updated sale:', sale.id);
        
      } catch (error) {
        console.error('❌ Error updating sale:', sale.id, error);
        results.push({ 
          id: sale.id, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
    
    console.log('✅ Migration completed. Processed:', processed, 'out of', salesMissingUserId.length);
    
    return NextResponse.json({
      message: 'Migration completed',
      totalSales: allSales.length,
      salesMissingUserId: salesMissingUserId.length,
      processed: processed,
      results: results
    });
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    return NextResponse.json({ 
      error: 'Migration failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 