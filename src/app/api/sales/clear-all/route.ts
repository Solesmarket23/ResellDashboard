import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';

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

    console.log('🔄 API: Starting clear all sales for user:', userId);
    console.log('🔄 API: User ID type:', typeof userId);
    console.log('🔄 API: User ID length:', userId.length);

    // Robust chunk deletion: loop until no documents remain
    const BATCH_SIZE = 500;
    let totalDeletedCount = 0;
    let cycles = 0;
    const MAX_CYCLES = 50; // safety to avoid infinite loops

    while (cycles < MAX_CYCLES) {
      cycles++;
      const snapshot = await db
        .collection('user_sales')
        .where('userId', '==', userId)
        .orderBy(FieldPath.documentId())
        .limit(BATCH_SIZE)
        .get();

      if (snapshot.empty) {
        console.log(`✅ API: No more sales found to delete after ${cycles} cycles.`);
        break;
      }

      console.log(`🔄 API: Cycle ${cycles}: deleting ${snapshot.docs.length} sales...`);
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      totalDeletedCount += snapshot.docs.length;
      console.log(`✅ API: Cycle ${cycles}: deleted ${snapshot.docs.length} sales. Total so far: ${totalDeletedCount}`);
    }

    // Final verification
    const finalVerifySnapshot = await db
      .collection('user_sales')
      .where('userId', '==', userId)
      .orderBy(FieldPath.documentId())
      .limit(1)
      .get();

    const remainingCount = finalVerifySnapshot.empty ? 0 : await (async () => {
      // Count remaining efficiently in chunks (rare path)
      let count = 0;
      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      while (true) {
        let q = db
          .collection('user_sales')
          .where('userId', '==', userId)
          .orderBy(FieldPath.documentId())
          .limit(BATCH_SIZE);
        if (lastDoc) q = q.startAfter(lastDoc);
        const snap = await q.get();
        count += snap.size;
        if (snap.size < BATCH_SIZE) break;
        lastDoc = snap.docs[snap.docs.length - 1];
      }
      return count;
    })();

    return NextResponse.json({
      success: true,
      deletedCount: totalDeletedCount,
      remainingCount,
      message: `Successfully cleared ${totalDeletedCount} sales. ${remainingCount} sales remain.`
    });

  } catch (error) {
    console.error('❌ API: Error clearing all sales:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to clear all sales',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
