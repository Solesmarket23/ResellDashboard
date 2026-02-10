import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getUserIdFromRequest(request: NextRequest): string | null {
  const qp = request.nextUrl.searchParams.get('userId')?.trim();
  if (qp) return qp;
  const header = request.headers.get('x-user-id')?.trim();
  return header || null;
}

async function requireUserId(request: NextRequest): Promise<string | null> {
  const uid = await resolveNativeAuthUserId(request);
  if (uid) return uid;
  return getUserIdFromRequest(request);
}

/**
 * GET /api/inventory/assigned-slots
 * Returns all purchases for the user that have a pickLocation set (slots/SKUs assigned in the app).
 * Auth: Bearer (native) or userId cookie/query/header.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }

    const snap = await adminDb
      .collection(COLLECTIONS.PURCHASES)
      .where('userId', '==', userId)
      .get();

    const items: Array<{
      id: string;
      orderNumber: string | null;
      productName: string | null;
      pickLocation: string;
      updatedAt: string | null;
    }> = [];

    for (const doc of snap.docs) {
      const data = doc.data() as any;
      const loc = (data?.pickLocation ?? data?.pick_location ?? '').toString().trim();
      if (!loc) continue;
      const productName =
        data?.productName ??
        data?.product?.name ??
        data?.product?.productName ??
        data?.title ??
        null;
      items.push({
        id: doc.id,
        orderNumber: data?.orderNumber ?? data?.order_number ?? null,
        productName: typeof productName === 'string' ? productName : null,
        pickLocation: loc,
        updatedAt: data?.updatedAt ?? null,
      });
    }

    items.sort((a, b) => (a.pickLocation.localeCompare(b.pickLocation, undefined, { numeric: true })));

    return NextResponse.json({
      success: true,
      items,
      count: items.length,
    });
  } catch (e) {
    console.error('[inventory/assigned-slots]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
