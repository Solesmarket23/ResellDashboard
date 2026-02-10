import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getUserIdFallback(request: NextRequest): string | null {
  const qp = request.nextUrl.searchParams.get('userId')?.trim();
  if (qp) return qp;
  const header = request.headers.get('x-user-id')?.trim();
  if (header) return header;
  const cookieStore = cookies();
  const v =
    cookieStore.get('site-user-id')?.value ||
    cookieStore.get('siteUserId')?.value ||
    cookieStore.get('userId')?.value ||
    null;
  return v ? String(v).trim() : null;
}

async function requireUserId(request: NextRequest): Promise<string | null> {
  const uid = await resolveNativeAuthUserId(request);
  if (uid) return uid;
  return getUserIdFallback(request);
}

/**
 * POST /api/purchases/set-pick-location
 * Body: { "purchaseId": "...", "location": "C12" } to set, or { "purchaseId": "...", "clear": true } to remove.
 * Sets or clears the bin/slot where this received item is stored.
 * Auth: Bearer (native) or userId cookie/query/header.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const purchaseId = (body?.purchaseId ?? '').toString().trim();
    const clear = body?.clear === true;
    const location = (body?.location ?? '').toString().trim();
    if (!purchaseId) {
      return NextResponse.json({ success: false, error: 'purchaseId is required' }, { status: 400 });
    }
    if (!clear && !location) {
      return NextResponse.json({ success: false, error: 'location is required (e.g. C12) or set clear: true' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }

    const ref = adminDb.collection(COLLECTIONS.PURCHASES).doc(purchaseId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ success: false, error: 'Purchase not found' }, { status: 404 });
    }
    const data = snap.data() as any;
    const owner = String(data?.userId ?? data?.uid ?? '').trim();
    if (owner !== userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    if (clear) {
      await ref.update({
        pickLocation: FieldValue.delete(),
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({
        success: true,
        purchaseId,
        cleared: true,
      });
    }

    const locationNorm = location.toUpperCase();
    const existingWithSlot = await adminDb
      .collection(COLLECTIONS.PURCHASES)
      .where('userId', '==', userId)
      .get();
    const alreadyUsedByOther = existingWithSlot.docs.some((d) => {
      if (d.id === purchaseId) return false;
      const loc = (d.data()?.pickLocation ?? d.data()?.pick_location ?? '').toString().trim();
      return loc.toUpperCase() === locationNorm;
    });
    if (alreadyUsedByOther) {
      return NextResponse.json(
        { success: false, error: 'That slot is already in use. Each slot is unique and never reused.' },
        { status: 409 }
      );
    }

    await ref.update({
      pickLocation: location,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      purchaseId,
      location,
    });
  } catch (e) {
    console.error('[purchases/set-pick-location]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
