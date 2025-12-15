import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, purchaseId, updates } = body;

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
      if (purchaseData?.userId && purchaseData.userId !== userId) {
        console.error(`❌ User ${userId} does not own purchase ${purchaseId}`);
        return NextResponse.json({ 
          error: 'Unauthorized',
          details: 'You do not own this purchase'
        }, { status: 403 });
      }
    }
    
    // Normalize/validate updates
    const normalizedUpdates: any = { ...updates };

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

