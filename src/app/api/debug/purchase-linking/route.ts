import { NextRequest, NextResponse } from 'next/server';
import { getAdminDocuments } from '@/lib/firebase/firebaseAdmin';
import { COLLECTIONS } from '@/lib/firebase/collections';

type PurchaseCandidate = {
  id: string;
  userId?: string;
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
  linkedSaleOrderNumber?: string;
  linkedSaleId?: string;
  product?: { styleId?: string | null; size?: string };
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
    (typeof p.totalAmount === 'number' ? p.totalAmount : parseMoney(p.totalAmount)) ??
    null;
  if (typeof totalAmount === 'number' && Number.isFinite(totalAmount) && totalAmount > 0) return totalAmount;

  const purchasePrice =
    (typeof p.purchasePrice === 'number' ? p.purchasePrice : parseMoney(p.purchasePrice)) ??
    null;
  if (typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0) return purchasePrice;

  const priceFromString = parseMoney(p.price);
  if (typeof priceFromString === 'number' && Number.isFinite(priceFromString) && priceFromString > 0) return priceFromString;

  return null;
}

function purchaseKey(styleId: string, size: string): string {
  return `${styleId}::${normalizeSize(size)}`;
}

function getUserIdFromRequest(request: NextRequest): string | null {
  const qp = request.nextUrl.searchParams.get('userId')?.trim();
  if (qp) return qp;
  const header = request.headers.get('x-user-id')?.trim();
  if (header) return header;
  const cookie =
    request.cookies.get('siteUserId')?.value ||
    request.cookies.get('site-user-id')?.value ||
    null;
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie);
  } catch {
    return cookie;
  }
}

