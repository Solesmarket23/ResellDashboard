import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

function getSiteUserIdFromCookie(request: NextRequest): string | null {
  // cookie name is used elsewhere in the app (see StockXRepricing save interval logic)
  const raw = request.cookies.get('site-user-id')?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function getEffectiveUserId(request: NextRequest): string | null {
  return request.headers.get('x-user-id')?.trim() || getSiteUserIdFromCookie(request);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId')?.trim() || getEffectiveUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const snapshot = await adminDb
      .collection('stockxPricingSettings')
      .where('userId', '==', userId)
      .get();

    const settings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ success: true, userId, settings });
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
    const listingId = body?.listingId ? String(body.listingId).trim() : '';
    const settings = body?.settings || null;
    const productId = body?.productId ? String(body.productId).trim() : '';
    const variantId = body?.variantId ? String(body.variantId).trim() : '';

    const userId = body?.userId ? String(body.userId).trim() : getEffectiveUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }
    if (!listingId) {
      return NextResponse.json({ success: false, error: 'Missing listingId' }, { status: 400 });
    }
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ success: false, error: 'Missing settings' }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const nowIso = new Date().toISOString();

    // Support deletion semantics from client: { minPrice: null } / { maxPrice: null }
    // because Firebase client FieldValue.delete() cannot be JSON-serialized.
    const normalizedSettings: any = { ...(settings as any) };
    if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'minPrice') && normalizedSettings.minPrice === null) {
      normalizedSettings.minPrice = FieldValue.delete();
    }
    if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'maxPrice') && normalizedSettings.maxPrice === null) {
      normalizedSettings.maxPrice = FieldValue.delete();
    }

    const payload = {
      userId,
      listingId,
      ...normalizedSettings,
      updatedAt: nowIso
    };

    const existing = await adminDb
      .collection('stockxPricingSettings')
      .where('userId', '==', userId)
      .where('listingId', '==', listingId)
      .limit(1)
      .get();

    let id: string;
    if (!existing.empty) {
      id = existing.docs[0].id;
      await adminDb.collection('stockxPricingSettings').doc(id).set(payload, { merge: true });
    } else {
      const created = await adminDb.collection('stockxPricingSettings').add({ ...payload, createdAt: nowIso });
      id = created.id;
    }

    // If we know productId + variantId, also store a reusable template so future listings
    // (new listingId for the same product/size) inherit the last saved min/max/strategy.
    if (productId && variantId) {
      const templateDocId = `${userId}__${productId}__${variantId}`;
      const templatePayload: any = {
        userId,
        productId,
        variantId,
        // copy only the knobs users expect to persist across relisting
        enabled: Object.prototype.hasOwnProperty.call(normalizedSettings, 'enabled') ? normalizedSettings.enabled !== false : true,
        pricingStrategy: normalizedSettings.pricingStrategy,
        minPrice: normalizedSettings.minPrice,
        maxPrice: normalizedSettings.maxPrice,
        autoDeactivate: normalizedSettings.autoDeactivate,
        sourceListingId: listingId,
        updatedAt: nowIso,
      };
      // Remove undefined fields (Firestore rejects undefined)
      Object.keys(templatePayload).forEach((k) => {
        if (templatePayload[k] === undefined) delete templatePayload[k];
      });

      await adminDb.collection('stockxPricingTemplates').doc(templateDocId).set(
        {
          ...templatePayload,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({ success: true, id, userId, listingId });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


