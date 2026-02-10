import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getUserIdFallback(request: NextRequest): string | null {
  const header = request.headers.get('x-user-id')?.trim();
  if (header) return header;
  const cookie =
    request.cookies.get('site-user-id')?.value ||
    request.cookies.get('siteUserId')?.value ||
    request.cookies.get('userId')?.value ||
    null;
  return cookie ? String(cookie).trim() : null;
}

async function requireUserId(request: NextRequest): Promise<string | null> {
  const uid = await resolveNativeAuthUserId(request);
  if (uid) return uid;
  return getUserIdFallback(request);
}

function normalizeProductName(name: string | null | undefined): string {
  if (name == null || typeof name !== 'string') return '';
  return name
    .trim()
    .replace(/\s+/g, ' ');
}

const MIN_CONTAINMENT_LENGTH = 15;

/**
 * GET /api/inventory/match-debug?productName=Fear%20of%20God%20...
 * Returns a comparison report: the requested product name (from the order) and every
 * received purchase that has a pick location (allocated or not), with match type
 * (exact / containment / none) so you can see why allocate-for-order did or didn't match.
 * Auth: same as allocate-for-order (Bearer or userId).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const productNameRaw = request.nextUrl.searchParams.get('productName')?.trim();
    if (!productNameRaw) {
      return NextResponse.json(
        { success: false, error: 'productName query param is required (e.g. the order\'s product name from StockX)' },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }

    const wantedName = normalizeProductName(productNameRaw);
    const wantedLower = wantedName.toLowerCase();

    const snap = await adminDb
      .collection(COLLECTIONS.PURCHASES)
      .where('userId', '==', userId)
      .get();

    const purchases: Array<{
      purchaseId: string;
      productName: string;
      normalized: string;
      pickLocation: string;
      received: boolean;
      allocatedToOrderNumber: string | null;
      receivedAt: string | null;
      matchType: 'exact' | 'containment' | 'none';
      reason?: string;
    }> = [];

    snap.docs.forEach((doc) => {
      const data = doc.data() as any;
      const pickLocation = (data?.pickLocation ?? data?.pick_location ?? '').toString().trim();
      if (!pickLocation) return;
      const received = data?.received === true;

      const name =
        data?.productName ?? data?.product?.productName ?? data?.product?.name ?? data?.name ?? '';
      const normalized = normalizeProductName(name);
      const purchaseLower = normalized.toLowerCase();
      const allocatedTo = data?.allocatedToOrderNumber ?? data?.allocatedToOrder ?? null;
      const receivedAt = data?.receivedAt ?? data?.received_at ?? data?.createdAt ?? data?.created_at ?? null;

      let matchType: 'exact' | 'containment' | 'none' = 'none';
      let reason: string | undefined;

      if (purchaseLower === wantedLower) {
        matchType = 'exact';
      } else if (
        purchaseLower.length >= MIN_CONTAINMENT_LENGTH &&
        wantedLower.length >= MIN_CONTAINMENT_LENGTH &&
        (wantedLower.includes(purchaseLower) || purchaseLower.includes(wantedLower))
      ) {
        matchType = 'containment';
        reason = wantedLower.includes(purchaseLower)
          ? 'order name contains purchase name'
          : 'purchase name contains order name';
      } else {
        const lenDiff = Math.abs(purchaseLower.length - wantedLower.length);
        const sameStart = wantedLower.slice(0, 20) === purchaseLower.slice(0, 20);
        reason = `no match (lengths: order=${wantedLower.length} purchase=${purchaseLower.length}, same first 20 chars: ${sameStart})`;
      }

      purchases.push({
        purchaseId: doc.id,
        productName: name || '(empty)',
        normalized: normalized || '(empty)',
        pickLocation,
        received,
        allocatedToOrderNumber: allocatedTo ?? null,
        receivedAt: receivedAt ?? null,
        matchType,
        reason,
      });
    });

    return NextResponse.json({
      success: true,
      requestedProductName: productNameRaw,
      normalizedRequested: wantedName,
      requestedLength: wantedLower.length,
      note: 'allocate-for-order only uses items with received=true and a pick location. If you see a slot in "Assigned slots" but not here with received:true, mark that item as received in Receiving.',
      purchases,
    });
  } catch (e) {
    console.error('[inventory/match-debug]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
