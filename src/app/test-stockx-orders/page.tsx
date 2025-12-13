'use client';

import { useMemo, useRef, useState } from 'react';

type OrderRow = {
  id?: string;
  status?: string;
  orderStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  product?: { name?: string; brand?: string; sku?: string; styleId?: string; category?: string };
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
  const [includeActive, setIncludeActive] = useState(true);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState<{ orderNumber: string; data: any } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  type LogLevel = 'info' | 'warn' | 'error';
  type LogEntry = { ts: string; level: LogLevel; message: string; data?: any };
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const appendLog = (level: LogLevel, message: string, data?: any) => {
    const entry: LogEntry = { ts: new Date().toISOString(), level, message, data };
    setLogs((prev) => [...prev, entry]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
  };
  const clearLogs = () => setLogs([]);
  const copyLogs = async () => {
    const text = logs
      .map((l) => {
        const base = `[${l.ts}] ${l.level.toUpperCase()}: ${l.message}`;
        if (l.data === undefined) return base;
        try {
          return `${base}\n${JSON.stringify(l.data, null, 2)}`;
        } catch {
          return `${base}\n${String(l.data)}`;
        }
      })
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      appendLog('info', 'Copied logs to clipboard');
    } catch {
      appendLog('warn', 'Could not copy logs (clipboard blocked)');
    }
  };

  const totals = useMemo(() => {
    const rows = orders || [];
    let sale = 0;
    let fees = 0;
    let payout = 0;
    let count = 0;
    const statusCounts: Record<string, number> = {};
    const productRevenue: Record<string, number> = {};
    const productCount: Record<string, number> = {};
    const brandRevenue: Record<string, number> = {};
    const sizeCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const idCounts: Record<string, number> = {};

    for (const o of rows) {
      const currency = o.pricing?.currency || 'USD';
      void currency; // currency not used in totals (assumes USD)
      const s = normalizeMoney(o.metrics?.salePrice ?? o.pricing?.salePrice ?? o.rawData?.amount ?? o.rawData?.price);
      const f = normalizeMoney(o.metrics?.totalFees ?? o.pricing?.totalFees ?? o.rawData?.totalFees);
      const p = normalizeMoney(o.metrics?.netPayout ?? o.pricing?.payout ?? o.rawData?.payout);

      const statusRaw = (o.rawData?.status || o.status || o.orderStatus || 'UNKNOWN') as string;
      const status = String(statusRaw || 'UNKNOWN').toUpperCase();
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      const raw = o.rawData || {};
      const orderKey = String(
        raw.orderNumber || raw.orderId || raw.id || o.id || raw.askId || 'UNKNOWN_ORDER'
      );
      idCounts[orderKey] = (idCounts[orderKey] || 0) + 1;

      const productName = String(
        o.product?.name || o.rawData?.product?.name || o.rawData?.variant?.product?.name || 'Unknown'
      );
      const brandName = String(
        o.product?.brand || o.rawData?.product?.brand || o.rawData?.variant?.product?.brand || 'Unknown'
      );
      const sizeName = String(
        o.variant?.size || o.rawData?.variant?.size || o.rawData?.size || 'Unknown'
      );
      const categoryName = String(
        o.product?.category ||
          o.rawData?.product?.category ||
          o.rawData?.variant?.product?.category ||
          'Unknown'
      );

      if (s !== null || f !== null || p !== null) count += 1;
      if (s !== null) sale += s;
      if (f !== null) fees += f;
      if (p !== null) payout += p;

      productCount[productName] = (productCount[productName] || 0) + 1;
      sizeCounts[sizeName] = (sizeCounts[sizeName] || 0) + 1;
      categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;

      if (s !== null) {
        productRevenue[productName] = (productRevenue[productName] || 0) + s;
        brandRevenue[brandName] = (brandRevenue[brandName] || 0) + s;
      }
    }

    const feeRate = sale > 0 ? (fees / sale) * 100 : 0;
    const payoutRate = sale > 0 ? (payout / sale) * 100 : 0;
    const avgSale = rows.length > 0 ? sale / rows.length : 0;
    const avgPayout = rows.length > 0 ? payout / rows.length : 0;

    const topProducts = Object.entries(productRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, revenue]) => ({ name, revenue }));
    const topProductsByCount = Object.entries(productCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, c]) => ({ name, count: c }));
    const topBrands = Object.entries(brandRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, revenue]) => ({ name, revenue }));
    const topSize = Object.entries(sizeCounts).sort((a, b) => b[1] - a[1])[0];
    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

    const completedCount =
      (statusCounts['COMPLETED'] || 0) +
      (statusCounts['PAYOUTCOMPLETED'] || 0) +
      (statusCounts['PAYOUT_COMPLETED'] || 0);
    const pendingCount = Math.max(0, rows.length - completedCount);

    const duplicates = Object.entries(idCounts)
      .filter(([, c]) => c > 1 && !['UNKNOWN_ORDER'].includes(String(c)))
      .sort((a, b) => b[1] - a[1])
      .map(([key, c]) => ({ key, count: c }));

    return {
      count: rows.length,
      sale,
      fees,
      payout,
      feeRate,
      payoutRate,
      avgSale,
      avgPayout,
      statusCounts,
      completedCount,
      pendingCount,
      topProducts,
      topProductsByCount,
      topBrands,
      topSize: topSize ? { size: topSize[0], count: topSize[1] } : null,
      topCategory: topCategory ? { category: topCategory[0], count: topCategory[1] } : null,
      duplicates,
      duplicateCount: duplicates.length,
      currency: 'USD',
    };
  }, [orders]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    setAuthRequired(false);
    setSelected(null);
    appendLog('info', 'Fetching order history (single page)...', {
      pageNumber,
      pageSize,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      orderStatus: orderStatus || undefined,
    });
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
          appendLog('warn', 'Auth required for orders history', { status: res.status, body: json });
          return;
        }
        throw new Error(json?.error || json?.details || `Request failed (${res.status})`);
      }

      const baseRows: OrderRow[] = Array.isArray(json?.data) ? json.data : [];
      setOrders(baseRows);
      appendLog('info', 'Fetched order history', {
        rows: Array.isArray(json?.data) ? json.data.length : 0,
        hasNextPage: json?.hasNextPage,
        pageNumber: json?.pageNumber,
        pageSize: json?.pageSize,
      });

      if (includeActive) {
        appendLog('info', 'Fetching active (pending) orders...');
        const aRes = await fetch('/api/stockx/orders/active');
        const aJson = await aRes.json().catch(() => ({}));

        if (!aRes.ok) {
          if (aRes.status === 401 || aJson?.authRequired) {
            setAuthRequired(true);
            appendLog('warn', 'Auth required for active orders', { status: aRes.status, body: aJson });
          } else {
            appendLog('warn', 'Active orders request failed (non-fatal)', { status: aRes.status, body: aJson });
          }
          return;
        }

        const activeRows: OrderRow[] = Array.isArray(aJson?.orders)
          ? aJson.orders.map((o: any) => ({
              id: o.id,
              status: o.status || 'ACTIVE',
              orderStatus: o.status || 'ACTIVE',
              createdAt: o.orderDate,
              product: { name: o.productName, brand: o.productBrand, sku: o.sku },
              variant: { size: o.size },
              pricing: { salePrice: o.salePrice, totalFees: o.fees, payout: o.payout, currency: 'USD' },
              rawData: o,
            }))
          : [];

        setOrders([...baseRows, ...activeRows]);
        appendLog('info', 'Fetched active orders', { rows: activeRows.length });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOrders([]);
      appendLog('error', 'Order history request failed', { error: e instanceof Error ? e.message : String(e) });
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
    setAllProgress({ page: 1, total: 0 });
    setError(null);
    setAuthRequired(false);
    setSelected(null);
    appendLog('info', 'Fetching ALL order history (paginating)...', {
      pageSize: PAGE_SIZE,
      maxPages: MAX_PAGES,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      orderStatus: orderStatus || undefined,
    });

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
            setError(json?.message || 'StockX authentication required.');
            appendLog('warn', 'Auth required while fetching all pages', { status: res.status, body: json });
            return;
          }
          throw new Error(json?.error || json?.details || `Request failed (${res.status})`);
        }

        const pageRows: OrderRow[] = Array.isArray(json?.data) ? json.data : [];
        all.push(...pageRows);
        // Show partial results as we go (so the table fills in while fetching)
        setOrders([...all]);
        setAllProgress({ page: p, total: all.length });

        hasNext = Boolean(json?.hasNextPage) && pageRows.length > 0;
        appendLog('info', `Page ${p} fetched`, {
          added: pageRows.length,
          total: all.length,
          hasNextPage: Boolean(json?.hasNextPage),
        });
        p += 1;

        // light delay to reduce rate-limit risk
        if (hasNext) await sleep(250);
      }

      setOrders(all);
      setPageNumber(1);
      setPageSize(PAGE_SIZE);
      appendLog('info', 'Fetch ALL complete', { total: all.length });

      if (includeActive) {
        appendLog('info', 'Fetching active (pending) orders...');
        const aRes = await fetch('/api/stockx/orders/active');
        const aJson = await aRes.json().catch(() => ({}));
        if (!aRes.ok) {
          appendLog('warn', 'Active orders request failed (non-fatal)', { status: aRes.status, body: aJson });
        } else {
          const activeRows: OrderRow[] = Array.isArray(aJson?.orders)
            ? aJson.orders.map((o: any) => ({
                id: o.id,
                status: o.status || 'ACTIVE',
                orderStatus: o.status || 'ACTIVE',
                createdAt: o.orderDate,
                product: { name: o.productName, brand: o.productBrand, sku: o.sku },
                variant: { size: o.size },
                pricing: { salePrice: o.salePrice, totalFees: o.fees, payout: o.payout, currency: 'USD' },
                rawData: o,
              }))
            : [];
          setOrders([...all, ...activeRows]);
          appendLog('info', 'Fetched active orders', { rows: activeRows.length });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOrders([]);
      appendLog('error', 'Fetch ALL failed', { error: e instanceof Error ? e.message : String(e) });
    } finally {
      setAllLoading(false);
      setAllProgress(null);
    }
  };

  const fetchDetails = async (orderNumber: string) => {
    setDetailsLoading(true);
    setError(null);
    try {
      appendLog('info', 'Fetching order details...', { orderNumber });
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
      appendLog('info', 'Loaded order details', { orderNumber });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSelected(null);
      appendLog('error', 'Order details request failed', { error: e instanceof Error ? e.message : String(e) });
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

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Logs</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={copyLogs}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-sm"
              >
                Copy
              </button>
              <button
                onClick={clearLogs}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-sm"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="mt-3 max-h-[220px] overflow-auto rounded-lg border border-white/10 bg-gray-900/50 p-3">
            {logs.length === 0 ? (
              <div className="text-sm text-gray-400">No logs yet. Click “Fetch Order History” or “Fetch ALL”.</div>
            ) : (
              <div className="space-y-3">
                {logs.map((l, idx) => (
                  <div key={`${l.ts}-${idx}`} className="text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-gray-400">{l.ts}</div>
                      <div
                        className={
                          l.level === 'error'
                            ? 'text-red-300'
                            : l.level === 'warn'
                              ? 'text-yellow-300'
                              : 'text-cyan-300'
                        }
                      >
                        {l.level.toUpperCase()}
                      </div>
                    </div>
                    <div className="text-gray-200 mt-1">{l.message}</div>
                    {l.data !== undefined && (
                      <pre className="mt-2 text-gray-300 whitespace-pre-wrap break-words">
                        {(() => {
                          try {
                            return JSON.stringify(l.data, null, 2);
                          } catch {
                            return String(l.data);
                          }
                        })()}
                      </pre>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
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
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  placeholder="2025-12-01"
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">To</label>
                <input
                  type="date"
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
                  const now = new Date();
                  const start = new Date(now.getFullYear(), now.getMonth(), 1);
                  setFromDate(start.toISOString().slice(0, 10));
                  setToDate(now.toISOString().slice(0, 10));
                }}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10"
                title="Set date range to this month"
              >
                This month
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

            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={includeActive}
                onChange={(e) => setIncludeActive(e.target.checked)}
              />
              Include active/pending orders
            </label>

            <div className="rounded-lg border border-white/10 bg-gray-900/40 p-3">
              <div className="text-xs text-gray-400">Quick analytics (current page)</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-300">Orders</div>
                <div className="text-right font-semibold">{totals.count}</div>
                <div className="text-gray-300">Completed</div>
                <div className="text-right font-semibold">{totals.completedCount}</div>
                <div className="text-gray-300">Pending</div>
                <div className="text-right font-semibold">{totals.pendingCount}</div>
                <div className="text-gray-300">Duplicates</div>
                <div className="text-right font-semibold">{totals.duplicateCount}</div>
                <div className="text-gray-300">Top size</div>
                <div className="text-right font-semibold">
                  {totals.topSize ? `${totals.topSize.size} (${totals.topSize.count})` : '—'}
                </div>
                <div className="text-gray-300">Top category</div>
                <div className="text-right font-semibold">
                  {totals.topCategory ? `${totals.topCategory.category} (${totals.topCategory.count})` : '—'}
                </div>
                <div className="text-gray-300">Sales</div>
                <div className="text-right font-semibold">{fmtMoney(totals.sale, totals.currency)}</div>
                <div className="text-gray-300">Fees</div>
                <div className="text-right font-semibold">{fmtMoney(totals.fees, totals.currency)}</div>
                <div className="text-gray-300">Net payout</div>
                <div className="text-right font-semibold">{fmtMoney(totals.payout, totals.currency)}</div>
                <div className="text-gray-300">Fee rate</div>
                <div className="text-right font-semibold">{totals.feeRate.toFixed(2)}%</div>
                <div className="text-gray-300">Avg sale</div>
                <div className="text-right font-semibold">{fmtMoney(totals.avgSale, totals.currency)}</div>
                <div className="text-gray-300">Avg payout</div>
                <div className="text-right font-semibold">{fmtMoney(totals.avgPayout, totals.currency)}</div>
              </div>

              {totals.duplicates?.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-gray-400 mb-1">Duplicate order IDs (first 10)</div>
                  <div className="space-y-1">
                    {totals.duplicates.slice(0, 10).map((d: any) => (
                      <div key={d.key} className="flex items-center justify-between text-xs text-gray-200">
                        <div className="truncate max-w-[220px]">{d.key}</div>
                        <div className="font-semibold">x{d.count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(totals.topProducts?.length > 0 || totals.topBrands?.length > 0) && (
                <div className="mt-3 grid grid-cols-1 gap-3">
                  {totals.topProductsByCount?.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Top items (by units sold)</div>
                      <div className="space-y-1">
                        {totals.topProductsByCount.map((p: any) => (
                          <div key={p.name} className="flex items-center justify-between text-xs text-gray-200">
                            <div className="truncate max-w-[220px]">{p.name}</div>
                            <div className="font-semibold">{p.count}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {totals.topProducts?.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Top products (by revenue)</div>
                      <div className="space-y-1">
                        {totals.topProducts.map((p: any) => (
                          <div key={p.name} className="flex items-center justify-between text-xs text-gray-200">
                            <div className="truncate max-w-[220px]">{p.name}</div>
                            <div className="font-semibold">{fmtMoney(p.revenue, totals.currency)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {totals.topBrands?.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Top brands (by revenue)</div>
                      <div className="space-y-1">
                        {totals.topBrands.map((b: any) => (
                          <div key={b.name} className="flex items-center justify-between text-xs text-gray-200">
                            <div className="truncate max-w-[220px]">{b.name}</div>
                            <div className="font-semibold">{fmtMoney(b.revenue, totals.currency)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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


