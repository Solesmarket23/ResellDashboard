'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import NeonNotification, { NotificationType } from '@/components/NeonNotification';

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

function fmtShortDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d.toLocaleDateString();
  }
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

function fmtMonthYear(yyyyMm?: string) {
  if (!yyyyMm) return '—';
  const [y, m] = String(yyyyMm).split('-').map((x) => parseInt(x, 10));
  if (!y || !m) return String(yyyyMm);
  const dt = new Date(y, m - 1, 1);
  try {
    return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return String(yyyyMm);
  }
}

function monthKeyFromIso(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatSizeLabel(size: string) {
  const s = String(size || '').trim();
  const upper = s.toUpperCase();
  if (upper === 'S') return 'Small';
  if (upper === 'M') return 'Medium';
  if (upper === 'L') return 'Large';
  return s || '—';
}

function toTitleCaseLabel(input: string) {
  const s = String(input || '').trim();
  if (!s) return '';
  // Preserve common placeholders / already-good values
  if (s === '—' || s.toUpperCase() === 'N/A') return s;
  // Split but keep separators so "streetwear/sneakers" stays readable.
  const parts = s.split(/(\s+|\/|-)/);
  return parts
    .map((p) => {
      if (!p) return p;
      if (p === ' ' || p === '/' || p === '-' || /^\s+$/.test(p)) return p;
      // Keep acronyms like "NBA" / "US" as-is
      if (/^[A-Z0-9]{2,6}$/.test(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    })
    .join('');
}

export default function TestStockXOrders() {
  const [loading, setLoading] = useState(false);
  const [allLoading, setAllLoading] = useState(false);
  const [allProgress, setAllProgress] = useState<{ page: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: NotificationType;
  }>({ isVisible: false, message: '', type: 'success' });

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const todayYmd = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);
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
  const [showQuickPresetsMore, setShowQuickPresetsMore] = useState(false);
  const quickPresetsMoreRef = useRef<HTMLDivElement | null>(null);
  const [includeActive, setIncludeActive] = useState(true);
  const [showDidNotShip, setShowDidNotShip] = useState(false);
  const [useCache, setUseCache] = useState(true);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState<{ orderNumber: string; data: any } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedSalesDay, setSelectedSalesDay] = useState<string | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const detailsSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showQuickPresetsMore) return;
    const onDocClick = (e: MouseEvent) => {
      const el = quickPresetsMoreRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setShowQuickPresetsMore(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowQuickPresetsMore(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showQuickPresetsMore]);

  type VerificationMonthRow = { month: string; success: number; failed: number; failureRate: number };
  type VerificationBrandRow = {
    brand: string;
    success: number;
    failed: number;
    total: number;
    failureRate: number;
  };
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState<{ status: string; page: number; totalRows: number } | null>(
    null
  );
  const [verificationRows, setVerificationRows] = useState<OrderRow[]>([]);
  const [verificationMonths, setVerificationMonths] = useState<VerificationMonthRow[]>([]);
  const [verificationBrands, setVerificationBrands] = useState<VerificationBrandRow[]>([]);
  const [selectedVerificationMonth, setSelectedVerificationMonth] = useState<string | null>(null);
  const [verificationPeriod, setVerificationPeriod] = useState<'last_12_months' | 'ytd' | 'custom'>('last_12_months');
  const [verificationRange, setVerificationRange] = useState<{ from: string; to: string } | null>(null);
  const [verificationFrom, setVerificationFrom] = useState<string>('');
  const [verificationTo, setVerificationTo] = useState<string>('');

  const [sortBy, setSortBy] = useState<
    | 'orderNumber'
    | 'status'
    | 'product'
    | 'styleId'
    | 'brand'
    | 'category'
    | 'size'
    | 'sale'
    | 'fees'
    | 'payout'
    | 'authStatus'
    | 'failureNotes'
    | 'carrier'
    | 'tracking'
    | 'shipBy'
    | 'inventory'
    | 'created'
    | null
  >(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  type LogLevel = 'info' | 'warn' | 'error';
  type LogEntry = { ts: string; level: LogLevel; message: string; data?: any };
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const appendLog = (level: LogLevel, message: string, data?: any) => {
    const entry: LogEntry = { ts: new Date().toISOString(), level, message, data };
    setLogs((prev) => [...prev, entry]);
    // Scroll the logs panel itself, without moving the whole page.
    setTimeout(() => {
      const el = logsContainerRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }, 0);
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

  const showToast = (type: NotificationType, message: string) => {
    setNotification({ isVisible: true, message, type });
  };

  const formatFetchErrorToast = (label: string, status?: number, body?: any) => {
    if (status === 429) return `${label}: Too many requests (429). Please wait ~30–60s and retry.`;
    if (status === 504) return `${label}: Timed out (504). Try again (cache helps) or narrow the date range.`;
    if (status === 401 || body?.authRequired) return `${label}: StockX auth required. Click “Authenticate with StockX”.`;
    const msg = body?.message || body?.error || body?.details;
    return `${label}: ${msg ? String(msg) : status ? `Request failed (${status})` : 'Request failed'}`;
  };

  const ymd = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const setQuickRange = (
    range: 'today' | 'this_week' | 'this_month' | 'this_year' | 'q1' | 'q2' | 'q3' | 'q4' | 'last_month' | 'last_12_months'
  ) => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start = new Date(end);

    if (range === 'today') {
      // start already equals end (today)
    } else if (range === 'this_week') {
      // Week-to-date (Mon → today) in local time.
      const day = end.getDay(); // 0=Sun ... 6=Sat
      const diffToMonday = (day + 6) % 7;
      start = new Date(end);
      start.setDate(end.getDate() - diffToMonday);
    } else if (range === 'this_month') {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else if (range === 'last_month') {
      start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      // end of last month
      const lastMonthEnd = new Date(end.getFullYear(), end.getMonth(), 0);
      setFromDate(ymd(start));
      setToDate(ymd(lastMonthEnd));
      return;
    } else if (range === 'this_year') {
      start = new Date(end.getFullYear(), 0, 1);
    } else if (range === 'q1' || range === 'q2' || range === 'q3' || range === 'q4') {
      const year = end.getFullYear();
      const qIndex = range === 'q1' ? 0 : range === 'q2' ? 1 : range === 'q3' ? 2 : 3;
      const qStartMonth = qIndex * 3; // 0,3,6,9
      const qEndMonth = qStartMonth + 2;
      const qStart = new Date(year, qStartMonth, 1);
      const qEnd = new Date(year, qEndMonth + 1, 0); // last day of quarter
      setFromDate(ymd(qStart));
      setToDate(ymd(qEnd));
      return;
    } else if (range === 'last_12_months') {
      start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    }

    setFromDate(ymd(start));
    setToDate(ymd(end));
  };

  const last12MonthsRange = () => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return { from, to };
  };

  const ytdRange = () => {
    const end = new Date();
    const start = new Date(end.getFullYear(), 0, 1);
    const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return { from, to };
  };

  const monthKeyFromYmd = (ymdStr: string) => ymdStr.slice(0, 7);

  // Keep verification date inputs in sync with the selected preset (unless the user switches to Custom).
  useEffect(() => {
    if (verificationPeriod === 'custom') return;
    const { from, to } = verificationPeriod === 'ytd' ? ytdRange() : last12MonthsRange();
    setVerificationFrom(from);
    setVerificationTo(to);
    setVerificationRange({ from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verificationPeriod]);

  const listMonthsBetween = (fromYmd: string, toYmd: string) => {
    const fromKey = monthKeyFromYmd(fromYmd);
    const toKey = monthKeyFromYmd(toYmd);
    const [fy, fm] = fromKey.split('-').map((x) => parseInt(x, 10));
    const [ty, tm] = toKey.split('-').map((x) => parseInt(x, 10));
    if (!fy || !fm || !ty || !tm) return [];
    const cur = new Date(fy, fm - 1, 1);
    const end = new Date(ty, tm - 1, 1);
    const out: string[] = [];
    while (cur <= end) {
      out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  };

  const computeVerificationStats = (
    rows: OrderRow[],
    opts?: { month?: string | null; from?: string; to?: string }
  ) => {
    const byMonth: Record<string, { success: number; failed: number }> = {};
    const byBrand: Record<string, { success: number; failed: number }> = {};
    const monthFilter = opts?.month || null;
    const rangeFrom = opts?.from || null;
    const rangeTo = opts?.to || null;

    // Initialize month buckets so months with zero activity still show up
    if (rangeFrom && rangeTo) {
      for (const mk of listMonthsBetween(rangeFrom, rangeTo)) {
        byMonth[mk] = { success: 0, failed: 0 };
      }
    }

    const inYmdRange = (iso: unknown, fromYmd?: string | null, toYmd?: string | null) => {
      if (!fromYmd || !toYmd) return true;
      if (!iso) return false;
      const d = new Date(String(iso));
      const t = d.getTime();
      if (Number.isNaN(t)) return false;
      const from = new Date(`${fromYmd}T00:00:00.000Z`).getTime();
      const to = new Date(`${toYmd}T23:59:59.999Z`).getTime();
      return t >= from && t <= to;
    };

    for (const r of rows) {
      const raw = (r as any)?.rawData || (r as any);
      const status = getRowStatus(r);
      const createdIso = (r as any)?.createdAt || raw?.createdAt || raw?.orderDate || raw?.created || undefined;
      if (!inYmdRange(createdIso, rangeFrom, rangeTo)) continue;
      const mk = monthKeyFromIso(createdIso);
      if (!mk) continue;
      if (monthFilter && mk !== monthFilter) continue;

      const brand = String(
        (r as any)?.product?.brand || raw?.product?.brand || raw?.variant?.product?.brand || raw?.brand || 'Unknown'
      );

      if (!byMonth[mk]) byMonth[mk] = { success: 0, failed: 0 };
      if (!byBrand[brand]) byBrand[brand] = { success: 0, failed: 0 };

      if (status === 'COMPLETED' || status === 'PAYOUTCOMPLETED' || status === 'PAYOUT_COMPLETED') {
        byMonth[mk].success += 1;
        byBrand[brand].success += 1;
      } else if (status === 'AUTHFAILED') {
        byMonth[mk].failed += 1;
        byBrand[brand].failed += 1;
      }
    }

    const months = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => {
        const total = v.success + v.failed;
        const failureRate = total > 0 ? (v.failed / total) * 100 : 0;
        return { month, success: v.success, failed: v.failed, failureRate };
      });

    const brands = Object.entries(byBrand)
      .map(([brand, v]) => {
        const total = v.success + v.failed;
        const failureRate = total > 0 ? (v.failed / total) * 100 : 0;
        return { brand, success: v.success, failed: v.failed, total, failureRate };
      })
      .sort((a, b) => b.failureRate - a.failureRate || b.failed - a.failed || b.total - a.total);

    return { months, brands };
  };

  const fetchVerificationStats = async () => {
    const derived = verificationPeriod === 'ytd' ? ytdRange() : last12MonthsRange();
    const from = verificationFrom || derived.from;
    const to = verificationTo || derived.to;
    const prevRange = verificationRange;
    const prevRows = verificationRows;
    setVerificationRange({ from, to });
    const cacheKey = `stockx_verification_cache_v2:${JSON.stringify({ period: verificationPeriod, from, to })}`;

    if (useCache) {
      const cached = readCache(cacheKey, 10 * 60 * 1000);
      if (cached?.rows && Array.isArray(cached.rows)) {
        setVerificationRows(cached.rows);
        const { months } = computeVerificationStats(cached.rows, { from, to });
        setVerificationMonths(months);
        const { brands } = computeVerificationStats(cached.rows, { from, to });
        setVerificationBrands(brands);
        setSelectedVerificationMonth(null);
        appendLog('info', 'Using cached verification stats', {
          period: verificationPeriod,
          from,
          to,
          rows: knownNumber(cached.rows.length),
          cachedAgeSeconds: Math.round((Date.now() - Number(cached.ts || 0)) / 1000),
        });
        return;
      }
    }

    setVerificationLoading(true);
    setVerificationProgress({ status: 'starting', page: 0, totalRows: 0 });
    setSelectedVerificationMonth(null);
    appendLog('info', 'Fetching verification stats...', { period: verificationPeriod, from, to, statuses: ['COMPLETED', 'AUTHFAILED'] });

    const ymdToUtcMsStart = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`).getTime();
    const ymdToUtcMsEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999Z`).getTime();
    const addDaysYmd = (ymd: string, days: number) => {
      const d = new Date(`${ymd}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    };
    const monthStartEndYmd = (monthKey: string) => {
      // monthKey: YYYY-MM
      const [yy, mm] = monthKey.split('-').map((x) => parseInt(x, 10));
      const y = Number.isFinite(yy) ? yy : 1970;
      const m = Number.isFinite(mm) ? mm : 1;
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      // last day of month: Date.UTC(y, m, 0)
      const last = new Date(Date.UTC(y, m, 0));
      const end = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(
        last.getUTCDate()
      ).padStart(2, '0')}`;
      return { start, end };
    };
    const rowCreatedIso = (r: any) => {
      const raw = r?.rawData || r;
      return r?.createdAt || raw?.createdAt || raw?.orderDate || raw?.created || null;
    };
    const rowInRange = (r: any, f: string, t: string) => {
      const iso = rowCreatedIso(r);
      if (!iso) return false;
      const d = new Date(String(iso));
      const ms = d.getTime();
      if (Number.isNaN(ms)) return false;
      return ms >= ymdToUtcMsStart(f) && ms <= ymdToUtcMsEnd(t);
    };

    // Reuse already-loaded rows when the new range overlaps the currently loaded range.
    // This prevents re-fetching months we already have (fewer upstream calls and faster UX).
    const reusePossible =
      prevRows &&
      prevRows.length > 0 &&
      prevRange &&
      typeof prevRange.from === 'string' &&
      typeof prevRange.to === 'string';
    let seedFrom: string | null = null;
    let seedTo: string | null = null;
    if (reusePossible) {
      const overlapFrom = ymdToUtcMsStart(from) <= ymdToUtcMsStart(prevRange!.to) ? (ymdToUtcMsStart(from) >= ymdToUtcMsStart(prevRange!.from) ? from : prevRange!.from) : null;
      const overlapTo = ymdToUtcMsStart(to) >= ymdToUtcMsStart(prevRange!.from) ? (ymdToUtcMsStart(to) <= ymdToUtcMsStart(prevRange!.to) ? to : prevRange!.to) : null;
      if (overlapFrom && overlapTo && ymdToUtcMsStart(overlapFrom) <= ymdToUtcMsStart(overlapTo)) {
        seedFrom = overlapFrom;
        seedTo = overlapTo;
      }
    }

    const collected: OrderRow[] = [];
    const seen = new Set<string>();
    if (seedFrom && seedTo) {
      const seeded = prevRows.filter((r) => rowInRange(r, seedFrom!, seedTo!));
      for (const r of seeded) {
        const raw = (r as any)?.rawData || {};
        const key = String(raw.orderNumber || raw.orderId || raw.id || (r as any).id || raw.askId || JSON.stringify(raw));
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(r);
      }
      appendLog('info', 'Reusing already-loaded verification rows', {
        prevFrom: prevRange?.from,
        prevTo: prevRange?.to,
        overlapFrom: seedFrom,
        overlapTo: seedTo,
        reusedRows: collected.length,
      });
    }

    try {
      const statusesToFetch = ['COMPLETED', 'AUTHFAILED'];

      // Month-by-month fetching (A then B per month):
      // For each month in the requested range:
      //   - fetch COMPLETED for that month
      //   - fetch AUTHFAILED for that month
      // This gives a more intuitive, progressive month list and avoids "global A then global B".
      const monthsInRange = listMonthsBetween(from, to);
      if (monthsInRange.length === 0) {
        writeCache(cacheKey, { rows: collected });
        const computed = computeVerificationStats(collected, { from, to });
        setVerificationRows([...collected]);
        setVerificationMonths(computed.months);
        setVerificationBrands(computed.brands);
        appendLog('info', 'Verification stats loaded (no months in range)', { rows: collected.length });
        return;
      }

      const desiredFromMs = ymdToUtcMsStart(from);
      const desiredToMs = ymdToUtcMsStart(to);
      const seedFromMs = seedFrom ? ymdToUtcMsStart(seedFrom) : null;
      const seedToMs = seedTo ? ymdToUtcMsStart(seedTo) : null;

      const buildMonthSegments = (monthKey: string) => {
        const { start: monthStart, end: monthEnd } = monthStartEndYmd(monthKey);
        // Clamp to requested range
        const segStart = Math.max(ymdToUtcMsStart(monthStart), desiredFromMs);
        const segEnd = Math.min(ymdToUtcMsStart(monthEnd), desiredToMs);
        if (segStart > segEnd) return [] as Array<{ from: string; to: string; monthKey: string }>;
        const startYmd =
          segStart === ymdToUtcMsStart(monthStart) ? monthStart : from; // safe fallback; recompute below
        // Convert ms->ymd for boundaries
        const msToYmd = (ms: number) => {
          const d = new Date(ms);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        };
        const desiredStartYmd = msToYmd(segStart);
        const desiredEndYmd = msToYmd(segEnd);

        // No seed overlap: fetch whole month segment
        if (!seedFromMs || !seedToMs) return [{ from: desiredStartYmd, to: desiredEndYmd, monthKey }];

        // If month segment is fully outside the overlap seed: fetch whole month segment
        if (segEnd < seedFromMs || segStart > seedToMs) return [{ from: desiredStartYmd, to: desiredEndYmd, monthKey }];

        // Otherwise, fetch only the uncovered part(s) of this month segment
        const out: Array<{ from: string; to: string; monthKey: string }> = [];
        if (segStart < seedFromMs) {
          const beforeTo = msToYmd(Math.min(segEnd, ymdToUtcMsStart(addDaysYmd(seedFrom!, -1))));
          out.push({ from: desiredStartYmd, to: beforeTo, monthKey });
        }
        if (segEnd > seedToMs) {
          const afterFrom = msToYmd(Math.max(segStart, ymdToUtcMsStart(addDaysYmd(seedTo!, 1))));
          out.push({ from: afterFrom, to: desiredEndYmd, monthKey });
        }
        return out.filter((s) => ymdToUtcMsStart(s.from) <= ymdToUtcMsStart(s.to));
      };

      const allMonthSegments = monthsInRange.flatMap((mk) => buildMonthSegments(mk));
      if (allMonthSegments.length === 0) {
        // Fully covered by existing overlap; no network calls needed.
        const computed = computeVerificationStats(collected, { from, to });
        setVerificationRows([...collected]);
        setVerificationMonths(computed.months);
        setVerificationBrands(computed.brands);
        writeCache(cacheKey, { rows: collected });
        appendLog('info', 'Verification stats already covered by existing data (no fetch needed)', {
          from,
          to,
          rows: collected.length,
        });
        return;
      }

      // Process month segments in chronological order for more natural progress in the UI.
      const monthSegmentsSorted = allMonthSegments
        .slice()
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey) || a.from.localeCompare(b.from));

      for (const seg of monthSegmentsSorted) {
        for (const st of statusesToFetch) {
          let page = 1;
          let hasNext = true;
          while (hasNext && page <= 100) {
            setVerificationProgress({ status: `${seg.monthKey} ${st}`, page, totalRows: collected.length });
            const qp = new URLSearchParams();
            qp.set('pageNumber', String(page));
            qp.set('pageSize', '100');
            qp.set('fromDate', seg.from);
            qp.set('toDate', seg.to);
            qp.set('orderStatus', st);
            qp.set('includeCatalog', '1'); // for brand
            // NOTE: we intentionally do NOT set includeDetails=1 here (keeps upstream calls lower)
            const url = `/api/stockx/orders/history?${qp.toString()}`;
            let attempt = 0;
            let json: any = {};
            let ok = false;
            let statusCode = 0;
            while (attempt < 6 && !ok) {
              const res = await fetch(url);
              statusCode = res.status;
              json = await res.json().catch(() => ({}));
              ok = res.ok;
              if (ok) break;

              if (res.status === 401 || json?.authRequired) {
                setAuthRequired(true);
                throw new Error(json?.message || 'StockX authentication required.');
              }

              // 429: exponential backoff and retry same page
              if (res.status === 429) {
                const backoffMs = Math.min(30_000, 800 * Math.pow(2, attempt));
                appendLog('warn', 'Rate limited (429). Backing off…', {
                  status: st,
                  month: seg.monthKey,
                  page,
                  backoffMs,
                  range: { from: seg.from, to: seg.to },
                });
                await sleep(backoffMs);
                attempt += 1;
                continue;
              }

              throw new Error(json?.error || json?.details || json?.message || `Request failed (${res.status})`);
            }

            if (!ok) {
              throw new Error(json?.error || json?.details || json?.message || `Request failed (${statusCode})`);
            }

            const pageRows: OrderRow[] = Array.isArray(json?.data) ? json.data : [];
            for (const r of pageRows) {
              const raw = (r as any)?.rawData || {};
              const key = String(raw.orderNumber || raw.orderId || raw.id || (r as any).id || raw.askId || JSON.stringify(raw));
              if (seen.has(key)) continue;
              seen.add(key);
              collected.push(r);
            }

            const { months, brands } = computeVerificationStats(collected, { from, to });
            setVerificationMonths(months);
            setVerificationBrands(brands);
            setVerificationRows([...collected]);

            hasNext = Boolean(json?.hasNextPage) && pageRows.length > 0;
            page += 1;
            // Pace requests to reduce 429 risk
            if (hasNext) await sleep(600);
          }
        }
      }

      writeCache(cacheKey, { rows: collected });
      const computed = computeVerificationStats(collected, { from, to });
      setVerificationRows([...collected]);
      setVerificationMonths(computed.months);
      setVerificationBrands(computed.brands);
      appendLog('info', 'Verification stats loaded', { rows: collected.length, months: computed.months.length });
    } catch (e) {
      appendLog('error', 'Verification stats fetch failed', { error: e instanceof Error ? e.message : String(e) });
      showToast('error', `Verification stats: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setVerificationLoading(false);
      setVerificationProgress(null);
    }
  };

  function knownNumber(n: any) {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
  }

  const clearVerificationCache = () => {
    try {
      const prefix = 'stockx_verification_cache_v2:';
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      appendLog('info', 'Cleared verification cache', { removed: keys.length });
    } catch {
      appendLog('warn', 'Could not clear verification cache (storage blocked)');
    }
  };

  const verificationCoverage = useMemo(() => {
    if (!verificationRows || verificationRows.length === 0) return null;
    let minTs = Number.POSITIVE_INFINITY;
    let maxTs = 0;
    let minIso: string | null = null;
    let maxIso: string | null = null;
    for (const r of verificationRows) {
      const raw = (r as any)?.rawData || (r as any);
      const iso = (r as any)?.createdAt || raw?.createdAt || raw?.orderDate || raw?.created || null;
      if (!iso) continue;
      const d = new Date(iso);
      const t = d.getTime();
      if (Number.isNaN(t)) continue;
      if (t < minTs) {
        minTs = t;
        minIso = iso;
      }
      if (t > maxTs) {
        maxTs = t;
        maxIso = iso;
      }
    }
    if (!minIso || !maxIso) return { rows: verificationRows.length, earliest: '—', latest: '—' };
    const earliest = monthKeyFromIso(minIso) ? fmtMonthYear(monthKeyFromIso(minIso) as string) : '—';
    const latest = monthKeyFromIso(maxIso) ? fmtMonthYear(monthKeyFromIso(maxIso) as string) : '—';
    return { rows: verificationRows.length, earliest, latest };
  }, [verificationRows]);

  const verificationStatusTotals = useMemo(() => {
    const totals = { COMPLETED: 0, AUTHFAILED: 0, OTHER: 0 };
    for (const r of verificationRows || []) {
      const st = getRowStatus(r);
      if (st === 'COMPLETED' || st === 'PAYOUTCOMPLETED' || st === 'PAYOUT_COMPLETED') totals.COMPLETED += 1;
      else if (st === 'AUTHFAILED') totals.AUTHFAILED += 1;
      else totals.OTHER += 1;
    }
    return totals;
  }, [verificationRows]);

  const isActiveRow = (row: any) => {
    if (row?.source === 'active') return true;
    const raw = row?.rawData || row;
    return Boolean(raw?.orderDate); // active route uses orderDate field
  };

  // NOTE: These are function declarations (not const arrow fns) so they are hoisted.
  // This avoids runtime "Cannot access X before initialization" when used by useMemo blocks above.
  function getRowStatus(row: any): string {
    const raw = row?.rawData || row;
    return String((raw?.status || row?.status || row?.orderStatus || raw?.orderStatus || '—')).toUpperCase();
  }

  function getRowOrderNumber(row: any): string {
    const raw = row?.rawData || row;
    return String(raw?.orderNumber || raw?.orderId || raw?.id || row?.id || raw?.askId || '—');
  }

  function getRowCreatedTs(row: any): number | null {
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
  }

  function getRowProductName(row: any): string {
    const raw = row?.rawData || row;
    return String(
      row?.product?.name ||
        raw?.product?.productName ||
        raw?.product?.name ||
        raw?.variant?.product?.productName ||
        raw?.variant?.product?.name ||
        '—'
    );
  }

  function getRowSize(row: any): string {
    const raw = row?.rawData || row;
    return String(row?.variant?.size || raw?.variant?.size || raw?.variant?.variantValue || raw?.size || '').trim();
  }

  function getRowSale(row: any): number | null {
    const raw = row?.rawData || row;
    return normalizeMoney(row?.metrics?.salePrice ?? row?.pricing?.salePrice ?? raw?.amount ?? raw?.price);
  }

  function getRowFees(row: any): number | null {
    const raw = row?.rawData || row;
    return normalizeMoney(row?.metrics?.totalFees ?? row?.pricing?.totalFees ?? raw?.totalFees);
  }

  function getRowPayout(row: any): number | null {
    const raw = row?.rawData || row;
    return normalizeMoney(row?.metrics?.netPayout ?? row?.pricing?.payout ?? raw?.payout);
  }

  function getRowBrand(row: any): string {
    const raw = row?.rawData || row;
    return String(row?.product?.brand || raw?.product?.brand || raw?.variant?.product?.brand || raw?.brand || '').trim();
  }

  const getRowCategory = (row: any) => {
    const raw = row?.rawData || row;
    return String(row?.product?.category || raw?.product?.category || raw?.variant?.product?.category || raw?.category || '').trim();
  };

  const getRowCategoryLabel = (row: any) => {
    const raw = getRowCategory(row);
    return toTitleCaseLabel(raw);
  };

  const getRowCarrier = (row: any) => {
    const raw = row?.rawData || row;
    return String(raw?.shipment?.carrierCode || raw?.carrierCode || '').trim();
  };

  const getRowTracking = (row: any) => {
    const raw = row?.rawData || row;
    return String(raw?.shipment?.trackingNumber || raw?.trackingNumber || '').trim();
  };

  const getRowShipByIso = (row: any) => {
    const raw = row?.rawData || row;
    return String(raw?.shipment?.shipByDate || '').trim();
  };

  const getRowShipByTs = (row: any) => {
    const iso = getRowShipByIso(row);
    if (!iso) return null;
    const d = new Date(iso);
    const t = d.getTime();
    return Number.isNaN(t) ? null : t;
  };

  const getRowInventoryType = (row: any) => {
    const raw = row?.rawData || row;
    return String(raw?.inventoryType || row?.variant?.inventoryType || '').trim();
  };

  const getRowStyleId = (row: any) => {
    const raw = row?.rawData || row;
    return String(row?.product?.sku || row?.product?.styleId || raw?.product?.styleId || raw?.sku || raw?.styleId || '').trim();
  };

  const formatAuthStatusLabel = (rawStatus: string) => {
    const s = String(rawStatus || '').trim();
    if (!s) return '';
    const upper = s.toUpperCase();
    if (upper === 'AUTHENTICATION_SUCCEEDED') return 'Authenticated';
    if (upper === 'AUTHENTICATION_FAILED') return 'Failed authentication';
    if (upper === 'AUTHENTICATED') return 'Authenticated';
    if (upper === 'AUTHENTICATING' || upper === 'AUTHENTICATION_IN_PROGRESS') return 'Authenticating';
    if (upper === 'AUTHFAILED') return 'Failed verification';
    // Fallback: nicer Title Case for unknown values
    return upper
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ');
  };

  const getRowAuthStatus = (row: any) => {
    const raw = row?.rawData || row;
    const status = String(raw?.authenticationDetails?.status || '').trim();
    return formatAuthStatusLabel(status);
  };

  const getRowAuthStatusRaw = (row: any) => {
    const raw = row?.rawData || row;
    return String(raw?.authenticationDetails?.status || '').trim();
  };

  const getRowFailureNotes = (row: any) => {
    const raw = row?.rawData || row;
    const v = raw?.authenticationDetails?.failureNotes;
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.filter(Boolean).join('; ');
    return String(v);
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

    // Search filter (matches Purchases UX: filters the displayed table + derived analytics)
    if (orderSearchQuery.trim()) {
      const q = orderSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((r) => {
        const orderNo = getRowOrderNumber(r).toLowerCase();
        const status = getRowStatus(r).toLowerCase();
        const product = getRowProductName(r).toLowerCase();
        const size = getRowSize(r).toLowerCase();
        const brand = getRowBrand(r).toLowerCase();
        const category = getRowCategory(r).toLowerCase();
        return (
          orderNo.includes(q) ||
          status.includes(q) ||
          product.includes(q) ||
          size.includes(q) ||
          brand.includes(q) ||
          category.includes(q)
        );
      });
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
      if (sortBy === 'styleId') {
        const ap = getRowStyleId(a);
        const bp = getRowStyleId(b);
        const cmp = ap.localeCompare(bp);
        if (cmp !== 0) return cmp * dir;
      }
      if (sortBy === 'brand') {
        const ap = getRowBrand(a);
        const bp = getRowBrand(b);
        const cmp = ap.localeCompare(bp);
        if (cmp !== 0) return cmp * dir;
      }
      if (sortBy === 'category') {
        const ap = getRowCategory(a);
        const bp = getRowCategory(b);
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
      if (sortBy === 'authStatus') {
        const ap = getRowAuthStatus(a);
        const bp = getRowAuthStatus(b);
        const cmp = ap.localeCompare(bp);
        if (cmp !== 0) return cmp * dir;
      }
      if (sortBy === 'failureNotes') {
        const ap = getRowFailureNotes(a);
        const bp = getRowFailureNotes(b);
        const cmp = ap.localeCompare(bp);
        if (cmp !== 0) return cmp * dir;
      }
      if (sortBy === 'carrier') {
        const ap = getRowCarrier(a);
        const bp = getRowCarrier(b);
        const cmp = ap.localeCompare(bp);
        if (cmp !== 0) return cmp * dir;
      }
      if (sortBy === 'tracking') {
        const ap = getRowTracking(a);
        const bp = getRowTracking(b);
        const cmp = ap.localeCompare(bp);
        if (cmp !== 0) return cmp * dir;
      }
      if (sortBy === 'shipBy') {
        const at = getRowShipByTs(a);
        const bt = getRowShipByTs(b);
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
      if (sortBy === 'inventory') {
        const ap = getRowInventoryType(a);
        const bp = getRowInventoryType(b);
        const cmp = ap.localeCompare(bp);
        if (cmp !== 0) return cmp * dir;
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
    orderSearchQuery,
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

  const verificationBrandsForSelectedMonth = useMemo(() => {
    if (!verificationRows || verificationRows.length === 0) return [] as VerificationBrandRow[];
    const computed = computeVerificationStats(verificationRows, {
      month: selectedVerificationMonth,
      from: verificationRange?.from,
      to: verificationRange?.to,
    });
    return computed.brands;
  }, [verificationRows, selectedVerificationMonth, verificationRange]);

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
      // StockX history endpoint typically requires an explicit orderStatus.
      // Treat "All statuses" as "fetch all API-supported historical statuses and merge".
      const statusesToFetch = selectedHistoryStatuses.length ? selectedHistoryStatuses : HISTORICAL_ORDER_STATUSES;
      const allRows: OrderRow[] = [];
      const seen = new Set<string>();
      // Incremental UI updates so users see progress immediately.
      let addedSinceFlush = 0;
      const FLUSH_EVERY = 10;
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
            showToast('warning', formatFetchErrorToast('Order history', res.status, json));
            return;
          }
          showToast('error', formatFetchErrorToast('Order history', res.status, json));
          throw new Error(json?.error || json?.details || `Request failed (${res.status})`);
        }

        const rows: OrderRow[] = Array.isArray(json?.data) ? json.data : [];
        for (const r of rows) {
          const raw = r?.rawData || {};
          const key = String(raw.orderNumber || raw.orderId || raw.id || r.id || raw.askId || JSON.stringify(raw));
          if (seen.has(key)) continue;
          seen.add(key);
          allRows.push(r);
          addedSinceFlush += 1;
          if (addedSinceFlush >= FLUSH_EVERY) {
            setOrders([...allRows]);
            addedSinceFlush = 0;
            // Yield so React paints progressively instead of batching updates.
            await sleep(0);
          }
        }
        // Flush after each status, even if fewer than FLUSH_EVERY
        if (addedSinceFlush > 0) {
          setOrders([...allRows]);
          addedSinceFlush = 0;
          await sleep(0);
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
            showToast('warning', formatFetchErrorToast('Active orders', aRes.status, aJson));
          } else {
            appendLog('warn', 'Active orders request failed (non-fatal)', { status: aRes.status, body: aJson });
            showToast('warning', formatFetchErrorToast('Active orders', aRes.status, aJson));
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
      showToast('error', `Order history: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const fetchJsonWithTimeout = async (url: string, opts: RequestInit = {}, timeoutMs = 25000) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      const json = await res.json().catch(() => ({}));
      return { res, json };
    } finally {
      clearTimeout(t);
    }
  };

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

  // StockX orders/history expects YYYY-MM-DD (not full ISO datetime), but its boundary semantics can be
  // surprising (timezone / inclusive/exclusive). To avoid "0 results" when the user picks a single day,
  // we widen the API request window by ±1 day and then filter rows client-side in local time.
  const addDaysYmd = (yyyyMmDd: string, deltaDays: number) => {
    const [y, m, d] = yyyyMmDd.split('-').map((x) => parseInt(x, 10));
    if (!y || !m || !d) return yyyyMmDd;
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0); // noon avoids DST edge cases
    dt.setDate(dt.getDate() + deltaDays);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const historyFromDate = () => (fromDate ? addDaysYmd(fromDate, -1) : '');
  const historyToDate = () => (toDate ? addDaysYmd(toDate, +1) : '');

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
      // StockX history endpoint typically requires an explicit orderStatus.
      // Treat "All statuses" as "fetch all API-supported historical statuses and merge".
      const statusesToFetch = selectedHistoryStatuses.length ? selectedHistoryStatuses : HISTORICAL_ORDER_STATUSES;
      // Incremental UI flush: update the table every N rows so users see results appear quickly.
      let addedSinceFlush = 0;
      const FLUSH_EVERY = 10;
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
              showToast('warning', formatFetchErrorToast('Fetch ALL', res.status, json));
              return;
            }
            showToast('error', formatFetchErrorToast('Fetch ALL', res.status, json));
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
            addedSinceFlush += 1;
            if (addedSinceFlush >= FLUSH_EVERY) {
              // Show partial results as we go (so the table fills in while fetching)
              setOrders([...all]);
              setAllProgress({ page: p, total: all.length });
              addedSinceFlush = 0;
              // Yield so React paints progressively instead of batching all updates into one render.
              await sleep(0);
            }
          }

          // Flush at end of each page even if fewer than FLUSH_EVERY were added
          if (addedSinceFlush > 0) {
            setOrders([...all]);
            setAllProgress({ page: p, total: all.length });
            addedSinceFlush = 0;
            // Yield so the user sees the page results immediately.
            await sleep(0);
          }

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
          let activeAddedSinceFlush = 0;
          const ACTIVE_FLUSH_EVERY = 10;

          for (const st of statuses) {
            let p = 1;
            let hasNext = true;
            while (hasNext && p <= MAX_PAGES) {
              appendLog('info', 'Requesting active page', { pageNumber: p, pageSize: PAGE_SIZE, orderStatus: st || '(all)' });
              const qp = new URLSearchParams();
              qp.set('pageNumber', String(p));
              qp.set('pageSize', String(PAGE_SIZE));
              qp.set('includeCatalog', '1');
              qp.set('includeDetails', '1');
              if (st) qp.set('orderStatus', st);
              apiCalls.activeRequests += 1;
              let aRes: Response;
              let aJson: any;
              try {
                const r = await fetchJsonWithTimeout(`/api/stockx/orders/active?${qp.toString()}`, {}, 25000);
                aRes = r.res;
                aJson = r.json;
              } catch (e) {
                const msg =
                  e instanceof DOMException && e.name === 'AbortError'
                    ? 'Active orders request timed out (25s)'
                    : e instanceof Error
                      ? e.message
                      : String(e);
                appendLog('warn', 'Active orders request failed (non-fatal)', { pageNumber: p, orderStatus: st || '(all)', error: msg });
                showToast('warning', `Active orders: ${msg}`);
                break;
              }
              if (aJson?.debug?.upstreamCalls) {
                apiCalls.upstream.activeList += Number(aJson.debug.upstreamCalls.activeList || 0);
                apiCalls.upstream.catalog += Number(aJson.debug.upstreamCalls.catalog || 0);
                apiCalls.upstream.orderDetails += Number(aJson.debug.upstreamCalls.orderDetails || 0);
                apiCalls.upstream.total += Number(aJson.debug.upstreamCalls.total || 0);
              }
              if (!aRes.ok) {
                appendLog('warn', 'Active orders request failed (non-fatal)', { status: aRes.status, body: aJson });
                showToast('warning', formatFetchErrorToast('Active orders', aRes.status, aJson));
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
                activeAddedSinceFlush += 1;
                if (activeAddedSinceFlush >= ACTIVE_FLUSH_EVERY) {
                  const dateFilteredActiveSoFar = activeAll.filter((x) => inSelectedDateRange(x.createdAt));
                  setOrders([...all, ...dateFilteredActiveSoFar]);
                  activeAddedSinceFlush = 0;
                  // Yield so React paints progressively instead of batching.
                  await sleep(0);
                }
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

          if (activeAddedSinceFlush > 0) {
            const dateFilteredActiveSoFar = activeAll.filter((x) => inSelectedDateRange(x.createdAt));
            setOrders([...all, ...dateFilteredActiveSoFar]);
            activeAddedSinceFlush = 0;
            await sleep(0);
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
      showToast('error', `Fetch ALL: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAllLoading(false);
      setAllProgress(null);
    }
  };

  const fetchDetails = async (orderNumber: string) => {
    setDetailsLoading(true);
    setError(null);
    // Scroll to the details panel immediately so the user sees progress.
    setTimeout(() => detailsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    try {
      appendLog('info', 'Fetching order details...', { orderNumber });
      const res = await fetch(`/api/stockx/orders/${encodeURIComponent(orderNumber)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || json?.authRequired) {
          setAuthRequired(true);
          showToast('warning', formatFetchErrorToast('Order details', res.status, json));
          throw new Error(json?.message || 'StockX authentication required.');
        }
        showToast('error', formatFetchErrorToast('Order details', res.status, json));
        throw new Error(json?.error || json?.details || `Request failed (${res.status})`);
      }
      setSelected({ orderNumber, data: json?.data });
      appendLog('info', 'Loaded order details', { orderNumber });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSelected(null);
      appendLog('error', 'Order details request failed', { error: e instanceof Error ? e.message : String(e) });
      showToast('error', `Order details: ${e instanceof Error ? e.message : String(e)}`);
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
      {notification.isVisible && (
        <NeonNotification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification((n) => ({ ...n, isVisible: false }))}
        />
      )}
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
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Logs</h2>
            <div className="flex items-center gap-2">
              {process.env.NODE_ENV !== 'production' && (
                <button
                  type="button"
                  onClick={() => {
                    const types: NotificationType[] = ['success', 'warning', 'error'];
                    const type = types[Math.floor(Math.random() * types.length)] || 'success';
                    showToast(
                      type,
                      type === 'success'
                        ? 'Test toast: success'
                        : type === 'warning'
                          ? 'Test toast: warning'
                          : 'Test toast: error'
                    );
                  }}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-sm"
                  title="Dev-only: trigger a sample toast"
                >
                  Test toast
                </button>
              )}
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
          <div
            ref={logsContainerRef}
            className="mt-3 max-h-[220px] overflow-auto rounded-lg border border-white/10 bg-gray-900/50 p-3"
          >
            {logs.length === 0 ? (
              <div className="text-sm text-gray-400">No logs yet. Click “Fetch for time period”.</div>
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
                <label className="block text-xs text-gray-400 mb-1">From</label>
                <input
                  type="date"
                  value={fromDate}
                  max={todayYmd}
                  onChange={(e) => {
                    let v = e.target.value;
                    if (v && v > todayYmd) v = todayYmd;
                    setFromDate(v);
                    // Keep From <= To
                    if (v && toDate && v > toDate) setToDate(v);
                  }}
                  placeholder="2025-12-01"
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">To</label>
                <input
                  type="date"
                  value={toDate}
                  max={todayYmd}
                  onChange={(e) => {
                    let v = e.target.value;
                    if (v && v > todayYmd) v = todayYmd;
                    setToDate(v);
                    // Keep From <= To
                    if (v && fromDate && v < fromDate) setFromDate(v);
                  }}
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

            <div className="flex items-center gap-2 flex-wrap">
              {/* Primary quick presets */}
              <button
                onClick={() => setQuickRange('today')}
                className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-sm whitespace-nowrap"
                title="Set date range to today"
              >
                Today
              </button>
              <button
                onClick={() => setQuickRange('this_week')}
                className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-gray-200 text-sm whitespace-nowrap"
                title="This week (Mon → today)"
              >
                This week
              </button>
              <button
                onClick={() => setQuickRange('this_month')}
                className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-gray-200 text-sm whitespace-nowrap"
                title="Set date range to this month"
              >
                This month
              </button>

              {/* Less-used presets under More */}
              <div ref={quickPresetsMoreRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowQuickPresetsMore((v) => !v)}
                  className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-gray-200 text-sm whitespace-nowrap"
                  aria-expanded={showQuickPresetsMore}
                  aria-haspopup="menu"
                  title="More quick presets"
                >
                  More ▾
                </button>

                {showQuickPresetsMore && (
                  <div
                    role="menu"
                    className="absolute z-30 mt-2 w-48 rounded-xl border border-white/10 bg-gray-950/95 backdrop-blur shadow-xl overflow-hidden"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setQuickRange('this_year');
                        setShowQuickPresetsMore(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                      title="This year"
                    >
                      This year
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setQuickRange('q4');
                        setShowQuickPresetsMore(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                      title="Q4 (current year)"
                    >
                      Q4
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setQuickRange('q3');
                        setShowQuickPresetsMore(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                      title="Q3 (current year)"
                    >
                      Q3
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setQuickRange('q2');
                        setShowQuickPresetsMore(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                      title="Q2 (current year)"
                    >
                      Q2
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setQuickRange('q1');
                        setShowQuickPresetsMore(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                      title="Q1 (current year)"
                    >
                      Q1
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setSelectedHistoryStatuses([]);
                  setSelectedActiveStatuses([]);
                  setShowQuickPresetsMore(false);
                }}
                className="sm:ml-auto h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-gray-200 text-sm whitespace-nowrap"
              >
                Clear
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchAllHistory}
                disabled={allLoading || loading}
                className="flex-1 px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white disabled:opacity-50"
                title="Fetch all pages for the selected time period (fills table as results arrive)"
              >
                {allLoading
                  ? `Fetching…${allProgress ? ` (page ${allProgress.page}, ${allProgress.total} orders)` : ''}`
                  : 'Fetch for time period'}
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
                  {totals.topCategory
                    ? `${toTitleCaseLabel(totals.topCategory.category)} (${totals.topCategory.count})`
                    : '—'}
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

            <div className="rounded-lg border border-white/10 bg-gray-900/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-200">Failed verification</div>
                  <div className="text-xs text-gray-400">
                    {verificationPeriod === 'ytd' ? 'YTD' : verificationPeriod === 'custom' ? 'Custom' : 'Last 12 months'}:{' '}
                    <code className="text-gray-300">AUTHFAILED</code> vs <code className="text-gray-300">COMPLETED</code>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearVerificationCache}
                    className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-sm text-gray-200"
                    title="Clear cached verification results"
                  >
                    Clear cache
                  </button>
                  <button
                    type="button"
                    onClick={fetchVerificationStats}
                    disabled={verificationLoading}
                    className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-sm disabled:opacity-50"
                  >
                    {verificationLoading ? 'Loading…' : 'Load'}
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVerificationPeriod('last_12_months')}
                  className={
                    'text-xs px-2 py-1 rounded border ' +
                    (verificationPeriod === 'last_12_months'
                      ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
                      : 'border-white/10 bg-white/5 hover:bg-white/10 text-gray-200')
                  }
                >
                  Last 12 months
                </button>
                <button
                  type="button"
                  onClick={() => setVerificationPeriod('ytd')}
                  className={
                    'text-xs px-2 py-1 rounded border ' +
                    (verificationPeriod === 'ytd'
                      ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
                      : 'border-white/10 bg-white/5 hover:bg-white/10 text-gray-200')
                  }
                >
                  YTD
                </button>
                <button
                  type="button"
                  onClick={() => setVerificationPeriod('custom')}
                  className={
                    'text-xs px-2 py-1 rounded border ' +
                    (verificationPeriod === 'custom'
                      ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
                      : 'border-white/10 bg-white/5 hover:bg-white/10 text-gray-200')
                  }
                  title="Use a custom date range"
                >
                  Custom
                </button>
                {verificationRange ? (
                  <div className="text-[11px] text-gray-400 ml-auto">
                    Range: {verificationRange.from} → {verificationRange.to}
                  </div>
                ) : null}
              </div>

              {/* Custom date range (same calendar UX as sales fetch) */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">From</label>
                  <input
                    type="date"
                    value={verificationFrom}
                    max={todayYmd}
                    onChange={(e) => {
                      let v = e.target.value;
                      if (v && v > todayYmd) v = todayYmd;
                      setVerificationPeriod('custom');
                      setVerificationFrom(v);
                      // Keep From <= To
                      if (v && verificationTo && v > verificationTo) setVerificationTo(v);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">To</label>
                  <input
                    type="date"
                    value={verificationTo}
                    max={todayYmd}
                    onChange={(e) => {
                      let v = e.target.value;
                      if (v && v > todayYmd) v = todayYmd;
                      setVerificationPeriod('custom');
                      setVerificationTo(v);
                      // Keep From <= To
                      if (v && verificationFrom && v < verificationFrom) setVerificationFrom(v);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>
              </div>

              {verificationCoverage ? (
                <div className="mt-2 text-xs text-gray-400">
                  Rows fetched: <span className="text-gray-200 font-semibold">{verificationCoverage.rows}</span> • Coverage:{' '}
                  <span className="text-gray-200 font-semibold">{verificationCoverage.earliest}</span> →{' '}
                  <span className="text-gray-200 font-semibold">{verificationCoverage.latest}</span>
                </div>
              ) : null}

              {verificationRows.length > 0 ? (
                <div className="mt-1 text-xs text-gray-400">
                  Status counts: <span className="text-gray-200 font-semibold">{verificationStatusTotals.COMPLETED}</span>{' '}
                  completed • <span className="text-gray-200 font-semibold">{verificationStatusTotals.AUTHFAILED}</span>{' '}
                  auth failed
                </div>
              ) : null}

              {verificationProgress && (
                <div className="mt-2 text-xs text-gray-400">
                  Fetching {verificationProgress.status} — page {verificationProgress.page} — rows {verificationProgress.totalRows}
                </div>
              )}

              {verificationMonths.length > 0 ? (
                <div className="mt-3">
                  <div className="text-xs text-gray-400 mb-2">Month-by-month</div>
                  {verificationLoading && verificationCoverage && verificationRange ? (
                    <div className="mb-2 text-xs text-yellow-200/90">
                      Loading is still in progress — months with no rows fetched yet will show <span className="font-semibold">—</span> until more pages are
                      fetched. Requested range: <span className="font-semibold">{verificationRange.from}</span> →{' '}
                      <span className="font-semibold">{verificationRange.to}</span>.
                    </div>
                  ) : null}
                  <div className="space-y-1 max-h-[240px] overflow-auto pr-1">
                    {verificationMonths
                      .slice()
                      .reverse()
                      .map((m) => {
                        const selected = selectedVerificationMonth === m.month;
                        const total = (m.success || 0) + (m.failed || 0);
                        const showLoadingPlaceholders = verificationLoading && total === 0;
                        return (
                          <button
                            key={m.month}
                            type="button"
                            onClick={() => setSelectedVerificationMonth((prev) => (prev === m.month ? null : m.month))}
                            className={
                              'w-full text-left rounded-lg border px-3 py-2 text-sm ' +
                              (selected
                                ? 'border-cyan-400/40 bg-cyan-500/10'
                                : 'border-white/10 bg-gray-950/30 hover:bg-white/5')
                            }
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-semibold text-gray-200">{fmtMonthYear(m.month)}</div>
                              <div className="text-gray-300 whitespace-nowrap">
                                <span className="text-gray-400">Success</span>{' '}
                                {showLoadingPlaceholders ? (
                                  <span className="inline-block w-6 text-center text-gray-500 animate-pulse">—</span>
                                ) : (
                                  m.success
                                )}{' '}
                                • <span className="text-gray-400">Failed</span>{' '}
                                {showLoadingPlaceholders ? (
                                  <span className="inline-block w-6 text-center text-gray-500 animate-pulse">—</span>
                                ) : (
                                  m.failed
                                )}{' '}
                                • <span className="text-gray-400">Fail</span>{' '}
                                {showLoadingPlaceholders ? (
                                  <span className="inline-block w-10 text-center text-gray-500 animate-pulse">—</span>
                                ) : (
                                  `${m.failureRate.toFixed(1)}%`
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-gray-400">Click “Load” to compute verification stats.</div>
              )}

              {verificationBrandsForSelectedMonth.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-gray-400 mb-2">
                    By brand (failure rate){selectedVerificationMonth ? ` — ${fmtMonthYear(selectedVerificationMonth)}` : ''}
                  </div>
                  <div className="overflow-auto rounded-lg border border-white/10 bg-gray-950/30">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-950/70 border-b border-white/10">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-300">Brand</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-gray-300">Success</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-gray-300">Failed</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-gray-300">Fail rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {verificationBrandsForSelectedMonth.slice(0, 15).map((b) => (
                          <tr key={b.brand} className="hover:bg-white/5">
                            <td className="px-3 py-2 text-gray-200">{b.brand}</td>
                            <td className="px-3 py-2 text-right text-gray-200">{b.success}</td>
                            <td className="px-3 py-2 text-right text-gray-200">{b.failed}</td>
                            <td className="px-3 py-2 text-right text-gray-200">{b.failureRate.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 text-[11px] text-gray-400">
                    Failure rate = failed / (success + failed). Profit metric: TBD.
                  </div>
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
                          <div className="text-xs text-gray-400">
                            {selectedPoint ? 'Click another point to change selection' : 'Click a point to see details'}
                          </div>
                        </div>

                        {selectedPoint ? (
                          <div className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-gray-200">{fmtMonthDay(selectedPoint.date)}</div>
                              <button
                                type="button"
                                onClick={() => setSelectedSalesDay(null)}
                                className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10 text-gray-200"
                                title="Clear selection"
                              >
                                Clear
                              </button>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                              <div>
                                <div className="text-xs text-gray-400">Total revenue</div>
                                <div className="font-semibold text-gray-200">{fmtMoney(selectedPoint.sales, totals.currency)}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-400">Items sold</div>
                                <div className="font-semibold text-gray-200">{selectedPoint.count}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-400">Profit</div>
                                <div className="font-semibold text-gray-200">TBD</div>
                              </div>
                            </div>
                          </div>
                        ) : null}

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

            <div className="p-4 border-b border-white/10">
              <div className="relative">
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  placeholder="Search by order #, product, size, brand, category, or status..."
                  className="w-full px-4 py-3 pl-12 rounded-lg bg-gray-900 border border-white/10 text-gray-200 placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all"
                />
                <svg
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {orderSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setOrderSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200 transition-colors"
                    title="Clear search"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {orderSearchQuery && (
                <p className="mt-2 text-sm text-gray-400">
                  Showing {displayedOrders.length} result{displayedOrders.length !== 1 ? 's' : ''} for "{orderSearchQuery}"
                </p>
              )}
            </div>

            <div
              className={`relative overflow-auto max-h-[55vh] ${
                displayedOrders.length === 0 ? 'min-h-[320px]' : ''
              }`}
            >
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
                        onClick={() => toggleSort('styleId', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by style ID"
                      >
                        Style ID
                        <span className="text-xs text-gray-400">{sortIndicator('styleId')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('brand', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by brand"
                      >
                        Brand
                        <span className="text-xs text-gray-400">{sortIndicator('brand')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('category', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by category"
                      >
                        Category
                        <span className="text-xs text-gray-400">{sortIndicator('category')}</span>
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
                        onClick={() => toggleSort('authStatus', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by authentication status"
                      >
                        Auth
                        <span className="text-xs text-gray-400">{sortIndicator('authStatus')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('failureNotes', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by failure notes"
                      >
                        Failure notes
                        <span className="text-xs text-gray-400">{sortIndicator('failureNotes')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('carrier', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by carrier"
                      >
                        Carrier
                        <span className="text-xs text-gray-400">{sortIndicator('carrier')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('tracking', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by tracking number"
                      >
                        Tracking
                        <span className="text-xs text-gray-400">{sortIndicator('tracking')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('shipBy', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by ship-by date"
                      >
                        Ship by
                        <span className="text-xs text-gray-400">{sortIndicator('shipBy')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('inventory', 'asc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by sale type"
                      >
                        Sale Type
                        <span className="text-xs text-gray-400">{sortIndicator('inventory')}</span>
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-300">
                      <button
                        type="button"
                        onClick={() => toggleSort('created', 'desc')}
                        className="inline-flex items-center gap-2 hover:text-white"
                        title="Sort by sale date"
                      >
                        Sale Date
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
                    const styleId = getRowStyleId(o) || '—';
                    const brand = getRowBrand(o) || '—';
                    const categoryRaw = getRowCategory(o);
                    const category = getRowCategoryLabel(o) || categoryRaw || '—';
                    const size = formatSizeLabel(String(o?.variant?.size || raw?.variant?.size || raw?.size || ''));
                    const created = o?.createdAt || raw?.createdAt;
                    const authStatus = getRowAuthStatus(o) || '—';
                    const authStatusRaw = getRowAuthStatusRaw(o);
                    const failureNotes = getRowFailureNotes(o) || '—';
                    const carrier = getRowCarrier(o) || '—';
                    const tracking = getRowTracking(o) || '—';
                    const shipBy = getRowShipByIso(o);
                    const inventoryType = getRowInventoryType(o) || '—';
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
                        <td className="px-4 py-3 text-gray-200" title={productName}>
                          <div
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {productName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-200">{styleId}</td>
                        <td className="px-4 py-3 text-gray-200">{brand}</td>
                        <td className="px-4 py-3 text-gray-200" title={categoryRaw || category}>
                          {category}
                        </td>
                        <td className="px-4 py-3 text-gray-200">{size}</td>
                        <td className="px-4 py-3 text-gray-200">{fmtMoney(sale, currency)}</td>
                        <td className="px-4 py-3 text-gray-200">{fmtMoney(fees, currency)}</td>
                        <td className="px-4 py-3 text-gray-200">
                          <div className="flex items-center gap-2">
                            <span>{fmtMoney(payout, currency)}</span>
                            {isProjected && <span className="text-[11px] text-gray-400">(proj)</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-200" title={authStatusRaw || authStatus}>
                          {authStatus}
                        </td>
                        <td className="px-4 py-3 text-gray-200" title={failureNotes}>
                          <div className="whitespace-nowrap truncate max-w-[260px]">{failureNotes}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-200">{carrier}</td>
                        <td className="px-4 py-3 text-gray-200">{tracking}</td>
                        <td className="px-4 py-3 text-gray-200">{fmtShortDate(shipBy)}</td>
                        <td className="px-4 py-3 text-gray-200">{inventoryType}</td>
                        <td className="px-4 py-3 text-gray-400">{fmtDate(created)}</td>
                      </tr>
                    );
                  })}

                  {/* Empty-state overlay is rendered outside the table so it stays centered within the visible viewport even when horizontally scrolled. */}
                </tbody>
              </table>

              {displayedOrders.length === 0 && (
                <div className="absolute inset-x-0 top-14 bottom-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-base font-medium text-gray-300">
                      {(() => {
                        const isLoading = loading || allLoading;
                        if (isLoading) {
                          // If we already loaded some rows but they're hidden by filters (common with DIDNOTSHIP),
                          // tell the user so it doesn't feel "stuck".
                          if (orders.length > 0) return `Loading… (${orders.length} rows loaded so far)`;
                          return 'Loading…';
                        }
                        if (orders.length === 0) return 'No orders loaded yet.';
                        return '0 rows shown (filters are hiding results).';
                      })()}
                    </div>
                    {!loading && !allLoading && orders.length === 0 && (
                      <div className="mt-1 text-sm text-gray-400">Click “Fetch for time period”.</div>
                    )}
                    {orders.length > 0 && (
                      <div className="mt-1 text-sm text-gray-400">
                        {(() => {
                          const didNotShipCount = orders.filter((r: any) => getRowStatus(r) === 'DIDNOTSHIP').length;
                          const nonDidNotShipCount = orders.length - didNotShipCount;
                          if (!showDidNotShip && didNotShipCount > 0 && nonDidNotShipCount === 0) {
                            return `You loaded ${didNotShipCount} DIDNOTSHIP row${didNotShipCount !== 1 ? 's' : ''}. Toggle “Show DIDNOTSHIP rows” to view them.`;
                          }
                          return 'Try adjusting Status filters / date range / search (or toggle “Show DIDNOTSHIP rows”).';
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div ref={detailsSectionRef} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
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


