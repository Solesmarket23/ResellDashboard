import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

async function trackingAlreadyExists(adminDb: FirebaseFirestore.Firestore, userId: string, trackingNumber: string) {
  const candidates: Array<{ fieldPath: string }> = [
    { fieldPath: 'tracking' },
    { fieldPath: 'trackingNumber' },
    { fieldPath: 'tracking_number' },
    { fieldPath: 'shipment.tracking' },
    { fieldPath: 'shipment.trackingNumber' }
  ];

  for (const { fieldPath } of candidates) {
    const snap = await adminDb.collection('purchases').where(fieldPath, '==', trackingNumber).limit(25).get();
    const match = snap.docs.find((doc) => {
      const data = doc.data() as any;
      const owner = (data?.userId || data?.uid || '').toString();
      return owner === userId;
    });
    if (match) return match.id;
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
    const carrier: string = (body?.carrier || '').toString().trim() || 'Unknown';
    const shippingStatus: string = (body?.shippingStatus || body?.status || '').toString().trim() || 'shipped';
    const orderNumber: string = (body?.orderNumber || '').toString().trim() || `manual-${Date.now()}`;

    const productName: string = (body?.productName || '').toString().trim() || 'Manual Entry';
    const productBrand: string = (body?.productBrand || '').toString().trim() || 'Unknown';
    const productSize: string = (body?.productSize || '').toString().trim() || 'Unknown';

    if (!trackingNumber) {
      return NextResponse.json({ success: false, error: 'trackingNumber is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const existingId = await trackingAlreadyExists(adminDb, userId, trackingNumber);
    if (existingId) {
      return NextResponse.json(
        { success: false, error: 'Tracking number already exists', purchaseId: existingId },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();

    const newPurchase: any = {
      userId,
      orderNumber,
      tracking: trackingNumber,
      carrier,
      shippingStatus,
      status: shippingStatus,
      productName,
      productBrand,
      productSize,
      totalAmount: 0,
      currency: 'USD',
      type: 'manual',
      manualTrackingAdded: true,
      purchaseDate: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const docRef = await adminDb.collection('purchases').add(newPurchase);

    // Best-effort: register tracking with AfterShip (non-blocking failure).
    try {
      const origin = request.nextUrl.origin;
      await fetch(`${origin}/api/tracking/register-aftership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: trackingNumber, carrier })
      });
    } catch (e) {
      console.warn('⚠️ AfterShip registration failed (non-critical):', e);
    }

    return NextResponse.json({
      success: true,
      purchaseId: docRef.id,
      purchase: { ...newPurchase, id: docRef.id }
    });
  } catch (error: any) {
    console.error('❌ API /api/purchases/create-manual error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}





