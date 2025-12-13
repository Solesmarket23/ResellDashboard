'use client';

import { useMemo, useState } from 'react';

type OrderRow = {
  id?: string;
  status?: string;
  orderStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  product?: { name?: string; brand?: string; sku?: string; styleId?: string };
  variant?: { size?: string; inventoryType?: string };
  pricing?: {
    salePrice?: number;
    totalFees?: number;
    payout?: number;
    currency?: string;
    processingFee?: number;
    transactionFee?: number;
    shippingFee?: number;
  };
  metrics?: {
    salePrice?: number;
    totalFees?: number;
    netPayout?: number;
    profitMargin?: string | number;
    feeBreakdown?: {
      processingFee?: number;
      transactionFee?: number;
      shippingFee?: number;
      calculatedTotal?: number;
    };
  };
  rawData?: any;
};

function normalizeMoney(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  // Heuristic: many StockX money fields arrive in cents (e.g. 25000). Anything > 5000 is very likely cents.
  if (n > 5000) return Math.round((n / 100) * 100) / 100;
  return Math.round(n * 100) / 100;
}

function fmtMoney(n: number | null | undefined, currency = 'USD') {
  if (n === null || n === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function TestStockXOrders() {
  const [loading, setLoading] = useState(false);
  const [allLoading, setAllLoading] = useState(false);
  const [allProgress, setAllProgress] = useState<{ page: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [orderStatus, setOrderStatus] = useState('');

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState<{ orderNumber: string; data: any } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const totals = useMemo(() => {
    const rows = orders || [];
    let sale = 0;
    let fees = 0;
    let payout = 0;
    let count = 0;

    for (const o of rows) {
      const currency = o.pricing?.currency || 'USD';
      void currency; // currency not used in totals (assumes USD)
      const s = normalizeMoney(o.metrics?.salePrice ?? o.pricing?.salePrice ?? o.rawData?.amount ?? o.rawData?.price);
      const f = normalizeMoney(o.metrics?.totalFees ?? o.pricing?.totalFees ?? o.rawData?.totalFees);
      const p = normalizeMoney(o.metrics?.netPayout ?? o.pricing?.payout ?? o.rawData?.payout);
      if (s !== null || f !== null || p !== null) count += 1;
      if (s !== null) sale += s;
      if (f !== null) fees += f;
      if (p !== null) payout += p;
    }

    const feeRate = sale > 0 ? (fees / sale) * 100 : 0;
    const payoutRate = sale > 0 ? (payout / sale) * 100 : 0;
    return {
      count: rows.length,
      sale,
      fees,
      payout,
      feeRate,
      payoutRate,
      currency: 'USD',
    };
  }, [orders]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    setAuthRequired(false);
    setSelected(null);
    try {
      const qp = new URLSearchParams();
      qp.set('pageNumber', String(pageNumber));
      qp.set('pageSize', String(pageSize));
      if (fromDate) qp.set('fromDate', fromDate);
      if (toDate) qp.set('toDate', toDate);
      if (orderStatus) qp.set('orderStatus', orderStatus);

      const res = await fetch(`/api/stockx/orders/history?${qp.toString()}`);
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401 || json?.authRequired) {
          setAuthRequired(true);
          setError(json?.message || 'StockX authentication required.');
          setOrders([]);
          return;
        }
        throw new Error(json?.error || json?.details || `Request failed (${res.status})`);
      }

      setOrders(Array.isArray(json?.data) ? json.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const fetchAllHistory = async () => {
    // StockX caps pageSize at 100; we paginate until hasNextPage is false.
    const PAGE_SIZE = 100;
    const MAX_PAGES = 100; // safety cap (10,000 orders max)

    setAllLoading(true);
    setAllProgress({ page: 0, total: 0 });
    setError(null);
    setAuthRequired(false);
    setSelected(null);

    try {
      const all: OrderRow[] = [];
      let p = 1;
      let hasNext = true;

      while (hasNext && p <= MAX_PAGES) {
        const qp = new URLSearchParams();
        qp.set('pageNumber', String(p));
        qp.set('pageSize', String(PAGE_SIZE));
        if (fromDate) qp.set('fromDate', fromDate);
        if (toDate) qp.set('toDate', toDate);
        if (orderStatus) qp.set('orderStatus', orderStatus);

        const res = await fetch(`/api/stockx/orders/history?${qp.toString()}`);
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (res.status === 401 || json?.authRequired) {
            setAuthRequired(true);
            throw new Error(json?.message || 'StockX authentication required.');
          }
          throw new Error(json?.error || json?.details || `Request failed (${res.status})`);
        }

        const pageRows: OrderRow[] = Array.isArray(json?.data) ? json.data : [];
        all.push(...pageRows);
        setAllProgress({ page: p, total: all.length });

        hasNext = Boolean(json?.hasNextPage) && pageRows.length > 0;
        p += 1;

        // light delay to reduce rate-limit risk
        if (hasNext) await sleep(250);
      }

      setOrders(all);
      setPageNumber(1);
      setPageSize(PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOrders([]);
    } finally {
      setAllLoading(false);
      setAllProgress(null);
    }
  };

  const fetchDetails = async (orderNumber: string) => {
    setDetailsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stockx/orders/${encodeURIComponent(orderNumber)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || json?.authRequired) {
          setAuthRequired(true);
          throw new Error(json?.message || 'StockX authentication required.');
        }
        throw new Error(json?.error || json?.details || `Request failed (${res.status})`);
      }
      setSelected({ orderNumber, data: json?.data });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSelected(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const login = () => {
    window.location.href = `/api/stockx/auth?returnTo=${encodeURIComponent(window.location.href)}`;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">StockX Orders (Test)</h1>
            <p className="text-sm text-gray-400">
              Explore <code className="text-gray-300">/selling/orders/history</code> +{' '}
              <code className="text-gray-300">/selling/orders/{'{orderNumber}'}</code> and inspect payout breakdowns.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {authRequired && (
              <button
                onClick={login}
                className="px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white"
              >
                Authenticate with StockX
              </button>
            )}
            <button
              onClick={fetchHistory}
              disabled={loading || allLoading}
              className="px-4 py-2 rounded-lg font-semibold bg-white/10 hover:bg-white/20 border border-white/15 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Fetch Order History'}
            </button>
            <button
              onClick={fetchAllHistory}
              disabled={allLoading || loading}
              className="px-4 py-2 rounded-lg font-semibold bg-white/10 hover:bg-white/20 border border-white/15 disabled:opacity-50"
              title="Fetch all pages (pageSize=100) for the current filters"
            >
              {allLoading
                ? `Fetching all…${allProgress ? ` (page ${allProgress.page}, ${allProgress.total} orders)` : ''}`
                : 'Fetch ALL'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Filters</h2>
              <div className="text-xs text-gray-400">page {pageNumber}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">From (ISO or date)</label>
                <input
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  placeholder="2025-12-01"
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">To</label>
                <input
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  placeholder="2025-12-13"
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Order Status</label>
                <input
                  value={orderStatus}
                  onChange={(e) => setOrderStatus(e.target.value)}
                  placeholder='e.g. "COMPLETED"'
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Page Size</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10"
              >
                Prev
              </button>
              <button
                onClick={() => setPageNumber((p) => p + 1)}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10"
              >
                Next
              </button>
              <button
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setOrderStatus('');
                  setPageNumber(1);
                }}
                className="ml-auto px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-gray-200"
              >
                Clear
              </button>
            </div>

            <div className="rounded-lg border border-white/10 bg-gray-900/40 p-3">
              <div className="text-xs text-gray-400">Quick analytics (current page)</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-300">Orders</div>
                <div className="text-right font-semibold">{totals.count}</div>
                <div className="text-gray-300">Sales</div>
                <div className="text-right font-semibold">{fmtMoney(totals.sale, totals.currency)}</div>
                <div className="text-gray-300">Fees</div>
                <div className="text-right font-semibold">{fmtMoney(totals.fees, totals.currency)}</div>
                <div className="text-gray-300">Net payout</div>
                <div className="text-right font-semibold">{fmtMoney(totals.payout, totals.currency)}</div>
                <div className="text-gray-300">Fee rate</div>
                <div className="text-right font-semibold">{totals.feeRate.toFixed(2)}%</div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-semibold">Order History</h2>
              <div className="text-xs text-gray-400">{orders.length} rows</div>
            </div>

            <div className="overflow-auto max-h-[55vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-950/80 backdrop-blur border-b border-white/10">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">Order #</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">Product</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">Size</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">Sale</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">Fees</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">Payout</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {orders.map((o: any) => {
                    const raw = o?.rawData || o;
                    const orderNumber =
                      raw?.orderNumber || raw?.orderId || raw?.id || o?.id || raw?.askId || '—';
                    const currency = o?.pricing?.currency || raw?.currencyCode || 'USD';
                    const sale = normalizeMoney(o?.metrics?.salePrice ?? o?.pricing?.salePrice ?? raw?.amount ?? raw?.price);
                    const fees = normalizeMoney(o?.metrics?.totalFees ?? o?.pricing?.totalFees ?? raw?.totalFees);
                    const payout = normalizeMoney(o?.metrics?.netPayout ?? o?.pricing?.payout ?? raw?.payout);
                    const productName = o?.product?.name || raw?.product?.name || raw?.variant?.product?.name || '—';
                    const size = o?.variant?.size || raw?.variant?.size || raw?.size || '—';
                    const created = o?.createdAt || raw?.createdAt;

                    return (
                      <tr
                        key={String(orderNumber)}
                        className="hover:bg-white/5 cursor-pointer"
                        onClick={() => fetchDetails(String(orderNumber))}
                        title="Click to load payout breakdown"
                      >
                        <td className="px-4 py-3 font-semibold text-cyan-200">{String(orderNumber)}</td>
                        <td className="px-4 py-3 text-gray-200">{productName}</td>
                        <td className="px-4 py-3 text-gray-200">{size}</td>
                        <td className="px-4 py-3 text-gray-200">{fmtMoney(sale, currency)}</td>
                        <td className="px-4 py-3 text-gray-200">{fmtMoney(fees, currency)}</td>
                        <td className="px-4 py-3 text-gray-200">{fmtMoney(payout, currency)}</td>
                        <td className="px-4 py-3 text-gray-400">{fmtDate(created)}</td>
                      </tr>
                    );
                  })}

                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                        {loading ? 'Loading…' : 'No orders loaded yet. Click “Fetch Order History”.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-semibold">Order Details & Payout Breakdown</h2>
            <div className="text-xs text-gray-400">
              {detailsLoading ? 'Loading…' : selected ? `Loaded: ${selected.orderNumber}` : 'Select an order'}
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 rounded-lg border border-white/10 bg-gray-900/40 p-4">
              <div className="text-sm font-semibold text-gray-200 mb-3">Summary</div>
              {!selected ? (
                <div className="text-sm text-gray-400">Click any order row above to load its payout details.</div>
              ) : (
                (() => {
                  const d: any = selected.data || {};
                  const currency = d?.currencyCode || d?.currency || 'USD';
                  const amount = normalizeMoney(d?.amount ?? d?.pricing?.amount ?? d?.price);
                  const payout = normalizeMoney(d?.payout?.payoutAmount ?? d?.payoutAmount ?? d?.payout);
                  const fees = normalizeMoney(d?.payout?.feesTotal ?? d?.feesTotal ?? d?.fees);
                  const status = d?.status || d?.orderStatus || '—';
                  const createdAt = d?.createdAt;
                  const productName = d?.product?.name || d?.variant?.product?.name || '—';
                  const size = d?.variant?.size || '—';

                  return (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Status</span>
                        <span className="font-semibold text-gray-200">{String(status)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Product</span>
                        <span className="font-semibold text-gray-200 text-right">{productName}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Size</span>
                        <span className="font-semibold text-gray-200">{String(size)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Sale</span>
                        <span className="font-semibold text-gray-200">{fmtMoney(amount, currency)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Fees (est.)</span>
                        <span className="font-semibold text-gray-200">{fmtMoney(fees, currency)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Net payout</span>
                        <span className="font-semibold text-gray-200">{fmtMoney(payout, currency)}</span>
                      </div>
                      <div className="pt-2 text-xs text-gray-400">Created: {fmtDate(createdAt)}</div>
                    </div>
                  );
                })()
              )}
            </div>

            <div className="lg:col-span-2 rounded-lg border border-white/10 bg-gray-900/40 p-4">
              <div className="text-sm font-semibold text-gray-200 mb-3">Raw JSON</div>
              <pre className="text-xs text-gray-200 overflow-auto max-h-[45vh] whitespace-pre-wrap break-words">
                {selected ? JSON.stringify(selected.data, null, 2) : '—'}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


