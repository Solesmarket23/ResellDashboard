import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isPerimeterXBlock(body: string): boolean {
  const b = String(body || '').toLowerCase();
  return (
    b.includes('px-cloud.net') ||
    b.includes('"appid":"px') ||
    b.includes('"blockscript"') ||
    b.includes('/captcha/captcha.js') ||
    b.includes('perimeterx')
  );
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as any;
  }
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out;
  }
  return value;
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

function isMissingish(value: any): boolean {
  const s = String(value ?? '').trim();
  if (!s) return true;
  const u = s.toUpperCase();
  return (
    u === 'UNKNOWN' ||
    u === 'UNKNOWN PRODUCT' ||
    u === 'UNKNOWN BRAND' ||
    u === 'N/A' ||
    u === 'NA' ||
    u === 'NULL' ||
    u === 'NONE' ||
    u === 'UNAVAILABLE' ||
    u === '-' ||
    u === '—'
  );
}

function normalizeSize(value: any): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const u = s
    .toUpperCase()
    .replace(/[()]/g, ' ')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (isMissingish(u)) return '';
  // Common "US M 10" / "US 10" patterns
  return u.replace(/^US\s+/i, '');
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

async function loadUserStockxTokens(userId: string): Promise<{ accessToken?: string; refreshToken?: string; expiresAt?: number | null }> {
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

async function getLastRunMs(userId: string): Promise<number | null> {
  const db = getAdminDb();
  const snap = await db.collection('users').doc(String(userId)).get();
  const data = snap.exists ? (snap.data() as any) : null;
  const v = data?.stockxSalesIdentifierBackfill?.lastRunAtMs;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function setLastRun(userId: string, lastRunAtMs: number, summary: any) {
  const db = getAdminDb();
  await db
    .collection('users')
    .doc(String(userId))
    .set(
      {
        stockxSalesIdentifierBackfill: {
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
    (err as any).blocked = res.status === 403 && isPerimeterXBlock(txt);
    (err as any).details = txt;
    throw err;
  }
  return await res.json().catch(() => ({}));
}

function hasUsefulIdentifierGaps(s: any): boolean {
  const styleId = String(s?.styleId || s?.product?.styleId || s?.product?.sku || '').trim();
  const sizeRaw = s?.size || s?.variant?.size || s?.variant?.variantValue || '';
  const size = normalizeSize(sizeRaw);
  const orderNumber = String(s?.orderNumber || '').trim();
  if (!orderNumber) return false;
  const product = s?.product;
  const brand = s?.brand;
  return isMissingish(styleId) || isMissingish(size) || isMissingish(product) || isMissingish(brand);
}

export async function POST(request: NextRequest) {
  try {
    const userId = getEffectiveUserId(request);
    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

    // Safety: prevent acting on other users by requiring cookie/header user to match query when present.
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
    const ttlHours = Math.max(1, Math.min(168, Number(body?.ttlHours ?? 24)));
    const ttlMs = ttlHours * 60 * 60 * 1000;
    const maxOrders = Math.max(1, Math.min(400, Number(body?.maxOrders ?? 120)));
    const scanLimit = Math.max(100, Math.min(20000, Number(body?.scanLimit ?? 12000)));
    const concurrency = Math.max(1, Math.min(6, Number(body?.concurrency ?? 3)));
    const perRequestDelayMs = Math.max(0, Math.min(2000, Number(body?.perRequestDelayMs ?? 125)));

    const now = Date.now();
    const lastRunMs = await getLastRunMs(userId);
    const ageMs = typeof lastRunMs === 'number' ? now - lastRunMs : null;
    if (!force && typeof ageMs === 'number' && ageMs >= 0 && ageMs < ttlMs) {
      return NextResponse.json({
        success: true,
        userId,
        skipped: true,
        reason: 'ttl_not_expired',
        ttlHours,
        lastRunAtMs: lastRunMs,
        lastRunAtIso: new Date(lastRunMs).toISOString(),
      });
    }

    const apiKey = process.env.STOCKX_API_KEY || '';
    if (!apiKey) return NextResponse.json({ success: false, error: 'Missing STOCKX_API_KEY' }, { status: 500 });

    // Prefer cookie tokens (interactive), fall back to Firebase user doc (server-side)
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
      await saveUserStockxTokens(userId, { accessToken, refreshToken, expiresAt: now + 3600 * 1000 });
    }

    const sales = await scanSalesByUserId(userId, scanLimit);
    const candidates = sales
      .filter((s) => hasUsefulIdentifierGaps(s))
      .map((s) => ({ docId: String(s.id), orderNumber: String(s?.orderNumber || '').trim() }))
      .filter((x) => x.orderNumber);

    // Dedup by orderNumber (user_sales upserts should already do this, but safe)
    const seen = new Set<string>();
    const uniq: Array<{ docId: string; orderNumber: string }> = [];
    for (const c of candidates) {
      if (seen.has(c.orderNumber)) continue;
      seen.add(c.orderNumber);
      uniq.push(c);
    }

    const toBackfill = uniq.slice(0, maxOrders);
    const db = getAdminDb();

    const failures: Array<{ orderNumber: string; error: string; status?: number; blocked?: boolean }> = [];
    const failureStatusCounts = new Map<string, number>();
    let blockedCount = 0;
    const updates: Array<{ docId: string; patch: any }> = [];

    const limit = concurrency;
    let idx = 0;

    const worker = async () => {
      while (idx < toBackfill.length) {
        const current = toBackfill[idx];
        idx += 1;
        try {
          if (perRequestDelayMs > 0) {
            // Small pacing to reduce StockX bot-protection triggers / rate limiting.
            await new Promise((r) => setTimeout(r, perRequestDelayMs));
          }
          let details: any = null;
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
            payoutObj && payoutObj.totalPayout !== null && payoutObj.totalPayout !== undefined ? parseMoney(payoutObj.totalPayout) : null;
          const fees = payout !== null && salePrice !== null ? Math.max(0, Math.round((salePrice - payout) * 100) / 100) : null;

          const patch: any = {
            updatedAt: new Date().toISOString(),
            stockxSyncedAt: new Date().toISOString(),
            status: details?.status ?? undefined,
            date: details?.createdAt || details?.created || undefined,
          };

          const styleId =
            details?.product?.styleId ||
            details?.product?.style_id ||
            details?.product?.sku ||
            details?.product?.skuId ||
            details?.sku ||
            details?.styleId ||
            details?.style_id ||
            details?.lineItem?.product?.styleId ||
            details?.lineItem?.product?.sku ||
            null;
          const size =
            details?.variant?.variantValue ||
            details?.variant?.size ||
            details?.variant?.displayValue ||
            details?.variant?.name ||
            details?.size ||
            details?.variantValue ||
            null;
          const productName =
            details?.product?.productName ||
            details?.product?.name ||
            details?.product?.title ||
            details?.productName ||
            details?.lineItem?.product?.productName ||
            details?.lineItem?.product?.name ||
            null;
          const brand =
            details?.product?.brand ||
            details?.product?.brandName ||
            details?.brand ||
            details?.brandName ||
            details?.lineItem?.product?.brand ||
            null;
          const urlKey =
            details?.product?.urlKey ||
            details?.product?.url_key ||
            details?.product?.slug ||
            details?.urlKey ||
            details?.url_key ||
            null;
          const listingId = details?.listingId || details?.askId || details?.listing?.id || null;

          const styleIdNorm = styleId ? String(styleId).trim() : '';
          const sizeNorm = normalizeSize(size);
          const productNorm = productName ? String(productName).trim() : '';
          const brandNorm = brand ? String(brand).trim() : '';
          const urlKeyNorm = urlKey ? String(urlKey).trim() : '';
          const listingIdNorm = listingId ? String(listingId).trim() : '';

          if (!isMissingish(styleIdNorm)) patch.styleId = styleIdNorm;
          if (sizeNorm) patch.size = sizeNorm;
          if (!isMissingish(productNorm)) patch.product = productNorm;
          if (!isMissingish(brandNorm)) patch.brand = brandNorm;
          if (!isMissingish(urlKeyNorm)) patch.urlKey = urlKeyNorm;
          if (!isMissingish(listingIdNorm)) patch.listingId = listingIdNorm;

          if (salePrice !== null) patch.salePrice = salePrice;
          if (payout !== null) patch.payout = payout;
          if (fees !== null) patch.fees = fees;

          updates.push({ docId: current.docId, patch: stripUndefinedDeep(patch) });
        } catch (e: any) {
          const st = typeof e?.status === 'number' ? String(e.status) : 'unknown';
          failureStatusCounts.set(st, (failureStatusCounts.get(st) || 0) + 1);
          if (e?.blocked) blockedCount += 1;
          failures.push({
            orderNumber: current.orderNumber,
            error: e?.message || String(e),
            status: typeof e?.status === 'number' ? e.status : undefined,
            blocked: e?.blocked ? true : undefined,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(limit, toBackfill.length) }, worker));

    let updated = 0;
    const batchSize = 400;
    for (let i = 0; i < updates.length; i += batchSize) {
      const chunk = updates.slice(i, i + batchSize);
      const batch = db.batch();
      for (const u of chunk) {
        batch.set(db.collection('user_sales').doc(u.docId), u.patch, { merge: true });
      }
      await batch.commit();
      updated += chunk.length;
    }

    const summary = {
      scannedSales: sales.length,
      candidateSales: uniq.length,
      attempted: toBackfill.length,
      updated,
      failed: failures.length,
      failureStatusCounts: Object.fromEntries(Array.from(failureStatusCounts.entries()).sort((a, b) => Number(b[1]) - Number(a[1]))),
      blockedCount,
      ttlHours,
      maxOrders,
      concurrency,
      perRequestDelayMs,
    };

    await setLastRun(userId, now, summary);

    const response = NextResponse.json({ success: true, userId, skipped: false, summary, failures: failures.slice(0, 20) });
    if (accessToken && cookieStore.get('stockx_access_token')?.value !== accessToken) {
      setStockXTokenCookies(response, accessToken, refreshToken);
    }
    return response;
  } catch (error: any) {
    console.error('❌ backfill-identifiers error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

