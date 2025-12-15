import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

function corsify(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get('origin') || '';
  // Allow chrome-extension origins (for our extension) + local dev.
  if (origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost') || origin.startsWith('https://www.solesmarket.com')) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Vary', 'Origin');
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Access-Control-Allow-Headers', 'content-type');
    res.headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  }
  return res;
}

export async function OPTIONS(request: NextRequest) {
  return corsify(request, new NextResponse(null, { status: 204 }));
}

function detectCarrier(trackingNumber: string): 'FedEx' | 'UPS' | 'USPS' | 'Unknown' {
  const t = trackingNumber.trim();
  if (/^1Z[0-9A-Z]{16}$/i.test(t)) return 'UPS';
  if (/^9[0-9]{19,21}$/.test(t)) return 'USPS';
  if (/^[0-9]{10,22}$/.test(t)) return 'FedEx';
  return 'Unknown';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderNumber, trackingNumber, fedexUrl, stockxBuyingId } = body || {};

    if (!trackingNumber || typeof trackingNumber !== 'string') {
      return corsify(request, NextResponse.json({ error: 'trackingNumber is required' }, { status: 400 }));
    }

    // Identify user (works for site-password sessions)
    const cookieStore = cookies();
    const userId =
      cookieStore.get('site-user-id')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('userId')?.value;

    if (!userId) {
      return corsify(
        request,
        NextResponse.json(
          {
            error: 'Not authenticated in app',
            details: 'Open solesmarket.com in this Chrome profile and log in, then try again.',
          },
          { status: 401 }
        )
      );
    }

    const carrier = detectCarrier(trackingNumber);

    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();

    let targetDocId: string | null = null;

    // Preferred: update by orderNumber (StockX email order number like 03-XXXX)
    if (orderNumber && typeof orderNumber === 'string') {
      const snap = await adminDb
        .collection('purchases')
        .where('userId', '==', userId)
        .where('orderNumber', '==', orderNumber)
        .limit(1)
        .get();
      if (!snap.empty) targetDocId = snap.docs[0].id;
    }

    // Fallback: some records store uid instead of userId
    if (!targetDocId && orderNumber && typeof orderNumber === 'string') {
      const snap = await adminDb
        .collection('purchases')
        .where('uid', '==', userId)
        .where('orderNumber', '==', orderNumber)
        .limit(1)
        .get();
      if (!snap.empty) targetDocId = snap.docs[0].id;
    }

    // If still not found, we can’t safely match (buyingId is not stored today).
    if (!targetDocId) {
      return corsify(
        request,
        NextResponse.json(
          {
            error: 'Purchase not found',
            details:
              'Could not find a matching purchase for this user. Ensure the purchase exists in FlipFlow and has the correct order number.',
            debug: { hasOrderNumber: !!orderNumber, stockxBuyingId: stockxBuyingId || null },
          },
          { status: 404 }
        )
      );
    }

    await adminDb.collection('purchases').doc(targetDocId).update({
      tracking: trackingNumber,
      carrier,
      trackingSource: 'chrome-extension',
      fedexUrl: typeof fedexUrl === 'string' ? fedexUrl : undefined,
      updatedAt: new Date().toISOString(),
    });

    return corsify(
      request,
      NextResponse.json({
        success: true,
        userId,
        purchaseId: targetDocId,
        orderNumber: orderNumber || null,
        trackingNumber,
        carrier,
      })
    );
  } catch (error: any) {
    return corsify(
      request,
      NextResponse.json(
        { error: 'Failed to sync tracking', details: error?.message || String(error) },
        { status: 500 }
      )
    );
  }
}


