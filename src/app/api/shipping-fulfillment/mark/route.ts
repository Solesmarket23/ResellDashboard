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

function parseMoney(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = String(val).replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function getPurchaseCost(data: any): number | null {
  const netPaid = parseMoney(data?.netPaid);
  if (typeof netPaid === 'number' && Number.isFinite(netPaid) && netPaid >= 0) return netPaid;
  const totalPayment = parseMoney(data?.totalPayment ?? data?.totalAmount);
  const credits = parseMoney(data?.credits ?? data?.discounts) ?? 0;
  if (typeof totalPayment === 'number' && Number.isFinite(totalPayment) && totalPayment > 0) {
    return Math.max(0, totalPayment - Math.max(0, credits));
  }
  const purchasePrice = parseMoney(data?.purchasePrice ?? data?.price);
  if (typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0) return purchasePrice;
  return null;
}

/**
 * POST /api/shipping-fulfillment/mark
 * Body: { "orderNumber": "06-XXX", "payout"?: number }
 * Marks an order as shipped locally (does not call StockX).
 * If payout is provided, looks up the allocated purchase cost and stores profit for today's shipped total.
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
    const payout =
      typeof body?.payout === 'number' && Number.isFinite(body.payout) ? body.payout : parseMoney(body?.payout);

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'Server error' },
        { status: 500 }
      );
    }

    const now = Date.now();
    const nowIso = new Date().toISOString();

    // Find allocated purchase for cost (and to mark as sold).
    let cost: number | null = null;
    const soldSnap = await db
      .collection(COLLECTIONS.PURCHASES)
      .where('userId', '==', userId)
      .where('allocatedToOrderNumber', '==', orderNumber)
      .limit(1)
      .get();
    if (!soldSnap.empty) {
      const purchaseData = soldSnap.docs[0].data();
      cost = getPurchaseCost(purchaseData);
      await soldSnap.docs[0].ref.update({
        soldAt: nowIso,
        fulfilledOrderNumber: orderNumber,
        updatedAt: nowIso,
      });
    }

    const profit =
      typeof payout === 'number' && Number.isFinite(payout)
        ? payout - (typeof cost === 'number' && Number.isFinite(cost) ? cost : 0)
        : null;

    const docRef = db.collection(COLLECTIONS.MARKED_SHIPPED).doc(userId);
    const snap = await docRef.get();
    const existing = (snap.exists ? snap.data() : null) as {
      orderNumbers?: Record<string, number>;
      orderDetails?: Record<string, { markedAt: number; payout?: number; cost?: number; profit?: number }>;
    } | null;
    const orderNumbers = { ...(existing?.orderNumbers ?? {}) };
    orderNumbers[orderNumber] = now;
    const orderDetails = { ...(existing?.orderDetails ?? {}) };
    orderDetails[orderNumber] = {
      markedAt: now,
      ...(typeof payout === 'number' && Number.isFinite(payout) ? { payout } : {}),
      ...(typeof cost === 'number' && Number.isFinite(cost) ? { cost } : {}),
      ...(typeof profit === 'number' && Number.isFinite(profit) ? { profit } : {}),
    };

    await docRef.set(
      { orderNumbers, orderDetails, updatedAt: nowIso },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      orderNumber,
      markedAt: now,
      ...(typeof profit === 'number' && Number.isFinite(profit) ? { profit } : {}),
    });
  } catch (e) {
    console.error('[shipping-fulfillment/mark]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
