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
      size: string | null;
      pickLocation: string;
      updatedAt: string | null;
      productImageUrl: string | null;
      styleId: string | null;
      soldAt: string | null;
      fulfilledOrderNumber: string | null;
      purchasePriceDisplay: string | null;
    }> = [];

    function parseMoney(val: unknown): number | null {
      if (val == null) return null;
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      if (typeof val === 'string') {
        const n = parseFloat(val.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(n) ? n : null;
      }
      return null;
    }
    function pickGrossAmount(data: Record<string, unknown>): number | null {
      const keys = ['totalAmount', 'totalPayment', 'purchasePrice', 'price', 'originalPrice'];
      for (const k of keys) {
        const n = parseMoney(data[k]);
        if (n != null && n > 0) return n;
      }
      return null;
    }
    function pickCredits(data: Record<string, unknown>): number {
      const raw = data['credits'] ?? data['discounts'] ?? 0;
      const n = parseMoney(raw);
      return n != null && n > 0 ? n : 0;
    }
    function computeNetPaid(data: Record<string, unknown>): number | null {
      const net = parseMoney(data['netPaid']);
      if (net != null && net >= 0) return net;
      const gross = pickGrossAmount(data);
      if (gross == null) return null;
      return Math.max(0, gross - pickCredits(data));
    }
    function formatUsd(n: number | null): string | null {
      if (n == null || !Number.isFinite(n)) return null;
      return `$${n.toFixed(2)}`;
    }

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
      const sizeRaw =
        data?.size ??
        data?.product?.size ??
        data?.variant?.size ??
        data?.product?.variantValue ??
        null;
      const size = sizeRaw != null && String(sizeRaw).trim() !== '' ? String(sizeRaw).trim() : null;
      const productImageUrl =
        typeof data?.productImageUrl === 'string'
          ? data.productImageUrl
          : typeof data?.product?.imageUrl === 'string'
            ? data.product.imageUrl
            : typeof data?.imageUrl === 'string'
              ? data.imageUrl
              : null;
      const styleId =
        typeof data?.styleId === 'string'
          ? data.styleId
          : typeof data?.style_id === 'string'
            ? data.style_id
            : typeof data?.product?.styleId === 'string'
              ? data.product.styleId
              : null;
      const soldAt =
        typeof data?.soldAt === 'string' && data.soldAt.trim() !== '' ? data.soldAt.trim() : null;
      const fulfilledOrderNumber =
        typeof data?.fulfilledOrderNumber === 'string' && data.fulfilledOrderNumber.trim() !== ''
          ? data.fulfilledOrderNumber.trim()
          : null;
      const purchasePriceDisplay = formatUsd(computeNetPaid(data as Record<string, unknown>));
      items.push({
        id: doc.id,
        orderNumber: data?.orderNumber ?? data?.order_number ?? null,
        productName: typeof productName === 'string' ? productName : null,
        size,
        pickLocation: loc,
        updatedAt: data?.updatedAt ?? null,
        productImageUrl: productImageUrl?.trim() || null,
        styleId: styleId?.trim() || null,
        soldAt: soldAt ?? null,
        fulfilledOrderNumber: fulfilledOrderNumber ?? null,
        purchasePriceDisplay: purchasePriceDisplay ?? null,
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
