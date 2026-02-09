import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';
import { getAdminDb } from '@/lib/firebase/admin';

function parseStockXMoneyToDollars(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // StockX is inconsistent across endpoints. Some return dollars (e.g. "113"),
  // others return cents (e.g. "11300"). Use a heuristic.
  return n >= 1000 ? n / 100 : n;
}

function getBearerToken(request: NextRequest): string | null {
  const raw = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const t = (m?.[1] || '').trim();
  return t ? t : null;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    let accessToken: string | null = null;
    let refreshToken: string | null = null;
    let usedCookieAuth = false;

    const bearer = getBearerToken(request);
    if (bearer) {
      const { resolveNativeAuthUserId } = await import('@/lib/nativeAuthResolver');
      const uid = await resolveNativeAuthUserId(request);
      if (!uid) {
        return NextResponse.json({ error: 'Invalid or missing Bearer token' }, { status: 401 });
      }
      const adminDb = getAdminDb();
      if (!adminDb) {
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
      }
      const userSnap = await adminDb.collection('users').doc(uid).get();
      const userData = (userSnap.data() || {}) as any;
      const stockxTokens = userData?.stockxTokens || {};
      accessToken = String(stockxTokens?.access_token || '').trim();
      refreshToken = String(stockxTokens?.refresh_token || '').trim();
      const expiresAt = Number(stockxTokens?.expires_at || 0);
      if (expiresAt && Date.now() > expiresAt - 60_000 && refreshToken) {
        const refreshed = await refreshStockXTokens(refreshToken);
        if (refreshed.success && refreshed.accessToken) {
          accessToken = refreshed.accessToken;
          refreshToken = refreshed.refreshToken || refreshToken;
        }
      }
    }

    if (!accessToken) {
      accessToken = cookieStore.get('stockx_access_token')?.value ?? null;
      refreshToken = cookieStore.get('stockx_refresh_token')?.value ?? null;
      usedCookieAuth = true;
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { listings } = body;
    
    if (!listings || !Array.isArray(listings)) {
      return NextResponse.json({ error: 'Invalid listings data' }, { status: 400 });
    }

    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const fetchOne = async (listing: any): Promise<{ listingId: string; marketData: any | null; error?: string }> => {
      const listingId = String(listing?.listingId || '');
      const productId = String(listing?.productId || '');
      const variantId = String(listing?.variantId || '');
      if (!listingId) return { listingId: '(unknown)', marketData: null, error: 'missing_listingId' };
      if (!productId || !variantId) return { listingId, marketData: null, error: 'missing_product_or_variant' };

      const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/market-data`;

      // Retry/backoff for 429/5xx, refresh once for 401
      const maxAttempts = 4;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await fetch(marketUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'ResellDashboard/1.0'
          }
        });

        if (res.status === 401 && refreshToken) {
          const refreshed = await refreshStockXTokens(refreshToken);
          if (refreshed.success && refreshed.accessToken) {
            accessToken = refreshed.accessToken;
            // Retry immediately with new token
            await res.text().catch(() => '');
            continue;
          }
          await res.text().catch(() => '');
          return { listingId, marketData: null, error: 'unauthorized' };
        }

        if (res.status === 429) {
          const ra = res.headers.get('retry-after');
          const raSeconds = ra ? parseInt(ra, 10) : NaN;
          await res.text().catch(() => '');
          const backoffMs = Number.isFinite(raSeconds)
            ? Math.min(30_000, Math.max(500, raSeconds * 1000))
            : Math.min(30_000, 750 * Math.pow(2, attempt));
          await sleep(backoffMs);
          continue;
        }

        if (res.status >= 500) {
          await res.text().catch(() => '');
          await sleep(Math.min(10_000, 500 * Math.pow(2, attempt)));
          continue;
        }

        if (!res.ok) {
          await res.text().catch(() => '');
          return { listingId, marketData: null, error: `upstream_${res.status}` };
        }

        const data = await res.json().catch(() => null);
        const variantData = Array.isArray(data)
          ? data.find((item: any) => String(item?.variantId) === String(variantId))
          : data;

        if (!variantData) return { listingId, marketData: null, error: 'no_variant_data' };

        return {
          listingId,
          marketData: {
            lowestAsk: parseStockXMoneyToDollars(variantData.lowestAskAmount),
            flexLowestAsk: parseStockXMoneyToDollars(variantData.flexLowestAskAmount),
            highestBid: parseStockXMoneyToDollars(variantData.highestBidAmount),
            lastSale: parseStockXMoneyToDollars(variantData.lastSaleAmount),
            numberOfAsks: variantData.numberOfAsks || 0,
            numberOfBids: variantData.numberOfBids || 0
          }
        };
      }

      return { listingId, marketData: null, error: 'rate_limited_or_unavailable' };
    };

    // IMPORTANT: do not start all requests at once (will 429). Run sequentially with a small delay.
    const results: Array<{ listingId: string; marketData: any | null; error?: string }> = [];
    for (let i = 0; i < listings.length; i++) {
      results.push(await fetchOne(listings[i]));
      // gentle pacing to reduce 429s
      if (i < listings.length - 1) await sleep(150);
    }

    const res = NextResponse.json({ success: true, marketData: results });
    if (usedCookieAuth && accessToken && accessToken !== cookieStore.get('stockx_access_token')?.value) {
      setStockXTokenCookies(res, accessToken, refreshToken);
    }
    return res;
    
  } catch (error) {
    console.error('Market data fetch error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch market data', 
      details: error.message 
    }, { status: 500 });
  }
}