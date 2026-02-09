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
    return NextResponse.json({ success: true, uid, data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}

