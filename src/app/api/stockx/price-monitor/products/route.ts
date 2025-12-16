import { NextRequest, NextResponse } from 'next/server';

type MonitoredProductInput = {
  productId: string;
  variantId: string;
  title?: string;
  brand?: string;
  size?: string;
  currentAsk?: number;
  currentBid?: number;
  currentFlexAsk?: number;
  targetAskPrice?: number;
  targetFlexAskPrice?: number;
  targetBidPrice?: number;
  priceDropThreshold?: number;
  flexPriceDropThreshold?: number;
  thresholdType?: 'percentage' | 'amount';
  askThresholdAmount?: number | null;
  flexThresholdAmount?: number | null;
  stockxUrl?: string;
  urlKey?: string;
  slug?: string;
  priceHistory?: Array<{ timestamp: number; highestBid: number; lowestAsk: number; flexLowestAsk?: number }>;
  lastChecked?: number;
  alerts?: any[];
};

function getSiteUserIdFromCookie(request: NextRequest): string | null {
  const raw =
    request.cookies.get('siteUserId')?.value ||
    request.cookies.get('site-user-id')?.value ||
    null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function getEffectiveUserId(request: NextRequest, bodyUserId?: unknown): string | null {
  const fromBody = bodyUserId ? String(bodyUserId).trim() : '';
  return (
    request.headers.get('x-user-id')?.trim() ||
    (fromBody ? fromBody : null) ||
    getSiteUserIdFromCookie(request)
  );
}

function normalizeNumber(n: any, fallback: number | undefined = undefined): number | undefined {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const userId =
      request.nextUrl.searchParams.get('userId')?.trim() ||
      getEffectiveUserId(request);
    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });

    const snap = await adminDb
      .collection('monitored_products')
      .where('userId', '==', userId)
      .get();

    const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ success: true, userId, count: products.length, products });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const userId = getEffectiveUserId(request, body?.userId);
    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

    const products: MonitoredProductInput[] = Array.isArray(body?.products)
      ? body.products
      : body?.product
        ? [body.product]
        : [];
    if (products.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing products' }, { status: 400 });
    }
    if (products.length > 800) {
      return NextResponse.json({ success: false, error: 'Too many products (max 800)' }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });

    const now = Date.now();
    const nowIso = new Date().toISOString();
    const batch = adminDb.batch();

    let upserted = 0;
    const writtenIds: string[] = [];

    for (const p of products) {
      const productId = String(p.productId || '').trim();
      const variantId = String(p.variantId || '').trim();
      if (!productId || !variantId) continue;

      const docId = `${userId}__${productId}__${variantId}`;
      const ref = adminDb.collection('monitored_products').doc(docId);

      const priceHistory = Array.isArray(p.priceHistory) ? p.priceHistory.slice(-100) : [];
      const alerts = Array.isArray(p.alerts) ? p.alerts.slice(-50) : [];

      batch.set(
        ref,
        {
          userId,
          productId,
          variantId,
          title: String(p.title || '').slice(0, 300),
          brand: String(p.brand || '').slice(0, 120),
          size: String(p.size || 'One Size').slice(0, 50),
          currentAsk: normalizeNumber(p.currentAsk, 0) ?? 0,
          currentBid: normalizeNumber(p.currentBid, 0) ?? 0,
          // Firestore does not allow `undefined` values. Use `null` for optional fields.
          currentFlexAsk: normalizeNumber(p.currentFlexAsk, undefined) ?? null,
          targetAskPrice: normalizeNumber(p.targetAskPrice, undefined) ?? null,
          targetFlexAskPrice: normalizeNumber(p.targetFlexAskPrice, undefined) ?? null,
          targetBidPrice: normalizeNumber(p.targetBidPrice, undefined) ?? null,
          priceDropThreshold: normalizeNumber(p.priceDropThreshold, 10) ?? 10,
          flexPriceDropThreshold: normalizeNumber(p.flexPriceDropThreshold, 10) ?? 10,
          thresholdType: p.thresholdType === 'amount' ? 'amount' : 'percentage',
          askThresholdAmount: p.askThresholdAmount ?? null,
          flexThresholdAmount: p.flexThresholdAmount ?? null,
          stockxUrl: p.stockxUrl || null,
          urlKey: p.urlKey || null,
          slug: p.slug || null,
          priceHistory,
          alerts,
          lastChecked: normalizeNumber(p.lastChecked, now) ?? now,
          updatedAt: nowIso,
          createdAt: nowIso,
        },
        { merge: true }
      );
      upserted++;
      writtenIds.push(docId);
    }

    await batch.commit();
    return NextResponse.json({ success: true, userId, upserted, ids: writtenIds });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });

    await adminDb.collection('monitored_products').doc(id).delete();
    return NextResponse.json({ success: true, id });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const userId = getEffectiveUserId(request, body?.userId);
    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

    const mode = body?.mode === 'amount' ? 'amount' : 'percentage';
    const askThreshold = normalizeNumber(body?.askThreshold, undefined);
    const flexThreshold = normalizeNumber(body?.flexThreshold, undefined);
    const askAmount = normalizeNumber(body?.askAmount, undefined);
    const flexAmount = normalizeNumber(body?.flexAmount, undefined);

    if (mode === 'percentage') {
      if (!Number.isFinite(askThreshold) || !Number.isFinite(flexThreshold)) {
        return NextResponse.json({ success: false, error: 'Invalid thresholds' }, { status: 400 });
      }
    } else {
      if (!Number.isFinite(askAmount) || !Number.isFinite(flexAmount)) {
        return NextResponse.json({ success: false, error: 'Invalid amounts' }, { status: 400 });
      }
    }

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });

    const snap = await adminDb
      .collection('monitored_products')
      .where('userId', '==', userId)
      .get();

    const batch = adminDb.batch();
    let updated = 0;
    for (const d of snap.docs) {
      const data = d.data() as any;
      if (mode === 'percentage') {
        batch.set(
          d.ref,
          {
            priceDropThreshold: askThreshold,
            flexPriceDropThreshold: flexThreshold,
            thresholdType: 'percentage',
            askThresholdAmount: null,
            flexThresholdAmount: null,
          },
          { merge: true }
        );
      } else {
        const currentAsk = Number(data.currentAsk) || 0;
        const currentFlexAsk = Number(data.currentFlexAsk) || 0;
        const askPct = currentAsk > 0 ? (askAmount! / currentAsk) * 100 : 1;
        const flexPct = currentFlexAsk > 0 ? (flexAmount! / currentFlexAsk) * 100 : 1;

        batch.set(
          d.ref,
          {
            priceDropThreshold: Math.max(0.1, Math.min(50, askPct)),
            flexPriceDropThreshold: Math.max(0.1, Math.min(50, flexPct)),
            thresholdType: 'amount',
            askThresholdAmount: askAmount,
            flexThresholdAmount: flexAmount,
            targetAskPrice: currentAsk > askAmount! ? currentAsk - askAmount! : currentAsk * 0.9,
            targetFlexAskPrice:
              currentFlexAsk > 0
                ? currentFlexAsk > flexAmount!
                  ? currentFlexAsk - flexAmount!
                  : currentFlexAsk * 0.9
                : null,
          },
          { merge: true }
        );
      }
      updated++;
    }

    await batch.commit();
    return NextResponse.json({ success: true, userId, updated });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


