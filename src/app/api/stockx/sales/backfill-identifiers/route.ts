import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';
import { refreshStockXTokens, setStockXTokenCookies } from '@/lib/stockx/tokenRefresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type StopReason = 'rate_limited_429' | 'blocked_403' | null;

// #region agent log
const __agentMask = (v: unknown) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length <= 12 ? `${s.slice(0, 2)}…${s.slice(-2)}` : `${s.slice(0, 6)}…${s.slice(-4)}`;
};
const __agentLog = (payload: { runId: string; hypothesisId: string; location: string; message: string; data?: any }) => {
  fetch('http://127.0.0.1:7242/ingest/80c2e612-47e3-4f28-8d98-15f80c4fae0e', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'debug-session',
      runId: payload.runId,
      hypothesisId: payload.hypothesisId,
      location: payload.location,
      message: payload.message,
      data: payload.data || {},
      timestamp: Date.now()
    })
  }).catch(() => {});
};
// #endregion

function isPerimeterXBlock(body: string): boolean {
  const b = String(body || '').toLowerCase();
  return (
    b.includes('px-cloud.net') ||
    b.includes('"appid":"px') ||
    b.includes('"blockscript"') ||
    b.includes('/captcha/captcha.js') ||
    b.includes('perimeterx') ||
    b.includes('verify you are human') ||
    b.includes('access denied') ||
    b.includes('request blocked') ||
    b.includes('captcha')
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

function patchFromEmbeddedSaleDoc(userSaleDoc: any): any | null {
  // Some historical imports stored the full StockX payload under `saleData` but did not lift identifiers.
  const base = userSaleDoc?.saleData || userSaleDoc?.sale || null;
  if (!base) return null;
  const styleId =
    base?.styleId ||
    base?.product?.styleId ||
    base?.product?.sku ||
    base?.sku ||
    base?.product?.productId ||
    null;
  const size = base?.size || base?.variant?.size || base?.variant?.variantValue || base?.variant?.variant_value || null;
  const productName = base?.productName || base?.product?.productName || base?.product?.name || base?.product?.title || null;
  const brand = base?.brand || base?.product?.brand || null;
  const urlKey = base?.urlKey || base?.product?.urlKey || base?.product?.url_key || null;
  const listingId = base?.listingId || base?.askId || null;
  const date = base?.createdAt || base?.created || base?.updatedAt || base?.updated || null;

  const patch: any = {
    updatedAt: new Date().toISOString(),
    embeddedSaleDataBackfillAt: new Date().toISOString(),
    date: date ? String(date) : undefined
  };

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

  const cleaned = stripUndefinedDeep(patch);
  // Only return a patch if we actually filled at least one meaningful identifier field.
  const meaningful = ['styleId', 'size', 'product', 'brand', 'urlKey', 'listingId'];
  const filledAny = meaningful.some((k) => !isMissingish((cleaned as any)?.[k]));
  return filledAny ? cleaned : null;
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

async function scanSalesByUserIdPage(userId: string, pageSize: number, cursorId?: string | null): Promise<{
  sales: any[];
  nextCursorId: string | null;
}> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db
    .collection('user_sales')
    .where('userId', '==', userId)
    .orderBy(FieldPath.documentId())
    .limit(Math.max(1, Math.min(2500, pageSize)));
  const cursor = String(cursorId || '').trim();
  if (cursor) q = q.startAfter(cursor);
  const snap = await q.get();
  const docs = snap.docs;
  const sales = docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const nextCursorId = docs.length > 0 && docs.length >= Math.max(1, Math.min(2500, pageSize)) ? docs[docs.length - 1].id : null;
  return { sales, nextCursorId };
}

async function scanCandidateSalesPage(opts: {
  userId: string;
  pageSize: number;
  cursorId?: string | null;
  mode: 'all' | 'missing_styleId';
}): Promise<{ sales: any[]; nextCursorId: string | null; modeUsed: string }> {
  const { userId, pageSize, cursorId, mode } = opts;
  const db = getAdminDb();
  const limit = Math.max(1, Math.min(2500, pageSize));
  const cursor = String(cursorId || '').trim();

  // Prefer scanning the highest-impact subset first: sales missing styleId.
  // IMPORTANT: some docs store styleId as '' or '—' (missingish), not null, so a Firestore `== null` query will miss them.
  // To avoid needing composite indexes or OR queries, we scan user_sales by docId and filter in-process until we collect `limit` candidates.
  if (mode === 'missing_styleId') {
    const out: any[] = [];
    let scanned = 0;
    let pageCursor: string | null = cursor || null;
    const BATCH = 500;
    const MAX_SCANNED = Math.max(limit, 3000); // safety cap to prevent long-running requests
    while (out.length < limit && scanned < MAX_SCANNED) {
      let q: FirebaseFirestore.Query = db
        .collection('user_sales')
        .where('userId', '==', userId)
        .orderBy(FieldPath.documentId())
        .limit(BATCH);
      if (pageCursor) q = q.startAfter(pageCursor);
      const snap = await q.get();
      if (snap.empty) return { sales: out, nextCursorId: null, modeUsed: `missing_styleId_scan(scanned=${scanned})` };
      const docs = snap.docs;
      scanned += docs.length;
      pageCursor = docs[docs.length - 1].id;
      for (const d of docs) {
        const data = d.data() as any;
        const orderNumber = String(data?.orderNumber || '').trim();
        if (!orderNumber) continue;
        const styleId = String(data?.styleId || data?.product?.styleId || data?.product?.sku || '').trim();
        if (isMissingish(styleId)) out.push({ id: d.id, ...data });
        if (out.length >= limit) break;
      }
      if (docs.length < BATCH) break;
    }
    return { sales: out, nextCursorId: pageCursor, modeUsed: `missing_styleId_scan(scanned=${scanned})` };
  }

  const page = await scanSalesByUserIdPage(userId, limit, cursor);
  return { sales: page.sales, nextCursorId: page.nextCursorId, modeUsed: 'all' };
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
    // StockX sometimes includes Retry-After for 429.
    const retryAfterRaw = res.headers.get('retry-after');
    const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : NaN;
    (err as any).retryAfterMs =
      res.status === 429 && Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(5 * 60 * 1000, Math.round(retryAfterSec * 1000))
        : undefined;
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

async function loadLegacyStockxSalesByOrderNumbers(orderNumbers: string[]): Promise<Map<string, any>> {
  const db = getAdminDb();
  const out = new Map<string, any>();
  const uniq = Array.from(new Set(orderNumbers.filter(Boolean)));
  const CHUNK = 30; // Firestore 'in' query limit
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const chunk = uniq.slice(i, i + CHUNK);
    // Use single-field 'in' to avoid requiring a composite index. We'll filter by userId later.
    const snap = await db.collection('stockxSales').where('stockxOrderId', 'in', chunk).get();
    for (const doc of snap.docs) {
      const d = doc.data() as any;
      const order = String(d?.stockxOrderId || d?.saleData?.orderNumber || '').trim();
      if (!order) continue;
      out.set(order, d);
    }
  }
  return out;
}

function patchFromLegacySaleData(legacyDoc: any): any {
  const saleData = legacyDoc?.saleData || legacyDoc?.sale || legacyDoc || null;
  if (!saleData) return null;
  const styleId = saleData?.product?.styleId || saleData?.product?.sku || saleData?.product?.productId || null;
  const size = saleData?.variant?.size || saleData?.variant?.variantValue || saleData?.size || null;
  const productName = saleData?.product?.productName || saleData?.product?.name || saleData?.productName || null;
  const brand = saleData?.product?.brand || saleData?.brand || null;
  const urlKey = saleData?.product?.urlKey || saleData?.product?.url_key || null;
  const listingId = saleData?.listingId || saleData?.askId || null;
  const date = saleData?.createdAt || saleData?.created || saleData?.updatedAt || saleData?.updated || null;

  const patch: any = {
    updatedAt: new Date().toISOString(),
    legacyStockxSalesBackfillAt: new Date().toISOString(),
    // only set date if we have something meaningful
    date: date ? String(date) : undefined,
  };

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

  const cleaned = stripUndefinedDeep(patch);
  const meaningful = ['styleId', 'size', 'product', 'brand', 'urlKey', 'listingId'];
  const filledAny = meaningful.some((k) => !isMissingish((cleaned as any)?.[k]));
  return filledAny ? cleaned : null;
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
    const scanLimit = Math.max(50, Math.min(2500, Number(body?.scanLimit ?? 1500)));
    const cursorId = typeof body?.cursorId === 'string' ? body.cursorId.trim() : '';
    const scanModeRaw = typeof body?.scanMode === 'string' ? body.scanMode.trim() : '';
    const scanMode: 'all' | 'missing_styleId' = scanModeRaw === 'all' ? 'all' : 'missing_styleId';
    // Default to gentler pacing to reduce PerimeterX / 429s for this high-volume endpoint.
    const concurrency = Math.max(1, Math.min(6, Number(body?.concurrency ?? 1)));
    const perRequestDelayMs = Math.max(0, Math.min(5000, Number(body?.perRequestDelayMs ?? 750)));
    const maxRemoteOrders = Math.max(0, Math.min(80, Number(body?.maxRemoteOrders ?? 30)));

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

    // #region agent log
    __agentLog({
      runId: 'pre-fix',
      hypothesisId: 'H3',
      location: 'backfill-identifiers/route.ts:POST:entry',
      message: 'backfill entry',
      data: {
        userIdMasked: __agentMask(userId),
        force,
        scanLimit,
        maxOrders,
        maxRemoteOrders,
        concurrency,
        perRequestDelayMs,
        cursorPresent: !!cursorId,
        scanMode
      }
    });
    // #endregion

    const apiKey = process.env.STOCKX_API_KEY || '';
    if (!apiKey) return NextResponse.json({ success: false, error: 'Missing STOCKX_API_KEY' }, { status: 500 });

    const page = await scanCandidateSalesPage({ userId, pageSize: scanLimit, cursorId, mode: scanMode });
    const sales = page.sales;
    const saleByDocId = new Map<string, any>();
    for (const s of sales) {
      const id = String(s?.id || '').trim();
      if (id) saleByDocId.set(id, s);
    }
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

    const db = getAdminDb();

    // Phase 0: lift identifiers from embedded saleData within user_sales docs (no external calls).
    const embeddedUpdates: Array<{ docId: string; patch: any }> = [];
    for (const c of uniq.slice(0, maxOrders)) {
      const raw = saleByDocId.get(c.docId) || null;
      const patch = raw ? patchFromEmbeddedSaleDoc(raw) : null;
      if (patch) embeddedUpdates.push({ docId: c.docId, patch });
    }
    let embeddedUpdated = 0;
    let embeddedFilledStyleId = 0;
    let embeddedFilledSize = 0;
    if (embeddedUpdates.length > 0) {
      const batchSize = 400;
      for (let i = 0; i < embeddedUpdates.length; i += batchSize) {
        const chunk = embeddedUpdates.slice(i, i + batchSize);
        const batch = db.batch();
        for (const u of chunk) {
          if (!isMissingish(u.patch?.styleId)) embeddedFilledStyleId += 1;
          if (!isMissingish(u.patch?.size)) embeddedFilledSize += 1;
          batch.set(db.collection('user_sales').doc(u.docId), u.patch, { merge: true });
        }
        await batch.commit();
        embeddedUpdated += chunk.length;
      }
    }

    // Phase 1: local backfill from legacy `stockxSales` data (no upstream StockX calls).
    const toConsider = uniq.slice(0, maxOrders);
    const legacyByOrder = await loadLegacyStockxSalesByOrderNumbers(toConsider.map((x) => x.orderNumber));
    const legacyUpdates: Array<{ docId: string; patch: any }> = [];
    const remainingForRemote: Array<{ docId: string; orderNumber: string }> = [];
    for (const c of toConsider) {
      const legacy = legacyByOrder.get(c.orderNumber) || null;
      const patch = legacy ? patchFromLegacySaleData(legacy) : null;
      if (patch) {
        // We found some usable fields locally.
        legacyUpdates.push({ docId: c.docId, patch });
        // If local data still didn't include styleId or size, keep it for remote attempt.
        const stillMissingStyle = isMissingish(patch?.styleId);
        const stillMissingSize = isMissingish(patch?.size);
        const stillMissingProduct = isMissingish(patch?.product);
        const stillMissingBrand = isMissingish(patch?.brand);
        if (stillMissingStyle || stillMissingSize || stillMissingProduct || stillMissingBrand) remainingForRemote.push(c);
      } else {
        remainingForRemote.push(c);
      }
    }

    // Commit local legacy updates first (cheap, no StockX calls).
    let legacyUpdated = 0;
    let legacyFilledStyleId = 0;
    let legacyFilledSize = 0;
    if (legacyUpdates.length > 0) {
      const batchSize = 400;
      for (let i = 0; i < legacyUpdates.length; i += batchSize) {
        const chunk = legacyUpdates.slice(i, i + batchSize);
        const batch = db.batch();
        for (const u of chunk) {
          if (!isMissingish(u.patch?.styleId)) legacyFilledStyleId += 1;
          if (!isMissingish(u.patch?.size)) legacyFilledSize += 1;
          batch.set(db.collection('user_sales').doc(u.docId), u.patch, { merge: true });
        }
        await batch.commit();
        legacyUpdated += chunk.length;
      }
    }

    // #region agent log
    __agentLog({
      runId: 'pre-fix',
      hypothesisId: 'H3',
      location: 'backfill-identifiers/route.ts:POST:phase1',
      message: 'backfill phase1 legacy complete',
      data: {
        scannedSales: sales.length,
        candidatesInPage: uniq.length,
        legacyCandidates: legacyUpdates.length,
        legacyUpdated,
        remainingForRemote: remainingForRemote.length
      }
    });
    // #endregion

    // Phase 2: remote StockX order-details backfill for anything still missing.
    const toBackfill = remainingForRemote.slice(0, Math.min(maxOrders, maxRemoteOrders));

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

    // If we have no remote work, we don't need StockX tokens.
    if (toBackfill.length > 0) {
      if (!refreshToken) {
        return NextResponse.json(
          {
            success: true,
            userId,
            skipped: false,
            summary: {
              scannedSales: sales.length,
              candidateSales: uniq.length,
              attempted: toConsider.length,
              legacyUpdated,
              remoteAttempted: 0,
              updated: legacyUpdated,
              failed: 0,
              note: 'StockX not connected; performed local legacy backfill only.',
              ttlHours,
              maxOrders,
              concurrency,
              perRequestDelayMs,
            },
            failures: [],
          },
          { status: 200 }
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
    }

    const failures: Array<{ orderNumber: string; error: string; status?: number; blocked?: boolean }> = [];
    const failureStatusCounts = new Map<string, number>();
    let blockedCount = 0;
    let rateLimitedCount = 0;
    let rateLimitedRetryCount = 0;
    let stoppedEarly = false;
    let stoppedEarlyReason: StopReason = null;
    let suggestedWaitMs: number | null = null;
    const updates: Array<{ docId: string; patch: any }> = [];
    let remoteFilledStyleId = 0;
    let remoteFilledSize = 0;
    let remoteOrderDetailsStyleIdPresent = 0;
    let remoteOrderDetailsProductIdPresent = 0;
    let remoteOrderDetailsVariantSizePresent = 0;
    let remoteOrderDetailsStyleIdMissingButProductIdPresent = 0;
    let debugShapeLogged = 0;

    const limit = concurrency;
    let idx = 0;
    let stopAll = false;
    let seen403 = 0;
    let seen429 = 0;

    const worker = async () => {
      while (idx < toBackfill.length) {
        if (stopAll) {
          stoppedEarly = true;
          return;
        }
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
            if (status === 429) {
              rateLimitedCount += 1;
              seen429 += 1;
              const backoffMs =
                typeof e?.retryAfterMs === 'number' && Number.isFinite(e.retryAfterMs) && e.retryAfterMs > 0
                  ? e.retryAfterMs
                  : 2500;
              // If we are getting flooded with 429s, stop early to avoid burning requests.
              // (Vercel route has execution limits; better to wait and retry later.)
              if (seen429 >= 10) {
                stopAll = true;
                stoppedEarly = true;
                stoppedEarlyReason = 'rate_limited_429';
                suggestedWaitMs = Math.max(suggestedWaitMs ?? 0, Math.min(30 * 60 * 1000, backoffMs));
                throw e;
              }

              // Otherwise: wait, then retry once.
              await new Promise((r) => setTimeout(r, backoffMs + Math.floor(Math.random() * 250)));
              rateLimitedRetryCount += 1;
              details = await fetchOrderDetails(current.orderNumber, apiKey, accessToken!);
            } else
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

          // Debug: confirm the JSON shape (some wrappers return { data: {...} } or { order: {...} }).
          if (debugShapeLogged < 3) {
            const roots: Array<{ label: string; v: any }> = [
              { label: 'details', v: details },
              { label: 'details.data', v: details?.data },
              { label: 'details.order', v: details?.order },
              { label: 'details.result', v: details?.result },
            ];
            const summary = roots.map((r) => {
              const v = r.v;
              const has = !!v && typeof v === 'object';
              const keys = has ? Object.keys(v).slice(0, 10) : [];
              const style = v?.product?.styleId ?? v?.product?.sku ?? v?.styleId ?? v?.sku ?? null;
              const pid = v?.product?.productId ?? v?.productId ?? null;
              const size = v?.variant?.variantValue ?? v?.variant?.size ?? v?.size ?? null;
              return {
                label: r.label,
                has,
                keys,
                hasProduct: !!v?.product,
                styleIdLikePresent: !isMissingish(style),
                productIdPresent: !isMissingish(pid),
                sizePresent: !isMissingish(size),
              };
            });
            __agentLog({
              runId: 'pre-fix',
              hypothesisId: 'H6',
              location: 'backfill-identifiers/route.ts:remote:detailsShape',
              message: 'StockX order-details JSON shape sample',
              data: { orderMasked: __agentMask(current.orderNumber), roots: summary }
            });
            debugShapeLogged += 1;
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
          const productId =
            details?.product?.productId ||
            details?.product?.id ||
            details?.productId ||
            details?.product_id ||
            details?.lineItem?.product?.productId ||
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

          const cleaned = stripUndefinedDeep(patch);
          const meaningful = ['styleId', 'size', 'product', 'brand', 'urlKey', 'listingId'];
          const filledAny = meaningful.some((k) => !isMissingish((cleaned as any)?.[k]));

          // Diagnostics: determine whether order-details actually contains styleId/size info.
          if (!isMissingish(styleIdNorm)) remoteOrderDetailsStyleIdPresent += 1;
          if (!isMissingish(productId)) remoteOrderDetailsProductIdPresent += 1;
          if (sizeNorm) remoteOrderDetailsVariantSizePresent += 1;
          if (isMissingish(styleIdNorm) && !isMissingish(productId)) remoteOrderDetailsStyleIdMissingButProductIdPresent += 1;

          if (filledAny) {
            if (!isMissingish((cleaned as any)?.styleId)) remoteFilledStyleId += 1;
            if (!isMissingish((cleaned as any)?.size)) remoteFilledSize += 1;
            updates.push({ docId: current.docId, patch: cleaned });
          }
        } catch (e: any) {
          const st = typeof e?.status === 'number' ? String(e.status) : 'unknown';
          failureStatusCounts.set(st, (failureStatusCounts.get(st) || 0) + 1);
          if (e?.blocked) blockedCount += 1;
          if (Number(e?.status) === 403) {
            seen403 += 1;
            // If we trip bot protection, abort remaining work to avoid burning requests.
            // A single 403 can happen transiently, but multiple 403s in a run usually means PerimeterX.
            if (e?.blocked || seen403 >= 5) {
              stopAll = true;
              stoppedEarly = true;
              stoppedEarlyReason = 'blocked_403';
            }
          }
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
      cursorId: cursorId || null,
      nextCursorId: page.nextCursorId,
      scanModeUsed: page.modeUsed,
      candidateSales: uniq.length,
      attempted: toConsider.length,
      embeddedUpdated,
      embeddedFilledStyleId,
      embeddedFilledSize,
      legacyUpdated,
      legacyFilledStyleId,
      legacyFilledSize,
      remoteAttempted: toBackfill.length,
      updated: embeddedUpdated + legacyUpdated + updated,
      remoteUpdated: updated,
      remoteFilledStyleId,
      remoteFilledSize,
      remoteOrderDetailsStyleIdPresent,
      remoteOrderDetailsProductIdPresent,
      remoteOrderDetailsVariantSizePresent,
      remoteOrderDetailsStyleIdMissingButProductIdPresent,
      failed: failures.length,
      failureStatusCounts: Object.fromEntries(Array.from(failureStatusCounts.entries()).sort((a, b) => Number(b[1]) - Number(a[1]))),
      blockedCount,
      rateLimitedCount,
      rateLimitedRetryCount,
      stoppedEarly,
      stoppedEarlyReason,
      suggestedWaitMs,
      ttlHours,
      maxOrders,
      maxRemoteOrders,
      concurrency,
      perRequestDelayMs,
    };

    // #region agent log
    __agentLog({
      runId: 'pre-fix',
      hypothesisId: 'H3',
      location: 'backfill-identifiers/route.ts:POST:exit',
      message: 'backfill exit summary',
      data: {
        scannedSales: summary.scannedSales,
        candidatesInPage: summary.candidateSales,
        attempted: summary.attempted,
        legacyUpdated: summary.legacyUpdated,
        remoteAttempted: summary.remoteAttempted,
        updated: summary.updated,
        failed: summary.failed,
        stoppedEarly: summary.stoppedEarly,
        stoppedEarlyReason: summary.stoppedEarlyReason,
        status429: (summary.failureStatusCounts as any)?.['429'] ?? 0,
        status403: (summary.failureStatusCounts as any)?.['403'] ?? 0,
        nextCursorPresent: !!summary.nextCursorId
      }
    });
    // #endregion

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

