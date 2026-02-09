import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Match web + StockX docs: x-api-key + jwt, pageNumber/pageSize/listingStatuses. Try api first; on 401 try gateway. */
async function fetchListings(
  accessToken: string,
  apiKey: string,
  pageNumber: number,
  pageSize: number
): Promise<Response> {
  const params = new URLSearchParams({
    pageNumber: String(pageNumber),
    pageSize: String(pageSize),
    listingStatuses: 'ACTIVE',
  });
  const path = `/v2/selling/listings?${params.toString()}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'FlipFlow/1.0',
  } as const;
  const opts = { headers, cache: 'no-store' as RequestCache };
  let res = await fetch(`https://api.stockx.com${path}`, opts);
  if (!res.ok && (res.status === 401 || res.status === 403)) {
    const gw = await fetch(`https://gateway.stockx.com${path}`, opts);
    if (gw.ok) console.log('[StockX listings/native] gateway.stockx.com succeeded after api 401');
    return gw;
  }
  return res;
}

/** Extract first image URL from StockX catalog product payload (same logic as /api/stockx/catalog/products). */
function imageUrlFromCatalogProduct(product: any): string | null {
  if (!product || typeof product !== 'object') return null;
  const img =
    (Array.isArray(product.productImages) && product.productImages[0]) ||
    (Array.isArray(product.product_images) && product.product_images[0]) ||
    product.media?.imageUrl ||
    product.media?.image_url ||
    product.imageUrl ||
    product.image_url ||
    product.image ||
    (Array.isArray(product.media) &&
      (product.media.find((m: any) => m?.type === 'image' && m?.url)?.url ||
        product.media.find((m: any) => typeof m?.url === 'string')?.url));
  return typeof img === 'string' && img.trim() ? img.trim() : null;
}

