import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }

    // Query only this user's sales with pagination to reduce reads per request
    const db = getAdminDb();
    const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') || '400', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 1000) : 400;
    const cursorId = request.nextUrl.searchParams.get('cursorId');

    let queryRef: FirebaseFirestore.Query = db
      .collection(COLLECTIONS.SALES)
      .where('userId', '==', userId)
      .orderBy(FieldPath.documentId())
      .limit(limit);

    if (cursorId) {
      const cursorDoc = await db.collection(COLLECTIONS.SALES).doc(cursorId).get();
      if (cursorDoc.exists) {
        queryRef = queryRef.startAfter(cursorDoc);
      }
    }

    const snapshot = await queryRef.get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const nextCursorId = snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null;

    return NextResponse.json({ success: true, sales: docs, nextCursorId });
  } catch (error: any) {
    console.error('❌ API /api/sales/list error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}


