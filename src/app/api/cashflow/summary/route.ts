import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function resolveUserId(request: NextRequest): string | null {
  const qpUserId = request.nextUrl.searchParams.get('userId')?.trim() || '';
  const headerUserId = request.headers.get('x-user-id')?.trim() || '';
  const cookieStore = cookies();
  const cookieUserId =
    (cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value ||
      '')
      .trim();
  const userId = (qpUserId || headerUserId || cookieUserId).trim();
  return userId || null;
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
  if (typeof val !== 'string' || !val.trim()) return null;
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? ms : null;
}

function coalesceNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = typeof v === 'number' ? v : parseMoney(v);
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return null;
}

function isInRange(ms: number | null, fromMs: number, toMs: number): boolean {
  if (ms === null) return false;
  return ms >= fromMs && ms <= toMs;
}

function getSaleTimestampMs(sale: any): number | null {
  // Prefer actual payout time for "money in" cashflow, else fall back to known timestamps.
  return (
    parseDateMs(sale?.payoutDate) ??
    parseDateMs(sale?.payout_date) ??
    parseDateMs(sale?.date) ??
    parseDateMs(sale?.updatedAt) ??
    parseDateMs(sale?.createdAt) ??
    parseDateMs(sale?.saleData?.payoutDate) ??
    parseDateMs(sale?.saleData?.date) ??
    null
  );
}

function getSaleNetPayout(sale: any): number | null {
  // Try common shapes from imports + legacy stockxSales.saleData
  const direct =
    coalesceNumber(
      sale?.saleNetPayout,
      sale?.netPayout,
      sale?.payout,
      sale?.totalPayout,
      sale?.stockxData?.totalPayout,
      sale?.pricing?.totalPayout,
      sale?.saleData?.pricing?.totalPayout,
      sale?.saleData?.payout?.totalPayout,
      sale?.saleData?.pricing?.payout,
      sale?.saleData?.payout
    ) ?? null;
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) return direct;

  // Fallback: salePrice - fees
  const salePrice = coalesceNumber(sale?.salePrice, sale?.amount, sale?.saleData?.pricing?.salePrice, sale?.saleData?.amount);
  const fees = coalesceNumber(sale?.fees, sale?.sellerFees, sale?.saleData?.pricing?.sellerFees, sale?.saleData?.fees);
  if (typeof salePrice === 'number' && Number.isFinite(salePrice) && salePrice > 0) {
    const feeAmt = typeof fees === 'number' && Number.isFinite(fees) ? Math.max(0, fees) : 0;
    const payout = salePrice - feeAmt;
    return Number.isFinite(payout) && payout > 0 ? payout : null;
  }

  return null;
}

function getPurchaseTimestampMs(p: any): number | null {
  // Purchase time should reflect cash leaving your account.
  return (
    parseDateMs(p?.purchase_date) ??
    parseDateMs(p?.email_date) ??
    parseDateMs(p?.purchaseDate) ??
    parseDateMs(p?.emailDate) ??
    parseDateMs(p?.createdAt) ??
    parseDateMs(p?.syncedAt) ??
    null
  );
}

function getPurchaseNetPaid(p: any): number | null {
  // Prefer netPaid (gross - credits) when present.
  const netPaid = coalesceNumber(p?.netPaid);
  if (typeof netPaid === 'number' && Number.isFinite(netPaid) && netPaid >= 0) return netPaid;

  // totalPayment minus credits/discounts
  const totalPayment = coalesceNumber(p?.totalPayment, p?.totalAmount);
  const credits = coalesceNumber(p?.credits, p?.discounts) ?? 0;
  if (typeof totalPayment === 'number' && Number.isFinite(totalPayment) && totalPayment > 0) {
    return Math.max(0, totalPayment - Math.max(0, credits));
  }

  // Fallback to purchase price
  const purchasePrice = coalesceNumber(p?.purchasePrice, p?.price);
  if (typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0) return purchasePrice;

  return null;
}

function looksCancelled(status: unknown): boolean {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return false;
  return s.includes('cancel');
}

