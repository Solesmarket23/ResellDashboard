import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function resolveUserId(request: NextRequest): string | null {
  // Allow explicit override via query param (useful for debugging when cookies are set to a different userId).
  const fromQuery = request.nextUrl.searchParams.get('userId');
  if (fromQuery) return fromQuery;

  const cookieStore = cookies();
  const fromCookie =
    cookieStore.get('userId')?.value ||
    cookieStore.get('siteUserId')?.value ||
    cookieStore.get('site-user-id')?.value ||
    null;
  if (fromCookie) return fromCookie;
  return null;
}

function getListingIdFromSaleDoc(doc: any): string | null {
  const v = doc?.stockxData?.listingId ?? doc?.listingId ?? null;
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const cookieUserId =
      cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value ||
      null;
    const queryUserId = request.nextUrl.searchParams.get('userId');

    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId', debug: { cookieUserId, queryUserId } },
        { status: 401 }
      );
    }

    const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') || '1000', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 5000) : 1000;

    const db = getAdminDb();

    // We keep this light: page by documentId so it works without extra indexes.
    // (This endpoint is for diagnostics, not for production UI.)
    const userSalesSnap = await db
      .collection('user_sales')
      .where('userId', '==', userId)
      .orderBy(FieldPath.documentId())
      .limit(limit)
      .get();

    const userSalesRows = userSalesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Breakdowns (computed in-memory so we don't require composite indexes like userId+platform)
    const platformCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};

    const stockxRows = userSalesRows.filter((r: any) => {
      const p = String(r?.platform || '').toLowerCase();
      return p === 'stockx';
    });

    for (const r of userSalesRows) {
      const p = String((r as any)?.platform || '(missing)');
      platformCounts[p] = (platformCounts[p] || 0) + 1;

      const s = String((r as any)?.source || '(missing)');
      sourceCounts[s] = (sourceCounts[s] || 0) + 1;
    }

    let withListingId = 0;
    const samples: Array<{ saleId: string; orderNumber?: string; listingId: string }> = [];
    const missingSamples: Array<{ saleId: string; orderNumber?: string }> = [];

    for (const r of stockxRows) {
      const listingId = getListingIdFromSaleDoc(r);
      if (listingId) {
        withListingId++;
        if (samples.length < 5) {
          samples.push({ saleId: String((r as any).id), orderNumber: (r as any).orderNumber, listingId });
        }
      } else if (missingSamples.length < 5) {
        missingSamples.push({ saleId: String((r as any).id), orderNumber: (r as any).orderNumber });
      }
    }

    const totalStockx = stockxRows.length;
    const pct = totalStockx > 0 ? Math.round((withListingId / totalStockx) * 1000) / 10 : 0;

    // Also check legacy collections so we can tell if imports are landing somewhere else.
    // NOTE: These are best-effort and capped; they help debug "scanned=0" cases.
    const legacySalesSnap = await db
      .collection('sales')
      .where('userId', '==', userId)
      .orderBy(FieldPath.documentId())
      .limit(1)
      .get();

    const stockxSalesSnap = await db
      .collection('stockxSales')
      .where('userId', '==', userId)
      .orderBy(FieldPath.documentId())
      .limit(1)
      .get();

    return NextResponse.json({
      success: true,
      userId,
      debug: {
        cookieUserId,
        queryUserId,
        resolvedFrom: queryUserId ? 'query' : cookieUserId ? 'cookie' : 'none'
      },
      // user_sales totals
      userSalesScanned: userSalesRows.length,
      userSalesPlatformCounts: platformCounts,
      userSalesSourceCounts: sourceCounts,

      // stockx subset within user_sales
      scanned: totalStockx,
      withListingId,
      withoutListingId: totalStockx - withListingId,
      percentWithListingId: pct,
      samplesWithListingId: samples,
      samplesWithoutListingId: missingSamples,

      // legacy collections (presence checks)
      legacy: {
        salesCollectionHasAny: !legacySalesSnap.empty,
        stockxSalesCollectionHasAny: !stockxSalesSnap.empty
      }
    });
  } catch (error: any) {
    console.error('❌ listingid-stats error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}


