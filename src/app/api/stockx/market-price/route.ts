import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { fetchStockXMarketPriceDetailed } from '@/lib/stockx/marketPrice';
import { extractStockXUrlKeyFromPurchase } from '@/lib/stockx/stockxLink';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function pickFirstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string') {
      const s = c.trim();
      if (s) return s;
    }
  }
  return null;
}

function pickProductName(p: any): string {
  return (
    pickFirstString(p?.productName, p?.product?.name, p?.product?.productName, p?.title, p?.name, p?.itemName) ||
    'Unknown Product'
  );
}

function pickSize(p: any): string {
  return pickFirstString(p?.productSize, p?.product?.size, p?.size) || 'Unknown';
}

function pickStyleId(p: any): string | null {
  const v = p?.styleId || p?.style_id || p?.product?.styleId || p?.sku || null;
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
}

function pickStockXIds(p: any): { productId?: string; variantId?: string } {
  const pid = p?.stockxProductId || p?.productId || p?.product?.productId || p?.product?.id || undefined;
  const vid = p?.stockxVariantId || p?.variantId || p?.variant?.variantId || p?.variant?.id || undefined;
  const productId = typeof pid === 'string' && pid.trim() ? pid.trim() : undefined;
  const variantId = typeof vid === 'string' && vid.trim() ? vid.trim() : undefined;
  return { productId, variantId };
}

async function getStockXAuthForUser(request: NextRequest, userId: string): Promise<{ apiKey: string; accessToken?: string; refreshToken?: string } | null> {
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;
  if (!apiKey) return null;

  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshTokenCookie = request.cookies.get('stockx_refresh_token')?.value;
  if (accessToken || refreshTokenCookie) {
    return { apiKey, accessToken, refreshToken: refreshTokenCookie };
  }

  // Fallback: use user's stored refresh token (so this works even if cookies are missing)
  try {
    const db = getAdminDb();
    const userSnap = await db.collection('users').doc(userId).get();
    const data = userSnap.exists ? (userSnap.data() as any) : null;
    const tokens = data?.stockxTokens || null;
    const refreshToken =
      (tokens?.refresh_token as string | undefined) ||
      (tokens?.refreshToken as string | undefined) ||
      undefined;
    if (!refreshToken) return { apiKey };
    return { apiKey, refreshToken };
  } catch {
    return { apiKey };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    const purchaseId = typeof body?.purchaseId === 'string' ? body.purchaseId.trim() : '';
    const fallback = body?.fallback && typeof body.fallback === 'object' ? body.fallback : null;

    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    if (!purchaseId && !fallback) {
      return NextResponse.json({ success: false, error: 'Missing purchaseId (or fallback payload)' }, { status: 400 });
    }

    const auth = await getStockXAuthForUser(request, userId);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'StockX API key not configured (missing STOCKX_API_KEY)' }, { status: 500 });
    }

    const db = getAdminDb();
    if (!db) return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });

    // Prefer reading the Firestore purchase doc so we can persist the fetched marketPrice.
    let purchaseDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    let purchaseData: any | null = null;

    if (purchaseId) {
      purchaseDoc = await db.collection('purchases').doc(purchaseId).get();
      if (purchaseDoc.exists) {
        purchaseData = purchaseDoc.data() as any;
        const owner = String(purchaseData?.userId || purchaseData?.uid || '').trim();
        if (owner && owner !== userId) {
          return NextResponse.json({ success: false, error: 'Unauthorized (purchase does not belong to user)' }, { status: 403 });
        }
      }
    }

    // If doc doesn't exist (e.g. localStorage-only purchase), fall back to passed identifiers.
    const productName = purchaseData ? pickProductName(purchaseData) : pickProductName(fallback);
    const size = purchaseData ? pickSize(purchaseData) : pickSize(fallback);
    const styleId = purchaseData ? pickStyleId(purchaseData) : pickStyleId(fallback);
    const urlKey = purchaseData ? extractStockXUrlKeyFromPurchase(purchaseData) : extractStockXUrlKeyFromPurchase(fallback);
    const ids = purchaseData ? pickStockXIds(purchaseData) : pickStockXIds(fallback);

    // Need *some* search term.
    if (!productName || productName === 'Unknown Product') {
      return NextResponse.json({ success: false, error: 'Missing productName for StockX lookup' }, { status: 400 });
    }

    const hasAuthTokens = Boolean((auth as any).accessToken || (auth as any).refreshToken);
    if (!hasAuthTokens) {
      return NextResponse.json({ success: false, error: 'StockX not connected for this user (missing tokens)' }, { status: 401 });
    }

    const result = await fetchStockXMarketPriceDetailed({
      auth,
      productName,
      // Use the display size (preserves cohort hints like "US W 8") for variant matching.
      size,
      styleId,
      urlKey,
      productId: ids.productId,
      variantId: ids.variantId,
    });

    if (!result.price || result.reason !== 'ok') {
      return NextResponse.json(
        {
          success: false,
          error: 'Market price unavailable',
          reason: result.reason,
          stage: result.stage,
          httpStatus: result.httpStatus,
          details: result.details,
        },
        { status: 502 }
      );
    }

    // Persist back to Firestore when we have a real purchase doc.
    if (purchaseDoc && purchaseDoc.exists) {
      await db
        .collection('purchases')
        .doc(purchaseDoc.id)
        .set(
          {
            marketPrice: result.price,
            marketPriceUpdatedAt: new Date().toISOString(),
            stockxProductId: result.productId || ids.productId || null,
            stockxVariantId: result.variantId || ids.variantId || null,
            stockxUrlKey: result.urlKey || urlKey || null,
          },
          { merge: true }
        );
    }

    return NextResponse.json({
      success: true,
      price: result.price,
      priceSource: result.priceSource || null,
      stockx: {
        productId: result.productId || ids.productId || null,
        variantId: result.variantId || ids.variantId || null,
        urlKey: result.urlKey || urlKey || null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}

