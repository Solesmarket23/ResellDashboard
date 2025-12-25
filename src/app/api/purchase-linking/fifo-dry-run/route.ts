import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { FieldPath } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PurchaseCandidate = {
  id: string;
  userId?: string;
  uid?: string;
  orderNumber?: string;
  size?: string;
  extracted_size?: string;
  styleId?: string | null;
  style_id?: string | null;
  stockxListingId?: string;
  totalAmount?: number | string;
  purchasePrice?: number | string;
  price?: string;
  purchaseDate?: string;
  purchase_date?: string;
  emailDate?: string;
  email_date?: string;
  createdAt?: string;
  actualDelivery?: string;
  linkedSaleOrderNumber?: string;
  linkedSaleId?: string;
  product?: { styleId?: string | null; size?: string; name?: string; productName?: string; title?: string; image?: string };
  productImageUrl?: string;
  _dateMs?: number | null;
  _dateSource?: 'actualDelivery' | 'purchaseDate' | 'purchase_date' | 'emailDate' | 'email_date' | 'createdAt' | 'none';
};

function normalizeSize(size: unknown): string {
  const raw = String(size || '').trim();
  if (!raw) return '';
  const s = raw
    .toUpperCase()
    .replace(/[()]/g, ' ')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Apparel sizing (handle "US M", "US L", etc.)
  const apparel = new Set(['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'OS', 'ONE SIZE']);
  if (apparel.has(s)) return s;
  const apparelPrefixed = s.match(/^(?:US|U\.S\.)\s+(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL|OS|ONE SIZE)$/);
  if (apparelPrefixed) return apparelPrefixed[1];

  // Detect gender/grade-school tokens.
  const isWomens = /\b(W|WMNS|WOMEN|WOMENS)\b/.test(s) || /\d+(?:\.\d+)?W\b/.test(s);
  const isYouth = /\b(Y|GS|GRADE SCHOOL)\b/.test(s) || /\d+(?:\.\d+)?Y\b/.test(s);

  // Remove common prefix tokens so "US M 10" -> "10"
  const tokensToDrop = new Set([
    'US',
    'U.S.',
    'M',
    'MEN',
    'MENS',
    'MEN’S',
    'W',
    'WMNS',
    'WOMEN',
    'WOMENS',
    'WOMEN’S',
    'Y',
    'GS',
    'GRADE',
    'SCHOOL',
  ]);

  const stripped = s
    .split(' ')
    .filter((t) => t && !tokensToDrop.has(t))
    .join(' ')
    .trim();

  // If stripping leaves an apparel size, return it (prevents "US M" -> "" -> wrong bucket)
  if (apparel.has(stripped)) return stripped;

  // Extract numeric size (handles "10", "10.5", "10 W", "W 10", "10W", etc.)
  const m = stripped.match(/(\d+(?:\.\d+)?)(?:\s*(W|Y))?/);
  if (m) {
    const num = m[1];
    const suffix = m[2] || (isWomens ? 'W' : isYouth ? 'Y' : '');
    return `${num}${suffix}`;
  }

  // Fallback: normalized token string
  return stripped || s;
}

function parseMoney(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function toNumberOrNull(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
    const money = parseMoney(val);
    return typeof money === 'number' ? money : null;
  }
  return null;
}

function parseDateMs(val: unknown): number | null {
  if (typeof val !== 'string' || !val) return null;
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? ms : null;
}

function isDateOnlyString(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function hasTimeComponent(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  // ISO datetime ("T") or any explicit hh:mm component.
  return /T\d{2}:\d{2}/.test(s) || /\b\d{1,2}:\d{2}\b/.test(s);
}

function getPurchaseFifoDate(p: PurchaseCandidate, strictDelivery: boolean): { ms: number | null; source: PurchaseCandidate['_dateSource'] } {
  // In strict mode, we only consider inventory that has actually arrived.
  // In non-strict mode, prefer "purchase happened" timestamps (order confirmation / email date) over delivery timestamps.
  if (strictDelivery) {
    const deliveryMs = parseDateMs((p as any).actualDelivery);
    if (deliveryMs !== null) return { ms: deliveryMs, source: 'actualDelivery' };
    return { ms: null, source: 'none' };
  }

  // In non-strict mode, if we DO have an actual delivery timestamp, treat that as the preferred "inventory available" time.
  // This matches the real-world FIFO constraint: you can't sell inventory you haven't received yet.
  const deliveryMs = parseDateMs((p as any).actualDelivery);
  if (deliveryMs !== null) return { ms: deliveryMs, source: 'actualDelivery' };

  // Prefer the most precise timestamps first (include time-of-day).
  const purchaseDateRaw = (p as any).purchaseDate;
  const purchaseDateIsoRaw = (p as any).purchase_date;
  const emailDateRaw = (p as any).emailDate;
  const emailDateIsoRaw = (p as any).email_date;

  // If purchase_date/purchaseDate are date-only (no time), prefer email_date which includes time.
  const purchaseHasTime = hasTimeComponent(purchaseDateRaw) || hasTimeComponent(purchaseDateIsoRaw);
  const purchaseIsDateOnly = isDateOnlyString(purchaseDateIsoRaw) || (typeof purchaseDateRaw === 'string' && !hasTimeComponent(purchaseDateRaw));

  if (purchaseHasTime) {
    // Prefer purchase_date (the canonical timestamp) over purchaseDate (often a display-only formatted date).
    const msPurchaseDateIso = parseDateMs(purchaseDateIsoRaw);
    if (msPurchaseDateIso !== null) return { ms: msPurchaseDateIso, source: 'purchase_date' };
    if (hasTimeComponent(purchaseDateRaw)) {
      const msPurchaseDate = parseDateMs(purchaseDateRaw);
      if (msPurchaseDate !== null) return { ms: msPurchaseDate, source: 'purchaseDate' };
    }
  }

  // Prefer whichever email timestamp actually includes time-of-day.
  const msEmailRaw = parseDateMs(emailDateRaw);
  const msEmailIso = parseDateMs(emailDateIsoRaw);
  const emailRawHasTime = hasTimeComponent(emailDateRaw);
  const emailIsoHasTime = hasTimeComponent(emailDateIsoRaw);

  if (emailIsoHasTime && msEmailIso !== null) return { ms: msEmailIso, source: 'email_date' };
  if (emailRawHasTime && msEmailRaw !== null) return { ms: msEmailRaw, source: 'emailDate' };
  if (msEmailIso !== null) return { ms: msEmailIso, source: 'email_date' };
  if (msEmailRaw !== null) return { ms: msEmailRaw, source: 'emailDate' };

  // Fall back to purchase dates even if date-only (they're still useful for day-level FIFO).
  if (purchaseIsDateOnly || true) {
    const msPurchaseDateIso = parseDateMs(purchaseDateIsoRaw);
    if (msPurchaseDateIso !== null) return { ms: msPurchaseDateIso, source: 'purchase_date' };
    const msPurchaseDate = parseDateMs(purchaseDateRaw);
    if (msPurchaseDate !== null) return { ms: msPurchaseDate, source: 'purchaseDate' };
  }

  const msCreated = parseDateMs((p as any).createdAt);
  if (msCreated !== null) return { ms: msCreated, source: 'createdAt' };
  return { ms: null, source: 'none' };
}

function getPurchaseStyleId(p: PurchaseCandidate): string | null {
  return (
    (typeof p.styleId === 'string' && p.styleId.trim()) ||
    (typeof p.style_id === 'string' && p.style_id.trim()) ||
    (typeof p.product?.styleId === 'string' && p.product.styleId.trim()) ||
    null
  );
}

function getPurchaseCost(p: PurchaseCandidate): number | null {
  // If we already stored netPaid, prefer it.
  const netPaid =
    (typeof (p as any).netPaid === 'number' ? (p as any).netPaid : parseMoney((p as any).netPaid)) ?? null;
  if (typeof netPaid === 'number' && Number.isFinite(netPaid) && netPaid > 0) return netPaid;

  // Prefer "totalPayment" when present (purchase price + fees + shipping, etc.)
  const totalPayment =
    (typeof (p as any).totalPayment === 'number' ? (p as any).totalPayment : parseMoney((p as any).totalPayment)) ?? null;
  if (typeof totalPayment === 'number' && Number.isFinite(totalPayment) && totalPayment > 0) {
    const credits = parseMoney((p as any).credits ?? (p as any).discounts ?? 0) ?? 0;
    return Math.max(0, totalPayment - Math.max(0, credits));
  }

  const totalAmount =
    (typeof p.totalAmount === 'number' ? p.totalAmount : parseMoney(p.totalAmount)) ?? null;
  if (typeof totalAmount === 'number' && Number.isFinite(totalAmount) && totalAmount > 0) {
    const credits = parseMoney((p as any).credits ?? (p as any).discounts ?? 0) ?? 0;
    return Math.max(0, totalAmount - Math.max(0, credits));
  }

  const purchasePrice =
    (typeof p.purchasePrice === 'number' ? p.purchasePrice : parseMoney(p.purchasePrice)) ?? null;
  const base =
    (typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0 ? purchasePrice : null) ??
    (() => {
      const priceFromString = parseMoney((p as any).price);
      return typeof priceFromString === 'number' && Number.isFinite(priceFromString) && priceFromString > 0 ? priceFromString : null;
    })();

  if (typeof base !== 'number') return null;

  // If we have fee breakdown fields, include them to approximate total payment.
  // (Only used when totalPayment/totalAmount are missing.)
  const extras = [
    (p as any).processingFee,
    (p as any).processing_fee,
    (p as any).shippingFee,
    (p as any).shipping_fee,
    (p as any).shipping,
    (p as any).tax,
    (p as any).taxAmount,
    (p as any).tax_amount,
    (p as any).fees,
    (p as any).fee,
    (p as any).serviceFee,
    (p as any).service_fee,
  ]
    .map((v) => parseMoney(v))
    .filter((n) => typeof n === 'number' && Number.isFinite(n) && n > 0);

  const extrasSum = extras.reduce((a, b) => a + b, 0);
  const gross = extrasSum > 0 ? base + extrasSum : base;
  const credits = parseMoney((p as any).credits ?? (p as any).discounts ?? 0) ?? 0;
  return Math.max(0, gross - Math.max(0, credits));

  return null;
}

function getSaleListingId(sale: any): string | null {
  const candidates: unknown[] = [
    sale?.listingId,
    sale?.stockxData?.listingId,
    sale?.saleData?.listingId
  ];
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function getSaleEventMs(sale: any): { ms: number | null; source: string | null } {
  // IMPORTANT:
  // Firestore doc fields like createdAt/updatedAt on `user_sales` are often "sync time" (when we imported),
  // not the true time the sale occurred. Using those makes almost every sale look like it happened "today".
  //
  // For FIFO eligibility, we want the best available *sale occurred at* timestamp.
  const ordered: Array<{ source: string; value: unknown }> = [
    { source: 'date', value: sale?.date }, // our canonical sale timestamp field (StockX order createdAt/updatedAt)
    { source: 'payoutDate', value: sale?.payoutDate },
    { source: 'payoutDetails.date', value: sale?.payoutDetails?.date },
    { source: 'stockxData.payoutDate', value: sale?.stockxData?.payoutDate },
  ];
  for (const c of ordered) {
    const ms = parseDateMs(c.value);
    if (ms !== null) return { ms, source: c.source };
  }
  return { ms: null, source: null };
}

function msToIso(ms: number | null): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function purchaseKey(styleId: string, size: string): string {
  return `${styleId}::${normalizeSize(size)}`;
}

function normalizeProductName(name: unknown): string {
  const raw = String(name || '').trim();
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPurchaseProductName(p: PurchaseCandidate): string | null {
  const candidates: unknown[] = [
    (p as any)?.product?.name,
    (p as any)?.product?.productName,
    (p as any)?.product?.title,
    (p as any)?.productName,
    (p as any)?.title,
    // common alternates from email parsing / manual entries
    (p as any)?.itemName,
    (p as any)?.item_name,
    (p as any)?.product_name,
    (p as any)?.productTitle,
    (p as any)?.product_title,
  ];
  for (const v of candidates) {
    const s = String(v || '').trim();
    if (s) return s;
  }
  return null;
}

function purchaseNameKey(productName: string, size: string): string {
  return `${normalizeProductName(productName)}::${normalizeSize(size)}`;
}

function tokenizeName(name: string): string[] {
  const n = normalizeProductName(name);
  if (!n) return [];
  const stop = new Set([
    'the',
    'and',
    'x',
    'mens',
    "men's",
    'womens',
    "women's",
    'wmns',
    'us',
    'size',
    'black',
    'white',
    'grey',
    'gray',
    'navy',
  ]);
  return n
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !stop.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union > 0 ? inter / union : 0;
}

function tokenOverlapScore(a: string[], b: string[]): { jaccard: number; coverage: number; overlap: number } {
  if (a.length === 0 || b.length === 0) return { jaccard: 0, coverage: 0, overlap: 0 };
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  const j = union > 0 ? inter / union : 0;
  const denom = Math.min(sa.size, sb.size);
  const coverage = denom > 0 ? inter / denom : 0;
  return { jaccard: j, coverage, overlap: inter };
}

function getEffectiveUserId(request: NextRequest): string | null {
  const header = request.headers.get('x-user-id')?.trim();
  if (header) return header;
  const cookie =
    request.cookies.get('site-user-id')?.value ||
    request.cookies.get('siteUserId')?.value ||
    request.cookies.get('userId')?.value ||
    null;
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie);
  } catch {
    return cookie;
  }
}

export async function GET(request: NextRequest) {
  try {
    const qpUserId = request.nextUrl.searchParams.get('userId')?.trim() || '';
    const effective = getEffectiveUserId(request);
    const userId = qpUserId || effective || '';

    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    // Basic safety: prevent reading other users by requiring cookie/header user to match query (when present)
    if (qpUserId && effective && qpUserId !== effective) {
      return NextResponse.json({ success: false, error: 'Unauthorized (user mismatch)' }, { status: 403 });
    }
    // If no cookie/header user is present, we still allow (some flows rely on query param),
    // but this endpoint only returns that userId's data. If you want stricter auth, we can tighten this later.

    const limitSales = Math.max(1, Math.min(5000, Number(request.nextUrl.searchParams.get('limitSales') || 200)));
    // When filtering by a time window, we may need to scan more than `limitSales` documents
    // because the first N documents in documentId order may not fall within the window.
    const scanLimit = Math.max(1, Math.min(20000, Number(request.nextUrl.searchParams.get('scanLimit') || 5000)));
    const unlinkedOnly = request.nextUrl.searchParams.get('unlinkedOnly') !== '0';
    const strictDelivery = request.nextUrl.searchParams.get('strictDelivery') !== '0';
    const saleStartMsRaw = request.nextUrl.searchParams.get('saleStartMs');
    const saleEndMsRaw = request.nextUrl.searchParams.get('saleEndMs');
    const saleStartMs = saleStartMsRaw ? Number(saleStartMsRaw) : null;
    const saleEndMs = saleEndMsRaw ? Number(saleEndMsRaw) : null;
    const hasSaleWindow =
      typeof saleStartMs === 'number' &&
      Number.isFinite(saleStartMs) &&
      typeof saleEndMs === 'number' &&
      Number.isFinite(saleEndMs) &&
      saleEndMs > saleStartMs;

    const db = getAdminDb();

    // 1) Load sales
    // IMPORTANT: Avoid Firestore composite-index requirement.
    // Using where(userId) + where(linkedPurchaseId==null) + orderBy(date) often triggers FAILED_PRECONDITION
    // unless a composite index is created. Instead, fetch the latest sales for the user and filter in memory.
    // NOTE: Even where(userId==...) + orderBy(date) can require a composite index in some Firestore setups.
    // To make this endpoint work out-of-the-box, do not orderBy in Firestore; sort in-memory instead.
    let sales: any[] = [];
    let salesRead = 0;
    let legacySalesRead = 0;
    let hasMoreSales = false;
    let hasMoreLegacySales = false;

    if (hasSaleWindow) {
      // Scan through sales in pages and filter to the requested window in-memory.
      // This avoids requiring Firestore composite indexes on (userId, date).
      let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
      const pageSize = 1000;
      while (salesRead < scanLimit) {
        let q: FirebaseFirestore.Query = db
          .collection('user_sales')
          .where('userId', '==', userId)
          .orderBy(FieldPath.documentId())
          .limit(Math.min(pageSize, scanLimit - salesRead));
        if (lastDoc) q = q.startAfter(lastDoc);
        const snap = await q.get();
        if (snap.empty) break;
        salesRead += snap.docs.length;
        lastDoc = snap.docs[snap.docs.length - 1];

        let batch = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        if (unlinkedOnly) batch = batch.filter((s: any) => (s?.linkedPurchaseId ?? null) === null);

        // Filter to time window
        for (const s of batch) {
          const ev = getSaleEventMs(s);
          const ms = ev.ms;
          if (typeof ms !== 'number') continue;
          if (ms >= (saleStartMs as number) && ms < (saleEndMs as number)) sales.push(s);
        }

        if (snap.docs.length < pageSize) break;
      }
      hasMoreSales = salesRead >= scanLimit;

      // ALSO scan legacy stockxSales when a time window is requested.
      // Many older imports wrote sales into stockxSales; user_sales may only contain a subset.
      // We merge+dedupe by orderNumber to avoid double counting.
      try {
        let legacyLastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
        const legacyPageSize = 1000;
        const legacyMatches: any[] = [];
        while (legacySalesRead < scanLimit) {
          let q: FirebaseFirestore.Query = db
            .collection(COLLECTIONS.STOCKX_SALES)
            .where('userId', '==', userId)
            .orderBy(FieldPath.documentId())
            .limit(Math.min(legacyPageSize, scanLimit - legacySalesRead));
          if (legacyLastDoc) q = q.startAfter(legacyLastDoc);
          const snap = await q.get();
          if (snap.empty) break;
          legacySalesRead += snap.docs.length;
          legacyLastDoc = snap.docs[snap.docs.length - 1];

          const legacyDocs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          const mapped = legacyDocs.map((x: any) => {
            const s = x?.saleData || x?.sale || x;
            return {
              id: x.id,
              orderNumber: s?.orderNumber || x?.stockxOrderId || x?.orderNumber || null,
              product: s?.productName || s?.product?.productName || s?.product?.title || s?.product?.name || null,
              brand: s?.product?.brand || s?.brand || null,
              size: s?.variant?.variantValue || s?.size || null,
              styleId: s?.product?.styleId || s?.styleId || null,
              imageUrl: s?.product?.imageUrl || s?.product?.image || null,
              salePrice: s?.amount ? Number(s.amount) || 0 : Number(s?.salePrice) || 0,
              fees: Number(s?.fees) || null,
              payout: s?.payout ? Number(s.payout) || null : (s?.totalPayout ? Number(s.totalPayout) || null : null),
              purchasePrice: Number(s?.purchasePrice) || null,
              profit: Number(s?.profit) || null,
              linkedPurchaseId: s?.linkedPurchaseId ?? null,
              linkedPurchaseOrderNumber: s?.linkedPurchaseOrderNumber ?? null,
              date: s?.date || s?.createdAt || s?.updatedAt || null,
              listingId: s?.listingId || s?.askId || null,
              _source: 'stockxSales'
            };
          });

          let filtered = mapped;
          if (unlinkedOnly) filtered = filtered.filter((s: any) => (s?.linkedPurchaseId ?? null) === null);

          for (const s of filtered) {
            const ev = getSaleEventMs(s);
            const ms = ev.ms;
            if (typeof ms !== 'number') continue;
            if (ms >= (saleStartMs as number) && ms < (saleEndMs as number)) legacyMatches.push(s);
          }

          if (snap.docs.length < legacyPageSize) break;
        }
        hasMoreLegacySales = legacySalesRead >= scanLimit;

        if (legacyMatches.length > 0) {
          const byOrder = new Map<string, any>();
          for (const s of sales) {
            const k = String(s?.orderNumber || '').trim();
            if (!k) continue;
            byOrder.set(k, s);
          }
          for (const s of legacyMatches) {
            const k = String(s?.orderNumber || '').trim();
            if (!k) continue;
            if (!byOrder.has(k)) {
              byOrder.set(k, s);
            }
          }
          sales = Array.from(byOrder.values());
        }
      } catch (e: any) {
        console.warn('⚠️ fifo-dry-run legacy sales scan failed (non-fatal):', e?.message || String(e));
      }

      // Safety: cap how many we actually process downstream in this run.
      if (sales.length > limitSales) {
        sales = sales.slice(0, limitSales);
        hasMoreSales = true;
      }
    } else {
      const salesQuery: FirebaseFirestore.Query = db
        .collection('user_sales')
        .where('userId', '==', userId)
        .limit(limitSales);

      const salesSnap = await salesQuery.get();
      salesRead = salesSnap.docs.length;
      sales = salesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      if (unlinkedOnly) {
        sales = sales.filter((s: any) => (s?.linkedPurchaseId ?? null) === null);
      }
    }
    // Sort newest-first for stable UI (best-effort).
    sales.sort((a: any, b: any) => {
      const aMs = parseDateMs(a?.date) ?? parseDateMs(a?.createdAt) ?? parseDateMs(a?.updatedAt) ?? 0;
      const bMs = parseDateMs(b?.date) ?? parseDateMs(b?.createdAt) ?? parseDateMs(b?.updatedAt) ?? 0;
      return bMs - aMs;
    });

    // Back-compat fallback: if user_sales has no docs, try legacy stockxSales docs ({saleData: ...})
    // so the dry-run can still demonstrate FIFO logic even before migration.
    if (sales.length === 0) {
      try {
        const legacySnap = await db
          .collection(COLLECTIONS.STOCKX_SALES)
          .where('userId', '==', userId)
          .orderBy(FieldPath.documentId())
          .limit(limitSales)
          .get();

        const legacyDocs = legacySnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        sales = legacyDocs.map((x: any) => {
          const s = x?.saleData || x?.sale || x;
          return {
            id: x.id,
            orderNumber: s?.orderNumber || x?.stockxOrderId || x?.orderNumber || null,
            product: s?.productName || s?.product?.productName || s?.product?.title || s?.product?.name || null,
            brand: s?.product?.brand || s?.brand || null,
            size: s?.variant?.variantValue || s?.size || null,
            styleId: s?.product?.styleId || s?.styleId || null,
            date: s?.date || s?.createdAt || s?.updatedAt || null,
            listingId: s?.listingId || s?.askId || null,
            linkedPurchaseId: s?.linkedPurchaseId ?? null,
            linkedPurchaseOrderNumber: s?.linkedPurchaseOrderNumber ?? null
          };
        });
      } catch (e: any) {
        console.warn('⚠️ fifo-dry-run legacy sales fallback failed:', e?.message || String(e));
      }
    }

    // 2) Load purchases (userId or uid), then dedupe
    const [pByUserId, pByUid] = await Promise.all([
      db.collection('purchases').where('userId', '==', userId).get(),
      db.collection('purchases').where('uid', '==', userId).get()
    ]);
    const purchaseDocs = [...pByUserId.docs, ...pByUid.docs];
    const purchasesAll = purchaseDocs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PurchaseCandidate[];
    const seenPurchaseIds = new Set<string>();
    const purchases: PurchaseCandidate[] = [];
    for (const p of purchasesAll) {
      if (seenPurchaseIds.has(p.id)) continue;
      seenPurchaseIds.add(p.id);
      purchases.push(p);
    }

    const purchaseIndex = new Map<string, PurchaseCandidate[]>();
    const purchaseNameIndex = new Map<string, PurchaseCandidate[]>();
    const purchaseBySize = new Map<string, PurchaseCandidate[]>();
    const purchaseByStockxListingId = new Map<string, PurchaseCandidate>();
    const usedPurchaseIds = new Set<string>();

    for (const p of purchases) {
      const pid = String(p.id || '');
      if (!pid) continue;

      if (p.linkedSaleOrderNumber || p.linkedSaleId) {
        usedPurchaseIds.add(pid);
        continue;
      }

      const size = normalizeSize((p as any).size ?? (p as any).extracted_size ?? p.product?.size);
      if (!size) continue;

      const stockxListingId = typeof p.stockxListingId === 'string' ? p.stockxListingId.trim() : '';
      if (stockxListingId && !purchaseByStockxListingId.has(stockxListingId)) {
        purchaseByStockxListingId.set(stockxListingId, p);
      }

      // FIFO ordering: prefer actualDelivery; optional fallback to purchaseDate/emailDate/createdAt if strictDelivery=0.
      const { ms: dateMs, source } = getPurchaseFifoDate(p, strictDelivery);
      p._dateMs = dateMs ?? null;
      p._dateSource = source;
      if (dateMs === null) {
        // Not eligible for FIFO matching in this mode.
        continue;
      }

      // Size index (for fuzzy name fallback)
      const bySizeArr = purchaseBySize.get(size) || [];
      bySizeArr.push(p);
      purchaseBySize.set(size, bySizeArr);

      const styleId = getPurchaseStyleId(p);
      if (styleId) {
        const key = purchaseKey(styleId, size);
        const arr = purchaseIndex.get(key) || [];
        arr.push(p);
        purchaseIndex.set(key, arr);
      }

      const productName = getPurchaseProductName(p);
      if (productName) {
        const nk = purchaseNameKey(productName, size);
        if (nk && !nk.startsWith('::')) {
          const arr = purchaseNameIndex.get(nk) || [];
          arr.push(p);
          purchaseNameIndex.set(nk, arr);
        }
      }
    }

    // FIFO sort
    for (const [key, arr] of purchaseIndex.entries()) {
      arr.sort((a, b) => {
        const aMs = typeof a._dateMs === 'number' ? a._dateMs : Number.POSITIVE_INFINITY;
        const bMs = typeof b._dateMs === 'number' ? b._dateMs : Number.POSITIVE_INFINITY;
        if (aMs !== bMs) return aMs - bMs;
        const aCreated = parseDateMs(a.createdAt) ?? Number.POSITIVE_INFINITY;
        const bCreated = parseDateMs(b.createdAt) ?? Number.POSITIVE_INFINITY;
        return aCreated - bCreated;
      });
      purchaseIndex.set(key, arr);
    }

    for (const [key, arr] of purchaseNameIndex.entries()) {
      arr.sort((a, b) => {
        const aMs = typeof a._dateMs === 'number' ? a._dateMs : Number.POSITIVE_INFINITY;
        const bMs = typeof b._dateMs === 'number' ? b._dateMs : Number.POSITIVE_INFINITY;
        if (aMs !== bMs) return aMs - bMs;
        const aCreated = parseDateMs(a.createdAt) ?? Number.POSITIVE_INFINITY;
        const bCreated = parseDateMs(b.createdAt) ?? Number.POSITIVE_INFINITY;
        return aCreated - bCreated;
      });
      purchaseNameIndex.set(key, arr);
    }

    for (const [key, arr] of purchaseBySize.entries()) {
      arr.sort((a, b) => {
        const aMs = typeof a._dateMs === 'number' ? a._dateMs : Number.POSITIVE_INFINITY;
        const bMs = typeof b._dateMs === 'number' ? b._dateMs : Number.POSITIVE_INFINITY;
        if (aMs !== bMs) return aMs - bMs;
        const aCreated = parseDateMs(a.createdAt) ?? Number.POSITIVE_INFINITY;
        const bCreated = parseDateMs(b.createdAt) ?? Number.POSITIVE_INFINITY;
        return aCreated - bCreated;
      });
      purchaseBySize.set(key, arr);
    }

    const results: any[] = [];
    let wouldLink = 0;
    let noMatch = 0;
    let alreadyLinked = 0;

    for (const sale of sales) {
      const existingLinkedPurchaseId = sale?.linkedPurchaseId || sale?.matchedPurchaseId || null;
      const saleSalePrice = toNumberOrNull(sale?.salePrice);
      const saleFees = toNumberOrNull(sale?.fees);
      const salePayout = toNumberOrNull(sale?.payout);
      const saleNetPayout =
        typeof salePayout === 'number'
          ? salePayout
          : typeof saleSalePrice === 'number'
            ? saleSalePrice - (typeof saleFees === 'number' ? saleFees : 0)
            : null;
      const salePurchasePrice = toNumberOrNull(sale?.purchasePrice);
      const saleProfit = toNumberOrNull(sale?.profit);
      if (existingLinkedPurchaseId) {
        alreadyLinked++;
        results.push({
          saleOrderNumber: sale?.orderNumber || null,
          saleProduct: sale?.product || null,
          saleSize: sale?.size || null,
          salePrice: saleSalePrice,
          saleFees,
          salePayout,
          saleNetPayout,
          purchaseCost: salePurchasePrice,
          profit: saleProfit,
          status: 'already_linked',
          linkedPurchaseId: existingLinkedPurchaseId,
          linkedPurchaseOrderNumber: sale?.linkedPurchaseOrderNumber || null,
          method: 'existing_link'
        });
        continue;
      }

      const saleOrderNumber = sale?.orderNumber || null;
      const saleProduct = sale?.product || null;
      const saleSizeRaw = sale?.size || '';
      const saleSize = normalizeSize(saleSizeRaw);
      const saleStyleId = (sale?.styleId || '').toString().trim();
      const saleEvent = getSaleEventMs(sale);
      const saleCreatedAtMs = saleEvent.ms;
      const saleCutoffIso = msToIso(saleCreatedAtMs);
      const saleCutoffSource = saleEvent.source;
      const saleListingId = getSaleListingId(sale);

      let linkedPurchase: PurchaseCandidate | null = null;
      let method: 'listingId' | 'fifo' | 'name' | null = null;

      // 1) Exact listingId match
      if (saleListingId) {
        const candidate = purchaseByStockxListingId.get(saleListingId) || null;
        const pid = candidate ? String(candidate.id || '') : '';
        if (candidate && pid && !usedPurchaseIds.has(pid)) {
          linkedPurchase = candidate;
          method = 'listingId';
          usedPurchaseIds.add(pid);
        }
      }

      // 2) FIFO by styleId+size
      if (!linkedPurchase && saleStyleId && saleSize) {
        const key = purchaseKey(saleStyleId, saleSize);
        const candidates = purchaseIndex.get(key) || [];
        const totalCandidates = candidates.length;
        let candidatesConsidered = 0;
        for (const cand of candidates) {
          const pid = String(cand.id || '');
          if (!pid || usedPurchaseIds.has(pid)) continue;
          candidatesConsidered++;
          if (
            typeof saleCreatedAtMs === 'number' &&
            typeof cand._dateMs === 'number' &&
            // Don't exclude based on Firestore createdAt (sync time) — it's not a reliable "purchase happened" timestamp.
            cand._dateSource !== 'createdAt' &&
            cand._dateMs > saleCreatedAtMs
          ) {
            continue;
          }
          linkedPurchase = cand;
          method = 'fifo';
          usedPurchaseIds.add(pid);
          break;
        }
        // If no match found, we still fall through and mark no_match below.
        if (!linkedPurchase && totalCandidates > 0) {
          // Attach debug metadata for later (UI can choose to show it or not).
          (sale as any)._fifoDebug = {
            saleStyleId,
            saleSize,
            candidatesTotal: totalCandidates,
            candidatesConsidered,
          };
        }
      }

      // 3) Fallback: match by product name + size.
      // First try exact normalized name key; if not found, use token similarity within same size bucket.
      if (!linkedPurchase && saleProduct && saleSize) {
        const nk = purchaseNameKey(String(saleProduct), saleSize);
        const exact = purchaseNameIndex.get(nk) || [];
        const candidates = exact.length > 0 ? exact : (purchaseBySize.get(saleSize) || []);

        const saleTokens = tokenizeName(String(saleProduct));
        let best: { cand: PurchaseCandidate; score: number; overlap: number; j: number; coverage: number } | null = null;
        let considered = 0;
        let skippedUsed = 0;
        let skippedAfterSaleDate = 0;
        let skippedAfterSaleDateButUnreliable = 0;

        for (const cand of candidates) {
          const pid = String(cand.id || '');
          if (!pid) continue;
          if (usedPurchaseIds.has(pid)) {
            skippedUsed++;
            continue;
          }
          if (
            typeof saleCreatedAtMs === 'number' &&
            typeof cand._dateMs === 'number' &&
            cand._dateMs > saleCreatedAtMs
          ) {
            if (cand._dateSource === 'createdAt') {
              // Likely sync-time, not real purchase/delivery time — don't block matching.
              skippedAfterSaleDateButUnreliable++;
            } else {
              skippedAfterSaleDate++;
              continue;
            }
          }

          const candName = getPurchaseProductName(cand);
          const candTokens = candName ? tokenizeName(candName) : [];
          const { jaccard: j, coverage, overlap } = tokenOverlapScore(saleTokens, candTokens);
          const score = Math.max(j, coverage);
          considered++;

          // Only track a "best" candidate when we have *some* overlap; otherwise it's misleading noise.
          if (overlap > 0 && (!best || score > best.score)) best = { cand, score, overlap, j, coverage };

          // Accept exact-key matches regardless of score; otherwise require reasonable similarity.
          // NOTE: coverage helps when one side has many extra tokens (common in apparel titles).
          const ok = exact.length > 0 ? true : (score >= 0.6 && overlap >= 2);
          if (!ok) continue;

          // Keep FIFO: choose the earliest eligible candidate; but track score for debugging.
          linkedPurchase = cand;
          method = 'name';
          usedPurchaseIds.add(pid);
          break;
        }

        if (!linkedPurchase && candidates.length > 0) {
          (sale as any)._nameDebug = {
            mode: exact.length > 0 ? 'exact' : 'fuzzy',
            attempted: candidates.length,
            considered,
            skippedUsed,
            skippedAfterSaleDate,
            skippedAfterSaleDateButUnreliable,
            bestScore: best?.score ?? 0,
            bestJaccard: best?.j ?? 0,
            bestCoverage: best?.coverage ?? 0,
            bestOverlap: best?.overlap ?? 0,
            bestCandidateOrderNumber: best?.cand?.orderNumber || null,
            bestCandidateName: best ? getPurchaseProductName(best.cand) : null,
            bestCandidateFifoIso: best ? msToIso(typeof best.cand._dateMs === 'number' ? best.cand._dateMs : null) : null,
            bestCandidateFifoSource: best ? (best.cand as any)._dateSource || null : null,
          };
        }
      }

      if (linkedPurchase) {
        wouldLink++;
        const purchaseCost = getPurchaseCost(linkedPurchase);
        const purchaseFifoMs = typeof linkedPurchase._dateMs === 'number' ? linkedPurchase._dateMs : null;
        const purchaseFifoIso = msToIso(purchaseFifoMs);
        const purchaseFifoSource = (linkedPurchase as any)._dateSource || null;
        const purchaseStyleId = getPurchaseStyleId(linkedPurchase);
        const profit =
          typeof saleNetPayout === 'number' && typeof purchaseCost === 'number'
            ? saleNetPayout - purchaseCost
            : null;
        results.push({
          saleOrderNumber,
          saleProduct,
          saleSize: saleSizeRaw,
          saleCutoffIso,
          saleCutoffSource,
          saleStyleId: saleStyleId || null,
          salePrice: saleSalePrice,
          saleFees,
          salePayout,
          saleNetPayout,
          status: 'would_link',
          method,
          linkedPurchaseId: linkedPurchase.id,
          linkedPurchaseOrderNumber: linkedPurchase.orderNumber || null,
          linkedPurchaseStyleId: purchaseStyleId,
          purchaseFifoIso,
          purchaseFifoSource,
          purchaseCost,
          profit,
          purchaseActualDelivery: (linkedPurchase as any)?.actualDelivery || null
        });
      } else {
        noMatch++;
        const dbg = (sale as any)._fifoDebug || null;
        const nameDbg = (sale as any)._nameDebug || null;
        const fifoCandidatesTotal = typeof dbg?.candidatesTotal === 'number' ? dbg.candidatesTotal : 0;
        const fifoCandidatesConsidered = typeof dbg?.candidatesConsidered === 'number' ? dbg.candidatesConsidered : 0;
        const nameCandidatesTotal =
          saleProduct && saleSize ? (purchaseNameIndex.get(purchaseNameKey(String(saleProduct), saleSize)) || []).length : 0;
        const sizeCandidatesTotal = saleSize ? (purchaseBySize.get(saleSize) || []).length : 0;
        const bestScore = typeof nameDbg?.bestScore === 'number' ? nameDbg.bestScore : null;
        const bestOverlap = typeof nameDbg?.bestOverlap === 'number' ? nameDbg.bestOverlap : null;
        const nameAttempted = typeof nameDbg?.attempted === 'number' ? nameDbg.attempted : null;
        const nameConsidered = typeof nameDbg?.considered === 'number' ? nameDbg.considered : null;
        const nameSkippedUsed = typeof nameDbg?.skippedUsed === 'number' ? nameDbg.skippedUsed : null;
        const nameSkippedAfterSaleDate = typeof nameDbg?.skippedAfterSaleDate === 'number' ? nameDbg.skippedAfterSaleDate : null;
        const nameSkippedAfterSaleDateButUnreliable =
          typeof nameDbg?.skippedAfterSaleDateButUnreliable === 'number' ? nameDbg.skippedAfterSaleDateButUnreliable : null;
        const nameMode = typeof nameDbg?.mode === 'string' ? nameDbg.mode : null;
        results.push({
          saleOrderNumber,
          saleProduct,
          saleSize: saleSizeRaw,
          saleCutoffIso,
          saleCutoffSource,
          salePrice: saleSalePrice,
          saleFees,
          salePayout,
          saleNetPayout,
          status: 'no_match',
          method: null,
          reason: !saleStyleId
            ? (() => {
              // Prefer explaining why size candidates (or exact name candidates) were ineligible.
              // Note: nameCandidatesTotal is "exact normalized name key" count; fuzzy may still be attempted via size bucket.
              const attempted = typeof nameAttempted === 'number' ? nameAttempted : 0;
              const skippedAfter = typeof nameSkippedAfterSaleDate === 'number' ? nameSkippedAfterSaleDate : 0;
              const skippedUsed = typeof nameSkippedUsed === 'number' ? nameSkippedUsed : 0;

              if (attempted > 0 && skippedAfter === attempted) return 'missing_sale_styleId_all_size_candidates_after_sale_date';
              if (attempted > 0 && skippedUsed === attempted) return 'missing_sale_styleId_all_size_candidates_already_used';

              if (nameCandidatesTotal > 0) {
                if (skippedAfter > 0) return 'missing_sale_styleId_name_candidate_after_sale_date';
                if (skippedUsed > 0) return 'missing_sale_styleId_name_candidate_already_used';
                return 'missing_sale_styleId_but_name_candidates_exist';
              }
              return 'missing_sale_styleId';
            })()
            : !saleSize
              ? 'missing_sale_size'
              : (fifoCandidatesTotal === 0 ? 'no_purchase_candidates' : 'no_eligible_purchase'),
          saleStyleId: saleStyleId || null,
          saleSizeNorm: saleSize || null,
          candidatesTotal: fifoCandidatesTotal,
          candidatesConsidered: fifoCandidatesConsidered,
          nameCandidatesTotal,
          sizeCandidatesTotal,
          nameMatchMode: nameMode,
          nameCandidatesAttempted: nameAttempted,
          nameCandidatesConsidered: nameConsidered,
          nameCandidatesSkippedUsed: nameSkippedUsed,
          nameCandidatesSkippedAfterSaleDate: nameSkippedAfterSaleDate,
          nameCandidatesSkippedAfterSaleDateButUnreliable: nameSkippedAfterSaleDateButUnreliable,
          bestNameMatchScore: bestScore,
          bestNameMatchOverlap: bestOverlap,
          bestNameMatchCandidateOrderNumber: nameDbg?.bestCandidateOrderNumber || null,
          bestNameMatchCandidateName: nameDbg?.bestCandidateName || null,
          bestNameMatchCandidateFifoIso: nameDbg?.bestCandidateFifoIso || null,
          bestNameMatchCandidateFifoSource: nameDbg?.bestCandidateFifoSource || null,
          strictDelivery,
        });
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      filters: hasSaleWindow ? { saleStartMs, saleEndMs } : null,
      summary: {
        totalSalesScanned: sales.length,
        wouldLink,
        noMatch,
        alreadyLinked,
        // Debug: how many sale docs we had to read to find those sales in-window.
        salesRead,
        legacySalesRead,
        salesCapped: hasMoreSales,
        legacySalesCapped: hasMoreLegacySales
      },
      results
    });
  } catch (error: any) {
    console.error('❌ FIFO dry-run error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}


