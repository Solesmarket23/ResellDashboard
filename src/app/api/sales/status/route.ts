import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function sanitizeUserId(raw: unknown): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  const lowered = v.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return '';
  return v;
}

async function countWhereUserId(db: FirebaseFirestore.Firestore, collectionName: string, userId: string) {
  // Use aggregate count() when available; fall back to limited read if needed.
  try {
    // @ts-expect-error - older firebase-admin typings may not include count()
    const agg = await db.collection(collectionName).where('userId', '==', userId).count().get();
    // @ts-expect-error - typings
    const count = typeof agg?.data?.().count === 'number' ? agg.data().count : null;
    if (typeof count === 'number') return count;
  } catch {
    // ignore and fall back
  }
  const snap = await db.collection(collectionName).where('userId', '==', userId).limit(1000).get();
  return snap.size; // note: capped at 1000 reads, but enough for “is it zero?”
}

export async function GET(request: NextRequest) {
  try {
    const qpUserId = sanitizeUserId(request.nextUrl.searchParams.get('userId'));
    const headerUserId = sanitizeUserId(request.headers.get('x-user-id'));
    const cookieStore = cookies();
    const cookieUserId = sanitizeUserId(
      cookieStore.get('userId')?.value ||
        cookieStore.get('siteUserId')?.value ||
        cookieStore.get('site-user-id')?.value
    );

    const userId = sanitizeUserId(qpUserId || headerUserId || cookieUserId);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id, or cookies)' },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    // These are the main “sales” collections we’ve used historically in this repo
    const collectionsToCheck = [
      { key: 'user_sales', name: 'user_sales' },
      { key: 'stockxSales', name: COLLECTIONS.STOCKX_SALES },
      { key: 'sales', name: COLLECTIONS.SALES }
    ];

    const counts: Record<string, number> = {};
    for (const c of collectionsToCheck) {
      counts[c.key] = await countWhereUserId(db, c.name, userId);
    }

    return NextResponse.json({ success: true, userId, counts });
  } catch (error: any) {
    console.error('❌ API /api/sales/status error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}


