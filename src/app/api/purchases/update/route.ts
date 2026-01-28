import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { trackingService } from '@/lib/tracking/trackingService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, purchaseId, updates, allowDuplicateTracking, allowInvalidTracking } = body;

    console.log('📝 Update request received:', { userId, purchaseId, updates });

    if (!purchaseId) {
      console.error('❌ Missing purchaseId');
      return NextResponse.json({ error: 'Purchase ID is required' }, { status: 400 });
    }

    if (!updates || typeof updates !== 'object') {
      console.error('❌ Invalid updates object');
      return NextResponse.json({ error: 'Updates object is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    
    // First, check if the purchase exists
    const purchaseDoc = await adminDb.collection('purchases').doc(purchaseId).get();
    
    if (!purchaseDoc.exists) {
      console.error(`❌ Purchase not found: ${purchaseId}`);
      return NextResponse.json({ 
        error: 'Purchase not found',
        details: `Document ${purchaseId} does not exist`
      }, { status: 404 });
    }

    // Verify user owns this purchase (if userId provided)
    if (userId) {
      const purchaseData = purchaseDoc.data();
      const owner = String((purchaseData as any)?.userId || (purchaseData as any)?.uid || '').trim();
      if (owner && owner !== String(userId).trim()) {
        console.error(`❌ User ${userId} does not own purchase ${purchaseId}`);
        return NextResponse.json({ 
          error: 'Unauthorized',
          details: 'You do not own this purchase'
        }, { status: 403 });
      }
    }
    
    // Normalize/validate updates
    const normalizedUpdates: any = { ...updates };

    const pickTrackingFromUpdates = (u: any): string => {
      const v =
        u?.tracking ??
        u?.trackingNumber ??
        u?.tracking_number ??
        u?.shipment?.tracking ??
        u?.shipment?.trackingNumber ??
        '';
      return typeof v === 'string' ? v.trim() : '';
    };

    // Duplicate tracking number guard (per user) unless allowDuplicateTracking === true
    const nextTracking = pickTrackingFromUpdates(normalizedUpdates);

    const inferNotFound = (t: any): boolean => {
      if (!t) return false;
      if (t?.error) return false; // explicit errors handled separately
      const status = String(t?.status || '').toLowerCase().trim();
      if (status !== 'unknown') return false;
      const updates = Array.isArray(t?.updates) ? t.updates : [];
      const hasAnyDates =
        !!t?.estimatedDelivery ||
        !!t?.actualDelivery ||
        !!t?.courierEstimatedDelivery ||
        !!t?.afterShipEstimatedDelivery ||
        !!t?.commitmentDate ||
        !!t?.appointmentDeliveryDate ||
        !!t?.deliveryTimeWindow?.estimated?.starts ||
        !!t?.deliveryTimeWindow?.estimated?.ends;
      return updates.length === 0 && !hasAnyDates;
    };

    // If a user is trying to save a tracking number, validate that the carrier can actually find it.
    // This prevents accidental "random 12-digit" entries from being treated as real.
    if (nextTracking && allowInvalidTracking !== true) {
      try {
        const [result] = await trackingService.getBulkTrackingInfo([nextTracking]);
        const err = String(result?.error || '').trim();
        const errLower = err.toLowerCase();
        const notConfigured =
          errLower.includes('api not configured') ||
          errLower.includes('no tracking apis configured') ||
          errLower.includes('not configured');

        if (!notConfigured) {
          const looksNotFound =
            errLower.includes('tracking not found') ||
            errLower.includes('no tracking results') ||
            errLower.includes('unable to locate') ||
            (errLower.includes('not found') && errLower.includes('tracking')) ||
            inferNotFound(result);

          if (looksNotFound) {
            return NextResponse.json(
              {
                error: 'Tracking not found/invalid',
                details:
                  'Carrier lookup did not find this tracking number. If it was just created, it may not work until the first carrier scan.',
                trackingNumber: nextTracking,
                carrier: (result as any)?.carrier || null,
              },
              { status: 422 }
            );
          }
        }
      } catch (e) {
        // Best-effort validation only; don't block updates if validation fails unexpectedly.
        console.warn('⚠️ Tracking validation failed (skipping):', e);
      }
    }

    if (nextTracking && allowDuplicateTracking !== true) {
      const purchaseData = purchaseDoc.data() as any;
      const owner = String(userId || purchaseData?.userId || purchaseData?.uid || '').trim();
      if (!owner) {
        return NextResponse.json(
          { error: 'User ID required', details: 'userId is required when updating tracking numbers' },
          { status: 400 }
        );
      }

      const candidates: Array<{ fieldPath: string }> = [
        { fieldPath: 'tracking' },
        { fieldPath: 'trackingNumber' },
        { fieldPath: 'tracking_number' },
        { fieldPath: 'shipment.tracking' },
        { fieldPath: 'shipment.trackingNumber' },
      ];

      const matchesById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const { fieldPath } of candidates) {
        const snap = await adminDb.collection('purchases').where(fieldPath, '==', nextTracking).limit(25).get();
        for (const doc of snap.docs) {
          if (doc.id === purchaseId) continue;
          const data = doc.data() as any;
          const docOwner = String(data?.userId || data?.uid || '').trim();
          if (docOwner === owner) {
            matchesById.set(doc.id, doc);
          }
        }
      }

      const conflict = [...matchesById.values()][0];
      if (conflict) {
        const d = conflict.data() as any;
        return NextResponse.json(
          {
            error: 'Duplicate tracking number',
            details: `Tracking number ${nextTracking} is already used on another purchase`,
            trackingNumber: nextTracking,
            conflict: {
              purchaseId: conflict.id,
              orderNumber: d?.orderNumber || d?.order_number || null,
              productName: d?.productName || d?.product?.name || d?.product?.productName || d?.title || null,
              status: d?.status || d?.shippingStatus || null,
            },
          },
          { status: 409 }
        );
      }
    }

    // Allow clearing tracking-related fields by sending null/'' (we delete the fields).
    // This is used when the UI detects a bogus tracking number and the user wants to remove it.
    const maybeDelete = (obj: any, key: string) => {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) return;
      const v = obj[key];
      if (v === null || v === '') obj[key] = FieldValue.delete();
    };
    maybeDelete(normalizedUpdates, 'tracking');
    maybeDelete(normalizedUpdates, 'trackingNumber');
    maybeDelete(normalizedUpdates, 'tracking_number');
    // Dot-path updates are supported by Firestore Admin `update()`
    maybeDelete(normalizedUpdates, 'shipment.tracking');
    maybeDelete(normalizedUpdates, 'shipment.trackingNumber');

    // Allow clearing archive-related fields (used by Deliveries "Archive/Restore" actions).
    maybeDelete(normalizedUpdates, 'archivedAt');
    maybeDelete(normalizedUpdates, 'archivedReason');
    maybeDelete(normalizedUpdates, 'archivedBy');
    maybeDelete(normalizedUpdates, 'archived_at');

    // Unit number: used for physical inventory labels (1–999)
    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'unitNumber')) {
      const raw = normalizedUpdates.unitNumber;

      // Allow clearing: { unitNumber: null } or { unitNumber: '' }
      if (raw === null || raw === '') {
        normalizedUpdates.unitNumber = FieldValue.delete();
      } else {
        const n = Number(raw);
        const isInt = Number.isFinite(n) && Math.floor(n) === n;
        if (!isInt || n < 1 || n > 999) {
          return NextResponse.json(
            { error: 'Invalid unitNumber', details: 'unitNumber must be an integer between 1 and 999 (or null to clear)' },
            { status: 400 }
          );
        }

        // Best-effort uniqueness check among ACTIVE (unsold) inventory for this user.
        // We treat a purchase as "sold" when it's linked to a sale.
        if (!userId) {
          return NextResponse.json(
            { error: 'User ID required', details: 'userId is required when updating unitNumber' },
            { status: 400 }
          );
        }

        const conflictsSnap = await adminDb
          .collection('purchases')
          .where('userId', '==', userId)
          .where('unitNumber', '==', n)
          .get();

        const conflictDoc = conflictsSnap.docs.find((d) => {
          if (d.id === purchaseId) return false;
          const data = d.data() as any;
          const isSold = !!(data.linkedSaleOrderNumber || data.linkedSaleId);
          return !isSold;
        });

        if (conflictDoc) {
          return NextResponse.json(
            {
              error: 'Unit number already in use',
              details: `Unit #${n} is already assigned to another active purchase`,
              conflictPurchaseId: conflictDoc.id
            },
            { status: 409 }
          );
        }

        normalizedUpdates.unitNumber = n;
      }
    }

    // Update the purchase document
    await adminDb.collection('purchases').doc(purchaseId).update({
      ...normalizedUpdates,
      updatedAt: new Date().toISOString()
    });

    console.log(`✅ Updated purchase ${purchaseId}:`, normalizedUpdates);

    return NextResponse.json({ 
      success: true,
      purchaseId,
      updates: normalizedUpdates
    });
  } catch (error: any) {
    console.error('❌ Error updating purchase:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ 
      error: 'Failed to update purchase', 
      details: error.message,
      code: error.code
    }, { status: 500 });
  }
}

