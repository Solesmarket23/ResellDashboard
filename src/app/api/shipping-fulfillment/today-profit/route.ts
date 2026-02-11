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
 * Start of today in UTC (00:00:00.000).
 */
function startOfTodayUTC(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * End of today in UTC (23:59:59.999).
 */
function endOfTodayUTC(): number {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * GET /api/shipping-fulfillment/today-profit
 * Returns the sum of (payout - purchase cost) for all orders marked as shipped today.
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
    const data = (snap.exists ? snap.data() : null) as {
      orderNumbers?: Record<string, number>;
      orderDetails?: Record<string, { markedAt: number; payout?: number; cost?: number; profit?: number }>;
    } | null;

    const orderDetails = data?.orderDetails ?? null;
    const orderNumbers = data?.orderNumbers ?? {};
    const todayStart = startOfTodayUTC();
    const todayEnd = endOfTodayUTC();

    let todayProfit = 0;
    let count = 0;

    if (orderDetails) {
      for (const orderNumber of Object.keys(orderDetails)) {
        const detail = orderDetails[orderNumber];
        if (!detail || typeof detail.markedAt !== 'number') continue;
        if (detail.markedAt < todayStart || detail.markedAt > todayEnd) continue;
        count += 1;
        if (typeof detail.profit === 'number' && Number.isFinite(detail.profit)) {
          todayProfit += detail.profit;
        }
      }
    } else {
      for (const [orderNumber, markedAt] of Object.entries(orderNumbers)) {
        if (typeof markedAt !== 'number') continue;
        if (markedAt < todayStart || markedAt > todayEnd) continue;
        count += 1;
        // No stored profit for legacy entries
      }
    }

    return NextResponse.json({
      success: true,
      todayProfit: Math.round(todayProfit * 100) / 100,
      count,
      currency: 'USD',
    });
  } catch (e) {
    console.error('[shipping-fulfillment/today-profit]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
