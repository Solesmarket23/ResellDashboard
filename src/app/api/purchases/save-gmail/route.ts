import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { getStatusPriority } from '@/lib/utils/statusPriority';

function pickBestStatus(existing: any, incoming: any): string {
  const existingStatus = String(existing?.status || existing?.shipping_status || 'Ordered');
  const incomingStatus = String(incoming?.status || incoming?.shipping_status || 'Ordered');
  return getStatusPriority(incomingStatus) >= getStatusPriority(existingStatus) ? incomingStatus : existingStatus;
}

function pickTracking(data: any): string {
  return String(
    data?.tracking ??
      data?.trackingNumber ??
      data?.tracking_number ??
      data?.shipment?.tracking ??
      data?.shipment?.trackingNumber ??
      ''
  ).trim();
}

export async function POST(request: NextRequest) {
  try {
    const { userId, purchases, reset } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!purchases || !Array.isArray(purchases)) {
      return NextResponse.json({ error: 'Purchases array is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    
    console.log(`📧 Saving ${purchases.length} Gmail purchases for user ${userId} via API...`);
    
    // Get existing Gmail purchases for this user
    const existingSnapshot = await adminDb
      .collection('purchases')
      .where('userId', '==', userId)
      .where('type', '==', 'gmail')
      .get();
    
    const existingPurchases = existingSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📄 Found ${existingPurchases.length} existing Gmail purchases`);

    const nowIso = new Date().toISOString();

    // IMPORTANT:
    // We should NOT delete-and-recreate purchases on every sync because that wipes:
    // - unitNumber / stockxListingId mappings
    // - linkedSaleOrderNumber (purchase → sale linkage)
    // - any manual edits users may have made
    //
    // Default behavior: UPSERT by orderNumber (merge), and only delete if reset === true.
    if (reset === true) {
      console.warn(`⚠️ Reset requested: deleting ${existingPurchases.length} Gmail purchases for user ${userId}. This may wipe unit/linkage fields.`);
      for (const oldPurchase of existingPurchases) {
        await adminDb.collection('purchases').doc(oldPurchase.id).delete();
      }
      console.log(`🗑️ Deleted ${existingPurchases.length} old Gmail purchases`);
    }

    const existingByOrderNumber = new Map<string, { id: string; data: any }>();
    const duplicateDocIdsToDelete: string[] = [];

    for (const p of existingPurchases) {
      const orderNumber = (p as any)?.orderNumber ? String((p as any).orderNumber) : '';
      if (!orderNumber) continue;
      if (existingByOrderNumber.has(orderNumber)) {
        duplicateDocIdsToDelete.push(String((p as any).id));
        continue;
      }
      existingByOrderNumber.set(orderNumber, { id: String((p as any).id), data: p });
    }

    // Best-effort cleanup of duplicates (same userId+type+orderNumber)
    let deletedDuplicates = 0;
    for (const dupId of duplicateDocIdsToDelete) {
      try {
        await adminDb.collection('purchases').doc(dupId).delete();
        deletedDuplicates++;
      } catch (e: any) {
        console.warn('⚠️ Failed to delete duplicate Gmail purchase (non-fatal):', { dupId, error: e?.message || String(e) });
      }
    }
    if (deletedDuplicates > 0) {
      console.log(`🧹 Deleted ${deletedDuplicates} duplicate Gmail purchases`);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const purchase of purchases) {
      const incomingOrderNumber = (purchase as any)?.orderNumber ? String((purchase as any).orderNumber) : '';

      // Remove the 'id' field if it exists (it might be set to orderNumber by frontend)
      const purchaseData: any = { ...(purchase as any) };
      delete purchaseData.id;

      // Avoid overwriting server-maintained timestamps
      delete purchaseData.createdAt;
      delete purchaseData.syncedAt;
      delete purchaseData.userId;
      delete purchaseData.type;

      if (incomingOrderNumber && existingByOrderNumber.has(incomingOrderNumber) && reset !== true) {
        const existing = existingByOrderNumber.get(incomingOrderNumber)!;
        const bestStatus = pickBestStatus(existing.data, purchaseData);

        // Tracking source-of-truth:
        // If the user scanned tracking in the iOS app, preserve it and do not let Gmail parsing overwrite it.
        const existingTracking = pickTracking(existing.data);
        const existingTrackingSource = String(existing.data?.trackingSource || existing.data?.tracking_source || '').toLowerCase().trim();
        const incomingTracking = pickTracking(purchaseData);

        const stripEmptyTrackingFields = (obj: any) => {
          const keys = ['tracking', 'trackingNumber', 'tracking_number', 'shipment.tracking', 'shipment.trackingNumber'];
          for (const k of keys) {
            if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
            const v = obj[k];
            if (typeof v === 'string' && v.trim() === '') delete obj[k];
            if (v === null) delete obj[k];
          }
        };

        // Never overwrite an existing non-empty tracking number with empty.
        stripEmptyTrackingFields(purchaseData);

        if (existingTrackingSource === 'scan' && existingTracking) {
          // If incoming tracking differs, keep scanned tracking.
          if (incomingTracking && incomingTracking !== existingTracking) {
            console.warn('⚠️ Preserving scanned tracking over Gmail parsing', {
              orderNumber: incomingOrderNumber,
              existingTracking,
              incomingTracking,
            });
          }
          purchaseData.tracking = existingTracking;
          purchaseData.trackingNumber = existingTracking;
          purchaseData.trackingSource = 'scan';
          // Prefer existing carrier when present.
          if (existing.data?.carrier && !purchaseData.carrier) purchaseData.carrier = existing.data.carrier;
        } else {
          // If Gmail didn't provide tracking but we already have one, keep it.
          if (!incomingTracking && existingTracking) {
            purchaseData.tracking = existingTracking;
            purchaseData.trackingNumber = existingTracking;
            if (existing.data?.carrier && !purchaseData.carrier) purchaseData.carrier = existing.data.carrier;
          }
        }

        await adminDb.collection('purchases').doc(existing.id).set(
          {
            ...purchaseData,
            userId,
            type: 'gmail',
            // Never downgrade status (e.g., don't let an "Ordered" email overwrite a previously "Shipped" order)
            status: bestStatus,
            shipping_status: bestStatus,
            syncedAt: nowIso
          },
          { merge: true }
        );
        // Keep our in-memory map updated so multiple rows for the same orderNumber in one request
        // can't "flip-flop" status based on iteration order.
        existingByOrderNumber.set(incomingOrderNumber, {
          id: existing.id,
          data: { ...(existing.data || {}), ...purchaseData, status: bestStatus, shipping_status: bestStatus }
        });
        updated++;
        continue;
      }

      // If we're in reset mode, or no matching orderNumber exists, create a new doc.
      // If orderNumber is missing, still save it (but we can't safely dedupe/upsert).
      if (!incomingOrderNumber) {
        skipped++;
        await adminDb.collection('purchases').add({
          ...purchaseData,
          userId,
          type: 'gmail',
          createdAt: nowIso,
          syncedAt: nowIso
        });
        created++;
        continue;
      }

      // Non-reset mode, orderNumber present, but not found: add new
      await adminDb.collection('purchases').add({
        ...purchaseData,
        userId,
        type: 'gmail',
        createdAt: nowIso,
        syncedAt: nowIso
      });
      created++;
    }

    console.log(`✅ Gmail purchases sync complete: created=${created}, updated=${updated}, deletedDuplicates=${deletedDuplicates}, missingOrderNumber=${skipped}`);

    return NextResponse.json({
      success: true,
      created,
      updated,
      deletedDuplicates,
      missingOrderNumberSaved: skipped
    });
  } catch (error: any) {
    console.error('Error saving Gmail purchases:', error);
    return NextResponse.json({ 
      error: 'Failed to save Gmail purchases', 
      details: error.message 
    }, { status: 500 });
  }
}

