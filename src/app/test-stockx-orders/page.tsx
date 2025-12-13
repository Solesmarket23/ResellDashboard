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
  source?: 'history' | 'active';
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

function parseMoneyAny(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return normalizeMoney(v);
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return null;
    const dollars = Math.abs(n) > 5000 ? n / 100 : n;
    return Math.round(dollars * 100) / 100;
  }
  return null;
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

function fmtMonthDay(yyyyMmDd?: string) {
  if (!yyyyMmDd) return '—';
  const [y, m, d] = String(yyyyMmDd).split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return String(yyyyMmDd);
  const dt = new Date(y, m - 1, d);
  try {
    return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  } catch {
    return String(yyyyMmDd);
  }
}

function formatSizeLabel(size: string) {
  const s = String(size || '').trim();
  const upper = s.toUpperCase();
  if (upper === 'S') return 'Small';
  if (upper === 'M') return 'Medium';
  if (upper === 'L') return 'Large';
  return s || '—';
}

export default function TestStockXOrders() {
  const [loading, setLoading] = useState(false);
  const [allLoading, setAllLoading] = useState(false);
  const [allProgress, setAllProgress] = useState<{ page: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // IMPORTANT: StockX /selling/orders/history only accepts HistoricalOrderStatus:
  // [AUTHFAILED, DIDNOTSHIP, CANCELED, COMPLETED, RETURNED]
  const HISTORICAL_ORDER_STATUSES = useMemo(
    () => ['AUTHFAILED', 'DIDNOTSHIP', 'CANCELED', 'COMPLETED', 'RETURNED'],
    []
  );

  // Active statuses are returned by /selling/orders/active; we filter them client-side.
  const ACTIVE_ORDER_STATUSES = useMemo(
    () => [
      'CREATED',
      'CCAUTHORIZATIONFAILED',
      'SHIPPED',
      'RECEIVED',
      'AUTHENTICATING',
      'AUTHENTICATED',
      'PAYOUTPENDING',
      'PAYOUTCOMPLETED',
      'SYSTEMFULFILLED',
      'PAYOUTFAILED',
      'SUSPENDED',
      'PENDING',
      // Sometimes observed in practice
      'MATCHED',
    ],
    []
  );

  const [selectedHistoryStatuses, setSelectedHistoryStatuses] = useState<string[]>([]);
  const [selectedActiveStatuses, setSelectedActiveStatuses] = useState<string[]>([]);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [includeActive, setIncludeActive] = useState(true);
  const [showDidNotShip, setShowDidNotShip] = useState(false);
  const [useCache, setUseCache] = useState(true);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState<{ orderNumber: string; data: any } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedSalesDay, setSelectedSalesDay] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<
    'orderNumber' | 'status' | 'product' | 'size' | 'sale' | 'fees' | 'payout' | 'created' | null
  >(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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

  const copySelectedJson = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selected.data, null, 2));
      appendLog('info', 'Copied selected raw JSON to clipboard', { orderNumber: selected.orderNumber });
    } catch {
      appendLog('warn', 'Could not copy raw JSON (clipboard blocked)');
    }
  };

  const exportDisplayedOrdersCsv = () => {
    const escapeCsv = (value: unknown) => {
      const s = String(value ?? '');
      const needsQuotes = /[",\n\r]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const header = [
      'Order #',
      'Status',
      'Product',
      'Size',
      'Sale',
      'Fees',
      'Payout',
      'Currency',
      'Created',
      'Brand',
      'Category',
    ];

    const rows = displayedOrders.map((o: any) => {
      const raw = o?.rawData || o;
      const orderNumber = getRowOrderNumber(o);
      const status = getRowStatus(o);
      const currency = o?.pricing?.currency || raw?.currencyCode || 'USD';
      const sale = normalizeMoney(o?.metrics?.salePrice ?? o?.pricing?.salePrice ?? raw?.amount ?? raw?.price);
      const fees = normalizeMoney(o?.metrics?.totalFees ?? o?.pricing?.totalFees ?? raw?.totalFees);
      const payout = normalizeMoney(o?.metrics?.netPayout ?? o?.pricing?.payout ?? raw?.payout);
      const createdAt = raw?.createdAt || raw?.orderDate || o?.createdAt || '';
      const productName = getRowProductName(o);
      const size = formatSizeLabel(getRowSize(o));
      const brand =
        o?.product?.brand || raw?.product?.brand || raw?.variant?.product?.brand || raw?.brand || '';
      const category =
        o?.product?.category || raw?.product?.category || raw?.variant?.product?.category || raw?.category || '';

      return [
        orderNumber,
        status,
        productName,
        size,
        sale ?? '',
        fees ?? '',
        payout ?? '',
        currency,
        createdAt,
        brand,
        category,
      ].map(escapeCsv);
    });

    const csv = [header.map(escapeCsv).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const filename = `stockx-orders-${stamp}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    appendLog('info', 'Exported CSV', { rows: displayedOrders.length, filename });
  };

  const makeFetchKey = (kind: 'history' | 'all' | 'active', extra?: Record<string, unknown>) => {
    const keyObj = {
      kind,
      fromDate: fromDate || null,
      toDate: toDate || null,
      includeActive,
      historyStatuses: [...selectedHistoryStatuses].sort(),
      activeStatuses: [...selectedActiveStatuses].sort(),
      includeCatalog: true,
      includeDetails: true,
      ...(extra || {}),
    };
    return `stockx_orders_cache_v1:${JSON.stringify(keyObj)}`;
  };

  const readCache = (key: string, maxAgeMs: number) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const ts = Number(parsed.ts || 0);
      if (!ts || Date.now() - ts > maxAgeMs) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const writeCache = (key: string, value: any) => {
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), ...value }));
    } catch {
      // ignore quota errors
    }
  };

  const clearOrdersCache = () => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('stockx_orders_cache_v1:')) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      appendLog('info', 'Cleared orders cache', { removed: keys.length });
    } catch {
      appendLog('warn', 'Could not clear cache (storage blocked)');
    }
  };

  const isActiveRow = (row: any) => {
    if (row?.source === 'active') return true;
    const raw = row?.rawData || row;
    return Boolean(raw?.orderDate); // active route uses orderDate field
  };

  const getRowStatus = (row: any) => {
    const raw = row?.rawData || row;
    return String((raw?.status || row?.status || row?.orderStatus || raw?.orderStatus || '—')).toUpperCase();
  };

  const getRowOrderNumber = (row: any) => {
    const raw = row?.rawData || row;
    return String(raw?.orderNumber || raw?.orderId || raw?.id || row?.id || raw?.askId || '—');
  };

  const getRowCreatedTs = (row: any): number | null => {
    const raw = row?.rawData || row;
    const iso =
      row?.createdAt ||
      raw?.createdAt ||
      raw?.orderDate ||
      raw?.created ||
      row?.rawData?.createdAt ||
      null;
    if (!iso) return null;
    const d = new Date(iso);
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  };

  const getRowProductName = (row: any) => {
    const raw = row?.rawData || row;
    return String(
      row?.product?.name ||
        raw?.product?.productName ||
        raw?.product?.name ||
        raw?.variant?.product?.productName ||
        raw?.variant?.product?.name ||
        '—'
    );
  };

  const getRowSize = (row: any) => {
    const raw = row?.rawData || row;
    return String(row?.variant?.size || raw?.variant?.size || raw?.variant?.variantValue || raw?.size || '').trim();
  };

  const getRowSale = (row: any) => {
    const raw = row?.rawData || row;
    return normalizeMoney(row?.metrics?.salePrice ?? row?.pricing?.salePrice ?? raw?.amount ?? raw?.price);
  };
  const getRowFees = (row: any) => {
    const raw = row?.rawData || row;
    return normalizeMoney(row?.metrics?.totalFees ?? row?.pricing?.totalFees ?? raw?.totalFees);
  };
  const getRowPayout = (row: any) => {
    const raw = row?.rawData || row;
    return normalizeMoney(row?.metrics?.netPayout ?? row?.pricing?.payout ?? raw?.payout);
  };

  const sortIndicator = (col: NonNullable<typeof sortBy>) =>
    sortBy === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅';

  const toggleSort = (col: NonNullable<typeof sortBy>, defaultDir: 'asc' | 'desc' = 'asc') => {
    setSortBy(col);
    setSortDir((d) => (sortBy === col ? (d === 'asc' ? 'desc' : 'asc') : defaultDir));
  };

  const displayedOrders = useMemo(() => {
    // 1) Apply filters live to already-fetched rows
    let filtered = [...orders];

    // Include active toggle
    if (!includeActive) {
      filtered = filtered.filter((r) => !isActiveRow(r));
    }

    // Date range filter applies to ALL rows (history + active)
    if (fromDate || toDate) {
      filtered = filtered.filter((r) => {
        const raw = (r as any)?.rawData || (r as any);
        const iso =
          (r as any)?.createdAt ||
          raw?.createdAt ||
          raw?.orderDate ||
          raw?.created ||
          (r as any)?.rawData?.createdAt ||
          undefined;
        return inSelectedDateRange(iso);
      });
    }

    // Status filters
    const selectedStatusSet = new Set<string>([...selectedHistoryStatuses, ...selectedActiveStatuses]);
    if (selectedStatusSet.size > 0) {
      filtered = filtered.filter((r) => selectedStatusSet.has(getRowStatus(r)));
    }

    // Hide DIDNOTSHIP by default (these are not fulfilled sales)
    if (!showDidNotShip) {
      filtered = filtered.filter((r) => getRowStatus(r) !== 'DIDNOTSHIP');
    }

    // 2) Apply sorting
    if (!sortBy) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return filtered.sort((a: any, b: any) => {
      if (sortBy === 'orderNumber') {
        const ao = getRowOrderNumber(a);
        const bo = getRowOrderNumber(b);
        const cmp = ao.localeCompare(bo);
        if (cmp !== 0) return cmp * dir;
      }
      if (sortBy === 'status') {
        const as = getRowStatus(a);
        const bs = getRowStatus(b);
        const cmp = as.localeCompare(bs);
        if (cmp !== 0) return cmp * dir;
      }
      if (sortBy === 'product') {
        const ap = getRowProductName(a);
        const bp = getRowProductName(b);
        const cmp = ap.localeCompare(bp);
        if (cmp !== 0) return cmp * dir;
      }
      if (sortBy === 'size') {
        const asz = getRowSize(a);
        const bsz = getRowSize(b);
        const cmp = asz.localeCompare(bsz);
        if (cmp !== 0) return cmp * dir;
      }
      if (sortBy === 'sale') {
        const av = getRowSale(a);
        const bv = getRowSale(b);
        if (av === null && bv === null) {
          // fall through
        } else if (av === null) {
          return 1;
        } else if (bv === null) {
          return -1;
        } else {
          const cmp = av - bv;
          if (cmp !== 0) return cmp * dir;
        }
      }
      if (sortBy === 'fees') {
        const av = getRowFees(a);
        const bv = getRowFees(b);
        if (av === null && bv === null) {
          // fall through
        } else if (av === null) {
          return 1;
        } else if (bv === null) {
          return -1;
        } else {
          const cmp = av - bv;
          if (cmp !== 0) return cmp * dir;
        }
      }
      if (sortBy === 'payout') {
        const av = getRowPayout(a);
        const bv = getRowPayout(b);
        if (av === null && bv === null) {
          // fall through
        } else if (av === null) {
          return 1;
        } else if (bv === null) {
          return -1;
        } else {
          const cmp = av - bv;
          if (cmp !== 0) return cmp * dir;
        }
      }
      if (sortBy === 'created') {
        const at = getRowCreatedTs(a);
        const bt = getRowCreatedTs(b);
        if (at === null && bt === null) {
          // fall through
        } else if (at === null) {
          return 1;
        } else if (bt === null) {
          return -1;
        } else {
          const cmp = at - bt;
          if (cmp !== 0) return cmp * dir;
        }
      }
      return getRowOrderNumber(a).localeCompare(getRowOrderNumber(b)) * dir;
    });
  }, [
    orders,
    includeActive,
    selectedHistoryStatuses,
    selectedActiveStatuses,
    showDidNotShip,
    sortBy,
    sortDir,
  ]);

  const totals = useMemo(() => {
    const rows = displayedOrders || [];
    const rowsForMetrics = rows.filter((r: any) => getRowStatus(r) !== 'DIDNOTSHIP');
    let sale = 0;
    let fees = 0;
    let payout = 0;
    let count = 0;
    let saleCount = 0;
    let payoutCount = 0;
    let feesCount = 0;
    const statusCounts: Record<string, number> = {};
    const productRevenue: Record<string, number> = {};
    const productCount: Record<string, number> = {};
    const productSizeCounts: Record<string, Record<string, number>> = {};
    const brandRevenue: Record<string, number> = {};
    const sizeCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const idCounts: Record<string, number> = {};

    for (const o of rowsForMetrics) {
      const currency = o.pricing?.currency || 'USD';
      void currency; // currency not used in totals (assumes USD)
      let s = parseMoneyAny(
        o.metrics?.salePrice ??
          o.pricing?.salePrice ??
          o.rawData?.payout?.salePrice ??
          o.rawData?.amount ??
          o.rawData?.price
      );
      let p = parseMoneyAny(
        o.metrics?.netPayout ??
          o.pricing?.payout ??
          o.rawData?.payout?.totalPayout ??
          o.rawData?.payoutAmount ??
          o.rawData?.payout
      );
      let f = parseMoneyAny(o.metrics?.totalFees ?? o.pricing?.totalFees ?? o.rawData?.totalFees);

      // Keep the totals internally consistent when one field is missing.
      // Prefer using payout if available (especially for history), otherwise derive it from sale - fees when both exist.
      if (p === null && s !== null && f !== null) {
        p = Math.round((s - f) * 100) / 100;
      }
      // If fees are missing but payout is present, derive fees as sale - payout.
      if (f === null && s !== null && p !== null) {
        f = Math.max(0, Math.round((s - p) * 100) / 100);
      }

      const statusRaw = (o.rawData?.status || o.status || o.orderStatus || 'UNKNOWN') as string;
      const status = String(statusRaw || 'UNKNOWN').toUpperCase();
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      const raw = o.rawData || {};
      const orderKey = String(
        raw.orderNumber || raw.orderId || raw.id || o.id || raw.askId || 'UNKNOWN_ORDER'
      );
      idCounts[orderKey] = (idCounts[orderKey] || 0) + 1;

      const productName = String(
        o.product?.name ||
          o.rawData?.product?.productName ||
          o.rawData?.product?.name ||
          o.rawData?.variant?.product?.productName ||
          o.rawData?.variant?.product?.name ||
          'Unknown'
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
      if (s !== null) {
        sale += s;
        saleCount += 1;
      }
      if (f !== null) {
        fees += f;
        feesCount += 1;
      }
      if (p !== null) {
        payout += p;
        payoutCount += 1;
      }

      productCount[productName] = (productCount[productName] || 0) + 1;
      sizeCounts[sizeName] = (sizeCounts[sizeName] || 0) + 1;
      categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;

      if (!productSizeCounts[productName]) productSizeCounts[productName] = {};
      productSizeCounts[productName][sizeName] = (productSizeCounts[productName][sizeName] || 0) + 1;

      if (s !== null) {
        productRevenue[productName] = (productRevenue[productName] || 0) + s;
        brandRevenue[brandName] = (brandRevenue[brandName] || 0) + s;
      }
    }

    const feeRate = sale > 0 ? (fees / sale) * 100 : 0;
    const payoutRate = sale > 0 ? (payout / sale) * 100 : 0;
    const avgSale = saleCount > 0 ? sale / saleCount : 0;
    const avgPayout = payoutCount > 0 ? payout / payoutCount : 0;

    const topProducts = Object.entries(productRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, revenue]) => {
        const sizeMap = productSizeCounts[name] || {};
        const topSizeEntry = Object.entries(sizeMap).sort((a, b) => b[1] - a[1])[0];
        return {
          name,
          revenue,
          topSize: topSizeEntry ? { size: topSizeEntry[0], count: topSizeEntry[1] } : null,
        };
      });
    const topProductsByCount = Object.entries(productCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, c]) => {
        const sizeMap = productSizeCounts[name] || {};
        const topSizeEntry = Object.entries(sizeMap).sort((a, b) => b[1] - a[1])[0];
        return {
          name,
          count: c,
          topSize: topSizeEntry ? { size: topSizeEntry[0], count: topSizeEntry[1] } : null,
        };
      });
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
    // "Pending" = everything that isn't completed (DIDNOTSHIP excluded from metrics by design)
    const pendingCount = Math.max(0, rowsForMetrics.length - completedCount);

    const duplicates = Object.entries(idCounts)
      .filter(([, c]) => c > 1 && !['UNKNOWN_ORDER'].includes(String(c)))
      .sort((a, b) => b[1] - a[1])
      .map(([key, c]) => ({ key, count: c }));

    return {
      count: rows.length,
      countForMetrics: rowsForMetrics.length,
      sale,
      fees,
      payout,
      feeRate,
      payoutRate,
      avgSale,
      avgPayout,
      saleCount,
      feesCount,
      payoutCount,
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
  }, [displayedOrders]);

  const salesByDay = useMemo(() => {
    const rows = (displayedOrders || []).filter((r: any) => getRowStatus(r) !== 'DIDNOTSHIP');

    const parseLocalDayStart = (yyyyMmDd: string) => {
      const [y, m, day] = yyyyMmDd.split('-').map((x) => parseInt(x, 10));
      if (!y || !m || !day) return null;
      return new Date(y, m - 1, day, 0, 0, 0, 0);
    };
    const parseLocalDayEnd = (yyyyMmDd: string) => {
      const [y, m, day] = yyyyMmDd.split('-').map((x) => parseInt(x, 10));
      if (!y || !m || !day) return null;
      return new Date(y, m - 1, day, 23, 59, 59, 999);
    };
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Determine chart range (prefer the selected date range; fall back to min/max from rows)
    let start = fromDate ? parseLocalDayStart(fromDate) : null;
    let end = toDate ? parseLocalDayEnd(toDate) : null;

    if (!start || !end) {
      let minTs = Number.POSITIVE_INFINITY;
      let maxTs = 0;
      for (const r of rows) {
        const raw = (r as any)?.rawData || (r as any);
        const iso = (r as any)?.createdAt || raw?.createdAt || raw?.orderDate || raw?.created || undefined;
        if (!iso) continue;
        const d = new Date(iso);
        const t = d.getTime();
        if (Number.isNaN(t)) continue;
        minTs = Math.min(minTs, t);
        maxTs = Math.max(maxTs, t);
      }
      if (!start && Number.isFinite(minTs)) {
        const d = new Date(minTs);
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      }
      if (!end && maxTs > 0) {
        const d = new Date(maxTs);
        end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      }
    }

    if (!start || !end || start > end) {
      return { series: [] as Array<{ date: string; sales: number; count: number }>, maxSales: 0 };
    }

    const totalsMap: Record<string, number> = {};
    const countsMap: Record<string, number> = {};
    for (const r of rows) {
      const raw = (r as any)?.rawData || (r as any);
      const iso = (r as any)?.createdAt || raw?.createdAt || raw?.orderDate || raw?.created || undefined;
      if (!iso) continue;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) continue;
      const k = dayKey(d);

      const sale = parseMoneyAny(
        (r as any)?.metrics?.salePrice ??
          (r as any)?.pricing?.salePrice ??
          raw?.payout?.salePrice ??
          raw?.amount ??
          raw?.price
      );
      if (sale === null) continue;
      totalsMap[k] = (totalsMap[k] || 0) + sale;
      countsMap[k] = (countsMap[k] || 0) + 1;
    }

    const series: Array<{ date: string; sales: number; count: number }> = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 0, 0, 0, 0);
    while (cur <= endDay) {
      const k = dayKey(cur);
      const sales = Math.round(((totalsMap[k] || 0) as number) * 100) / 100;
      series.push({ date: k, sales, count: countsMap[k] || 0 });
      cur.setDate(cur.getDate() + 1);
    }

    const maxSales = series.reduce((m, x) => Math.max(m, x.sales), 0);
    return { series, maxSales };
  }, [displayedOrders, fromDate, toDate]);

  const fetchHistory = async () => {
    // Quick mode: just fetch the first page (max 100) for the chosen date range.
    const pageNumber = 1;
    const pageSize = 100;
    const cacheKey = makeFetchKey('history');
    if (useCache) {
      const cached = readCache(cacheKey, 10 * 60 * 1000);
      if (cached?.orders && Array.isArray(cached.orders)) {
        setOrders(cached.orders);
        appendLog('info', 'Using cached results (Fetch for time period)', {
          cachedAgeSeconds: Math.round((Date.now() - Number(cached.ts || 0)) / 1000),
          rows: cached.orders.length,
          debug: cached.debug,
        });
        return;
      }
    }

    setLoading(true);
    setError(null);
    setAuthRequired(false);
    setSelected(null);
    appendLog('info', 'Fetching order history (single page)...', {
      pageNumber,
      pageSize,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      historyStatuses: selectedHistoryStatuses.length ? selectedHistoryStatuses : undefined,
      activeStatuses: selectedActiveStatuses.length ? selectedActiveStatuses : undefined,
    });
    try {
      const statusesToFetch = selectedHistoryStatuses.length ? selectedHistoryStatuses : [''];
      const allRows: OrderRow[] = [];
      const seen = new Set<string>();
      const apiCalls = {
        historyRequests: 0,
        activeRequests: 0,
        upstream: { historyList: 0, activeList: 0, catalog: 0, orderDetails: 0, total: 0 },
      };

      for (const st of statusesToFetch) {
        const qp = new URLSearchParams();
        qp.set('pageNumber', String(pageNumber));
        qp.set('pageSize', String(pageSize));
        qp.set('includeCatalog', '1');
        qp.set('includeDetails', '1');
        const fd = historyFromDate();
        const td = historyToDate();
        if (fd) qp.set('fromDate', fd);
        if (td) qp.set('toDate', td);
        if (st) qp.set('orderStatus', st);

        appendLog('info', 'Requesting history page', { pageNumber, pageSize, orderStatus: st || '(all)' });
        apiCalls.historyRequests += 1;
        const res = await fetch(`/api/stockx/orders/history?${qp.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (json?.debug?.upstreamCalls) {
          apiCalls.upstream.historyList += Number(json.debug.upstreamCalls.historyList || 0);
          apiCalls.upstream.catalog += Number(json.debug.upstreamCalls.catalog || 0);
          apiCalls.upstream.orderDetails += Number(json.debug.upstreamCalls.orderDetails || 0);
          apiCalls.upstream.total += Number(json.debug.upstreamCalls.total || 0);
        }

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

        const rows: OrderRow[] = Array.isArray(json?.data) ? json.data : [];
        for (const r of rows) {
          const raw = r?.rawData || {};
          const key = String(raw.orderNumber || raw.orderId || raw.id || r.id || raw.askId || JSON.stringify(raw));
          if (seen.has(key)) continue;
          seen.add(key);
          allRows.push(r);
        }
      }

      setOrders(allRows);
      appendLog('info', 'Fetched order history (merged)', {
        rows: allRows.length,
        statuses: selectedHistoryStatuses.length ? selectedHistoryStatuses : '(all)',
        apiCalls,
      });

      if (includeActive) {
        appendLog('info', 'Fetching active (pending) orders...');
        // Single-page fetch for active orders (quick mode)
        const qp = new URLSearchParams();
        qp.set('pageNumber', '1');
        qp.set('pageSize', '100');
        qp.set('includeCatalog', '1');
        qp.set('includeDetails', '1');
        apiCalls.activeRequests += 1;
        const aRes = await fetch(`/api/stockx/orders/active?${qp.toString()}`);
        const aJson = await aRes.json().catch(() => ({}));
        if (aJson?.debug?.upstreamCalls) {
          apiCalls.upstream.activeList += Number(aJson.debug.upstreamCalls.activeList || 0);
          apiCalls.upstream.catalog += Number(aJson.debug.upstreamCalls.catalog || 0);
          apiCalls.upstream.orderDetails += Number(aJson.debug.upstreamCalls.orderDetails || 0);
          apiCalls.upstream.total += Number(aJson.debug.upstreamCalls.total || 0);
        }

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
              status: o.status,
              orderStatus: o.status,
              createdAt: o.orderDate,
              product: { name: o.productName, brand: o.productBrand, sku: o.sku, category: o.category },
              variant: { size: o.size },
              pricing: { salePrice: o.salePrice, totalFees: o.fees, payout: o.payout, currency: 'USD' },
              rawData: o,
            }))
          : [];

        const filteredActive =
          selectedActiveStatuses.length === 0
            ? activeRows
            : activeRows.filter((r) =>
                selectedActiveStatuses.includes(
                  String((r.rawData?.status || r.status || r.orderStatus || '')).toUpperCase()
                )
              );

        const dateFilteredActive = filteredActive.filter((r) => inSelectedDateRange(r.createdAt));

        setOrders([...allRows, ...dateFilteredActive]);
        appendLog('info', 'Fetched active orders (page 1)', {
          rows: activeRows.length,
          kept: filteredActive.length,
          keptAfterDateFilter: dateFilteredActive.length,
          hasNextPage: Boolean(aJson?.hasNextPage),
          apiCalls,
        });
      }

      writeCache(cacheKey, { orders: allRows, debug: { apiCalls } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOrders([]);
      appendLog('error', 'Order history request failed', { error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // History API supports fromDate/toDate filters; active orders API does NOT, so we filter active rows client-side.
  function inSelectedDateRange(isoOrDate: string | undefined) {
    if (!fromDate && !toDate) return true;
    if (!isoOrDate) return false;
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return false;
    // IMPORTANT: interpret the date picker range in the user's local time (not UTC),
    // otherwise late-night local times can appear as the prior/next day.
    const parseLocalDayStart = (yyyyMmDd: string) => {
      const [y, m, day] = yyyyMmDd.split('-').map((x) => parseInt(x, 10));
      if (!y || !m || !day) return null;
      return new Date(y, m - 1, day, 0, 0, 0, 0);
    };
    const parseLocalDayEnd = (yyyyMmDd: string) => {
      const [y, m, day] = yyyyMmDd.split('-').map((x) => parseInt(x, 10));
      if (!y || !m || !day) return null;
      return new Date(y, m - 1, day, 23, 59, 59, 999);
    };

    const start = fromDate ? parseLocalDayStart(fromDate) : null;
    const end = toDate ? parseLocalDayEnd(toDate) : null;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  }

  // StockX orders/history expects YYYY-MM-DD (not full ISO datetime)
  const historyFromDate = () => (fromDate ? fromDate : '');
  const historyToDate = () => (toDate ? toDate : '');

  const fetchAllHistory = async () => {
    // StockX caps pageSize at 100; we paginate until hasNextPage is false.
    const PAGE_SIZE = 100;
    const MAX_PAGES = 100; // safety cap (10,000 orders max)

    const cacheKey = makeFetchKey('all');
    if (useCache) {
      const cached = readCache(cacheKey, 10 * 60 * 1000);
      if (cached?.orders && Array.isArray(cached.orders)) {
        setOrders(cached.orders);
        appendLog('info', 'Using cached results (Fetch ALL)', {
          cachedAgeSeconds: Math.round((Date.now() - Number(cached.ts || 0)) / 1000),
          rows: cached.orders.length,
          debug: cached.debug,
        });
        return;
      }
    }

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
      historyStatuses: selectedHistoryStatuses.length ? selectedHistoryStatuses : undefined,
      activeStatuses: selectedActiveStatuses.length ? selectedActiveStatuses : undefined,
    });

    try {
      const all: OrderRow[] = [];
      const seen = new Set<string>();
      const statusesToFetch = selectedHistoryStatuses.length ? selectedHistoryStatuses : [''];
      const apiCalls = {
        historyRequests: 0,
        activeRequests: 0,
        upstream: { historyList: 0, activeList: 0, catalog: 0, orderDetails: 0, total: 0 },
      };

      for (const st of statusesToFetch) {
        let p = 1;
        let hasNext = true;
        appendLog('info', 'Fetching status', { orderStatus: st || '(all)' });

        while (hasNext && p <= MAX_PAGES) {
          const qp = new URLSearchParams();
          qp.set('pageNumber', String(p));
          qp.set('pageSize', String(PAGE_SIZE));
          qp.set('includeCatalog', '1');
          qp.set('includeDetails', '1');
          const fd = historyFromDate();
          const td = historyToDate();
          if (fd) qp.set('fromDate', fd);
          if (td) qp.set('toDate', td);
          if (st) qp.set('orderStatus', st);

          const res = await fetch(`/api/stockx/orders/history?${qp.toString()}`);
          const json = await res.json().catch(() => ({}));
          apiCalls.historyRequests += 1;
          if (json?.debug?.upstreamCalls) {
            apiCalls.upstream.historyList += Number(json.debug.upstreamCalls.historyList || 0);
            apiCalls.upstream.catalog += Number(json.debug.upstreamCalls.catalog || 0);
            apiCalls.upstream.orderDetails += Number(json.debug.upstreamCalls.orderDetails || 0);
            apiCalls.upstream.total += Number(json.debug.upstreamCalls.total || 0);
          }

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
          let added = 0;
          for (const r of pageRows) {
            const raw = r?.rawData || {};
            const key = String(raw.orderNumber || raw.orderId || raw.id || r.id || raw.askId || JSON.stringify(raw));
            if (seen.has(key)) continue;
            seen.add(key);
            all.push(r);
            added += 1;
          }

          // Show partial results as we go (so the table fills in while fetching)
          setOrders([...all]);
          setAllProgress({ page: p, total: all.length });

          hasNext = Boolean(json?.hasNextPage) && pageRows.length > 0;
          appendLog('info', `Page ${p} fetched`, {
            orderStatus: st || '(all)',
            added,
            total: all.length,
            hasNextPage: Boolean(json?.hasNextPage),
          });
          p += 1;

          // light delay to reduce rate-limit risk
          if (hasNext) await sleep(250);
        }
      }

      setOrders(all);
      appendLog('info', 'Fetch ALL complete', { total: all.length, apiCalls });

      if (includeActive) {
        appendLog('info', 'Fetching active (pending) orders...');
        const fetchActiveAll = async () => {
          const PAGE_SIZE = 100;
          const MAX_PAGES = 50;
          const statuses = selectedActiveStatuses.length ? selectedActiveStatuses : [''];
          const activeAll: OrderRow[] = [];
          const seenActive = new Set<string>();

          for (const st of statuses) {
            let p = 1;
            let hasNext = true;
            while (hasNext && p <= MAX_PAGES) {
              const qp = new URLSearchParams();
              qp.set('pageNumber', String(p));
              qp.set('pageSize', String(PAGE_SIZE));
              qp.set('includeCatalog', '1');
              qp.set('includeDetails', '1');
              if (st) qp.set('orderStatus', st);
              apiCalls.activeRequests += 1;
              const aRes = await fetch(`/api/stockx/orders/active?${qp.toString()}`);
              const aJson = await aRes.json().catch(() => ({}));
              if (aJson?.debug?.upstreamCalls) {
                apiCalls.upstream.activeList += Number(aJson.debug.upstreamCalls.activeList || 0);
                apiCalls.upstream.catalog += Number(aJson.debug.upstreamCalls.catalog || 0);
                apiCalls.upstream.orderDetails += Number(aJson.debug.upstreamCalls.orderDetails || 0);
                apiCalls.upstream.total += Number(aJson.debug.upstreamCalls.total || 0);
              }
              if (!aRes.ok) {
                appendLog('warn', 'Active orders request failed (non-fatal)', { status: aRes.status, body: aJson });
                break;
              }
              const pageRows: OrderRow[] = Array.isArray(aJson?.orders)
                ? aJson.orders.map((o: any) => ({
                    id: o.id,
                    status: o.status,
                    orderStatus: o.status,
                    createdAt: o.orderDate,
                    product: { name: o.productName, brand: o.productBrand, sku: o.sku, category: o.category },
                    variant: { size: o.size },
                    pricing: { salePrice: o.salePrice, totalFees: o.fees, payout: o.payout, currency: 'USD' },
                    rawData: o,
                  }))
                : [];
              let added = 0;
              for (const r of pageRows) {
                const key = String(r.rawData?.orderNumber || r.rawData?.id || r.id || JSON.stringify(r.rawData));
                if (seenActive.has(key)) continue;
                seenActive.add(key);
                activeAll.push(r);
                added += 1;
              }
              appendLog('info', `Active page ${p} fetched`, {
                orderStatus: st || '(all)',
                added,
                total: activeAll.length,
                hasNextPage: Boolean(aJson?.hasNextPage),
              });
              hasNext = Boolean(aJson?.hasNextPage) && pageRows.length > 0;
              p += 1;
              if (hasNext) await sleep(200);
            }
          }

          return activeAll;
        };

        const activeAll = await fetchActiveAll();
        const dateFilteredActiveAll = activeAll.filter((r) => inSelectedDateRange(r.createdAt));
        setOrders([...all, ...dateFilteredActiveAll]);
        appendLog('info', 'Fetched active orders (all pages)', {
          total: activeAll.length,
          keptAfterDateFilter: dateFilteredActiveAll.length,
          apiCalls,
        });
      }

      writeCache(cacheKey, { orders: includeActive ? [...all] : all, debug: { apiCalls } });
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

  const openGmailSearch = (orderNumber: string) => {
    const q = `"${orderNumber}"`;
    const url = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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
              onClick={fetchAllHistory}
              disabled={allLoading || loading}
              className="px-4 py-2 rounded-lg font-semibold bg-white/10 hover:bg-white/20 border border-white/15 disabled:opacity-50"
            >
              {allLoading
                ? `Fetching…${allProgress ? ` (page ${allProgress.page}, ${allProgress.total} orders)` : ''}`
                : 'Fetch for time period'}
            </button>
            <button
              onClick={fetchHistory}
              disabled={loading || allLoading}
              className="px-4 py-2 rounded-lg font-semibold bg-white/10 hover:bg-white/20 border border-white/15 disabled:opacity-50"
              title="Quick fetch (first page only). Useful for debugging."
            >
              {loading ? 'Loading…' : 'Quick fetch'}
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
              <div className="text-xs text-gray-400">Pick a date range then fetch</div>
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
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowStatusDropdown((v) => !v)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 text-left flex items-center justify-between"
                    title="Select one or more statuses"
                  >
                    <span className="text-gray-200">
                      {selectedHistoryStatuses.length === 0 && selectedActiveStatuses.length === 0
                        ? 'All statuses'
                        : `History: ${selectedHistoryStatuses.length}, Active: ${selectedActiveStatuses.length}`}
                    </span>
                    <span className="text-gray-400">{showStatusDropdown ? '▲' : '▼'}</span>
                  </button>

                  {showStatusDropdown && (
                    <div className="absolute z-20 mt-2 w-full rounded-lg border border-white/10 bg-gray-950 shadow-xl p-2">
                      <div className="flex items-center justify-between gap-2 px-2 pb-2">
                        <div className="text-xs text-gray-400">
                          History filters are sent to StockX; Active filters are applied locally.
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowStatusDropdown(false)}
                          className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10"
                        >
                          Done
                        </button>
                      </div>

                      <div className="max-h-72 overflow-auto space-y-3 px-2 pb-2">
                        <div className="text-[11px] text-gray-400">
                          Note: we only send the “History (API-supported)” statuses to StockX when fetching. The table view filters to any
                          checked statuses (history + active).
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold text-gray-300">History (API-supported)</div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedHistoryStatuses(HISTORICAL_ORDER_STATUSES)}
                                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10"
                              >
                                Select all
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedHistoryStatuses([])}
                                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 space-y-1">
                            {HISTORICAL_ORDER_STATUSES.map((st) => {
                              const checked = selectedHistoryStatuses.includes(st);
                              return (
                                <label
                                  key={st}
                                  className="flex items-center justify-between gap-2 px-2 py-2 rounded hover:bg-white/5 cursor-pointer"
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        setSelectedHistoryStatuses((prev) => {
                                          if (isChecked) return Array.from(new Set([...prev, st]));
                                          return prev.filter((x) => x !== st);
                                        });
                                      }}
                                    />
                                    <span className="text-sm text-gray-200">{st}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold text-gray-300">Active (client-side filter)</div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedActiveStatuses(ACTIVE_ORDER_STATUSES)}
                                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10"
                              >
                                Select all
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedActiveStatuses([])}
                                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 space-y-1">
                            {ACTIVE_ORDER_STATUSES.map((st) => {
                              const checked = selectedActiveStatuses.includes(st);
                              return (
                                <label
                                  key={st}
                                  className="flex items-center justify-between gap-2 px-2 py-2 rounded hover:bg-white/5 cursor-pointer"
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        setSelectedActiveStatuses((prev) => {
                                          if (isChecked) return Array.from(new Set([...prev, st]));
                                          return prev.filter((x) => x !== st);
                                        });
                                      }}
                                    />
                                    <span className="text-sm text-gray-200">{st}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-white/10">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedHistoryStatuses([]);
                              setSelectedActiveStatuses([]);
                            }}
                            className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10"
                          >
                            Clear all
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
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
                  setSelectedHistoryStatuses([]);
                  setSelectedActiveStatuses([]);
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

            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={useCache}
                onChange={(e) => setUseCache(e.target.checked)}
              />
              Use cache (10 min) to reduce API calls
            </label>

            <button
              type="button"
              onClick={clearOrdersCache}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-sm text-gray-200"
              title="Clear cached order-history results"
            >
              Clear cache
            </button>

            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={showDidNotShip}
                onChange={(e) => setShowDidNotShip(e.target.checked)}
              />
              Show DIDNOTSHIP rows (excluded from metrics)
            </label>

            <div className="rounded-lg border border-white/10 bg-gray-900/40 p-3">
              <div className="text-xs text-gray-400">Quick analytics (current page)</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-300">Orders</div>
                <div className="text-right font-semibold">
                  {totals.countForMetrics ?? totals.count}
                  {totals.countForMetrics !== undefined && totals.countForMetrics !== totals.count ? (
                    <span className="text-[11px] text-gray-400"> (shown {totals.count})</span>
                  ) : null}
                </div>
                <div className="text-gray-300">Completed</div>
                <div className="text-right font-semibold">{totals.completedCount}</div>
                <div className="text-gray-300">Pending</div>
                <div className="text-right font-semibold">{totals.pendingCount}</div>
                <div className="text-gray-300">Duplicates</div>
                <div className="text-right font-semibold">{totals.duplicateCount}</div>
                <div className="text-gray-300">Top size</div>
                <div className="text-right font-semibold">
                  {totals.topSize ? `${formatSizeLabel(totals.topSize.size)} (${totals.topSize.count})` : '—'}
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
                            <div className="flex-1 pr-3">
                              <div className="whitespace-normal break-words" title={p.name}>
                                {p.name}
                              </div>
                              <div className="text-[11px] text-gray-400">
                                {p.topSize
                                  ? `Top size: ${formatSizeLabel(p.topSize.size)} (${p.topSize.count})`
                                  : 'Top size: —'}
                              </div>
                            </div>
                            <div className="font-semibold whitespace-nowrap">{p.count}</div>
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
                            <div className="flex-1 pr-3">
                              <div className="whitespace-normal break-words" title={p.name}>
                                {p.name}
                              </div>
                              <div className="text-[11px] text-gray-400">
                                {p.topSize
                                  ? `Top size: ${formatSizeLabel(p.topSize.size)} (${p.topSize.count})`
                                  : 'Top size: —'}
                              </div>
                            </div>
                            <div className="font-semibold whitespace-nowrap">
                              {fmtMoney(p.revenue, totals.currency)}
                            </div>
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
              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-400">{displayedOrders.length} rows</div>
                <button
                  type="button"
                  onClick={exportDisplayedOrdersCsv}
                  disabled={displayedOrders.length === 0}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-sm disabled:opacity-50"
                  title="Export the currently displayed rows (filters + sort applied) as CSV"
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-white/10">
              <div className="text-xs text-gray-400 mb-2">Sales by day</div>
              {salesByDay.series.length === 0 ? (
                <div className="text-sm text-gray-400">No data for chart yet.</div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-gray-950/40 p-3 overflow-hidden">
                  {(() => {
                    const W = 900;
                    const H = 320;
                    const padL = 58;
                    const padR = 18;
                    const padT = 14;
                    const padB = 56;
                    const innerW = W - padL - padR;
                    const innerH = H - padT - padB;
                    const n = salesByDay.series.length;
                    const maxY = Math.max(1, salesByDay.maxSales);
                    const baseY = padT + innerH;

                    const xAt = (i: number) => (n <= 1 ? padL : padL + (i / (n - 1)) * innerW);
                    const yAt = (v: number) => padT + (1 - v / maxY) * innerH;

                    const pts = salesByDay.series.map((p, i) => ({
                      x: xAt(i),
                      y: yAt(p.sales),
                      date: p.date,
                      sales: p.sales,
                      count: p.count,
                    }));

                    const lineD =
                      pts.length === 0
                        ? ''
                        : `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} ` +
                          pts
                            .slice(1)
                            .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
                            .join(' ');

                    const areaD =
                      pts.length === 0
                        ? ''
                        : `M ${pts[0].x.toFixed(2)} ${baseY.toFixed(2)} ` +
                          pts.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') +
                          ` L ${pts[pts.length - 1].x.toFixed(2)} ${baseY.toFixed(2)} Z`;

                    const startLabel = fmtMonthDay(salesByDay.series[0]?.date || '');
                    const endLabel = fmtMonthDay(salesByDay.series[salesByDay.series.length - 1]?.date || '');
                    const midLabel = n > 2 ? fmtMonthDay(salesByDay.series[Math.floor((n - 1) / 2)]?.date || '') : '';

                    const selectedPoint =
                      (selectedSalesDay
                        ? salesByDay.series.find((s) => s.date === selectedSalesDay)
                        : null) || null;

                    return (
                      <div>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="text-xs text-gray-400">X axis: Date • Y axis: Sales ($)</div>
                          <div className="text-xs text-gray-200">
                            {selectedPoint ? (
                              <span>
                                <span className="text-gray-400">Selected:</span> {fmtMonthDay(selectedPoint.date)} —{' '}
                                <span className="font-semibold">{fmtMoney(selectedPoint.sales, totals.currency)}</span> •{' '}
                                <span className="font-semibold">{selectedPoint.count}</span> items
                              </span>
                            ) : (
                              <span className="text-gray-400">Click a point to see that day’s revenue + items sold</span>
                            )}
                          </div>
                        </div>

                        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[300px]">
                        <defs>
                          <linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgb(34 211 238)" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="rgb(34 211 238)" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>

                        {/* axes */}
                        <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="rgba(255,255,255,0.12)" />
                        <line x1={padL} y1={padT} x2={padL} y2={baseY} stroke="rgba(255,255,255,0.12)" />

                        {/* axis labels */}
                        <text
                          x={16}
                          y={padT + innerH / 2}
                          fill="rgba(255,255,255,0.55)"
                          fontSize="11"
                          textAnchor="middle"
                          transform={`rotate(-90 16 ${padT + innerH / 2})`}
                        >
                          Sales ($)
                        </text>
                        <text
                          x={(padL + (W - padR)) / 2}
                          y={H - 10}
                          fill="rgba(255,255,255,0.55)"
                          fontSize="11"
                          textAnchor="middle"
                        >
                          Date
                        </text>

                        {/* y labels */}
                        <text x={padL - 10} y={padT + 12} fill="rgba(255,255,255,0.55)" fontSize="11" textAnchor="end">
                          {fmtMoney(maxY, totals.currency)}
                        </text>
                        <text
                          x={padL - 10}
                          y={baseY}
                          fill="rgba(255,255,255,0.55)"
                          fontSize="11"
                          textAnchor="end"
                          dominantBaseline="middle"
                        >
                          {fmtMoney(0, totals.currency)}
                        </text>

                        {/* x labels */}
                        <text x={padL} y={H - 28} fill="rgba(255,255,255,0.55)" fontSize="11" textAnchor="start">
                          {startLabel}
                        </text>
                        {midLabel && (
                          <text
                            x={(padL + (W - padR)) / 2}
                            y={H - 28}
                            fill="rgba(255,255,255,0.55)"
                            fontSize="11"
                            textAnchor="middle"
                          >
                            {midLabel}
                          </text>
                        )}
                        <text x={W - padR} y={H - 28} fill="rgba(255,255,255,0.55)" fontSize="11" textAnchor="end">
                          {endLabel}
                        </text>

                        {/* series */}
                        <path d={areaD} fill="url(#salesArea)" />
                        <path d={lineD} fill="none" stroke="rgb(34 211 238)" strokeWidth="2.5" />

                        {/* points */}
                        {pts.map((p, i) => {
                          const isSelected = selectedSalesDay === p.date;
                          const label = `${fmtMonthDay(p.date)} — ${fmtMoney(p.sales, totals.currency)} — ${p.count} items`;
                          return (
                            <g
                              key={`${p.date}-${i}`}
                              onClick={() => setSelectedSalesDay(p.date)}
                              style={{ cursor: 'pointer' }}
                            >
                              <title>{label}</title>
                              {/* bigger hit target */}
                              <circle cx={p.x} cy={p.y} r="10" fill="transparent" />
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={isSelected ? 4.5 : 3}
                                fill="rgb(34 211 238)"
                                opacity={isSelected ? 1 : 0.9}
                              />
                              {isSelected && (
                                <circle cx={p.x} cy={p.y} r="8" fill="transparent" stroke="rgba(34,211,238,0.55)" />
                              )}
                            </g>
                          );
                        })}
                      </svg>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="overflow-auto max-h-[55vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-950/80 backdrop-blur border-b border-white/10">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('orderNumber', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by order number"
                      >
                        Order #
                        <span className="text-xs text-gray-400">{sortIndicator('orderNumber')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('status', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by status"
                      >
                        Status
                        <span className="text-xs text-gray-400">{sortIndicator('status')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('product', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by product"
                      >
                        Product
                        <span className="text-xs text-gray-400">{sortIndicator('product')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('size', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by size"
                      >
                        Size
                        <span className="text-xs text-gray-400">{sortIndicator('size')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('sale', 'desc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by sale price"
                      >
                        Sale
                        <span className="text-xs text-gray-400">{sortIndicator('sale')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('fees', 'desc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by fees"
                      >
                        Fees
                        <span className="text-xs text-gray-400">{sortIndicator('fees')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('payout', 'desc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by payout"
                      >
                        Payout
                        <span className="text-xs text-gray-400">{sortIndicator('payout')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('created', 'desc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by created date"
                      >
                        Created
                        <span className="text-xs text-gray-400">{sortIndicator('created')}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {displayedOrders.map((o: any) => {
                    const raw = o?.rawData || o;
                    const orderNumber = getRowOrderNumber(o);
                    const status = getRowStatus(o);
                    const currency = o?.pricing?.currency || raw?.currencyCode || 'USD';
                    const sale = parseMoneyAny(
                      o?.metrics?.salePrice ?? o?.pricing?.salePrice ?? raw?.payout?.salePrice ?? raw?.amount ?? raw?.price
                    );
                    const payout = parseMoneyAny(
                      o?.metrics?.netPayout ??
                        o?.pricing?.payout ??
                        raw?.payout?.totalPayout ??
                        raw?.payoutAmount ??
                        raw?.payout
                    );
                    const feesBase = parseMoneyAny(o?.metrics?.totalFees ?? o?.pricing?.totalFees ?? raw?.totalFees);
                    const fees =
                      feesBase !== null ? feesBase : sale !== null && payout !== null ? Math.max(0, sale - payout) : null;
                    const productName =
                      o?.product?.name ||
                      raw?.product?.productName ||
                      raw?.product?.name ||
                      raw?.variant?.product?.productName ||
                      raw?.variant?.product?.name ||
                      '—';
                    const size = formatSizeLabel(String(o?.variant?.size || raw?.variant?.size || raw?.size || ''));
                    const created = o?.createdAt || raw?.createdAt;
                    const isProjected = status !== 'PAYOUTCOMPLETED' && status !== 'PAYOUT_COMPLETED' && payout !== null;

                    return (
                      <tr
                        key={String(orderNumber)}
                        className="hover:bg-white/5 cursor-pointer"
                        onClick={() => fetchDetails(String(orderNumber))}
                        title="Click to load payout breakdown"
                      >
                        <td className="px-4 py-3 font-semibold text-cyan-200">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openGmailSearch(String(orderNumber));
                            }}
                            className="text-left hover:underline underline-offset-4"
                            title="Search this order number in Gmail"
                          >
                            {String(orderNumber)}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-200">{status}</td>
                        <td className="px-4 py-3 text-gray-200">{productName}</td>
                        <td className="px-4 py-3 text-gray-200">{size}</td>
                        <td className="px-4 py-3 text-gray-200">{fmtMoney(sale, currency)}</td>
                        <td className="px-4 py-3 text-gray-200">{fmtMoney(fees, currency)}</td>
                        <td className="px-4 py-3 text-gray-200">
                          <div className="flex items-center gap-2">
                            <span>{fmtMoney(payout, currency)}</span>
                            {isProjected && <span className="text-[11px] text-gray-400">(proj)</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{fmtDate(created)}</td>
                      </tr>
                    );
                  })}

                  {displayedOrders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
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
                  const sale = parseMoneyAny(d?.payout?.salePrice ?? d?.amount ?? d?.pricing?.amount ?? d?.price);
                  const payout = parseMoneyAny(
                    d?.payout?.totalPayout ?? d?.payout?.payoutAmount ?? d?.payoutAmount ?? d?.payout
                  );
                  const feesBase = parseMoneyAny(d?.payout?.feesTotal ?? d?.feesTotal ?? d?.fees);
                  const fees =
                    feesBase !== null ? feesBase : sale !== null && payout !== null ? Math.max(0, sale - payout) : null;
                  const status = d?.status || d?.orderStatus || '—';
                  const createdAt = d?.createdAt;
                  const productName =
                    d?.product?.productName ||
                    d?.product?.name ||
                    d?.variant?.product?.productName ||
                    d?.variant?.product?.name ||
                    '—';
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
                        <span className="font-semibold text-gray-200">{fmtMoney(sale, currency)}</span>
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
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-sm font-semibold text-gray-200">Raw JSON</div>
                <button
                  type="button"
                  onClick={copySelectedJson}
                  disabled={!selected}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-sm disabled:opacity-50"
                >
                  Copy
                </button>
              </div>
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


