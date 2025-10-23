import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }

    const db = getAdminDb();
    
    // Get all sales for this user
    const salesSnapshot = await db
      .collection('user_sales')
      .where('userId', '==', userId)
      .get();
    
    const allSales = salesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Group by orderNumber and find duplicates
    const salesByOrderNumber = new Map();
    allSales.forEach(sale => {
      const orderNumber = sale.orderNumber;
      if (!salesByOrderNumber.has(orderNumber)) {
        salesByOrderNumber.set(orderNumber, []);
      }
      salesByOrderNumber.get(orderNumber).push(sale);
    });

    // Find duplicates and keep only the most recent one
    const toDelete = [];
    const toKeep = [];

    for (const [orderNumber, sales] of salesByOrderNumber.entries()) {
      if (sales.length > 1) {
        // Sort by createdAt (most recent first)
        const sortedSales = sales.sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        
        // Keep the first (most recent), delete the rest
        toKeep.push(sortedSales[0]);
        toDelete.push(...sortedSales.slice(1));
      } else {
        toKeep.push(sales[0]);
      }
    }

    // Delete duplicates
    const batch = db.batch();
    toDelete.forEach(sale => {
      batch.delete(db.collection('user_sales').doc(sale.id));
    });
    
    if (toDelete.length > 0) {
      await batch.commit();
    }

    return NextResponse.json({ 
      success: true, 
      removedCount: toDelete.length,
      keptCount: toKeep.length,
      totalProcessed: allSales.length
    });

  } catch (error: any) {
    console.error('❌ API /api/sales/cleanup-duplicates error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}