function isAuthorized(request: NextRequest): boolean {
  // Allow localhost without a secret
  const host = (request.headers.get('host') || '').toLowerCase();
  if (host.includes('localhost') || host.includes('127.0.0.1')) return true;

  const secret = process.env.INTERNAL_DEBUG_SECRET?.trim();
  if (!secret) return false;

  const headerSecret = request.headers.get('x-internal-secret')?.trim();
  const qpSecret = request.nextUrl.searchParams.get('secret')?.trim();
  return headerSecret === secret || qpSecret === secret;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });

    const limitSales = Math.max(1, Math.min(500, Number(request.nextUrl.searchParams.get('limitSales') || 100)));
    const unlinkedOnly = request.nextUrl.searchParams.get('unlinkedOnly') !== '0';

    // Load user sales and purchases
    const MAIN_SALES_COLLECTION = 'user_sales';
    const allSales = await getAdminDocuments(MAIN_SALES_COLLECTION as any);
    const userSales = allSales
      .filter((s: any) => s?.userId === userId && (s?.platform === 'stockx' || s?.market === 'StockX' || s?.source?.includes?.('stockx')))
      .sort((a: any, b: any) => (parseDateMs(b?.date) ?? 0) - (parseDateMs(a?.date) ?? 0))
      .slice(0, limitSales);

    const allPurchasesRaw = (await getAdminDocuments(COLLECTIONS.PURCHASES)) as PurchaseCandidate[];
    const userPurchases = allPurchasesRaw.filter((p: any) => p?.userId === userId);

    const purchaseIndex = new Map<string, PurchaseCandidate[]>();
    const purchaseByStockxListingId = new Map<string, PurchaseCandidate>();
    const usedPurchaseIds = new Set<string>();

    for (const p of userPurchases) {
      const pid = String((p as any)?.id || '');
      if (!pid) continue;

      // Skip already-linked purchases
      if (p.linkedSaleOrderNumber || p.linkedSaleId) {
        usedPurchaseIds.add(pid);
        continue;
      }

      const styleId = getPurchaseStyleId(p);
      const size = normalizeSize(p.size ?? p.product?.size);
      if (!styleId || !size) continue;

      const stockxListingId = typeof (p as any)?.stockxListingId === 'string' ? String((p as any).stockxListingId).trim() : '';
      if (stockxListingId && !purchaseByStockxListingId.has(stockxListingId)) {
        purchaseByStockxListingId.set(stockxListingId, { ...p, id: pid });
      }

      const dateMs =
        parseDateMs(p.purchaseDate) ??
        parseDateMs(p.purchase_date) ??
        parseDateMs(p.emailDate) ??
        parseDateMs(p.email_date) ??
        parseDateMs(p.createdAt) ??
        null;
      p._dateMs = dateMs;

      const key = purchaseKey(styleId, size);
      const arr = purchaseIndex.get(key) || [];
      arr.push({ ...p, id: pid });
      purchaseIndex.set(key, arr);
    }

    // FIFO sort
    for (const [key, arr] of purchaseIndex.entries()) {
      arr.sort((a, b) => {
        const aMs = typeof a._dateMs === 'number' ? a._dateMs : Number.POSITIVE_INFINITY;
        const bMs = typeof b._dateMs === 'number' ? b._dateMs : Number.POSITIVE_INFINITY;
        if (aMs !== bMs) return aMs - bMs;
        const aCreatedMs = parseDateMs(a.createdAt) ?? Number.POSITIVE_INFINITY;
        const bCreatedMs = parseDateMs(b.createdAt) ?? Number.POSITIVE_INFINITY;
        return aCreatedMs - bCreatedMs;
      });
      purchaseIndex.set(key, arr);
    }

    const results: any[] = [];
    let alreadyLinked = 0;
    let wouldLink = 0;
    let skippedNoMatch = 0;

    for (const sale of userSales) {
      const orderNumber = String(sale?.orderNumber || sale?.stockxOrderId || sale?.id || '');
      const saleListingId = typeof sale?.listingId === 'string' ? sale.listingId : (sale?.stockxData?.listingId || '');
      const saleStyleId = String(sale?.styleId || sale?.stockxData?.productId || '');
      const saleSize = normalizeSize(sale?.size || '');
      const saleCreatedAtMs = parseDateMs(sale?.date) ?? parseDateMs(sale?.createdAt) ?? parseDateMs(sale?.updatedAt) ?? null;

      const existingLinkedPurchaseId = sale?.linkedPurchaseId || sale?.matchedPurchaseId || null;
      if (existingLinkedPurchaseId) {
        alreadyLinked++;
        if (!unlinkedOnly) {
          results.push({
            orderNumber,
            saleListingId: saleListingId || null,
            saleStyleId: saleStyleId || null,
            saleSize: saleSize || null,
            status: 'already_linked',
            linkedPurchaseId: existingLinkedPurchaseId,
            linkedPurchaseOrderNumber: sale?.linkedPurchaseOrderNumber || null,
          });
        }
        continue;
      }

      let linkedPurchase: PurchaseCandidate | null = null;
      let method: 'listingId' | 'fifo' | null = null;

      // 1) listingId exact match
      if (saleListingId) {
        const candidate = purchaseByStockxListingId.get(String(saleListingId)) || null;
        const pid = candidate ? String(candidate.id || '') : '';
        if (candidate && pid && !usedPurchaseIds.has(pid)) {
          linkedPurchase = candidate;
          usedPurchaseIds.add(pid);
          method = 'listingId';
        }
      }

      // 2) FIFO by styleId + size
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
          usedPurchaseIds.add(pid);
          method = 'fifo';
          break;
        }
      }

      if (!linkedPurchase) {
        skippedNoMatch++;
        if (!unlinkedOnly) {
          results.push({
            orderNumber,
            saleListingId: saleListingId || null,
            saleStyleId: saleStyleId || null,
            saleSize: saleSize || null,
            status: 'no_match',
          });
        }
        continue;
      }

      wouldLink++;
      results.push({
        orderNumber,
        saleListingId: saleListingId || null,
        saleStyleId: saleStyleId || null,
        saleSize: saleSize || null,
        status: 'would_link',
        method,
        purchaseId: String(linkedPurchase.id || ''),
        purchaseOrderNumber: linkedPurchase.orderNumber || null,
        purchaseCost: getPurchaseCost(linkedPurchase),
        purchaseDate: linkedPurchase.purchaseDate || linkedPurchase.purchase_date || linkedPurchase.emailDate || linkedPurchase.email_date || linkedPurchase.createdAt || null,
        purchaseStockxListingId: (linkedPurchase as any)?.stockxListingId || null,
      });
    }

    return NextResponse.json({
      success: true,
      userId,
      mode: 'dry_run',
      limitSales,
      unlinkedOnly,
      summary: {
        salesScanned: userSales.length,
        alreadyLinked,
        wouldLink,
        skippedNoMatch,
      },
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


