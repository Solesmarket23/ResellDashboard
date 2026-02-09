import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getUserId(request: NextRequest): string | null {
  const header = request.headers.get('x-user-id')?.trim();
  if (header) return header;
  const cookie =
    request.cookies.get('site-user-id')?.value ||
    request.cookies.get('siteUserId')?.value ||
    request.cookies.get('userId')?.value ||
    null;
  return cookie ? String(cookie).trim() : null;
}

/**
 * POST /api/shipping-fulfillment/undo
 * Body: { "orderNumber": "06-XXX" }
 * Removes an order from the user's marked-as-shipped list.
 * Auth: Bearer (native) or userId cookie/header.
 */
export async function POST(request: NextRequest) {
  try {
    let userId = await resolveNativeAuthUserId(request);
    if (!userId) userId = getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : '';
    if (!orderNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing orderNumber in body' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Server error' },
        { status: 500 }
      );
    }

    const docRef = db.collection(COLLECTIONS.MARKED_SHIPPED).doc(userId);
    const snap = await docRef.get();
    const existing = (snap.exists ? snap.data() : null) as { orderNumbers?: Record<string, number> } | null;
    const orderNumbers = { ...(existing?.orderNumbers ?? {}) };
    delete orderNumbers[orderNumber];

    await docRef.set({ orderNumbers, updatedAt: new Date().toISOString() }, { merge: true });

    return NextResponse.json({
      success: true,
      orderNumber,
      undone: true,
    });
  } catch (e) {
    console.error('[shipping-fulfillment/undo]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
