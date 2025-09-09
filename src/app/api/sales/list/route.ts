import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
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

    // Query only this user's sales to reduce reads
    const db = getAdminDb();
    const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') || '2500', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 5000) : 2500;
    const snapshot = await db
      .collection(COLLECTIONS.SALES)
      .where('userId', '==', userId)
      .limit(limit)
      .get();

    const userSales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ success: true, sales: userSales });
  } catch (error: any) {
    console.error('❌ API /api/sales/list error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}


