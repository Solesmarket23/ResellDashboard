import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminMessaging } from '@/lib/firebase/admin';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const FIFTEEN_MINS_MS = 15 * 60 * 1000;
const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour before notifying again for same listing

function parseStockXMoneyToDollars(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1000 ? n / 100 : n;
}

function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const host = request.headers.get('host') || '';
  return (
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    host.includes('localhost') ||
    host.includes('solesmarket.com')
  );
}

async function fetchListings(accessToken: string, apiKey: string): Promise<any[]> {
  const params = new URLSearchParams({
    pageNumber: '1',
    pageSize: '50',
    listingStatuses: 'ACTIVE',
  });
  const res = await fetch(
    `https://api.stockx.com/v2/selling/listings?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
    }
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const list = Array.isArray(data?.listings) ? data.listings : Array.isArray(data?.data) ? data.data : [];
  return list;
}

async function fetchMarketData(
  productId: string,
  variantId: string,
  accessToken: string,
  apiKey: string
): Promise<{ lowestAsk: number | null }> {
  const url = `https://api.stockx.com/v2/catalog/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/market-data`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-API-Key': apiKey,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) return { lowestAsk: null };
  const data = await res.json().catch(() => null);
  const variant = Array.isArray(data) ? data.find((v: any) => String(v?.variantId) === String(variantId)) : data;
  const lowestAsk = parseStockXMoneyToDollars(variant?.lowestAskAmount ?? variant?.lowestAsk);
  return { lowestAsk };
}

export async function GET(request: NextRequest) {
  try {
    if (process.env.CRON_PAUSED === '1' || process.env.CRON_PAUSED === 'true') {
      return NextResponse.json({ success: true, paused: true, message: 'Cron paused' });
    }

    if (!verifyCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const messaging = getAdminMessaging();
    if (!adminDb || !messaging) {
      return NextResponse.json({ error: 'Firebase not initialized' }, { status: 500 });
    }

    const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID || '';
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing STOCKX_API_KEY' }, { status: 500 });
    }

    const usersSnap = await adminDb.collection('users').where('buyboxPushEnabled', '==', true).get();
    const now = Date.now();
    let sent = 0;
    let errors = 0;

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data() || {};
      const pushTokens: Array<{ token: string; platform: string }> = userData.pushTokens || [];
      const stockxTokens = userData.stockxTokens || {};
      let accessToken = String(stockxTokens.access_token || '').trim();
      let refreshToken = String(stockxTokens.refresh_token || '').trim();

      if (pushTokens.length === 0 || !accessToken || !refreshToken) continue;

      const expiresAt = Number(stockxTokens.expires_at || 0);
      if (expiresAt && now > expiresAt - 60_000) {
        const refreshed = await refreshStockXTokens(refreshToken);
        if (refreshed.success && refreshed.accessToken) {
          accessToken = refreshed.accessToken;
          refreshToken = refreshed.refreshToken || refreshToken;
          await adminDb.collection('users').doc(uid).set(
            {
              stockxTokens: {
                ...stockxTokens,
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_at: now + 55 * 60 * 1000,
              },
            },
            { merge: true }
          );
        } else {
          errors++;
          continue;
        }
      }

      const listings = await fetchListings(accessToken, apiKey);
      if (listings.length === 0) continue;

      const buyboxState: Record<string, { firstNotWinningAt: number; lastNotifiedAt?: number }> =
        userData.buyboxAlertState || {};
      let stateUpdated = false;

      for (let i = 0; i < Math.min(listings.length, 20); i++) {
        await new Promise((r) => setTimeout(r, 180));
        const listing = listings[i];
        const listingId = String(listing?.listingId || listing?.id || '').trim();
        const productId = String(listing?.productId || listing?.product?.productId || '').trim();
        const variantId = String(listing?.variantId || listing?.variant?.variantId || '').trim();
        const productName =
          listing?.productName ||
          listing?.product?.productName ||
          listing?.product?.title ||
          listing?.product?.name ||
          'Listing';
        const amount = listing?.amount ?? listing?.price ?? '0';
        const myPrice = parseStockXMoneyToDollars(amount) ?? (parseFloat(amount) || 0);
        if (myPrice <= 0 || !productId || !variantId) continue;

        const { lowestAsk } = await fetchMarketData(productId, variantId, accessToken, apiKey);
        if (lowestAsk == null) continue;

        const notWinning = myPrice > lowestAsk;
        const state = buyboxState[listingId] || { firstNotWinningAt: 0 };

        if (notWinning) {
          if (!state.firstNotWinningAt) {
            state.firstNotWinningAt = now;
            buyboxState[listingId] = state;
            stateUpdated = true;
          }
          const elapsed = now - state.firstNotWinningAt;
          const lastNotified = state.lastNotifiedAt || 0;
          const cooldownPassed = now - lastNotified >= NOTIFY_COOLDOWN_MS;
          if (elapsed >= FIFTEEN_MINS_MS && cooldownPassed) {
            const title = "You're not winning the buybox";
            const body = `${productName} — someone is listing lower than your $${Math.round(myPrice)}. Tap to open.`;
            for (const t of pushTokens) {
              if (!t.token?.trim()) continue;
              try {
                await messaging.send({
                  token: t.token.trim(),
                  notification: { title, body },
                  data: {
                    type: 'buybox_lost',
                    listingId,
                    productName: productName.slice(0, 100),
                  },
                  apns: {
                    payload: {
                      aps: { 'mutable-content': 1, sound: 'default' },
                    },
                    fcmOptions: {},
                  },
                });
                sent++;
              } catch (e) {
                errors++;
              }
            }
            state.lastNotifiedAt = now;
            buyboxState[listingId] = state;
            stateUpdated = true;
          }
        } else {
          if (state.firstNotWinningAt) {
            delete buyboxState[listingId];
            stateUpdated = true;
          }
        }
      }

      if (stateUpdated) {
        await adminDb.collection('users').doc(uid).update({
          buyboxAlertState: buyboxState,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      usersChecked: usersSnap.size,
      notificationsSent: sent,
      errors,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[cron/buybox-alerts]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
