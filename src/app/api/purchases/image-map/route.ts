import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

function normalizeSize(size: unknown): string {
  const raw = String(size || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  if (!raw) return '';

  const tokens = raw
    .replace(/[:]/g, ' ')
    .split(' ')
    .filter(Boolean);

  const ignore = new Set([
    'SIZE',
    'US',
    'U.S.',
    'USA',
    'MENS',
    "MEN'S",
    'MEN',
    'WOMENS',
    "WOMEN'S",
    'WOMEN',
    'KIDS',
    'KID',
    'YOUTH',
  ]);

  const cleanedTokens = tokens.filter((t) => !ignore.has(t));
  const cleaned = cleanedTokens.join(' ').trim();
  if (!cleaned) return '';

  const numericToken = cleanedTokens.find((t) => /^\d+(\.\d+)?$/.test(t));
  if (numericToken) {
    // Shoe sizes often appear as "US M 8.5" (Mens marker) or "US W 8.5".
    // If we have a numeric size, prefer it over treating "M" as apparel.
    const hasW = cleanedTokens.includes('W');
    return hasW ? `W ${numericToken}` : numericToken;
  }

  const apparel = new Set(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
  for (const t of cleanedTokens) {
    if (apparel.has(t)) return t;
  }

  return cleaned;
}

function normalizeProductName(name: unknown): string {
  const raw = String(name || '').trim().toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStyleId(styleId: unknown): string {
  const raw = String(styleId || '').trim().toUpperCase();
  if (!raw) return '';
  // Remove punctuation/spaces so "IO7684-921" and "IO7684921" match.
  return raw.replace(/[^A-Z0-9]+/g, '');
}

function nameTokens(nameNorm: string): string[] {
  if (!nameNorm) return [];
  const stop = new Set(['the', 'and', 'with', 'for', 'of', 'a', 'an', 'to', 'in']);
  return nameNorm.split(' ').filter((t) => t && !stop.has(t));
}

function getStyleId(p: any): string | null {
  const val =
    p?.styleId ||
    p?.style_id ||
    p?.product?.styleId ||
    p?.product?.style_id ||
    null;
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed ? trimmed : null;
}

function getProductName(p: any): string | null {
  const v = p?.product?.name || p?.productName || p?.product?.productName || p?.name || null;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

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
    (Array.isArray(p?.product?.images) ? p.product.images[0] : null) ||
    (Array.isArray(p?.images) ? p.images[0] : null) ||
    null;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Returns a mapping of purchase match keys => imageUrl from the user's purchases.
 *
 * Keys are one of:
 * - `style:<STYLEID>__<SIZE>`
 * - `name:<NORMALIZED_PRODUCT_NAME>__<SIZE>`
 *
 * Used as a fallback when StockX listing payload/catalog doesn't provide a product image.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const body = await request.json().catch(() => null);
    const debug = Boolean(body?.debug) || request.nextUrl.searchParams.get('debug') === '1';

    const keys = Array.isArray(body?.keys) ? body.keys : [];
    if (keys.length === 0) {
      return NextResponse.json({ success: false, error: 'keys[] is required' }, { status: 400 });
    }

    let userId: string | undefined =
      request.headers.get('x-user-id')?.trim() ||
      cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value ||
      (typeof body?.userId === 'string' ? body.userId : undefined);

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 401 });
    }

    const wanted = new Set<string>();
    const wantedStyleNormKeyToRequestedKeys = new Map<string, string[]>(); // key: "<STYLE_NORM>__<SIZE>"
    const wantedNameBySize: Record<string, Array<{ requestedKey: string; nameNorm: string; tokens: string[] }>> = {};
    for (const k of keys) {
      const size = normalizeSize(k?.size);
      if (!size) continue;

      const styleId = typeof k?.styleId === 'string' ? k.styleId.trim() : '';
      if (styleId) {
        const reqKey = `style:${styleId}__${size}`;
        wanted.add(reqKey);
        const n = normalizeStyleId(styleId);
        if (n) {
          const normKey = `${n}__${size}`;
          const arr = wantedStyleNormKeyToRequestedKeys.get(normKey) || [];
          arr.push(reqKey);
          wantedStyleNormKeyToRequestedKeys.set(normKey, arr);
        }
      }

      const productNameRaw = typeof k?.productName === 'string' ? k.productName : '';
      const productName = normalizeProductName(productNameRaw);
      if (productName) {
        const reqKey = `name:${productName}__${size}`;
        wanted.add(reqKey);
        (wantedNameBySize[size] ||= []).push({
          requestedKey: reqKey,
          nameNorm: productName,
          tokens: nameTokens(productName),
        });
      }
    }

    if (wanted.size === 0) {
      return NextResponse.json({ success: true, images: {} });
    }

    const db = getAdminDb();
    // Some older pipelines wrote purchases with `uid` instead of `userId`. Query both and merge.
    const [snapUserId, snapUid] = await Promise.all([
      db.collection('purchases').where('userId', '==', userId).get(),
      db.collection('purchases').where('uid', '==', userId).get(),
    ]);
    const byId = new Map<string, any>();
    for (const d of snapUserId.docs) byId.set(d.id, { id: d.id, ...d.data() });
    for (const d of snapUid.docs) if (!byId.has(d.id)) byId.set(d.id, { id: d.id, ...d.data() });
    const purchases = Array.from(byId.values());

    const images: Record<string, string> = {};

    // Prefer newest purchases (roughly) by iterating in whatever order; if we want strict newest,
    // we would need an indexed orderBy. For fallback images, "first match wins" is fine.
    for (const p of purchases) {
      const img = pickPurchaseImageUrl(p);
      if (!img) continue;
      const size = normalizeSize(p?.size || p?.product?.size);
      if (!size) continue;

      const styleId = getStyleId(p);
      if (styleId) {
        const k = `style:${styleId}__${size}`;
        // Exact key match (fast path)
        if (wanted.has(k) && !images[k]) images[k] = img;

        // Normalized styleId match (handles punctuation differences)
        const norm = normalizeStyleId(styleId);
        if (norm) {
          const normKey = `${norm}__${size}`;
          const reqKeys = wantedStyleNormKeyToRequestedKeys.get(normKey);
          if (reqKeys) {
            for (const rk of reqKeys) {
              if (!images[rk]) images[rk] = img;
            }
          }
        }
      }

      const nameRaw = getProductName(p);
      const normName = normalizeProductName(nameRaw);
      if (normName) {
        const k = `name:${normName}__${size}`;
        if (wanted.has(k) && !images[k]) images[k] = img;

        // Fuzzy name match (size-gated), for slight wording differences.
        const candidates = wantedNameBySize[size];
        if (candidates && candidates.length > 0) {
          const pTokens = nameTokens(normName);
          for (const c of candidates) {
            if (images[c.requestedKey]) continue;
            // quick check: substring either direction
            if (normName.includes(c.nameNorm) || c.nameNorm.includes(normName)) {
              images[c.requestedKey] = img;
              continue;
            }
            // token overlap heuristic (>= 3 shared tokens)
            if (pTokens.length >= 3 && c.tokens.length >= 3) {
              const set = new Set(pTokens);
              let shared = 0;
              for (const t of c.tokens) if (set.has(t)) shared++;
              if (shared >= 3) images[c.requestedKey] = img;
            }
          }
        }
      }
    }

    if (debug) {
      const wantedArr = Array.from(wanted);
      const foundKeys = Object.keys(images);
      const missingKeys = wantedArr.filter((k) => !images[k]);

      // Try to explain missing keys: find a matching purchase (style/name+size) that simply has no image fields.
      const missingExplainers = missingKeys.slice(0, 20).map((key) => {
        const isStyle = key.startsWith('style:');
        const payload = key.replace(/^style:|^name:/, '');
        const [left, size] = payload.split('__');
        const target = (left || '').trim();
        const targetSize = (size || '').trim();

        const match = purchases.find((p: any) => {
          const pSize = normalizeSize(p?.size || p?.product?.size);
          if (!pSize || pSize !== targetSize) return false;
          if (isStyle) {
            const sid = getStyleId(p);
            return sid ? sid.trim() === target : false;
          }
          const nm = normalizeProductName(getProductName(p));
          return nm ? nm === target : false;
        });

        const img = match ? pickPurchaseImageUrl(match) : null;
        return {
          key,
          matchedPurchase: Boolean(match),
          matchedPurchaseHasImage: Boolean(img),
          matchedPurchaseId: match?.id || null,
          matchedPurchaseOrderNumber: match?.orderNumber || match?.order_id || null,
          matchedPurchaseImageCandidate: img,
          matchedPurchaseProductName: match ? getProductName(match) : null,
          matchedPurchaseSize: match ? normalizeSize(match?.size || match?.product?.size) : null,
          matchedPurchaseStyleId: match ? getStyleId(match) : null,
        };
      });

      return NextResponse.json({
        success: true,
        images,
        debug: {
          wantedKeys: wantedArr.length,
          foundKeys: foundKeys.length,
          missingKeys: missingKeys.slice(0, 50),
          missingExplainers,
          purchasesScanned: purchases.length,
          purchasesFromUserIdQuery: snapUserId.size,
          purchasesFromUidQuery: snapUid.size,
        },
      });
    }

    return NextResponse.json({ success: true, images });
  } catch (error: any) {
    console.error('❌ /api/purchases/image-map error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}

