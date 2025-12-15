import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

function normalizeSize(size: unknown): string {
  const raw = String(size || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  if (!raw) return '';

  // Common formats we see in purchases: "Size US XL", "US M 10.5", "Size: XL"
  // Common formats we see in StockX listings: "XL", "10.5", "W 7"
  // We normalize by removing noisy tokens and collapsing to the meaningful size token.
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
    'YOUTH'
  ]);

  const cleanedTokens = tokens.filter((t) => !ignore.has(t));
  const cleaned = cleanedTokens.join(' ').trim();
  if (!cleaned) return '';

  // If the string contains a known apparel size, return that single token.
  const apparel = new Set(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
  for (const t of cleanedTokens) {
    if (apparel.has(t)) return t;
  }

  // If we see a numeric size anywhere, return the numeric token (preserve leading W if present).
  // Examples:
  // - "M 10.5" -> "10.5"
  // - "W 7" -> "W 7"
  const numericToken = cleanedTokens.find((t) => /^\d+(\.\d+)?$/.test(t));
  if (numericToken) {
    const hasW = cleanedTokens[0] === 'W';
    return hasW ? `W ${numericToken}` : numericToken;
  }

  return cleaned;
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

function getSize(p: any): string {
  return normalizeSize(p?.size || p?.product?.size);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Returns available purchase units for the given user + (styleId, size).
 * "Available" means:
 * - has unitNumber (1–999)
 * - is not sold (no linkedSaleOrderNumber/linkedSaleId)
 * - is not already assigned to a StockX listing (no stockxListingId)
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const url = new URL(request.url);

    const styleId = (url.searchParams.get('styleId') || '').trim();
    const size = normalizeSize(url.searchParams.get('size') || '');
    const debug = url.searchParams.get('debug') === '1';

    let userId: string | undefined =
      cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value ||
      (url.searchParams.get('userId') || undefined);

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 401 });
    }
    if (!styleId) {
      return NextResponse.json({ success: false, error: 'styleId is required' }, { status: 400 });
    }
    if (!size) {
      return NextResponse.json({ success: false, error: 'size is required' }, { status: 400 });
    }

    const db = getAdminDb();
    const snap = await db.collection('purchases').where('userId', '==', userId).get();
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const breakdown = debug
      ? {
          total: all.length,
          withUnitNumber: 0,
          unsold: 0,
          unassigned: 0,
          styleMatched: 0,
          sizeMatched: 0
        }
      : null;

    const units = all
      .filter((p: any) => {
        const unitNumber = p?.unitNumber;
        const hasUnit =
          typeof unitNumber === 'number' && Number.isFinite(unitNumber) && unitNumber >= 1 && unitNumber <= 999;
        if (!hasUnit) return false;
        if (breakdown) breakdown.withUnitNumber++;

        // Unsold only
        if (p?.linkedSaleOrderNumber || p?.linkedSaleId) return false;
        if (breakdown) breakdown.unsold++;

        // Unassigned only
        if (p?.stockxListingId) return false;
        if (breakdown) breakdown.unassigned++;

        // Match by styleId + size
        const pStyle = getStyleId(p);
        if (!pStyle) return false;
        if (pStyle !== styleId) return false;
        if (breakdown) breakdown.styleMatched++;

        const pSize = getSize(p);
        if (!pSize) return false;
        if (pSize !== size) return false;
        if (breakdown) breakdown.sizeMatched++;

        return true;
      })
      .map((p: any) => ({
        purchaseId: p.id,
        unitNumber: p.unitNumber,
        orderNumber: p.orderNumber || null,
        purchaseDate: p.purchaseDate || p.purchase_date || null,
        totalAmount: typeof p.totalAmount === 'number' ? p.totalAmount : null,
        productName: p.product?.name || p.productName || null
      }))
      .sort((a, b) => a.unitNumber - b.unitNumber);

    return NextResponse.json({
      success: true,
      styleId,
      size,
      units,
      debug: breakdown
    });
  } catch (error: any) {
    console.error('❌ /api/purchases/available-units error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}


