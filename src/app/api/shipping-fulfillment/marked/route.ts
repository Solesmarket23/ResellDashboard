import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getUserId(request: NextRequest): string | null {
  const qp = request.nextUrl.searchParams.get('userId')?.trim();
  if (qp) return qp;
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
 * GET /api/shipping-fulfillment/marked
 * Returns order numbers the user has marked as shipped (local state only).
 * Auth: Bearer (native) or userId cookie/query/header.
 */
export async function GET(request: NextRequest) {
  try {
    let userId = await resolveNativeAuthUserId(request);
    if (!userId) userId = getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
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
    const data = (snap.exists ? snap.data() : null) as { orderNumbers?: Record<string, number> } | null;
    const orderNumbers = data?.orderNumbers ?? {};
    const list = Object.keys(orderNumbers);
    const markedAt: Record<string, number> = { ...orderNumbers };

    return NextResponse.json({
      success: true,
      orderNumbers: list,
      markedAt,
    });
  } catch (e) {
    console.error('[shipping-fulfillment/marked]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
