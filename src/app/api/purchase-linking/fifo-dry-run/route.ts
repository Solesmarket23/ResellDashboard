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

  // Apparel sizing
  const apparel = new Set(['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'OS', 'ONE SIZE']);
  if (apparel.has(s)) return s;

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

function getPurchaseFifoDateMs(p: PurchaseCandidate, strictDelivery: boolean): number | null {
  const deliveryMs = parseDateMs((p as any).actualDelivery);
  if (deliveryMs !== null) return deliveryMs;
  if (strictDelivery) return null;
  return (
    parseDateMs((p as any).purchaseDate) ??
    parseDateMs((p as any).purchase_date) ??
    parseDateMs((p as any).emailDate) ??
    parseDateMs((p as any).email_date) ??
    parseDateMs((p as any).createdAt) ??
    null
  );
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
  // Prefer "totalPayment" when present (purchase price + fees + shipping, etc.)
  const totalPayment =
    (typeof (p as any).totalPayment === 'number' ? (p as any).totalPayment : parseMoney((p as any).totalPayment)) ?? null;
  if (typeof totalPayment === 'number' && Number.isFinite(totalPayment) && totalPayment > 0) return totalPayment;

  const totalAmount =
    (typeof p.totalAmount === 'number' ? p.totalAmount : parseMoney(p.totalAmount)) ?? null;
  if (typeof totalAmount === 'number' && Number.isFinite(totalAmount) && totalAmount > 0) return totalAmount;

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
  return extrasSum > 0 ? base + extrasSum : base;

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

    const limitSales = Math.max(1, Math.min(500, Number(request.nextUrl.searchParams.get('limitSales') || 200)));
    const unlinkedOnly = request.nextUrl.searchParams.get('unlinkedOnly') !== '0';
    const strictDelivery = request.nextUrl.searchParams.get('strictDelivery') !== '0';

    const db = getAdminDb();

    // 1) Load sales
    // IMPORTANT: Avoid Firestore composite-index requirement.
    // Using where(userId) + where(linkedPurchaseId==null) + orderBy(date) often triggers FAILED_PRECONDITION
    // unless a composite index is created. Instead, fetch the latest sales for the user and filter in memory.
    // NOTE: Even where(userId==...) + orderBy(date) can require a composite index in some Firestore setups.
    // To make this endpoint work out-of-the-box, do not orderBy in Firestore; sort in-memory instead.
    const salesQuery: FirebaseFirestore.Query = db
      .collection('user_sales')
      .where('userId', '==', userId)
      .limit(limitSales);

    const salesSnap = await salesQuery.get();
    let sales = salesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    if (unlinkedOnly) {
      sales = sales.filter((s: any) => (s?.linkedPurchaseId ?? null) === null);
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
      const dateMs = getPurchaseFifoDateMs(p, strictDelivery) ?? null;
      p._dateMs = dateMs;
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
      const saleCreatedAtMs = parseDateMs(sale?.date) ?? parseDateMs(sale?.createdAt) ?? parseDateMs(sale?.updatedAt) ?? null;
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
        let best: { cand: PurchaseCandidate; score: number } | null = null;

        for (const cand of candidates) {
          const pid = String(cand.id || '');
          if (!pid || usedPurchaseIds.has(pid)) continue;
          if (
            typeof saleCreatedAtMs === 'number' &&
            typeof cand._dateMs === 'number' &&
            cand._dateMs > saleCreatedAtMs
          ) {
            continue;
          }

          const candName = getPurchaseProductName(cand);
          const score = candName ? jaccard(saleTokens, tokenizeName(candName)) : 0;
          // Accept exact-key matches regardless of score; otherwise require reasonable similarity.
          const ok = exact.length > 0 ? true : score >= 0.55;
          if (!ok) continue;

          // Keep FIFO: choose the earliest eligible candidate; but track score for debugging.
          linkedPurchase = cand;
          method = 'name';
          best = { cand, score };
          usedPurchaseIds.add(pid);
          break;
        }

        if (!linkedPurchase && exact.length === 0 && (purchaseBySize.get(saleSize) || []).length > 0) {
          (sale as any)._nameDebug = {
            attempted: (purchaseBySize.get(saleSize) || []).length,
            bestScore: best?.score ?? 0,
            mode: 'fuzzy',
          };
        }
      }

      if (linkedPurchase) {
        wouldLink++;
        const purchaseCost = getPurchaseCost(linkedPurchase);
        const profit =
          typeof saleNetPayout === 'number' && typeof purchaseCost === 'number'
            ? saleNetPayout - purchaseCost
            : null;
        results.push({
          saleOrderNumber,
          saleProduct,
          saleSize: saleSizeRaw,
          salePrice: saleSalePrice,
          saleFees,
          salePayout,
          saleNetPayout,
          status: 'would_link',
          method,
          linkedPurchaseId: linkedPurchase.id,
          linkedPurchaseOrderNumber: linkedPurchase.orderNumber || null,
          purchaseCost,
          profit,
          purchaseActualDelivery: (linkedPurchase as any)?.actualDelivery || null
        });
      } else {
        noMatch++;
        const dbg = (sale as any)._fifoDebug || null;
        const nameCandidatesTotal =
          saleProduct && saleSize ? (purchaseNameIndex.get(purchaseNameKey(String(saleProduct), saleSize)) || []).length : 0;
        const sizeCandidatesTotal = saleSize ? (purchaseBySize.get(saleSize) || []).length : 0;
        results.push({
          saleOrderNumber,
          saleProduct,
          saleSize: saleSizeRaw,
          salePrice: saleSalePrice,
          saleFees,
          salePayout,
          saleNetPayout,
          status: 'no_match',
          method: null,
          reason: !saleStyleId
            ? (nameCandidatesTotal > 0 ? 'missing_sale_styleId_but_name_candidates_exist' : 'missing_sale_styleId')
            : !saleSize
              ? 'missing_sale_size'
              : (dbg?.candidatesTotal === 0 ? 'no_purchase_candidates' : 'no_eligible_purchase'),
          saleStyleId: saleStyleId || null,
          saleSizeNorm: saleSize || null,
          candidatesTotal: typeof dbg?.candidatesTotal === 'number' ? dbg.candidatesTotal : 0,
          candidatesConsidered: typeof dbg?.candidatesConsidered === 'number' ? dbg.candidatesConsidered : 0,
          nameCandidatesTotal,
          sizeCandidatesTotal,
          strictDelivery,
        });
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      summary: {
        totalSalesScanned: sales.length,
        wouldLink,
        noMatch,
        alreadyLinked
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