function shouldIncludeSaleForCashIn(sale: any, includePending: boolean): boolean {
  if (includePending) return true;
  const status = String(sale?.status || sale?.saleData?.status || '').toLowerCase();
  if (status.includes('cancel') || status.includes('return')) return false;
  // If payoutDate exists, it's cash-in.
  if (typeof sale?.payoutDate === 'string' && sale.payoutDate) return true;
  // Otherwise include completed/payout-completed variants.
  if (status.includes('payout') || status.includes('completed')) return true;
  return false;
}

type CashflowTx = {
  id: string;
  type: 'sale' | 'purchase';
  dateIso: string;
  orderNumber: string | null;
  productName: string | null;
  platform: string | null;
  moneyIn: number | null;
  moneyOut: number | null;
  net: number;
  rawSource: 'user_sales' | 'purchases' | 'stockxSales';
};

export async function GET(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    const fromIso = request.nextUrl.searchParams.get('fromIso')?.trim() || '';
    const toIso = request.nextUrl.searchParams.get('toIso')?.trim() || '';
    const fromMs = parseDateMs(fromIso);
    const toMs = parseDateMs(toIso);
    if (fromMs === null || toMs === null) {
      return NextResponse.json(
        { success: false, error: 'Missing/invalid fromIso or toIso' },
        { status: 400 }
      );
    }
    const includePendingSales = request.nextUrl.searchParams.get('includePendingSales') === 'true';
    const maxDocs = Math.min(Math.max(Number(request.nextUrl.searchParams.get('maxDocs') || 20000), 1000), 100000);
    const maxTx = Math.min(Math.max(Number(request.nextUrl.searchParams.get('maxTx') || 5000), 100), 20000);

    const db = getAdminDb();

    // ---- Sales (money in) ----
    const sales: any[] = [];
    let salesScanned = 0;
    let cursorIdSales: string | null = null;
    const pageSize = 1000;

    while (salesScanned < maxDocs) {
      let q: FirebaseFirestore.Query = db
        .collection('user_sales')
        .where('userId', '==', userId)
        .orderBy(FieldPath.documentId())
        .limit(pageSize);
      if (cursorIdSales) {
        const cursorDoc = await db.collection('user_sales').doc(cursorIdSales).get();
        if (cursorDoc.exists) q = q.startAfter(cursorDoc);
      }

      const snap = await q.get();
      if (snap.empty) break;
      salesScanned += snap.size;
      for (const doc of snap.docs) sales.push({ id: doc.id, ...(doc.data() as any), _source: 'user_sales' });
      cursorIdSales = snap.docs[snap.docs.length - 1].id;
      if (snap.size < pageSize) break;
    }

    // Legacy fallback sales (stockxSales) – include only when user_sales is empty (same as /api/sales/list)
    const legacySales: any[] = [];
    let legacyScanned = 0;
    if (sales.length === 0) {
      try {
        let cursorLegacy: string | null = null;
        while (legacyScanned < maxDocs) {
          let q: FirebaseFirestore.Query = db
            .collection(COLLECTIONS.STOCKX_SALES)
            .where('userId', '==', userId)
            .orderBy(FieldPath.documentId())
            .limit(pageSize);
          if (cursorLegacy) {
            const cursorDoc = await db.collection(COLLECTIONS.STOCKX_SALES).doc(cursorLegacy).get();
            if (cursorDoc.exists) q = q.startAfter(cursorDoc);
          }
          const snap = await q.get();
          if (snap.empty) break;
          legacyScanned += snap.size;
          for (const doc of snap.docs) legacySales.push({ id: doc.id, ...(doc.data() as any), _source: 'stockxSales' });
          cursorLegacy = snap.docs[snap.docs.length - 1].id;
          if (snap.size < pageSize) break;
        }
      } catch (e: any) {
        console.warn('⚠️ cashflow: legacy stockxSales scan failed:', e?.message || String(e));
      }
    }

    const salesAll = sales.length > 0 ? sales : legacySales;

    // ---- Purchases (money out) ----
    const purchases: any[] = [];
    let purchasesScanned = 0;
    let cursorIdPurch: string | null = null;

    while (purchasesScanned < maxDocs) {
      let q: FirebaseFirestore.Query = db
        .collection('purchases')
        .where('userId', '==', userId)
        .orderBy(FieldPath.documentId())
        .limit(pageSize);

      if (cursorIdPurch) {
        const cursorDoc = await db.collection('purchases').doc(cursorIdPurch).get();
        if (cursorDoc.exists) q = q.startAfter(cursorDoc);
      }

      const snap = await q.get();
      if (snap.empty) break;
      purchasesScanned += snap.size;
      for (const doc of snap.docs) purchases.push({ id: doc.id, ...(doc.data() as any), _source: 'purchases' });
      cursorIdPurch = snap.docs[snap.docs.length - 1].id;
      if (snap.size < pageSize) break;
    }

    // ---- Build transactions ----
    const tx: CashflowTx[] = [];
    let moneyIn = 0;
    let moneyOut = 0;
    let includedSales = 0;
    let includedPurchases = 0;
    let skippedSalesOutside = 0;
    let skippedPurchasesOutside = 0;

    for (const s of salesAll) {
      const saleObj = s?.saleData ? s.saleData : s;
      if (!shouldIncludeSaleForCashIn(saleObj, includePendingSales)) continue;
      const ms = getSaleTimestampMs(saleObj);
      if (!isInRange(ms, fromMs, toMs)) {
        skippedSalesOutside++;
        continue;
      }
      const payout = getSaleNetPayout(saleObj);
      if (payout === null) continue;
      includedSales++;
      moneyIn += payout;

      const orderNumber =
        (typeof saleObj?.orderNumber === 'string' && saleObj.orderNumber) ||
        (typeof saleObj?.orderId === 'string' && saleObj.orderId) ||
        (typeof saleObj?.id === 'string' && saleObj.id) ||
        null;

      const productName =
        (typeof saleObj?.product === 'string' && saleObj.product) ||
        saleObj?.product?.productName ||
        saleObj?.product?.name ||
        saleObj?.productName ||
        null;

      tx.push({
        id: String(s.id || orderNumber || Math.random()),
        type: 'sale',
        dateIso: new Date(ms ?? fromMs).toISOString(),
        orderNumber,
        productName,
        platform: (typeof saleObj?.platform === 'string' ? saleObj.platform : null) || 'stockx',
        moneyIn: payout,
        moneyOut: null,
        net: payout,
        rawSource: s?._source === 'stockxSales' ? 'stockxSales' : 'user_sales'
      });
    }

    for (const p of purchases) {
      if (looksCancelled(p?.status)) continue;
      const ms = getPurchaseTimestampMs(p);
      if (!isInRange(ms, fromMs, toMs)) {
        skippedPurchasesOutside++;
        continue;
      }
      const paid = getPurchaseNetPaid(p);
      if (paid === null) continue;
      includedPurchases++;
      moneyOut += paid;

      const orderNumber =
        (typeof p?.orderNumber === 'string' && p.orderNumber) ||
        (typeof p?.order_number === 'string' && p.order_number) ||
        null;

      const productName =
        (typeof p?.productName === 'string' && p.productName) ||
        p?.product?.name ||
        p?.product?.productName ||
        p?.product?.title ||
        null;

      tx.push({
        id: String(p.id || orderNumber || Math.random()),
        type: 'purchase',
        dateIso: new Date(ms ?? fromMs).toISOString(),
        orderNumber,
        productName,
        platform: (typeof p?.market === 'string' ? p.market : null) || (typeof p?.platform === 'string' ? p.platform : null) || 'stockx',
        moneyIn: null,
        moneyOut: paid,
        net: -paid,
        rawSource: 'purchases'
      });
    }

    tx.sort((a, b) => Date.parse(b.dateIso) - Date.parse(a.dateIso));
    const txLimited = tx.slice(0, maxTx);

    return NextResponse.json({
      success: true,
      userId,
      fromIso,
      toIso,
      summary: {
        moneyIn,
        moneyOut,
        net: moneyIn - moneyOut,
        salesCount: includedSales,
        purchasesCount: includedPurchases,
      },
      scanned: {
        userSalesDocs: salesScanned,
        legacySalesDocs: legacyScanned,
        purchasesDocs: purchasesScanned,
      },
      filteredOut: {
        skippedSalesOutside,
        skippedPurchasesOutside,
      },
      transactions: txLimited,
      truncated: tx.length > txLimited.length,
      truncatedTotal: tx.length
    });
  } catch (error: any) {
    console.error('❌ API /api/cashflow/summary error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}


