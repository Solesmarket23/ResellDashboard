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

/** Normalize for exact match: trim, collapse multiple spaces to one, optional case-insensitive. */
function normalizeProductName(name: string | null | undefined): string {
  if (name == null || typeof name !== 'string') return '';
  return name
    .trim()
    .replace(/\s+/g, ' ');
}

/** Min length for a name to be used in containment match (avoids "Hoodie" matching everything). */
const MIN_CONTAINMENT_LENGTH = 15;

/**
 * GET /api/inventory/allocate-for-order?orderNumber=04-XXX&productName=Fear%20of%20God%20Essentials%20...
 * Finds a received purchase with matching product name (exact match first; then one name contains the other),
 * FIFO (oldest first), that has a pick location and is not yet allocated. Allocates it and returns the location.
 * Idempotent: if this order already has an allocation, returns that location.
 * Auth: Bearer (native) or userId cookie/header.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const orderNumber = request.nextUrl.searchParams.get('orderNumber')?.trim();
    const productNameRaw = request.nextUrl.searchParams.get('productName')?.trim();
    if (!orderNumber || !productNameRaw) {
      return NextResponse.json(
        { success: false, error: 'orderNumber and productName query params are required' },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }

    const wantedName = normalizeProductName(productNameRaw);
    if (!wantedName) {
      return NextResponse.json({ success: false, error: 'productName is empty after normalize' }, { status: 400 });
    }

    const purchasesRef = adminDb.collection(COLLECTIONS.PURCHASES);
    const alreadySnap = await purchasesRef
      .where('userId', '==', userId)
      .where('allocatedToOrderNumber', '==', orderNumber)
      .limit(1)
      .get();
    if (!alreadySnap.empty) {
      const doc = alreadySnap.docs[0];
      const data = doc.data() as any;
      const loc = data?.pickLocation ?? data?.pick_location ?? null;
      return NextResponse.json({
        success: true,
        location: loc,
        allocated: false,
        purchaseId: doc.id,
      });
    }

    const snap = await purchasesRef
      .where('userId', '==', userId)
      .where('received', '==', true)
      .get();

    const wantedLower = wantedName.toLowerCase();

    const candidates: Array<{ id: string; data: any; receivedAt: string; exact: boolean }> = [];
    snap.docs.forEach((doc) => {
      const data = doc.data() as any;
      const pickLocation = data?.pickLocation ?? data?.pick_location;
      if (!pickLocation || typeof pickLocation !== 'string' || !pickLocation.trim()) return;
      const allocatedTo = data?.allocatedToOrderNumber ?? data?.allocatedToOrder ?? null;
      if (allocatedTo != null && allocatedTo !== '') return;
      const name =
        data?.productName ?? data?.product?.productName ?? data?.product?.name ?? data?.name ?? '';
      const normalized = normalizeProductName(name);
      const purchaseLower = normalized.toLowerCase();

      const exactMatch = purchaseLower === wantedLower;
      const containmentMatch =
        purchaseLower.length >= MIN_CONTAINMENT_LENGTH &&
        wantedLower.length >= MIN_CONTAINMENT_LENGTH &&
        (wantedLower.includes(purchaseLower) || purchaseLower.includes(wantedLower));

      if (!exactMatch && !containmentMatch) return;

      const receivedAt = data?.receivedAt ?? data?.received_at ?? data?.createdAt ?? data?.created_at ?? '';
      candidates.push({ id: doc.id, data, receivedAt: String(receivedAt), exact: exactMatch });
    });

    candidates.sort((a, b) => {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      if (!a.receivedAt) return 1;
      if (!b.receivedAt) return -1;
      return a.receivedAt.localeCompare(b.receivedAt);
    });

    const toAllocate = candidates[0];
    if (!toAllocate) {
      return NextResponse.json({
        success: true,
        location: null,
        allocated: false,
        message: 'No matching inventory (received item with same product name and a pick location).',
      });
    }

    const nowIso = new Date().toISOString();
    await purchasesRef.doc(toAllocate.id).update({
      allocatedToOrderNumber: orderNumber,
      allocatedAt: nowIso,
      updatedAt: nowIso,
    });

    const loc = toAllocate.data?.pickLocation ?? toAllocate.data?.pick_location ?? null;
    return NextResponse.json({
      success: true,
      location: loc,
      allocated: true,
      purchaseId: toAllocate.id,
    });
  } catch (e) {
    console.error('[inventory/allocate-for-order]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
