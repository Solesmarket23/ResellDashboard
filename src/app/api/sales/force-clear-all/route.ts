import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }

    const db = getAdminDb();

    console.log('🔥 FORCE CLEAR: Starting force clear all sales for user:', userId);

    // Strategy 1: Delete using collection group query (more aggressive)
    let totalDeleted = 0;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`🔥 FORCE CLEAR: Attempt ${attempts}/${maxAttempts}`);

      // Get all sales for this user
      const snapshot = await db
        .collection('user_sales')
        .where('userId', '==', userId)
        .limit(500) // Process in chunks
        .get();

      if (snapshot.empty) {
        console.log('🔥 FORCE CLEAR: No more sales found, stopping');
        break;
      }

      console.log(`🔥 FORCE CLEAR: Found ${snapshot.docs.length} sales to delete`);

      // Delete each document individually
      const deletePromises = snapshot.docs.map(async (doc) => {
        try {
          await doc.ref.delete();
          console.log(`🔥 FORCE CLEAR: Deleted ${doc.id}`);
          return 1;
        } catch (error) {
          console.error(`🔥 FORCE CLEAR: Failed to delete ${doc.id}:`, error);
          return 0;
        }
      });

      const results = await Promise.all(deletePromises);
      const deletedThisRound = results.reduce((sum, count) => sum + count, 0);
      totalDeleted += deletedThisRound;

      console.log(`🔥 FORCE CLEAR: Deleted ${deletedThisRound} sales in attempt ${attempts}`);
      
      // If we didn't delete any, break to avoid infinite loop
      if (deletedThisRound === 0) {
        console.log('🔥 FORCE CLEAR: No sales deleted this round, stopping');
        break;
      }
    }

    // Final verification
    const finalSnapshot = await db
      .collection('user_sales')
      .where('userId', '==', userId)
      .get();

    const remainingCount = finalSnapshot.docs.length;
    console.log(`🔥 FORCE CLEAR: Final verification - ${remainingCount} sales remain`);

    if (remainingCount > 0) {
      console.log('🔥 FORCE CLEAR: Remaining sales:', finalSnapshot.docs.map(doc => ({
        id: doc.id,
        data: doc.data()
      })));
    }

    return NextResponse.json({ 
      success: true, 
      deletedCount: totalDeleted,
      remainingCount: remainingCount,
      attempts: attempts,
      message: `Force cleared ${totalDeleted} sales in ${attempts} attempts. ${remainingCount} sales remain.`
    });

  } catch (error) {
    console.error('🔥 FORCE CLEAR: Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message || 'Failed to force clear all sales',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
