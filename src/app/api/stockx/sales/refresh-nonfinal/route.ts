import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeOrderStatus(status: unknown): string {
  const raw = String(status || '').trim();
  if (!raw) return '';
  return raw.toUpperCase().replace(/\s+/g, '_');
}

function isFinalStockxStatus(status: unknown): boolean {
  const st = normalizeOrderStatus(status);
  return st === 'COMPLETED' || st === 'PAYOUTCOMPLETED' || st === 'PAYOUT_COMPLETED';
}

function parseMoney(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const dollars = Math.abs(value) > 5000 ? value / 100 : value;
    return Math.round(dollars * 100) / 100;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    const dollars = Math.abs(n) > 5000 ? n / 100 : n;
    return Math.round(dollars * 100) / 100;
  }
  return null;
}

function getEffectiveUserId(request: NextRequest): string | null {
  const qpUserId = request.nextUrl.searchParams.get('userId')?.trim();
  if (qpUserId) return qpUserId;
  const header = request.headers.get('x-user-id')?.trim();
  if (header) return header;
  const cookie =
    request.cookies.get('site-user-id')?.value ||
    request.cookies.get('siteUserId')?.value ||
    request.cookies.get('userId')?.value ||
    null;
  return cookie ? String(cookie).trim() : null;
}

async function loadUserStockxTokens(userId: string): Promise<{
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number | null;
}> {
  const db = getAdminDb();
  const snap = await db.collection('users').doc(String(userId)).get();
  const data = snap.exists ? (snap.data() as any) : null;
  const tokens = data?.stockxTokens || null;
  return {
    accessToken: tokens?.access_token || tokens?.accessToken || undefined,
    refreshToken: tokens?.refresh_token || tokens?.refreshToken || undefined,
    expiresAt: typeof tokens?.expires_at === 'number' ? tokens.expires_at : null,
  };
}

async function saveUserStockxTokens(userId: string, tokens: { accessToken: string; refreshToken: string; expiresAt: number }) {
  const db = getAdminDb();
  await db
    .collection('users')
    .doc(String(userId))
    .set(
      {
        stockxTokens: {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_at: tokens.expiresAt,
          updated_at: new Date().toISOString(),
        },
      },
      { merge: true }
    );
}

