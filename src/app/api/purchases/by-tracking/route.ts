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

function pickProductName(data: any): string | null {
  return (
    data?.productName ||
    data?.product?.name ||
    data?.product?.productName ||
    data?.title ||
    null
  );
}

function pickProductBrand(data: any): string | null {
  return data?.productBrand || data?.product?.brand || data?.brand || null;
}

function pickProductSize(data: any): string | null {
  return data?.productSize || data?.product?.size || data?.size || null;
}

function pickImageUrl(data: any): string | null {
  return data?.imageUrl || data?.product?.imageUrl || data?.product?.image || null;
}

function pickTracking(data: any): string | null {
  return (
    data?.tracking ||
    data?.trackingNumber ||
    data?.tracking_number ||
    data?.shipment?.tracking ||
    data?.shipment?.trackingNumber ||
    null
  );
}

function parseMoney(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pickCreditsAmount(data: any): number {
  const raw = data?.credits ?? data?.discounts ?? 0;
  const n = parseMoney(raw);
  return n && n > 0 ? n : 0;
}

function pickGrossAmount(data: any): number | null {
  const candidates = [data?.totalAmount, data?.totalPayment, data?.purchasePrice, data?.netPaid, data?.price, data?.originalPrice];
  for (const c of candidates) {
    const n = parseMoney(c);
    if (n && n > 0) return n;
  }
  return null;
}

function computeNetPaid(data: any): number | null {
  const net = parseMoney(data?.netPaid);
  if (net && net >= 0) return net;
  const gross = pickGrossAmount(data);
  if (gross == null) return null;
  const credits = pickCreditsAmount(data);
  return Math.max(0, gross - credits);
}

function formatUsd(n: number | null): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

function toMillis(isoOrNumber: any): number {
  if (typeof isoOrNumber === 'number') return isoOrNumber;
  if (typeof isoOrNumber !== 'string') return 0;
  const t = Date.parse(isoOrNumber);
  return Number.isFinite(t) ? t : 0;
}

async function findPurchasesByTracking(adminDb: FirebaseFirestore.Firestore, userId: string, trackingNumber: string) {
  const candidates: Array<{ fieldPath: string }> = [
    { fieldPath: 'tracking' },
    { fieldPath: 'trackingNumber' },
    { fieldPath: 'tracking_number' },
    { fieldPath: 'shipment.tracking' },
    { fieldPath: 'shipment.trackingNumber' }
  ];

  const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

  for (const { fieldPath } of candidates) {
    const snap = await adminDb.collection('purchases').where(fieldPath, '==', trackingNumber).limit(25).get();
    for (const doc of snap.docs) {
      const data = doc.data() as any;
      const owner = (data?.userId || data?.uid || '').toString();
      if (owner === userId) {
        byId.set(doc.id, doc);
      }
    }
  }

  return [...byId.values()];
}

export async function GET(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    const trackingNumber = request.nextUrl.searchParams.get('trackingNumber')?.trim() || '';
    if (!trackingNumber) {
      return NextResponse.json({ success: false, error: 'trackingNumber query param is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const docs = await findPurchasesByTracking(adminDb, userId, trackingNumber);
    if (docs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No purchases found for this tracking number', trackingNumber },
        { status: 404 }
      );
    }

    const matches = docs
      .map((doc) => {
        const data = doc.data() as any;
        const gross = pickGrossAmount(data);
        const credits = pickCreditsAmount(data);
        const netPaid = computeNetPaid(data);
        return {
          id: doc.id,
          userId: data?.userId || data?.uid || null,
          orderNumber: data?.orderNumber || data?.order_number || null,
          market: data?.market || data?.source || data?.platform || null,
          trackingNumber: pickTracking(data),
          carrier: data?.carrier || data?.shipment?.carrier || null,
          shippingStatus: data?.shippingStatus || data?.status || null,
          deliveredAt: data?.actualDelivery || data?.deliveredAt || data?.shipment?.deliveredAt || null,
          received: !!data?.received,
          receivedAt: data?.receivedAt || null,
          pricing: {
            gross,
            credits,
            netPaid,
            display: formatUsd(netPaid),
          },
          authSelf: data?.authSelf || data?.auth?.self || null,
          authExternal: data?.authExternal || data?.auth?.external || null,
          stockx: data?.stockx || null,
          stockxUnitQrRaw: data?.stockx?.unitQrRaw || data?.stockxUnitQrRaw || null,
          product: {
            name: pickProductName(data),
            brand: pickProductBrand(data),
            size: pickProductSize(data),
            sku: data?.sku || data?.styleId || data?.productSku || null,
            imageUrl: pickImageUrl(data)
          },
          timestamps: {
            createdAt: data?.createdAt || null,
            updatedAt: data?.updatedAt || null,
            purchaseDate: data?.purchaseDate || data?.timestamp || null
          }
        };
      })
      .sort((a, b) => {
        const aScore = Math.max(toMillis(a.timestamps.updatedAt), toMillis(a.timestamps.createdAt), toMillis(a.timestamps.purchaseDate));
        const bScore = Math.max(toMillis(b.timestamps.updatedAt), toMillis(b.timestamps.createdAt), toMillis(b.timestamps.purchaseDate));
        return bScore - aScore;
      });

    return NextResponse.json({
      success: true,
      trackingNumber,
      count: matches.length,
      match: matches.length === 1 ? matches[0] : null,
      matches
    });
  } catch (error: any) {
    console.error('❌ API /api/purchases/by-tracking error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}





