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

  const apparel = new Set(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
  for (const t of cleanedTokens) {
    if (apparel.has(t)) return t;
  }

  const numericToken = cleanedTokens.find((t) => /^\d+(\.\d+)?$/.test(t));
  if (numericToken) {
    // Shoe sizes often appear as "US M 8.5" (Mens marker) or "US W 8.5".
    // If we have a numeric size, prefer it over treating "M" as apparel.
    const hasW = cleanedTokens.includes('W');
    return hasW ? `W ${numericToken}` : numericToken;
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
    for (const k of keys) {
      const size = normalizeSize(k?.size);
      if (!size) continue;

      const styleId = typeof k?.styleId === 'string' ? k.styleId.trim() : '';
      if (styleId) wanted.add(`style:${styleId}__${size}`);

      const productNameRaw = typeof k?.productName === 'string' ? k.productName : '';
      const productName = normalizeProductName(productNameRaw);
      if (productName) wanted.add(`name:${productName}__${size}`);
    }

    if (wanted.size === 0) {
      return NextResponse.json({ success: true, images: {} });
    }

    const db = getAdminDb();
    const snap = await db.collection('purchases').where('userId', '==', userId).get();
    const purchases = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

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
        if (wanted.has(k) && !images[k]) images[k] = img;
      }

      const nameRaw = getProductName(p);
      const normName = normalizeProductName(nameRaw);
      if (normName) {
        const k = `name:${normName}__${size}`;
        if (wanted.has(k) && !images[k]) images[k] = img;
      }
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