async function getLastRefreshMs(userId: string): Promise<number | null> {
  const db = getAdminDb();
  const snap = await db.collection('users').doc(String(userId)).get();
  const data = snap.exists ? (snap.data() as any) : null;
  const v = data?.stockxSalesNonFinalRefresh?.lastRunAtMs;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function setLastRefreshMs(userId: string, lastRunAtMs: number, summary: any) {
  const db = getAdminDb();
  await db
    .collection('users')
    .doc(String(userId))
    .set(
      {
        stockxSalesNonFinalRefresh: {
          lastRunAtMs,
          lastRunAtIso: new Date(lastRunAtMs).toISOString(),
          summary: summary || null,
        },
      },
      { merge: true }
    );
}

async function scanSalesByUserId(userId: string, scanLimit: number): Promise<any[]> {
  const db = getAdminDb();
  const out: any[] = [];
  let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  const pageSize = 1000;
  while (out.length < scanLimit) {
    let q: FirebaseFirestore.Query = db
      .collection('user_sales')
      .where('userId', '==', userId)
      .orderBy(FieldPath.documentId())
      .limit(Math.min(pageSize, scanLimit - out.length));
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    out.push(...snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < pageSize) break;
  }
  return out;
}

async function fetchOrderDetails(orderNumber: string, apiKey: string, accessToken: string): Promise<any> {
  const url = `https://api.stockx.com/v2/selling/orders/${encodeURIComponent(orderNumber)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': apiKey,
      Accept: 'application/json',
      'User-Agent': 'FlipFlow/1.0',
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`StockX order details failed (${res.status})`);
    (err as any).status = res.status;
    (err as any).details = txt;
    throw err;
  }
  return await res.json().catch(() => ({}));
}

export async function POST(request: NextRequest) {
  try {
    const userId = getEffectiveUserId(request);
    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

    // Safety: prevent refreshing other users by requiring cookie/header user to match query when present.
    const qpUserId = request.nextUrl.searchParams.get('userId')?.trim();
    const headerUserId = request.headers.get('x-user-id')?.trim();
    const cookieUserId =
      request.cookies.get('site-user-id')?.value ||
      request.cookies.get('siteUserId')?.value ||
      request.cookies.get('userId')?.value ||
      '';
    const effective = (headerUserId || cookieUserId || '').trim();
    if (qpUserId && effective && qpUserId !== effective) {
      return NextResponse.json({ success: false, error: 'Unauthorized (user mismatch)' }, { status: 403 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const force = body?.force === true || body?.force === 1 || body?.force === '1';
    const ttlHours = Math.max(1, Math.min(48, Number(body?.ttlHours ?? 12)));
    const ttlMs = ttlHours * 60 * 60 * 1000;
    const maxOrders = Math.max(1, Math.min(200, Number(body?.maxOrders ?? 80)));
    const scanLimit = Math.max(100, Math.min(20000, Number(body?.scanLimit ?? 8000)));

    const now = Date.now();
    const lastRefreshMs = await getLastRefreshMs(userId);
    const ageMs = typeof lastRefreshMs === 'number' ? now - lastRefreshMs : null;
    if (!force && typeof ageMs === 'number' && ageMs >= 0 && ageMs < ttlMs) {
      return NextResponse.json({
        success: true,
        userId,
        skipped: true,
        reason: 'ttl_not_expired',
        ttlHours,
        lastRunAtMs: lastRefreshMs,
        lastRunAtIso: new Date(lastRefreshMs).toISOString(),
      });
    }

    const apiKey = process.env.STOCKX_API_KEY || '';
    if (!apiKey) return NextResponse.json({ success: false, error: 'Missing STOCKX_API_KEY' }, { status: 500 });

    // Prefer cookie tokens (interactive), fall back to Firebase user doc (cron/server-side)
    const cookieStore = cookies();
    let accessToken = cookieStore.get('stockx_access_token')?.value || undefined;
    let refreshToken = cookieStore.get('stockx_refresh_token')?.value || undefined;
    const expiresAtCookie = cookieStore.get('stockx_token_expires_at')?.value || '';
    const expiresAtFromCookie = expiresAtCookie ? Number(expiresAtCookie) : null;

    if (!accessToken || !refreshToken) {
      const stored = await loadUserStockxTokens(userId);
      accessToken = accessToken || stored.accessToken;
      refreshToken = refreshToken || stored.refreshToken;
    }

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, error: 'StockX not connected (missing refresh token). Reconnect to StockX first.' },
        { status: 401 }
      );
    }

    // Refresh token if access token missing or expired
    const shouldRefresh =
      !accessToken ||
      (typeof expiresAtFromCookie === 'number' && Number.isFinite(expiresAtFromCookie) && expiresAtFromCookie > 0 && expiresAtFromCookie <= now);
    if (shouldRefresh) {
      const refreshed = await refreshStockXTokens(refreshToken);
      if (!refreshed.success || !refreshed.accessToken) {
        return NextResponse.json(
          { success: false, error: refreshed.error || 'StockX token refresh failed', needsReauth: true },
          { status: 401 }
        );
      }
      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken || refreshToken;
      // Save to Firebase so future server-side refreshes can run without cookies
      await saveUserStockxTokens(userId, { accessToken, refreshToken, expiresAt: now + 3600 * 1000 });
    }

    // Load sales and pick candidates that are non-final or missing payout/fees.
    const sales = await scanSalesByUserId(userId, scanLimit);
    const byOrderNumber = new Map<string, { id: string; data: any }>();
    for (const s of sales) {
      const orderNumber = String(s?.orderNumber || '').trim();
      if (!orderNumber) continue;
      if (!byOrderNumber.has(orderNumber)) byOrderNumber.set(orderNumber, { id: String(s.id), data: s });
    }

    const candidates: Array<{ orderNumber: string; docId: string }> = [];
    for (const [orderNumber, v] of byOrderNumber.entries()) {
      const st = v.data?.status;
      const payout = v.data?.payout ?? v.data?.totalPayout ?? v.data?.pricing?.totalPayout ?? null;
      const fees = v.data?.fees ?? v.data?.totalFees ?? v.data?.pricing?.fees ?? null;
      const payoutMissing = payout === null || payout === undefined || payout === 0;
      const feesMissing = fees === null || fees === undefined;
      if (!isFinalStockxStatus(st) || payoutMissing || feesMissing) {
        candidates.push({ orderNumber, docId: v.id });
      }
    }

    // Smallest-first: refresh the most recently updated first (best-effort) by sorting on sale date.
    // If date missing, keep but later.
    const parseMs = (iso: any) => {
      const t = Date.parse(String(iso || ''));
      return Number.isFinite(t) ? t : null;
    };
    candidates.sort((a, b) => {
      const aData = byOrderNumber.get(a.orderNumber)?.data;
      const bData = byOrderNumber.get(b.orderNumber)?.data;
      const aMs = parseMs(aData?.date) ?? parseMs(aData?.updatedAt) ?? 0;
      const bMs = parseMs(bData?.date) ?? parseMs(bData?.updatedAt) ?? 0;
      return bMs - aMs;
    });

    const toRefresh = candidates.slice(0, maxOrders);
    const db = getAdminDb();

    let refreshedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const failures: Array<{ orderNumber: string; error: string; status?: number }> = [];

    // Concurrency-limited refresh to reduce bot-protection triggers
    const limit = 6;
    let idx = 0;

    const updates: Array<{ docId: string; patch: any }> = [];

    const worker = async () => {
      while (idx < toRefresh.length) {
        const current = toRefresh[idx];
        idx += 1;
        try {
          let details: any | null = null;
          try {
            details = await fetchOrderDetails(current.orderNumber, apiKey, accessToken!);
          } catch (e: any) {
            const status = Number(e?.status || 0) || null;
            if (status === 401 && refreshToken) {
              const refreshed = await refreshStockXTokens(refreshToken);
              if (refreshed.success && refreshed.accessToken) {
                accessToken = refreshed.accessToken;
                refreshToken = refreshed.refreshToken || refreshToken;
                await saveUserStockxTokens(userId, { accessToken, refreshToken, expiresAt: Date.now() + 3600 * 1000 });
                details = await fetchOrderDetails(current.orderNumber, apiKey, accessToken!);
              } else {
                throw e;
              }
            } else {
              throw e;
            }
          }

          const payoutObj = details?.payout || null;
          const salePrice = parseMoney(payoutObj?.salePrice ?? details?.amount) ?? null;
          const payout =
            payoutObj && payoutObj.totalPayout !== null && payoutObj.totalPayout !== undefined
              ? parseMoney(payoutObj.totalPayout)
              : null;
          const fees = payout !== null && salePrice !== null ? Math.max(0, Math.round((salePrice - payout) * 100) / 100) : null;

          const patch: any = {
            status: details?.status ?? null,
            // Keep canonical date if present; don't overwrite with sync time.
            date: details?.createdAt || details?.created || undefined,
            // Pricing fields
            salePrice: salePrice ?? undefined,
            payout: payout ?? undefined,
            fees: fees ?? undefined,
            updatedAt: new Date().toISOString(),
            stockxSyncedAt: new Date().toISOString(),
          };

          // Backfill identifying fields when present (helps matching)
          const styleId = details?.product?.styleId || details?.product?.sku || details?.sku || null;
          const size = details?.variant?.variantValue || details?.variant?.size || details?.size || null;
          const productName = details?.product?.productName || details?.product?.name || details?.productName || null;
          const brand = details?.product?.brand || details?.brand || null;
          const urlKey = details?.product?.urlKey || details?.product?.url_key || null;
          if (styleId) patch.styleId = String(styleId);
          if (size) patch.size = String(size);
          if (productName) patch.product = String(productName);
          if (brand) patch.brand = String(brand);
          if (urlKey) patch.urlKey = String(urlKey);

          updates.push({ docId: current.docId, patch });
          refreshedCount += 1;
        } catch (e: any) {
          failedCount += 1;
          failures.push({
            orderNumber: current.orderNumber,
            error: e?.message || String(e),
            status: typeof e?.status === 'number' ? e.status : undefined,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(limit, toRefresh.length) }, worker));

    // Batch update Firestore
    const batchSize = 400;
    for (let i = 0; i < updates.length; i += batchSize) {
      const chunk = updates.slice(i, i + batchSize);
      const batch = db.batch();
      for (const u of chunk) {
        batch.set(db.collection('user_sales').doc(u.docId), u.patch, { merge: true });
      }
      await batch.commit();
      updatedCount += chunk.length;
    }

    const summary = {
      scannedSales: sales.length,
      candidates: candidates.length,
      refreshed: refreshedCount,
      updated: updatedCount,
      failed: failedCount,
      maxOrders,
      ttlHours,
    };

    await setLastRefreshMs(userId, now, summary);

    const response = NextResponse.json({
      success: true,
      userId,
      skipped: false,
      ttlHours,
      summary,
      failures: failures.slice(0, 20),
    });

    // If token was refreshed during this request and we have cookies available, update them.
    // (This keeps interactive sessions stable.)
    if (accessToken && cookieStore.get('stockx_access_token')?.value !== accessToken) {
      setStockXTokenCookies(response, accessToken, refreshToken);
    }

    return response;
  } catch (error: any) {
    console.error('❌ refresh-nonfinal error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

