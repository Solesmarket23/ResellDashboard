import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { resolveNativeAuthUserId } from '@/lib/nativeAuthResolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchListings(accessToken: string, page = 1, pageSize = 100) {
  // StockX endpoints vary by account. This is the same base used elsewhere in the repo.
  const url = `https://api.stockx.com/v2/selling/listings?limit=${pageSize}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  return res;
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

    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') || '1') || 1);
    const pageSize = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') || '100') || 100));

    let res = await fetchListings(accessToken, page, pageSize);

    // If StockX says unauthorized, try refresh once.
    if (res.status === 401 || res.status === 403) {
      const refreshed = await refreshStockXTokens(refreshToken);
      if (!refreshed.success || !refreshed.accessToken) {
        return NextResponse.json({ success: false, error: 'StockX token expired, please reconnect' }, { status: 401 });
      }

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

      res = await fetchListings(accessToken, page, pageSize);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { success: false, error: 'Failed to fetch listings from StockX', status: res.status, detail: text.slice(0, 200) },
        { status: 502 }
      );
    }

    const data = await res.json().catch(() => null);
    return NextResponse.json({ success: true, uid, data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}

