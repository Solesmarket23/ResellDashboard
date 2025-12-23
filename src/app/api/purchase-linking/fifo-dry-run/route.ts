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
  return String(size || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function parseMoney(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseDateMs(val: unknown): number | null {
  if (typeof val !== 'string' || !val) return null;
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? ms : null;
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
  const totalAmount =
    (typeof p.totalAmount === 'number' ? p.totalAmount : parseMoney(p.totalAmount)) ?? null;
  if (typeof totalAmount === 'number' && Number.isFinite(totalAmount) && totalAmount > 0) return totalAmount;

  const purchasePrice =
    (typeof p.purchasePrice === 'number' ? p.purchasePrice : parseMoney(p.purchasePrice)) ?? null;
  if (typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0) return purchasePrice;

  const priceFromString = parseMoney(p.price);
  if (typeof priceFromString === 'number' && Number.isFinite(priceFromString) && priceFromString > 0) return priceFromString;

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

    const db = getAdminDb();

    // 1) Load sales
    let salesQuery: FirebaseFirestore.Query = db
      .collection('user_sales')
      .where('userId', '==', userId)
      .orderBy('date', 'desc')
      .limit(limitSales);

    if (unlinkedOnly) {
      salesQuery = salesQuery.where('linkedPurchaseId', '==', null);
    }

    const salesSnap = await salesQuery.get();
    let sales = salesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

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
    const purchaseByStockxListingId = new Map<string, PurchaseCandidate>();
    const usedPurchaseIds = new Set<string>();

    for (const p of purchases) {
      const pid = String(p.id || '');
      if (!pid) continue;

      if (p.linkedSaleOrderNumber || p.linkedSaleId) {
        usedPurchaseIds.add(pid);
        continue;
      }

      const styleId = getPurchaseStyleId(p);
      const size = normalizeSize(p.size ?? p.product?.size);
      if (!styleId || !size) continue;

      const stockxListingId = typeof p.stockxListingId === 'string' ? p.stockxListingId.trim() : '';
      if (stockxListingId && !purchaseByStockxListingId.has(stockxListingId)) {
        purchaseByStockxListingId.set(stockxListingId, p);
      }

      // STRICT FIFO: only consider purchases that have an actual delivery timestamp.
      const dateMs = parseDateMs((p as any).actualDelivery) ?? null;
      p._dateMs = dateMs;
      if (dateMs === null) {
        // Not eligible for strict-delivery FIFO matching.
        continue;
      }

      const key = purchaseKey(styleId, size);
      const arr = purchaseIndex.get(key) || [];
      arr.push(p);
      purchaseIndex.set(key, arr);
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

    const results: any[] = [];
    let wouldLink = 0;
    let noMatch = 0;
    let alreadyLinked = 0;

    for (const sale of sales) {
      const existingLinkedPurchaseId = sale?.linkedPurchaseId || sale?.matchedPurchaseId || null;
      if (existingLinkedPurchaseId) {
        alreadyLinked++;
        results.push({
          saleOrderNumber: sale?.orderNumber || null,
          saleProduct: sale?.product || null,
          saleSize: sale?.size || null,
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
      let method: 'listingId' | 'fifo' | null = null;

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
          linkedPurchase = cand;
          method = 'fifo';
          usedPurchaseIds.add(pid);
          break;
        }
      }

      if (linkedPurchase) {
        wouldLink++;
        results.push({
          saleOrderNumber,
          saleProduct,
          saleSize: saleSizeRaw,
          status: 'would_link',
          method,
          linkedPurchaseId: linkedPurchase.id,
          linkedPurchaseOrderNumber: linkedPurchase.orderNumber || null,
          purchaseCost: getPurchaseCost(linkedPurchase),
          purchaseActualDelivery: (linkedPurchase as any)?.actualDelivery || null
        });
      } else {
        noMatch++;
        results.push({
          saleOrderNumber,
          saleProduct,
          saleSize: saleSizeRaw,
          status: 'no_match',
          method: null
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