/** Same as purchases/image-map: pick first image URL from a purchase doc. */
function pickPurchaseImageUrl(p: any): string | null {
  const v =
    p?.productImageUrl ||
    p?.imageUrl ||
    p?.product?.imageUrl ||
    p?.product?.image ||
    p?.product?.image_url ||
    p?.product?.thumbnail ||
    p?.product?.thumbnailUrl ||
    p?.product?.thumb ||
    (Array.isArray(p?.product?.images) ? p?.product?.images[0] : null) ||
    (Array.isArray(p?.images) ? p?.images[0] : null) ||
    null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

function normalizeSizeForMatch(size: unknown): string {
  const raw = String(size || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!raw) return '';
  const tokens = raw.replace(/[:]/g, ' ').split(' ').filter(Boolean);
  const ignore = new Set(['SIZE', 'US', 'U.S.', 'USA', 'MENS', "MEN'S", 'MEN', 'WOMENS', "WOMEN'S", 'WOMEN', 'KIDS', 'KID', 'YOUTH']);
  const cleanedTokens = tokens.filter((t) => !ignore.has(t));
  const cleaned = cleanedTokens.join(' ').trim();
  if (!cleaned) return '';
  const numericToken = cleanedTokens.find((t) => /^\d+(\.\d+)?$/.test(t));
  if (numericToken) {
    const hasW = cleanedTokens.includes('W');
    return hasW ? `W ${numericToken}` : numericToken;
  }
  const apparel = new Set(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
  for (const t of cleanedTokens) {
    if (apparel.has(t)) return t;
  }
  return cleaned;
}

function normalizeProductNameForMatch(name: unknown): string {
  const raw = String(name || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getStyleIdFromPurchase(p: any): string | null {
  const val = p?.styleId ?? p?.style_id ?? p?.product?.styleId ?? p?.product?.style_id ?? null;
  if (typeof val !== 'string') return null;
  const t = val.trim();
  return t || null;
}

function getProductNameFromPurchase(p: any): string | null {
  const v = p?.product?.name ?? p?.productName ?? p?.product?.productName ?? p?.name ?? null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

/** Fetch one product from StockX catalog; try gateway on 401. */
async function fetchCatalogProduct(
  productId: string,
  accessToken: string,
  apiKey: string
): Promise<{ imageUrl: string | null }> {
  const path = `/v2/catalog/products/${encodeURIComponent(productId)}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-API-Key': apiKey,
    Accept: 'application/json',
    'User-Agent': 'FlipFlow/1.0',
  } as const;
  const opts = { headers, cache: 'no-store' as RequestCache };
  let res = await fetch(`https://api.stockx.com${path}`, opts);
  if (res.status === 401 || res.status === 403) {
    res = await fetch(`https://gateway.stockx.com${path}`, opts);
  }
  if (!res.ok) return { imageUrl: null };
  const json = await res.json().catch(() => null);
  const product = json?.product ?? json;
  const imageUrl = imageUrlFromCatalogProduct(product);
  return { imageUrl };
}

export async function GET(request: NextRequest) {
  try {
    const uid = await resolveNativeAuthUserId(request);
    if (!uid) {
      return NextResponse.json(
        { success: false, error: 'Missing Authorization: Bearer <Firebase ID token or site session token>' },
        { status: 401 }
      );
    }
    // #region agent log
    const uidData = { uidPrefix: uid.slice(0, 8) };
    console.log('[StockX listings/native] uid resolved', uidData);
    fetch('http://127.0.0.1:7242/ingest/80c2e612-47e3-4f28-8d98-15f80c4fae0e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stockx/listings/native/route.ts:resolved-uid',message:'Listings API uid resolved',data:uidData,timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion agent log

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const userSnap = await adminDb.collection('users').doc(uid).get();
    const userData = (userSnap.data() || {}) as any;
    const stockxTokens = userData?.stockxTokens || {};

    let accessToken = String(stockxTokens?.access_token || '').trim();
    let refreshToken = String(stockxTokens?.refresh_token || '').trim();
    const expiresAt = Number(stockxTokens?.expires_at || 0);

    if (!accessToken || !refreshToken) {
      // #region agent log
      const noTokData = { uidPrefix: uid.slice(0, 8) };
      console.log('[StockX listings/native] no tokens for user', noTokData);
      fetch('http://127.0.0.1:7242/ingest/80c2e612-47e3-4f28-8d98-15f80c4fae0e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stockx/listings/native/route.ts:no-tokens',message:'No StockX tokens for user',data:noTokData,timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
      // #endregion agent log
      return NextResponse.json({ success: false, error: 'StockX not connected for this user' }, { status: 401 });
    }

    // Refresh if expired/near-expired
    if (expiresAt && Date.now() > expiresAt - 60_000) {
      const refreshed = await refreshStockXTokens(refreshToken);
      if (!refreshed.success || !refreshed.accessToken) {
        return NextResponse.json({ success: false, error: refreshed.error || 'Failed to refresh StockX token' }, { status: 401 });
      }

      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken || refreshToken;

      // We don't have expires_in here; give it a conservative 55m window to avoid constant refresh loops.
      const newExpiresAt = Date.now() + 55 * 60 * 1000;
      await adminDb.collection('users').doc(uid).set(
        {
          stockxTokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
            source: 'native_refresh',
          },
        },
        { merge: true }
      );
    }

    const pageNumber = Math.max(1, Number(request.nextUrl.searchParams.get('page') || request.nextUrl.searchParams.get('pageNumber') || '1') || 1);
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') || '100') || 100));
    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';

    let res = await fetchListings(accessToken, apiKey, pageNumber, pageSize);

    // If StockX says unauthorized, try refresh once.
    if (res.status === 401 || res.status === 403) {
      console.log('[StockX listings/native] got 401/403, attempting token refresh', { uidPrefix: uid.slice(0, 8) });
      const refreshed = await refreshStockXTokens(refreshToken);
      if (!refreshed.success || !refreshed.accessToken) {
        console.log('[StockX listings/native] refresh failed', { uidPrefix: uid.slice(0, 8), error: refreshed.error || 'no token' });
        return NextResponse.json({ success: false, error: 'StockX token expired, please reconnect' }, { status: 401 });
      }
      console.log('[StockX listings/native] refresh ok, retrying listings request');
      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken || refreshToken;
      const newExpiresAt = Date.now() + 55 * 60 * 1000;
      await adminDb.collection('users').doc(uid).set(
        {
          stockxTokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
            source: 'native_refresh_401',
          },
        },
        { merge: true }
      );

      res = await fetchListings(accessToken, apiKey, pageNumber, pageSize);
      console.log('[StockX listings/native] retry response status', { status: res.status, uidPrefix: uid.slice(0, 8) });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // #region agent log
      const stockxFailData = { status: res.status, uidPrefix: uid.slice(0, 8) };
      console.log('[StockX listings/native] StockX API non-OK', stockxFailData);
      fetch('http://127.0.0.1:7242/ingest/80c2e612-47e3-4f28-8d98-15f80c4fae0e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stockx/listings/native/route.ts:stockx-401',message:'StockX API non-OK',data:stockxFailData,timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
      // #endregion agent log
      return NextResponse.json(
        { success: false, error: 'Failed to fetch listings from StockX', status: res.status, detail: text.slice(0, 200) },
        { status: 502 }
      );
    }

    const data = await res.json().catch(() => null);
    // StockX may return listings at data.listings, data.data, or data.data.listings (match web route).
    const listings: any[] =
      (Array.isArray(data?.listings) ? data.listings : null) ??
      (Array.isArray((data as any)?.data?.listings) ? (data as any).data.listings : null) ??
      (Array.isArray(data?.data) ? data.data : null) ??
      [];
    if (listings.length > 0) {
      // 1) Normalize imageUrl from listing.product when present
      for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        const product = listing.product || {};
        const imageUrl =
          (Array.isArray(product.productImages) && product.productImages[0]) ||
          (Array.isArray(product.product_images) && product.product_images[0]) ||
          product.imageUrl ||
          product.image_url ||
          product.media?.imageUrl ||
          product.media?.image_url ||
          listing.imageUrl ||
          listing.image_url ||
          null;
        const url = typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null;
        listings[i] = { ...listing, imageUrl: url, image_url: url };
      }

      // 2) Enrich missing images from StockX catalog (same as web repricing)
      const missingImageByProductId = new Map<string, number[]>();
      listings.forEach((listing: any, index: number) => {
        const pid = String(listing.productId ?? listing.product?.productId ?? '').trim();
        const hasImage = typeof listing.imageUrl === 'string' && listing.imageUrl.trim().length > 0;
        if (pid && !hasImage) {
          if (!missingImageByProductId.has(pid)) missingImageByProductId.set(pid, []);
          missingImageByProductId.get(pid)!.push(index);
        }
      });
      const productIdsToFetch = Array.from(missingImageByProductId.keys()).slice(0, 40);
      if (productIdsToFetch.length > 0) {
        const catalogImageByProductId: Record<string, string> = {};
        for (const productId of productIdsToFetch) {
          await new Promise((r) => setTimeout(r, 120));
          const { imageUrl } = await fetchCatalogProduct(productId, accessToken, apiKey);
          if (imageUrl) catalogImageByProductId[productId] = imageUrl;
        }
        for (const [productId, imageUrl] of Object.entries(catalogImageByProductId)) {
          const indices = missingImageByProductId.get(productId) ?? [];
          for (const i of indices) {
            listings[i] = { ...listings[i], imageUrl, image_url: imageUrl };
          }
        }
      }

      // 3) Fallback: same as deliveries/purchases — match from user's purchases by productName+size (and styleId+size if present)
      const stillMissing: number[] = [];
      listings.forEach((listing: any, index: number) => {
        const hasImage = typeof listing.imageUrl === 'string' && listing.imageUrl.trim().length > 0;
        if (!hasImage) stillMissing.push(index);
      });
      if (stillMissing.length > 0) {
        const [snapUserId, snapUid] = await Promise.all([
          adminDb.collection('purchases').where('userId', '==', uid).get(),
          adminDb.collection('purchases').where('uid', '==', uid).get(),
        ]);
        const purchaseById = new Map<string, any>();
        for (const d of snapUserId.docs) purchaseById.set(d.id, { id: d.id, ...d.data() });
        for (const d of snapUid.docs) if (!purchaseById.has(d.id)) purchaseById.set(d.id, { id: d.id, ...d.data() });
        const purchases = Array.from(purchaseById.values());

        const imageByStyleSize = new Map<string, string>();
        const imageByNameSize = new Map<string, string>();
        for (const p of purchases) {
          const img = pickPurchaseImageUrl(p);
          if (!img) continue;
          const size = normalizeSizeForMatch(p?.size ?? p?.product?.size);
          if (!size) continue;
          const styleId = getStyleIdFromPurchase(p);
          if (styleId) {
            const styleNorm = String(styleId).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
            if (styleNorm) imageByStyleSize.set(`${styleNorm}__${size}`, img);
          }
          const name = normalizeProductNameForMatch(getProductNameFromPurchase(p));
          if (name) imageByNameSize.set(`${name}__${size}`, img);
        }

        for (const i of stillMissing) {
          const listing = listings[i];
          const size = normalizeSizeForMatch(listing.size ?? listing.variant?.size ?? listing.variant?.variantValue);
          const productName = normalizeProductNameForMatch(
            listing.productName ?? listing.product?.productName ?? listing.product?.title ?? listing.product?.name
          );
          const styleId = listing.styleId ?? listing.product?.styleId ?? listing.product?.style_id ?? null;
          let img: string | null = null;
          if (styleId && size) {
            const key = `${String(styleId).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '')}__${size}`;
            img = imageByStyleSize.get(key) ?? null;
          }
          if (!img && productName && size) {
            img = imageByNameSize.get(`${productName}__${size}`) ?? null;
          }
          if (img) {
            listings[i] = { ...listing, imageUrl: img, image_url: img };
          }
        }
      }

      // Ensure response has data.listings for clients (iOS expects payload.listings)
      data.listings = listings;
    }
    return NextResponse.json({ success: true, uid, data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}

