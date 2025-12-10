import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    
    // Get all purchases for this user
    const purchasesSnapshot = await adminDb
      .collection('purchases')
      .where('userId', '==', userId)
      .get();

    const purchases = purchasesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`📊 Found ${purchases.length} total purchases for user ${userId}`);

    // Group by order number
    const grouped = new Map();
    purchases.forEach((purchase: any) => {
      const orderNum = purchase.orderNumber;
      if (!grouped.has(orderNum)) {
        grouped.set(orderNum, []);
      }
      grouped.get(orderNum).push(purchase);
    });

    // Find and remove duplicates (keep the most recent one)
    let deletedCount = 0;
    const deletePromises = [];

    for (const [orderNum, purchaseGroup] of grouped.entries()) {
      if (purchaseGroup.length > 1) {
        // Sort by syncedAt or createdAt (most recent first)
        purchaseGroup.sort((a: any, b: any) => {
          const aTime = new Date(a.syncedAt || a.createdAt || 0).getTime();
          const bTime = new Date(b.syncedAt || b.createdAt || 0).getTime();
          return bTime - aTime;
        });

        // Keep the first one (most recent), delete the rest
        const toDelete = purchaseGroup.slice(1);
        console.log(`🗑️ Order ${orderNum}: Keeping 1, deleting ${toDelete.length} duplicates`);

        for (const purchase of toDelete) {
          deletePromises.push(
            adminDb.collection('purchases').doc(purchase.id).delete()
          );
          deletedCount++;
        }
      }
    }

    // Execute all deletions
    await Promise.all(deletePromises);

    console.log(`✅ Cleanup complete: Deleted ${deletedCount} duplicate purchases`);

    return NextResponse.json({
      success: true,
      totalPurchases: purchases.length,
      uniqueOrders: grouped.size,
      duplicatesDeleted: deletedCount,
      remainingPurchases: purchases.length - deletedCount
    });
  } catch (error: any) {
    console.error('Error cleaning up duplicates:', error);
    return NextResponse.json({ 
      error: 'Failed to cleanup duplicates', 
      details: error.message 
    }, { status: 500 });
  }
}

