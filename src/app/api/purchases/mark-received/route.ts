import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ReceivedMethod = 'scan' | 'manual';

function resolveUserId(request: NextRequest): string {
  const qpUserId = request.nextUrl.searchParams.get('userId')?.trim() || '';
  const headerUserId = request.headers.get('x-user-id')?.trim() || '';
  const cookieStore = cookies();
  const cookieUserId =
    (cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value ||
      '')
      .trim();

  return (qpUserId || headerUserId || cookieUserId).trim();
}

async function findPurchaseByTracking(adminDb: FirebaseFirestore.Firestore, userId: string, trackingNumber: string) {
  const candidates: Array<{ fieldPath: string }> = [
    { fieldPath: 'tracking' },
    { fieldPath: 'trackingNumber' },
    { fieldPath: 'tracking_number' },
    { fieldPath: 'shipment.tracking' },
    { fieldPath: 'shipment.trackingNumber' }
  ];

  for (const { fieldPath } of candidates) {
    const snap = await adminDb.collection('purchases').where(fieldPath, '==', trackingNumber).limit(10).get();
    if (snap.empty) continue;

    const match = snap.docs.find((doc) => {
      const data = doc.data() as any;
      const owner = (data?.userId || data?.uid || '').toString();
      return owner === userId;
    });

    if (match) return match;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const trackingNumber: string = (body?.trackingNumber || body?.tracking || '').toString().trim();
    const receivedMethod: ReceivedMethod = body?.receivedMethod === 'manual' ? 'manual' : 'scan';
    const receivedAt: string = (body?.receivedAt || '').toString().trim();
    const receivedNotes: string = (body?.receivedNotes || '').toString().trim();

    if (!trackingNumber) {
      return NextResponse.json({ success: false, error: 'trackingNumber is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const purchaseDoc = await findPurchaseByTracking(adminDb, userId, trackingNumber);
    if (!purchaseDoc) {
      return NextResponse.json(
        { success: false, error: 'Purchase not found for this user with that tracking number' },
        { status: 404 }
      );
    }

    const isoReceivedAt = receivedAt || new Date().toISOString();

    const updates: any = {
      received: true,
      receivedAt: isoReceivedAt,
      receivedBy: userId,
      receivedMethod,
      updatedAt: new Date().toISOString()
    };

    if (receivedNotes) {
      updates.receivedNotes = receivedNotes;
    }

    await adminDb.collection('purchases').doc(purchaseDoc.id).update(updates);

    return NextResponse.json({
      success: true,
      purchaseId: purchaseDoc.id,
      updates
    });
  } catch (error: any) {
    console.error('❌ API /api/purchases/mark-received error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}





