import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

function parseUnitNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.floor(n) !== n) return null;
  if (n < 1 || n > 999) return null;
  return n;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Assign a physical Unit # (1–999) to a specific StockX listingId.
 *
 * This lets users ensure StockX gets the exact unit they labeled (important for some categories like Streetwear).
 *
 * Request:
 * - listingId: string (required)
 * - unitNumber: number | null (required; null clears assignment for listingId)
 *
 * Auth:
 * - userId is resolved from cookies or request body/query.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const body = await request.json().catch(() => ({}));

    const listingId = String(body?.listingId || '').trim();
    const unitNumber = parseUnitNumber(body?.unitNumber);

    let userId: string | undefined =
      cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value ||
      body?.userId;

    if (!userId) {
      const url = new URL(request.url);
      userId = url.searchParams.get('userId') || undefined;
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 401 });
    }

    if (!listingId) {
      return NextResponse.json({ success: false, error: 'listingId is required' }, { status: 400 });
    }

    // Clear mapping for this listing
    if (body?.unitNumber === null || body?.unitNumber === '') {
      const adminDb = getAdminDb();
      const snap = await adminDb
        .collection('purchases')
        .where('userId', '==', userId)
        .where('stockxListingId', '==', listingId)
        .get();

      if (snap.empty) {
        return NextResponse.json({ success: true, message: 'No assignment found (nothing to clear)' });
      }

      // If multiple matches exist, clear them all (best-effort cleanup)
      const batch = adminDb.batch();
      snap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          stockxListingId: FieldValue.delete(),
          stockxListingAssignedAt: FieldValue.delete(),
          updatedAt: new Date().toISOString()
        });
      });
      await batch.commit();

      return NextResponse.json({
        success: true,
        cleared: snap.docs.length
      });
    }

    if (unitNumber === null) {
      return NextResponse.json(
        { success: false, error: 'unitNumber must be an integer 1–999 (or null to clear)' },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();

    // Enforce: a listingId can only be assigned to one purchase.
    const existingForListing = await adminDb
      .collection('purchases')
      .where('userId', '==', userId)
      .where('stockxListingId', '==', listingId)
      .get();

    // Enforce: a unitNumber can only be assigned to one listing while unsold.
    const existingForUnit = await adminDb
      .collection('purchases')
      .where('userId', '==', userId)
      .where('unitNumber', '==', unitNumber)
      .get();

    const isSold = (d: any) => !!(d?.linkedSaleOrderNumber || d?.linkedSaleId);

    // If listing is already assigned to an active unit, block (unless it's the same purchase we will update).
    const existingListingDoc = existingForListing.docs.find((d) => !isSold(d.data()));
    const targetUnitDoc = existingForUnit.docs.find((d) => !isSold(d.data()));

    if (!targetUnitDoc) {
      return NextResponse.json(
        { success: false, error: `No active purchase found with Unit #${unitNumber}` },
        { status: 404 }
      );
    }

    if (existingListingDoc && existingListingDoc.id !== targetUnitDoc.id) {
      return NextResponse.json(
        {
          success: false,
          error: `Listing is already assigned to a different unit`,
          conflictPurchaseId: existingListingDoc.id
        },
        { status: 409 }
      );
    }

    // If this unit is already assigned to a different listing, block.
    const targetData = targetUnitDoc.data() as any;
    if (targetData?.stockxListingId && String(targetData.stockxListingId) !== listingId) {
      return NextResponse.json(
        {
          success: false,
          error: `Unit #${unitNumber} is already assigned to a different listing`,
          conflictListingId: targetData.stockxListingId
        },
        { status: 409 }
      );
    }

    await adminDb.collection('purchases').doc(targetUnitDoc.id).update({
      stockxListingId: listingId,
      stockxListingAssignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      purchaseId: targetUnitDoc.id,
      listingId,
      unitNumber
    });
  } catch (error: any) {
    console.error('❌ Error assigning unit to listing:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}


