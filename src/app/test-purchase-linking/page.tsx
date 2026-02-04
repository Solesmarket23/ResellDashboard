'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import NeonNotification, { type NotificationType } from '@/components/NeonNotification';
import StockXSalesImport from '@/components/StockXSalesImport';
import { Box, DollarSign, HandCoins, Hash, Link2, Mail, Ruler, Settings2, X } from 'lucide-react';

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

type SaleRow = {
  id: string;
  orderNumber?: string | null;
  product?: string | null;
  brand?: string | null;
  size?: string | null;
  styleId?: string | null;
  imageUrl?: string | null;
  salePrice?: number | null;
  fees?: number | null;
  payout?: number | null;
  purchasePrice?: number | null;
  profit?: number | null;
  linkedPurchaseId?: string | null;
  linkedPurchaseOrderNumber?: string | null;
  date?: string | null;
};

type PurchaseRow = {
  id: string;
  orderNumber?: string | null;
  purchaseDate?: string | null;
  purchase_date?: string | null;
  emailDate?: string | null;
  email_date?: string | null;
  createdAt?: string | null;
  totalAmount?: number | string | null;
  purchasePrice?: number | string | null;
  price?: string | null;
  unitNumber?: number | null;
  linkedSaleOrderNumber?: string | null;
  linkedSaleId?: string | null;
  styleId?: string | null;
  style_id?: string | null;
  size?: string | null;
  extracted_size?: string | null;
  product?: any;
  productImageUrl?: string | null;
  actualDelivery?: string | null;
};

function sanitizeUserId(raw: unknown): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  const lowered = v.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return '';
  return v;
}

function ymdToUtcMs(ymd: string): number | null {
  // Interpret YYYY-MM-DD as UTC midnight for stable bucketing.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const ms = Date.parse(`${ymd}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function clampYmdRange(startYmd: string, endYmd: string): { startMs: number; endMs: number } | null {
  const startMs = ymdToUtcMs(startYmd);
  const endMs = ymdToUtcMs(endYmd);
  if (startMs === null || endMs === null) return null;
  const a = Math.min(startMs, endMs);
  const b = Math.max(startMs, endMs);
  if (a === b) return { startMs: a, endMs: b };
  return { startMs: a, endMs: b };
}

function hashToUint32(s: string): number {
  // Simple deterministic hash
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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
  const apparelPrefixed = s.match(/^(?:US|U\.S\.)\s+(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL|OS|ONE SIZE)$/);
  if (apparelPrefixed) return apparelPrefixed[1];

  const isWomens = /\b(W|WMNS|WOMEN|WOMENS)\b/.test(s) || /\d+(?:\.\d+)?W\b/.test(s);
  const isYouth = /\b(Y|GS|GRADE SCHOOL)\b/.test(s) || /\d+(?:\.\d+)?Y\b/.test(s);

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

  if (apparel.has(stripped)) return stripped;

  const m = stripped.match(/(\d+(?:\.\d+)?)(?:\s*(W|Y))?/);
  if (m) {
    const num = m[1];
    const suffix = m[2] || (isWomens ? 'W' : isYouth ? 'Y' : '');
    return `${num}${suffix}`;
  }

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

function getPurchaseCost(p: PurchaseRow | null): number {
  if (!p) return 0;
  // Prefer netPaid (gross - credits) when present.
  const netPaid =
    (typeof (p as any).netPaid === 'number' && Number.isFinite((p as any).netPaid) ? (p as any).netPaid : parseMoney((p as any).netPaid)) ?? null;
  if (typeof netPaid === 'number' && Number.isFinite(netPaid) && netPaid > 0) return netPaid;
  // Prefer totalPayment when present (purchase price + fees + shipping, etc.)
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
      const priceFromString = parseMoney(p.price);
      return typeof priceFromString === 'number' && Number.isFinite(priceFromString) && priceFromString > 0 ? priceFromString : null;
    })();

  if (typeof base !== 'number') return 0;

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

  return 0;
}

function currency(n: number | null | undefined): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

function formatIsoToLocal(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // Use browser timezone; include short TZ name (e.g., ET).
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    }).format(d);
  } catch {
    return iso;
  }
}

function getLocalYearMonth(iso: string | null): { year: number; month: number } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() }; // local tz
}

function toCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Escape quotes by doubling them. Wrap in quotes if it contains comma, quote, or newline.
  const needsQuotes = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const lines: string[] = [];
  lines.push(headers.map(toCsvCell).join(','));
  for (const r of rows) {
    lines.push(headers.map((h) => toCsvCell((r as any)[h])).join(','));
  }
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getNetPayout(s: SaleRow | null): number {
  if (!s) return 0;
  const payout = typeof s.payout === 'number' && Number.isFinite(s.payout) ? s.payout : null;
  if (typeof payout === 'number') return payout;
  const sale = typeof s.salePrice === 'number' && Number.isFinite(s.salePrice) ? s.salePrice : 0;
  const fees = typeof s.fees === 'number' && Number.isFinite(s.fees) ? s.fees : 0;
  return sale - fees;
}

function getTotalPaid(s: SaleRow | null): number {
  if (!s) return 0;
  const paid = typeof s.purchasePrice === 'number' && Number.isFinite(s.purchasePrice) ? s.purchasePrice : 0;
  return paid;
}

function hasKnownTotalPaid(s: SaleRow | null): boolean {
  if (!s) return false;
  // Treat 0 / null as "unknown" for UI purposes (you don't pay $0 for inventory)
  return typeof s.purchasePrice === 'number' && Number.isFinite(s.purchasePrice) && s.purchasePrice > 0;
}

function getProfitNetPayoutMinusPaid(s: SaleRow | null): number {
  if (!s) return 0;
  return getNetPayout(s) - getTotalPaid(s);
}

export default function TestPurchaseLinkingPage() {
  const { user } = useAuth();
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name === 'Neon';
  const headerIconClass = isNeon ? 'text-cyan-400' : 'text-blue-600';
  const headerTextClass = isNeon ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700';

  // Test-only: simulate actualDelivery for purchases that don't have it (for FIFO experiments)
  const todayYmd = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [simulateMissingDeliveries, setSimulateMissingDeliveries] = useState(false);
  const [simFromYmd, setSimFromYmd] = useState('2025-10-01');
  const [simToYmd, setSimToYmd] = useState(todayYmd);

  const [stockxAuth, setStockxAuth] = useState<{
    state: 'loading' | 'connected' | 'disconnected' | 'warning';
    message?: string;
  }>({ state: 'loading' });

  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: NotificationType;
    durationMs?: number;
  }>({ isVisible: false, message: '', type: 'success', durationMs: 12000 });

  const showNotice = useCallback((message: string, type: NotificationType | 'info', durationMs?: number) => {
    const normalizedType: NotificationType = type === 'info' ? 'success' : type;
    setNotification({ isVisible: true, message, type: normalizedType, durationMs });
  }, []);

  const LOCALHOST_DEFAULT_USER_ID = '20115098dd871b0a7863cd1017fa';

  const resolveUserId = useCallback((): string => {
    const siteUserId =
      typeof window !== 'undefined'
        ? sanitizeUserId(localStorage.getItem('siteUserId') || localStorage.getItem('site-user-id') || '')
        : '';

    // Dev convenience: when running locally and no auth/cookie/localStorage user is present,
    // default to the primary test account so FIFO/testing "just works".
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const isLocalhost = host === 'localhost' || host === '127.0.0.1';
      if (process.env.NODE_ENV === 'development' && isLocalhost && !user?.uid && !siteUserId) {
        return LOCALHOST_DEFAULT_USER_ID;
      }
    }

    return sanitizeUserId(user?.uid || siteUserId || '');
  }, [user?.uid]);

  const [userId, setUserId] = useState('');

  const detectUserIdFromServer = useCallback(async () => {
    try {
      // 1) Try the dedicated endpoint (cookie-based)
      {
        const resp = await fetch('/api/whoami', { cache: 'no-store' });
        const json = await resp.json().catch(() => ({}));
        const detected = sanitizeUserId(json?.userId);
        if (detected) {
          setUserId(detected);
          showNotice(`✅ Detected userId from cookies: ${detected.slice(0, 10)}…`, 'success');
          return;
        }
      }

      // 2) Fallback: purchases endpoint can infer cookie userId and returns it in the payload
      {
        const resp = await fetch('/api/purchases/list', { cache: 'no-store' });
        const json = await resp.json().catch(() => ({}));
        const detected = sanitizeUserId(json?.userId);
        if (resp.ok && detected) {
          setUserId(detected);
          showNotice(`✅ Detected userId via purchases cookies: ${detected.slice(0, 10)}…`, 'success');
          return;
        }
      }

      // 3) Fallback: sales endpoint can infer cookie userId (after our fix) and returns it in the payload
      {
        const resp = await fetch('/api/sales/list?limit=1', { cache: 'no-store' });
        const json = await resp.json().catch(() => ({}));
        const detected = sanitizeUserId(json?.userId);
        if (resp.ok && detected) {
          setUserId(detected);
          showNotice(`✅ Detected userId via sales cookies: ${detected.slice(0, 10)}…`, 'success');
          return;
        }
      }

      showNotice(
        '⚠️ Could not detect userId from cookies on this domain. Paste your siteUserId (hex string) into the box.',
        'warning'
      );
    } catch {
      showNotice('❌ Detect ID failed (network/server error). Try refreshing and clicking again.', 'error');
    }
  }, [showNotice]);

  useEffect(() => {
    const resolved = resolveUserId();
    if (resolved) {
      setUserId(resolved);
      return;
    }
    // On trycloudflare domains, localStorage usually won't have siteUserId.
    // Fall back to cookie-based detection.
    detectUserIdFromServer();
  }, [detectUserIdFromServer, resolveUserId]);

  const refreshStockxAuthStatus = useCallback(async () => {
    try {
      setStockxAuth({ state: 'loading' });
      const resp = await fetch('/api/stockx/auth/status', { cache: 'no-store', credentials: 'include' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStockxAuth({ state: 'warning', message: json?.message || `Status check failed (${resp.status})` });
        return;
      }
      if (json?.isAuthenticated === true) {
        // Some responses can be {isAuthenticated:true, verified:false, warning:true}
        if (json?.warning || json?.verified === false) {
          setStockxAuth({ state: 'warning', message: json?.message || 'Connected, but verification failed.' });
        } else {
          setStockxAuth({ state: 'connected', message: json?.message || 'Connected' });
        }
        return;
      }
      setStockxAuth({ state: 'disconnected', message: json?.message || 'Not connected' });
    } catch (e: any) {
      setStockxAuth({ state: 'warning', message: e?.message || 'Failed to check StockX connection' });
    }
  }, []);

  useEffect(() => {
    refreshStockxAuthStatus();
  }, [refreshStockxAuthStatus]);

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  const [saleSearch, setSaleSearch] = useState('');
  const [purchaseSearch, setPurchaseSearch] = useState('');

  const filteredSales = useMemo(() => {
    const q = saleSearch.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((s) => {
      const fields = [s.orderNumber, s.product, s.brand, s.size, s.styleId].map((x) => String(x || '').toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [saleSearch, sales]);

  const filteredPurchases = useMemo(() => {
    const q = purchaseSearch.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((p) => {
      const fields = [
        p.orderNumber,
        p.id,
        p.styleId,
        p.style_id,
        p.size,
        p.extracted_size,
        p.unitNumber ? `unit ${p.unitNumber}` : null
      ].map((x) => String(x || '').toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [purchaseSearch, purchases]);

  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const selectedSale = useMemo(() => sales.find((s) => s.id === selectedSaleId) || null, [sales, selectedSaleId]);

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>('');
  const selectedPurchase = useMemo(
    () => purchases.find((p) => p.id === selectedPurchaseId) || null,
    [purchases, selectedPurchaseId]
  );

  const loadSales = useCallback(async (opts?: { silent?: boolean }) => {
    const u = userId.trim();
    if (!u) {
      if (!opts?.silent) showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
      return;
    }
    setLoadingSales(true);
    try {
      // The sales list endpoint is paginated and has a server-side max limit.
      // Bump this so "Loaded N sales" isn't confusingly stuck at 50 for most users.
      const qs = new URLSearchParams({ userId: u, limit: '1000' });
      const resp = await fetch(`/api/sales/list?${qs.toString()}`, { cache: 'no-store' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) {
        throw new Error(json?.error || `Failed to load sales (${resp.status})`);
      }
      const rows: SaleRow[] = Array.isArray(json?.sales)
        ? json.sales.map((x: any) => ({
            id: String(x.id),
            orderNumber: x.orderNumber ? String(x.orderNumber) : null,
            product: x.product ? String(x.product) : null,
            brand: x.brand ? String(x.brand) : null,
            size: x.size ? String(x.size) : null,
            styleId: x.styleId ? String(x.styleId) : null,
            imageUrl: x.imageUrl ? String(x.imageUrl) : null,
            salePrice: typeof x.salePrice === 'number' ? x.salePrice : Number(x.salePrice) || null,
            fees: typeof x.fees === 'number' ? x.fees : Number(x.fees) || null,
            payout: typeof x.payout === 'number' ? x.payout : Number(x.payout) || null,
            purchasePrice: typeof x.purchasePrice === 'number' ? x.purchasePrice : Number(x.purchasePrice) || null,
            profit: typeof x.profit === 'number' ? x.profit : Number(x.profit) || null,
            linkedPurchaseId: x.linkedPurchaseId ? String(x.linkedPurchaseId) : null,
            linkedPurchaseOrderNumber: x.linkedPurchaseOrderNumber ? String(x.linkedPurchaseOrderNumber) : null,
            date: x.date ? String(x.date) : null
          }))
        : [];
      setSales(rows);
      if (!opts?.silent) showNotice(`✅ Loaded ${rows.length} sale(s)${json?.nextCursorId ? ' (more available)' : ''}.`, 'success');
    } catch (e: any) {
      if (!opts?.silent) showNotice(`❌ Failed to load sales: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLoadingSales(false);
    }
  }, [selectedSaleId, showNotice, userId]);

  const loadPurchases = useCallback(async (opts?: { silent?: boolean }) => {
    const u = userId.trim();
    if (!u) {
      if (!opts?.silent) showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
      return;
    }
    setLoadingPurchases(true);
    try {
      const qs = new URLSearchParams({ userId: u });
      const resp = await fetch(`/api/purchases/list?${qs.toString()}`, { cache: 'no-store' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error || json?.message || `Failed to load purchases (${resp.status})`);
      }
      const rows: PurchaseRow[] = Array.isArray(json?.purchases)
        ? json.purchases.map((x: any) => ({
            ...x,
            id: String(x.id),
            orderNumber: x.orderNumber ? String(x.orderNumber) : null
          }))
        : [];
      setPurchases(rows);
      if (!opts?.silent) showNotice(`✅ Loaded ${rows.length} purchase(s).`, 'success');
    } catch (e: any) {
      if (!opts?.silent) showNotice(`❌ Failed to load purchases: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLoadingPurchases(false);
    }
  }, [selectedPurchaseId, showNotice, userId]);

  useEffect(() => {
    // Convenience: load both once if userId exists
    if (userId) {
      loadSales();
      loadPurchases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // FIFO profit using existing debug endpoint (now supports committed-profit windows + status filtering)
  const [fifoLoading, setFifoLoading] = useState(false);
  const [fifoSummary, setFifoSummary] = useState<any | null>(null);
  const [fifoRows, setFifoRows] = useState<any[]>([]);
  // Default OFF: until `actualDelivery` is reliably populated, strict delivery causes lots of false no_match.
  const [fifoStrictDelivery, setFifoStrictDelivery] = useState(false);
  const [fifoUnlinkedOnly, setFifoUnlinkedOnly] = useState(false);
  const [fifoIncludePending, setFifoIncludePending] = useState(true);
  const [cogsMethod, setCogsMethod] = useState<'fifo' | 'lifo'>('fifo');
  const [fifoMatchMode, setFifoMatchMode] = useState<'product_name' | 'two_keys' | 'full'>('product_name');
  const [fifoInventoryStartMode, setFifoInventoryStartMode] = useState<'none' | 'first_purchase'>('first_purchase');
  const [fifoSandboxWindowOnly, setFifoSandboxWindowOnly] = useState(false);
  const [fifoSalesAllocationStartYmd, setFifoSalesAllocationStartYmd] = useState<string>('2025-01-01');
  const [fifoPurchaseStartYmd, setFifoPurchaseStartYmd] = useState<string>('2024-11-01');
  const [fifoUsePurchaseLookback, setFifoUsePurchaseLookback] = useState(true);
  const [fifoPurchaseLookbackDays, setFifoPurchaseLookbackDays] = useState(60);
  const [comparingModes, setComparingModes] = useState(false);
  const [fifoCompare, setFifoCompare] = useState<null | {
    a: { matchMode: 'product_name' | 'two_keys' | 'full'; summary: any | null };
    b: { matchMode: 'product_name' | 'two_keys' | 'full'; summary: any | null };
  }>(null);
  const [fifoWindowPreset, setFifoWindowPreset] = useState<'this_month' | 'today' | 'custom'>('this_month');
  const [fifoCustomFromYmd, setFifoCustomFromYmd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [fifoCustomToYmd, setFifoCustomToYmd] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [showRawSalesTable, setShowRawSalesTable] = useState(false);
  const fifoResultsAnchorId = 'fifo-results-anchor';
  const [fifoTablePage, setFifoTablePage] = useState(1);
  const [fifoRowsPerPage, setFifoRowsPerPage] = useState<number | 'all'>(50);
  const [fifoShowNoMatchOnly, setFifoShowNoMatchOnly] = useState(false);
  const [refreshingStockX, setRefreshingStockX] = useState(false);
  const [lastStockXRefresh, setLastStockXRefresh] = useState<any | null>(null);
  const [backfillingSalesIds, setBackfillingSalesIds] = useState(false);
  const [lastSalesIdBackfill, setLastSalesIdBackfill] = useState<any | null>(null);
  const [salesIdBackfillCursorId, setSalesIdBackfillCursorId] = useState<string>('');
  const [autoFixingIds, setAutoFixingIds] = useState(false);
  const autoFixStopRef = useRef(false);
  const [autoFixLogs, setAutoFixLogs] = useState<
    Array<{
      atIso: string;
      updated: number;
      embeddedUpdated: number;
      legacyUpdated: number;
      remoteAttempted: number;
      failed: number;
      statusCounts: Record<string, number>;
      stoppedEarlyReason?: string | null;
      nextCursorId?: string | null;
    }>
  >([]);
  const [debugOrderNumbersCsv, setDebugOrderNumbersCsv] = useState<string>('72881685, 73038625, 73123272');
  const [debuggingOrders, setDebuggingOrders] = useState(false);

  const monthOptions = useMemo(
    () => [
      { label: 'Jan', value: 0 },
      { label: 'Feb', value: 1 },
      { label: 'Mar', value: 2 },
      { label: 'Apr', value: 3 },
      { label: 'May', value: 4 },
      { label: 'Jun', value: 5 },
      { label: 'Jul', value: 6 },
      { label: 'Aug', value: 7 },
      { label: 'Sep', value: 8 },
      { label: 'Oct', value: 9 },
      { label: 'Nov', value: 10 },
      { label: 'Dec', value: 11 }
    ],
    []
  );

  const defaultYear = useMemo(() => new Date().getFullYear(), []);
  const defaultMonth = useMemo(() => new Date().getMonth(), []);
  const yearOptions = useMemo(() => {
    // Always show a few sensible years, even before we have any FIFO rows.
    const base = [defaultYear, defaultYear - 1, defaultYear - 2, defaultYear - 3];
    const fromRows = new Set<number>();
    for (const r of fifoRows) {
      const ym = getLocalYearMonth(typeof r?.saleCutoffIso === 'string' ? r.saleCutoffIso : null);
      if (ym) fromRows.add(ym.year);
    }
    return Array.from(new Set([...fromRows, ...base])).sort((a, b) => b - a);
  }, [defaultYear, fifoRows]);

  const [fifoSelectedYear, setFifoSelectedYear] = useState<number>(defaultYear);
  const [fifoSelectedMonth, setFifoSelectedMonth] = useState<number>(defaultMonth); // 0-11

  // FIFO API now returns ONLY the selected window’s rows (today/month/custom),
  // so profit totals should be computed over all returned rows (no extra month/year filtering here).
  const fifoRowsForProfit = useMemo(() => {
    return fifoRows.filter((r) => r?.status === 'would_link' || r?.status === 'already_linked');
  }, [fifoRows]);

  const fifoProfitTotals = useMemo(() => {
    let count = 0;
    let netPayout = 0;
    let totalPaid = 0;
    let profit = 0;
    for (const r of fifoRowsForProfit) {
      const n = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      const np = n(r?.saleNetPayout) ?? null;
      const paid = n(r?.purchaseCost) ?? null;
      const p = n(r?.profit) ?? (np !== null && paid !== null ? np - paid : null);
      if (np === null || paid === null || p === null) continue;
      count++;
      netPayout += np;
      totalPaid += paid;
      profit += p;
    }
    return { count, netPayout, totalPaid, profit };
  }, [fifoRowsForProfit]);

  const fifoMetrics = useMemo(() => {
    const n = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const ms = (v: any): number | null => {
      if (typeof v !== 'string' || !v) return null;
      const t = Date.parse(v);
      return Number.isFinite(t) ? t : null;
    };
    const safeDiv = (a: number, b: number): number | null => (b === 0 ? null : a / b);

    // Consider all FIFO rows for the selected period that represent a match (linked or would-link),
    // and have the $ fields we need for meaningful metrics.
    let count = 0;
    let netPayoutSum = 0;
    let paidSum = 0;
    let profitSum = 0;
    let roiSum = 0;
    let roiCount = 0;
    let marginSum = 0;
    let marginCount = 0;
    let daysSum = 0;
    let daysCount = 0;

    let profitable = 0;
    let unprofitable = 0;

    for (const r of fifoRowsForProfit) {
      const netPayout = n(r?.saleNetPayout);
      const paid = n(r?.purchaseCost);
      const profit = n(r?.profit) ?? (netPayout !== null && paid !== null ? netPayout - paid : null);
      if (netPayout === null || paid === null || profit === null) continue;

      count += 1;
      netPayoutSum += netPayout;
      paidSum += paid;
      profitSum += profit;

      if (profit >= 0) profitable += 1;
      else unprofitable += 1;

      const roi = safeDiv(profit, paid);
      if (roi !== null) {
        roiSum += roi;
        roiCount += 1;
      }

      const margin = safeDiv(profit, netPayout);
      if (margin !== null) {
        marginSum += margin;
        marginCount += 1;
      }

      const saleMs = ms((r as any)?.saleCutoffIso);
      const purchaseMs = ms((r as any)?.purchaseFifoIso);
      if (saleMs !== null && purchaseMs !== null) {
        const days = (saleMs - purchaseMs) / (1000 * 60 * 60 * 24);
        if (Number.isFinite(days)) {
          daysSum += days;
          daysCount += 1;
        }
      }
    }

    const avgProfit = safeDiv(profitSum, count);
    const avgNetPayout = safeDiv(netPayoutSum, count);
    const avgPaid = safeDiv(paidSum, count);
    const overallRoi = safeDiv(profitSum, paidSum); // ROI based on totals
    const avgRoi = roiCount ? roiSum / roiCount : null; // average of per-row ROI
    const avgMargin = marginCount ? marginSum / marginCount : null; // profit/net payout
    const avgDays = daysCount ? daysSum / daysCount : null;

    return {
      count,
      netPayoutSum,
      paidSum,
      profitSum,
      profitable,
      unprofitable,
      avgProfit,
      avgNetPayout,
      avgPaid,
      overallRoi,
      avgRoi,
      avgMargin,
      avgDays,
    };
  }, [fifoRowsForProfit]);

  const exportFifoCsv = useCallback(() => {
    if (typeof window === 'undefined') return;
    const monthLabel = monthOptions[fifoSelectedMonth]?.label || String(fifoSelectedMonth + 1);
    const filename =
      fifoWindowPreset === 'today'
        ? `fifo-committed-today-${new Date().toISOString().slice(0, 10)}.csv`
        : fifoWindowPreset === 'custom'
          ? `fifo-committed-${fifoCustomFromYmd}-to-${fifoCustomToYmd}.csv`
          : `fifo-committed-${fifoSelectedYear}-${monthLabel}.csv`;
    const safeFilename = filename.replace(/\s+/g, '-');

    const rows = fifoRows.map((r: any) => ({
      saleOrderNumber: r.saleOrderNumber ?? '',
      saleProduct: r.saleProduct ?? '',
      saleSize: r.saleSize ?? '',
      saleStyleId: r.saleStyleId ?? '',
      saleDateIso: r.saleCutoffIso ?? '',
      saleDateLocal: formatIsoToLocal(typeof r.saleCutoffIso === 'string' ? r.saleCutoffIso : null),
      salePrice: r.salePrice ?? '',
      saleFees: r.saleFees ?? '',
      saleNetPayout: r.saleNetPayout ?? '',
      purchaseOrderNumber: r.linkedPurchaseOrderNumber ?? '',
      purchaseStyleId: r.linkedPurchaseStyleId ?? '',
      purchaseAvailableIso: r.purchaseFifoIso ?? '',
      purchaseAvailableSource: r.purchaseFifoSource ?? '',
      purchaseActualDelivery: r.purchaseActualDelivery ?? '',
      purchaseCost: r.purchaseCost ?? '',
      profit: r.profit ?? '',
      status: r.status ?? '',
      method: r.method ?? '',
      reason: r.reason ?? ''
    }));

    downloadCsv(safeFilename, rows);
    showNotice(`✅ Exported CSV (${rows.length} row${rows.length === 1 ? '' : 's'}).`, 'success');
  }, [fifoCustomFromYmd, fifoCustomToYmd, fifoRows, fifoSelectedMonth, fifoSelectedYear, fifoWindowPreset, monthOptions, showNotice]);

  const fifoNoMatchBreakdown = useMemo(() => {
    const byReason = new Map<string, number>();
    let totalNoMatch = 0;
    let missingStyleId = 0;
    let missingSize = 0;
    let noPurchaseCandidates = 0;
    let noEligiblePurchase = 0;
    let other = 0;

    for (const r of fifoRows) {
      if (r?.status !== 'no_match') continue;
      totalNoMatch += 1;
      const reason = String(r?.reason || 'unknown');
      byReason.set(reason, (byReason.get(reason) || 0) + 1);

      if (reason.startsWith('missing_sale_styleId')) missingStyleId += 1;
      else if (reason === 'missing_sale_size') missingSize += 1;
      else if (reason === 'no_purchase_candidates') noPurchaseCandidates += 1;
      else if (reason === 'no_eligible_purchase') noEligiblePurchase += 1;
      else other += 1;
    }

    const topReasons = Array.from(byReason.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([reason, count]) => ({ reason, count }));

    return {
      totalNoMatch,
      topReasons,
      stats: { missingStyleId, missingSize, noPurchaseCandidates, noEligiblePurchase, other },
    };
  }, [fifoRows]);

  const filteredFifoRows = useMemo(() => {
    const q = saleSearch.trim().toLowerCase();
    let base = fifoRows;
    if (fifoShowNoMatchOnly) base = base.filter((r: any) => r?.status === 'no_match');
    if (!q) return base;
    return base.filter((r: any) => {
      const fields = [
        r?.saleOrderNumber,
        r?.saleProduct,
        r?.saleSize,
        r?.saleStyleId,
        r?.linkedPurchaseOrderNumber,
        r?.linkedPurchaseStyleId,
        r?.method,
        r?.reason,
        r?.status
      ]
        .map((x: any) => String(x || '').toLowerCase())
        .filter(Boolean);
      return fields.some((f: string) => f.includes(q));
    });
  }, [fifoRows, fifoShowNoMatchOnly, saleSearch]);

  // Reset to page 1 when filters/results/page-size change.
  useEffect(() => {
    setFifoTablePage(1);
  }, [saleSearch, fifoRows, fifoRowsPerPage]);

  const fifoPagination = useMemo(() => {
    const total = filteredFifoRows.length;
    const perPage = fifoRowsPerPage === 'all' ? total : fifoRowsPerPage;
    const pages = perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1;
    const page = Math.min(Math.max(1, fifoTablePage), pages);
    const start = (page - 1) * perPage;
    const end = fifoRowsPerPage === 'all' ? total : Math.min(total, start + perPage);
    return { total, perPage, pages, page, start, end };
  }, [filteredFifoRows.length, fifoRowsPerPage, fifoTablePage]);

  const visibleFifoRows = useMemo(() => {
    if (fifoRowsPerPage === 'all') return filteredFifoRows;
    return filteredFifoRows.slice(fifoPagination.start, fifoPagination.end);
  }, [filteredFifoRows, fifoPagination.end, fifoPagination.start, fifoRowsPerPage]);
  const runFifoDryRun = useCallback(async () => {
    const u = userId.trim();
    if (!u) return;
    setFifoLoading(true);
    setFifoSummary(null);
    setFifoRows([]);
    // #region agent log
    __agentLog({
      runId: 'pre-fix',
      hypothesisId: 'H4',
      location: 'test-purchase-linking/page.tsx:runFifoDryRun:start',
      message: 'runFifoDryRun start',
      data: {
        userIdMasked: __agentMask(u),
        strictDelivery: fifoStrictDelivery,
        includePending: fifoIncludePending,
        cogsMethod,
        preset: fifoWindowPreset
      }
    });
    // #endregion
    try {
      const ymdLocal = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      // Window is [startMs, endMs) in local time.
      const now = new Date();
      const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
      const todayEndMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0).getTime();

      const monthStartMs = new Date(fifoSelectedYear, fifoSelectedMonth, 1, 0, 0, 0, 0).getTime();
      const monthEndMs = new Date(fifoSelectedYear, fifoSelectedMonth + 1, 1, 0, 0, 0, 0).getTime();

      const parseLocalYmdStartMs = (ymd: string): number | null => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
        const [yy, mm, dd] = ymd.split('-').map((x) => parseInt(x, 10));
        if (!yy || !mm || !dd) return null;
        return new Date(yy, mm - 1, dd, 0, 0, 0, 0).getTime();
      };

      const customStartMs = parseLocalYmdStartMs(fifoCustomFromYmd);
      const customEndMs = (() => {
        const base = parseLocalYmdStartMs(fifoCustomToYmd);
        return base === null ? null : base + 86400000;
      })();

      const saleWindow =
        fifoWindowPreset === 'today'
          ? { startMs: todayStartMs, endMs: todayEndMs }
          : fifoWindowPreset === 'custom'
            ? (customStartMs !== null && customEndMs !== null && customEndMs > customStartMs
                ? { startMs: customStartMs, endMs: customEndMs }
                : null)
            : { startMs: monthStartMs, endMs: monthEndMs };

      const computedPurchaseStartMs = (() => {
        if (!saleWindow) return null;
        if (!fifoUsePurchaseLookback) return null;
        const days = Number(fifoPurchaseLookbackDays);
        if (!Number.isFinite(days) || days <= 0) return null;
        return saleWindow.startMs - Math.floor(days) * 86400000;
      })();

      // Keep the year/month picker in sync with presets (helps CSV naming + profit table filter).
      if (fifoWindowPreset === 'today') {
        setFifoSelectedYear(now.getFullYear());
        setFifoSelectedMonth(now.getMonth());
        setFifoCustomFromYmd(ymdLocal(now));
        setFifoCustomToYmd(ymdLocal(now));
      }

      const qs = new URLSearchParams({
        userId: u,
        // For month profit totals, you typically want *all* sales (linked + unlinked).
        unlinkedOnly: fifoUnlinkedOnly ? 'true' : '0',
        limitSales: '5000',
        scanLimit: '20000',
        // strictDelivery=1 means only purchases with actualDelivery are eligible.
        strictDelivery: fifoStrictDelivery ? '1' : '0',
        // includePending=1 includes active/pending/shipped/auth/etc. (excludes known non-sales like CANCELED/AUTHFAILED).
        includePending: fifoIncludePending ? '1' : '0',
        cogsMethod,
        matchMode: fifoMatchMode,
        inventoryStartMode: fifoInventoryStartMode,
        // Sandbox: allocate only the selected window's sales (not FIFO-correct, but great for validating matching)
        allocationMode: fifoSandboxWindowOnly ? 'window_only' : 'full',
      });
      const purchaseStartMs = computedPurchaseStartMs ?? parseLocalYmdStartMs(fifoPurchaseStartYmd);
      const salesAllocationStartMs = parseLocalYmdStartMs(fifoSalesAllocationStartYmd);
      if (purchaseStartMs !== null) qs.set('purchaseStartMs', String(purchaseStartMs));
      if (salesAllocationStartMs !== null) qs.set('salesAllocationStartMs', String(salesAllocationStartMs));
      if (saleWindow) {
        qs.set('saleStartMs', String(saleWindow.startMs));
        qs.set('saleEndMs', String(saleWindow.endMs));
      }
      const resp = await fetch(`/api/purchase-linking/fifo-dry-run?${qs.toString()}`, {
        cache: 'no-store',
        headers: { 'x-user-id': u }
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Dry run failed (${resp.status})`);
      setFifoSummary(json.summary || null);
      setFifoRows(Array.isArray(json.results) ? json.results : []);
      const summary = json.summary || null;
      const scanned = typeof summary?.totalSalesScanned === 'number' ? summary.totalSalesScanned : null;
      const wouldLink = typeof summary?.wouldLink === 'number' ? summary.wouldLink : null;
      const noMatch = typeof summary?.noMatch === 'number' ? summary.noMatch : null;
      const alreadyLinked = typeof summary?.alreadyLinked === 'number' ? summary.alreadyLinked : null;
      const pdbg = summary?.purchasesDebug || null;
      const slugAttemptsUrlKey = typeof pdbg?.slugAttemptsUrlKey === 'number' ? pdbg.slugAttemptsUrlKey : null;
      const slugAttemptsProductName = typeof pdbg?.slugAttemptsProductName === 'number' ? pdbg.slugAttemptsProductName : null;
      const slugSuccessUrlKey = typeof pdbg?.slugSuccessUrlKey === 'number' ? pdbg.slugSuccessUrlKey : null;
      const slugSuccessProductName = typeof pdbg?.slugSuccessProductName === 'number' ? pdbg.slugSuccessProductName : null;
      // #region agent log
      try {
        const top = Array.isArray(summary?.allocated?.noMatchTopReasons) ? summary.allocated.noMatchTopReasons : [];
        const compact = top.slice(0, 6).map((r: any) => {
          const samples = Array.isArray(r?.samples) ? r.samples : [];
          const sourceCounts: Record<string, number> = {};
          for (const s of samples) {
            const src = String(s?.saleSource || 'unknown');
            sourceCounts[src] = (sourceCounts[src] || 0) + 1;
          }
          return {
            reason: String(r?.reason || 'unknown'),
            count: Number(r?.count || 0),
            sampleSourceCounts: sourceCounts,
            sample0: samples[0]
              ? {
                  orderMasked: __agentMask(samples[0]?.saleOrderNumber),
                  styleIdPresent: !!String(samples[0]?.saleStyleId || '').trim(),
                  sizeRaw: String(samples[0]?.saleSize || ''),
                  source: String(samples[0]?.saleSource || ''),
                  nameMatchMode: String(samples[0]?.nameMatchMode || ''),
                  nameCandidatesTotal: samples[0]?.nameCandidatesTotal ?? null,
                  exactNameCandidatesTotal: samples[0]?.exactNameCandidatesTotal ?? null,
                  nameSkippedAfter: samples[0]?.nameCandidatesSkippedAfterSaleDate ?? null,
                  nameSkippedUsed: samples[0]?.nameCandidatesSkippedUsed ?? null,
                  exactNameKey: typeof samples[0]?.exactNameKey === 'string' ? String(samples[0].exactNameKey).slice(0, 80) : null,
                  earliestCandIso: samples[0]?.exactNameEarliestCandidateIso ?? null,
                  earliestCandSource: samples[0]?.exactNameEarliestCandidateSource ?? null,
                  saleCutoffIso: samples[0]?.exactNameSaleCutoffIso ?? null,
                  saleCutoffSource: samples[0]?.exactNameSaleCutoffSource ?? null,
                  candDateSources: samples[0]?.exactNameCandidateDateSources ?? null
                }
              : null
          };
        });
        __agentLog({
          runId: 'pre-fix',
          hypothesisId: 'H5',
          location: 'test-purchase-linking/page.tsx:runFifoDryRun:allocatedTopReasons',
          message: 'allocated no_match top reasons (with sample sources)',
          data: { allocatedNoMatch: summary?.allocated?.noMatch ?? null, top: compact }
        });
      } catch {
        // ignore
      }
      // #endregion
      // #region agent log
      __agentLog({
        runId: 'pre-fix',
        hypothesisId: 'H4',
        location: 'test-purchase-linking/page.tsx:runFifoDryRun:ok',
        message: 'runFifoDryRun success',
        data: {
          scanned,
          wouldLink,
          noMatch,
          alreadyLinked,
          allocatedNoMatch: summary?.allocated?.noMatch ?? null,
          slugAttemptsUrlKey,
          slugAttemptsProductName,
          slugSuccessUrlKey,
          slugSuccessProductName,
          matchMode: fifoMatchMode,
          matchesByStyleId: typeof pdbg?.matchesByStyleId === 'number' ? pdbg.matchesByStyleId : null,
          matchesByUrlKey: typeof pdbg?.matchesByUrlKey === 'number' ? pdbg.matchesByUrlKey : null,
          matchesByName: typeof pdbg?.matchesByName === 'number' ? pdbg.matchesByName : null
        }
      });
      // #endregion
      showNotice(
        `✅ FIFO profit computed${scanned !== null ? ` — scanned=${scanned}` : ''}${wouldLink !== null ? ` • matched=${wouldLink}` : ''}${noMatch !== null ? ` • noMatch=${noMatch}` : ''}${alreadyLinked !== null ? ` • alreadyLinked=${alreadyLinked}` : ''}`,
        'success'
      );

      // Scroll to results so it's obvious something happened.
      window.setTimeout(() => {
        const el = document.getElementById(fifoResultsAnchorId);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch (e: any) {
      // #region agent log
      __agentLog({
        runId: 'pre-fix',
        hypothesisId: 'H4',
        location: 'test-purchase-linking/page.tsx:runFifoDryRun:error',
        message: 'runFifoDryRun error',
        data: { error: String(e?.message || e || 'unknown') }
      });
      // #endregion
      showNotice(`❌ FIFO profit failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setFifoLoading(false);
    }
  }, [
    cogsMethod,
    fifoCustomFromYmd,
    fifoCustomToYmd,
    fifoIncludePending,
    fifoInventoryStartMode,
    fifoMatchMode,
    fifoPurchaseStartYmd,
    fifoPurchaseLookbackDays,
    fifoUsePurchaseLookback,
    fifoSalesAllocationStartYmd,
    fifoSandboxWindowOnly,
    fifoSelectedMonth,
    fifoSelectedYear,
    fifoStrictDelivery,
    fifoUnlinkedOnly,
    fifoWindowPreset,
    showNotice,
    userId
  ]);

  const compareFifoMatchModes = useCallback(async () => {
    const u = userId.trim();
    if (!u) {
      showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
      return;
    }
    setComparingModes(true);
    try {
      const eventRunId = `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      // Keep window logic consistent with Compute FIFO profit.
      const now = new Date();
      const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
      const todayEndMs = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0).getTime();

      const monthStartMs = new Date(fifoSelectedYear, fifoSelectedMonth, 1, 0, 0, 0, 0).getTime();
      const monthEndMs = new Date(fifoSelectedYear, fifoSelectedMonth + 1, 1, 0, 0, 0, 0).getTime();

      const parseLocalYmdStartMs = (ymd: string): number | null => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
        const [yy, mm, dd] = ymd.split('-').map((x) => parseInt(x, 10));
        if (!yy || !mm || !dd) return null;
        return new Date(yy, mm - 1, dd, 0, 0, 0, 0).getTime();
      };
      const customStartMs = parseLocalYmdStartMs(fifoCustomFromYmd);
      const customEndMs = (() => {
        const base = parseLocalYmdStartMs(fifoCustomToYmd);
        return base === null ? null : base + 86400000;
      })();

      const saleWindow =
        fifoWindowPreset === 'today'
          ? { startMs: todayStartMs, endMs: todayEndMs }
          : fifoWindowPreset === 'custom'
            ? (customStartMs !== null && customEndMs !== null && customEndMs > customStartMs
                ? { startMs: customStartMs, endMs: customEndMs }
                : null)
            : { startMs: monthStartMs, endMs: monthEndMs };

      const computedPurchaseStartMs = (() => {
        if (!saleWindow) return null;
        if (!fifoUsePurchaseLookback) return null;
        const days = Number(fifoPurchaseLookbackDays);
        if (!Number.isFinite(days) || days <= 0) return null;
        return saleWindow.startMs - Math.floor(days) * 86400000;
      })();

      const fetchForMode = async (mode: 'product_name' | 'two_keys') => {
        const qs = new URLSearchParams({
          userId: u,
          unlinkedOnly: fifoUnlinkedOnly ? 'true' : '0',
          limitSales: '5000',
          scanLimit: '20000',
          strictDelivery: fifoStrictDelivery ? '1' : '0',
          includePending: fifoIncludePending ? '1' : '0',
          cogsMethod,
          matchMode: mode,
          allocationMode: fifoSandboxWindowOnly ? 'window_only' : 'full',
        });
        const purchaseStartMs = computedPurchaseStartMs ?? parseLocalYmdStartMs(fifoPurchaseStartYmd);
        const salesAllocationStartMs = parseLocalYmdStartMs(fifoSalesAllocationStartYmd);
        if (purchaseStartMs !== null) qs.set('purchaseStartMs', String(purchaseStartMs));
        if (salesAllocationStartMs !== null) qs.set('salesAllocationStartMs', String(salesAllocationStartMs));
        if (saleWindow) {
          qs.set('saleStartMs', String(saleWindow.startMs));
          qs.set('saleEndMs', String(saleWindow.endMs));
        }
        const resp = await fetch(`/api/purchase-linking/fifo-dry-run?${qs.toString()}`, {
          cache: 'no-store',
          headers: { 'x-user-id': u }
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || json?.success === false) throw new Error(json?.error || `Dry run failed (${resp.status})`);
        return json;
      };

      const aMode: 'product_name' | 'two_keys' = 'product_name';
      const bMode: 'product_name' | 'two_keys' = 'two_keys';
      const a = await fetchForMode(aMode);
      const b = await fetchForMode(bMode);

      setFifoCompare({
        a: { matchMode: aMode, summary: a?.summary || null },
        b: { matchMode: bMode, summary: b?.summary || null }
      });

      const pick = (s: any) => ({
        matchMode: s?.matchMode ?? null,
        scanned: s?.totalSalesScanned ?? null,
        wouldLink: s?.wouldLink ?? null,
        noMatch: s?.noMatch ?? null,
        allocatedNoMatch: s?.allocated?.noMatch ?? null,
        matchesByStyleId: s?.purchasesDebug?.matchesByStyleId ?? null,
        matchesByUrlKey: s?.purchasesDebug?.matchesByUrlKey ?? null,
        matchesByName: s?.purchasesDebug?.matchesByName ?? null,
        slugSuccessUrlKey: s?.purchasesDebug?.slugSuccessUrlKey ?? null,
        slugSuccessProductName: s?.purchasesDebug?.slugSuccessProductName ?? null,
      });

      // #region agent log
      __agentLog({
        runId: 'pre-fix',
        hypothesisId: 'H8',
        location: 'test-purchase-linking/page.tsx:compareFifoMatchModes',
        message: 'compare FIFO match modes',
        data: { eventRunId, a: pick(a?.summary), b: pick(b?.summary) }
      });
      // #endregion

      showNotice('✅ Compared product-name vs two-keys (see panel below)', 'success', 20000);
    } catch (e: any) {
      showNotice(`❌ Compare failed: ${e?.message || 'Unknown error'}`, 'error', 20000);
    } finally {
      setComparingModes(false);
    }
  }, [
    cogsMethod,
    fifoCustomFromYmd,
    fifoCustomToYmd,
    fifoIncludePending,
    fifoSandboxWindowOnly,
    fifoStrictDelivery,
    fifoUnlinkedOnly,
    fifoPurchaseStartYmd,
    fifoSalesAllocationStartYmd,
    fifoPurchaseLookbackDays,
    fifoUsePurchaseLookback,
    fifoWindowPreset,
    showNotice,
    userId
  ]);

  const refreshNonFinalStockX = useCallback(
    async (opts?: { force?: boolean }) => {
      const u = userId.trim();
      if (!u) return;
      setRefreshingStockX(true);
      try {
        const resp = await fetch('/api/stockx/sales/refresh-nonfinal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': u },
          body: JSON.stringify({
            force: opts?.force ? true : false,
            // Keep this modest; this endpoint is mainly for payout/status backfill.
            maxOrders: 120,
            scanLimit: 12000,
            ttlHours: 12,
          }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || json?.success === false) throw new Error(json?.error || `Refresh failed (${resp.status})`);
        setLastStockXRefresh(json);

        if (json?.skipped) {
          showNotice(`ℹ️ StockX refresh skipped (TTL not expired).`, 'info');
        } else {
          const s = json?.summary || {};
          showNotice(
            `✅ StockX refresh complete — updated=${s.updated ?? 0} refreshed=${s.refreshed ?? 0} failed=${s.failed ?? 0}`,
            'success'
          );
        }

        await loadSales({ silent: true });
      } catch (e: any) {
        showNotice(`❌ StockX refresh failed: ${e?.message || 'Unknown error'}`, 'error');
      } finally {
        setRefreshingStockX(false);
      }
    },
    [loadSales, showNotice, userId]
  );

  const backfillSaleIdentifiers = useCallback(
    async (opts?: { force?: boolean }) => {
      const u = userId.trim();
      if (!u) return;
      setBackfillingSalesIds(true);
      try {
        const resp = await fetch('/api/stockx/sales/backfill-identifiers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': u },
          body: JSON.stringify({
            force: opts?.force ? true : false,
            // This is the main lever to eliminate missing_sale_styleId buckets.
            maxOrders: 400,
            // Scan in pages to avoid 504 timeouts. We'll continue via cursor across clicks.
            scanLimit: 1500,
            ttlHours: 24,
            // Be gentle to reduce bot protection / 429s during high-volume backfills.
            concurrency: 1,
            perRequestDelayMs: 750,
            maxRemoteOrders: 30,
            cursorId: salesIdBackfillCursorId || null,
            scanMode: 'missing_styleId',
          }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || json?.success === false) throw new Error(json?.error || `Backfill failed (${resp.status})`);
        setLastSalesIdBackfill(json);
        const next = typeof json?.summary?.nextCursorId === 'string' ? json.summary.nextCursorId : '';
        setSalesIdBackfillCursorId(next || '');
        if (json?.skipped) {
          const ttlHours = typeof json?.ttlHours === 'number' ? json.ttlHours : 24;
          const lastRunAtMs = typeof json?.lastRunAtMs === 'number' ? json.lastRunAtMs : null;
          const lastRunAtIso = typeof json?.lastRunAtIso === 'string' ? json.lastRunAtIso : null;
          const nextEligibleMs =
            typeof lastRunAtMs === 'number' && Number.isFinite(lastRunAtMs) ? lastRunAtMs + ttlHours * 60 * 60 * 1000 : null;
          const remainingMs = typeof nextEligibleMs === 'number' ? Math.max(0, nextEligibleMs - Date.now()) : null;
          const remainingMin = typeof remainingMs === 'number' ? Math.round(remainingMs / 60000) : null;
          const remainingLabel =
            typeof remainingMin === 'number'
              ? remainingMin >= 120
                ? `~${Math.round(remainingMin / 60)}h`
                : remainingMin >= 60
                  ? `~${Math.round(remainingMin / 60)}h`
                  : `~${remainingMin}m`
              : null;

          showNotice(
            `ℹ️ Identifier backfill skipped (TTL ${ttlHours}h).${lastRunAtIso ? ` Last run: ${lastRunAtIso}.` : ''}${
              remainingLabel ? ` Try again in ${remainingLabel} or click “Force IDs”.` : ' Click “Force IDs” to bypass TTL.'
            }`,
            'info',
            20000
          );
        } else {
          const s = json?.summary || {};
          // NOTE: backfill now scans sales in cursor pages to avoid 504 timeouts.
          // `candidateSales` is "candidates in this scanned page", not a global total.
          const pageRemaining =
            typeof s.candidateSales === 'number' && typeof s.attempted === 'number'
              ? Math.max(0, s.candidateSales - s.attempted)
              : null;
          const hasMorePages = typeof s?.nextCursorId === 'string' && !!s.nextCursorId;
          const statusCounts = s?.failureStatusCounts && typeof s.failureStatusCounts === 'object' ? s.failureStatusCounts : null;
          const blockedCount = typeof s?.blockedCount === 'number' ? s.blockedCount : 0;
          const hint =
            blockedCount > 0
              ? ` • blocked=${blockedCount} (StockX bot protection; wait + retry)`
              : statusCounts?.['401']
                ? ` • 401s detected (reconnect StockX)`
                : statusCounts?.['403']
                  ? ` • 403s detected (possible bot protection)`
                  : '';
          const legacyUpdated = typeof s?.legacyUpdated === 'number' ? s.legacyUpdated : null;
          const embeddedUpdated = typeof s?.embeddedUpdated === 'number' ? s.embeddedUpdated : null;
          const remoteAttempted = typeof s?.remoteAttempted === 'number' ? s.remoteAttempted : null;
          showNotice(
            `✅ Identifier backfill — updated=${s.updated ?? 0} failed=${s.failed ?? 0}${
              embeddedUpdated !== null ? ` • embeddedUpdated=${embeddedUpdated}` : ''
            }${
              legacyUpdated !== null ? ` • legacyUpdated=${legacyUpdated}` : ''
            }${remoteAttempted !== null ? ` • remoteAttempted=${remoteAttempted}` : ''}${
              pageRemaining !== null ? ` • pageRemaining≈${pageRemaining}` : ''
            }${hasMorePages ? ' • more pages (click Force IDs again)' : ''}${hint}`,
            'success',
            20000
          );
        }
        await loadSales({ silent: true });
      } catch (e: any) {
        showNotice(`❌ Identifier backfill failed: ${e?.message || 'Unknown error'}`, 'error');
      } finally {
        setBackfillingSalesIds(false);
      }
    },
    [loadSales, showNotice, userId]
  );

  const autoFixIdsAndMaybeCompute = useCallback(
    async (opts?: { runCompute?: boolean }) => {
      const u = userId.trim();
      if (!u) {
        showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
        return;
      }

      setAutoFixingIds(true);
      autoFixStopRef.current = false;
      setAutoFixLogs([]);
      const eventRunId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      // Start from the current cursor so repeated runs continue where you left off.
      let cursorId = salesIdBackfillCursorId || '';
      const startedAt = Date.now();
      const MAX_RUNTIME_MS = 6 * 60 * 1000;
      const MAX_ITERS = 25;

      try {
        // #region agent log
        __agentLog({
          runId: 'pre-fix',
          hypothesisId: 'H1',
          location: 'test-purchase-linking/page.tsx:autoFix:start',
          message: 'autoFix start',
          data: { eventRunId, userIdMasked: __agentMask(u), startCursorPresent: !!cursorId, runCompute: !!opts?.runCompute }
        });
        // #endregion
        for (let iter = 0; iter < MAX_ITERS; iter++) {
          if (autoFixStopRef.current) break;
          if (Date.now() - startedAt > MAX_RUNTIME_MS) {
            showNotice('ℹ️ Auto fix stopped (time budget). Click again to continue.', 'info', 20000);
            break;
          }

          // #region agent log
          __agentLog({
            runId: 'pre-fix',
            hypothesisId: 'H2',
            location: 'test-purchase-linking/page.tsx:autoFix:iter',
            message: 'autoFix iter',
            data: { eventRunId, iter, cursorPresent: !!cursorId }
          });
          // #endregion
          // #region agent log
          __agentLog({
            runId: 'pre-fix',
            hypothesisId: 'H2',
            location: 'test-purchase-linking/page.tsx:autoFix:beforeFetch',
            message: 'autoFix before fetch backfill',
            data: { eventRunId, iter }
          });
          // #endregion
          const t0 = Date.now();
          const resp = await fetch('/api/stockx/sales/backfill-identifiers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': u },
            body: JSON.stringify({
              __debugEventRunId: eventRunId,
              force: true,
              maxOrders: 400,
              scanLimit: 1500,
              ttlHours: 24,
              concurrency: 1,
              perRequestDelayMs: 750,
              maxRemoteOrders: 30,
              cursorId: cursorId || null,
              scanMode: 'missing_styleId'
            })
          });
          // #region agent log
          __agentLog({
            runId: 'pre-fix',
            hypothesisId: 'H2',
            location: 'test-purchase-linking/page.tsx:autoFix:afterFetch',
            message: 'autoFix after fetch backfill',
            data: { eventRunId, iter, status: resp.status, ok: resp.ok, durMs: Date.now() - t0 }
          });
          // #endregion
          const json = await resp.json().catch(() => ({}));
          // #region agent log
          __agentLog({
            runId: 'pre-fix',
            hypothesisId: 'H2',
            location: 'test-purchase-linking/page.tsx:autoFix:afterJson',
            message: 'autoFix after json parse',
            data: { eventRunId, iter, keys: json && typeof json === 'object' ? Object.keys(json).slice(0, 12) : null }
          });
          // #endregion
          if (!resp.ok || json?.success === false) throw new Error(json?.error || `Backfill failed (${resp.status})`);

          setLastSalesIdBackfill(json);
          const s = json?.summary || {};
          const next = typeof s?.nextCursorId === 'string' ? s.nextCursorId : null;
          cursorId = next || '';
          setSalesIdBackfillCursorId(cursorId);

          const updated = typeof s?.updated === 'number' ? s.updated : 0;
          const scanModeUsed = typeof s?.scanModeUsed === 'string' ? s.scanModeUsed : '';
          const candidateSales = typeof s?.candidateSales === 'number' ? s.candidateSales : null;
          const embeddedUpdated = typeof s?.embeddedUpdated === 'number' ? s.embeddedUpdated : 0;
          const embeddedFilledStyleId = typeof s?.embeddedFilledStyleId === 'number' ? s.embeddedFilledStyleId : null;
          const legacyFilledStyleId = typeof s?.legacyFilledStyleId === 'number' ? s.legacyFilledStyleId : null;
          const remoteFilledStyleId = typeof s?.remoteFilledStyleId === 'number' ? s.remoteFilledStyleId : null;
          const remoteOrderDetailsStyleIdPresent = typeof s?.remoteOrderDetailsStyleIdPresent === 'number' ? s.remoteOrderDetailsStyleIdPresent : null;
          const remoteOrderDetailsProductIdPresent = typeof s?.remoteOrderDetailsProductIdPresent === 'number' ? s.remoteOrderDetailsProductIdPresent : null;
          const remoteOrderDetailsVariantSizePresent = typeof s?.remoteOrderDetailsVariantSizePresent === 'number' ? s.remoteOrderDetailsVariantSizePresent : null;
          const remoteOrderDetailsStyleIdMissingButProductIdPresent =
            typeof s?.remoteOrderDetailsStyleIdMissingButProductIdPresent === 'number' ? s.remoteOrderDetailsStyleIdMissingButProductIdPresent : null;
          const productDetailsCalls = typeof s?.productDetailsCalls === 'number' ? s.productDetailsCalls : null;
          const productDetailsStyleIdPresent = typeof s?.productDetailsStyleIdPresent === 'number' ? s.productDetailsStyleIdPresent : null;
          const productDetailsStyleIdMissing = typeof s?.productDetailsStyleIdMissing === 'number' ? s.productDetailsStyleIdMissing : null;
          const productDetailsDebugSamplesLen = Array.isArray(s?.productDetailsDebugSamples) ? s.productDetailsDebugSamples.length : null;
          const productDetailsDebugSample0 =
            Array.isArray(s?.productDetailsDebugSamples) && s.productDetailsDebugSamples.length > 0 ? s.productDetailsDebugSamples[0] : null;
          const orderDetailsDebugSamplesLen = Array.isArray(s?.orderDetailsDebugSamples) ? s.orderDetailsDebugSamples.length : null;
          const orderDetailsDebugSample0 =
            Array.isArray(s?.orderDetailsDebugSamples) && s.orderDetailsDebugSamples.length > 0 ? s.orderDetailsDebugSamples[0] : null;
          const legacyUpdated = typeof s?.legacyUpdated === 'number' ? s.legacyUpdated : 0;
          const remoteAttempted = typeof s?.remoteAttempted === 'number' ? s.remoteAttempted : 0;
          const failed = typeof s?.failed === 'number' ? s.failed : 0;
          const statusCounts =
            s?.failureStatusCounts && typeof s.failureStatusCounts === 'object' ? (s.failureStatusCounts as Record<string, number>) : {};
          const stoppedEarlyReason = typeof s?.stoppedEarlyReason === 'string' ? s.stoppedEarlyReason : null;

          // #region agent log
          __agentLog({
            runId: 'pre-fix',
            hypothesisId: 'H3',
            location: 'test-purchase-linking/page.tsx:autoFix:resp',
            message: 'autoFix backfill response',
            data: {
              eventRunId,
              iter,
              updated,
              embeddedUpdated,
              legacyUpdated,
              remoteAttempted,
              failed,
              stoppedEarlyReason,
              scanModeUsed,
              candidateSales,
              embeddedFilledStyleId,
              legacyFilledStyleId,
              remoteFilledStyleId,
              remoteOrderDetailsStyleIdPresent,
              remoteOrderDetailsProductIdPresent,
              remoteOrderDetailsVariantSizePresent,
              remoteOrderDetailsStyleIdMissingButProductIdPresent,
              productDetailsCalls,
              productDetailsStyleIdPresent,
              productDetailsStyleIdMissing,
              productDetailsDebugSamplesLen,
              productDetailsDebugSample0,
              orderDetailsDebugSamplesLen,
              orderDetailsDebugSample0,
              nextCursorPresent: !!next,
              status429: statusCounts?.['429'] ?? 0,
              status403: statusCounts?.['403'] ?? 0,
              status401: statusCounts?.['401'] ?? 0
            }
          });
          // #endregion

          setAutoFixLogs((prev) => [
            ...prev,
            {
              atIso: new Date().toISOString(),
              updated,
              embeddedUpdated,
              legacyUpdated,
              remoteAttempted,
              failed,
              statusCounts,
              stoppedEarlyReason,
              nextCursorId: next
            }
          ]);

          // IMPORTANT: don't wrap around to the beginning when we've reached the end of the cursor scan.
          // If there are still missing IDs, the user can run another pass later (often due to 429/403 limits).
          if (!next) {
            __agentLog({
              runId: 'pre-fix',
              hypothesisId: 'H2',
              location: 'test-purchase-linking/page.tsx:autoFix:donePaging',
              message: 'autoFix reached end of cursor paging; stopping to avoid wraparound',
              data: { eventRunId, iter, embeddedUpdated, legacyUpdated, remoteAttempted, failed }
            });
            break;
          }

          // Stop early when we hit heavy rate limiting; better to cool down.
          if (stoppedEarlyReason === 'rate_limited_429') {
            showNotice('⚠️ Auto fix paused due to StockX 429 rate limit. Wait ~30–60 min then click again.', 'warning', 20000);
            break;
          }
          if (stoppedEarlyReason === 'blocked_403') {
            showNotice('⚠️ Auto fix paused due to StockX bot protection (403). Wait and retry.', 'warning', 20000);
            break;
          }

          // Done when no more pages to scan and this page had no remaining remote work.
          const hasMorePages = !!next;
          if (!hasMorePages && legacyUpdated === 0 && remoteAttempted === 0) break;

          // Small spacing between iterations so we don't spam our own API.
          await new Promise((r) => setTimeout(r, 300));
        }

        await loadSales({ silent: true });

        if (opts?.runCompute && !autoFixStopRef.current) {
          await runFifoDryRun();
        } else {
          showNotice('✅ Auto fix finished. Now run “Compute FIFO profit”.', 'success', 12000);
        }
      } catch (e: any) {
        // #region agent log
        __agentLog({
          runId: 'pre-fix',
          hypothesisId: 'H2',
          location: 'test-purchase-linking/page.tsx:autoFix:error',
          message: 'autoFix error',
          data: { error: String(e?.message || e || 'unknown') }
        });
        // #endregion
        showNotice(`❌ Auto fix failed: ${e?.message || 'Unknown error'}`, 'error', 20000);
      } finally {
        setAutoFixingIds(false);
        autoFixStopRef.current = false;
      }
    },
    [loadSales, runFifoDryRun, salesIdBackfillCursorId, showNotice, userId]
  );

  const debugSpecificOrders = useCallback(async () => {
    const u = userId.trim();
    if (!u) {
      showNotice('❌ No userId found. Sign in (or ensure site password login).', 'error');
      return;
    }
    const eventRunId = `dbg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setDebuggingOrders(true);
    try {
      // #region agent log
      __agentLog({
        runId: 'pre-fix',
        hypothesisId: 'H7',
        location: 'test-purchase-linking/page.tsx:debugSpecificOrders:start',
        message: 'debugSpecificOrders start',
        data: { eventRunId, userIdMasked: __agentMask(u), debugOrderNumbersCsvLen: debugOrderNumbersCsv.length }
      });
      // #endregion
      const resp = await fetch('/api/stockx/sales/backfill-identifiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': u },
        body: JSON.stringify({
          __debugEventRunId: eventRunId,
          debugOrderNumbersCsv
        })
      });
      const json = await resp.json().catch(() => ({}));
      // #region agent log
      __agentLog({
        runId: 'pre-fix',
        hypothesisId: 'H7',
        location: 'test-purchase-linking/page.tsx:debugSpecificOrders:resp',
        message: 'debugSpecificOrders response',
        data: {
          eventRunId,
          ok: resp.ok,
          status: resp.status,
          debug: json?.debug === true,
          debugOrderNumbersCount: json?.debugOrderNumbersCount ?? null,
          debugOrders0: Array.isArray(json?.debugOrders) && json.debugOrders.length > 0 ? json.debugOrders[0] : null
        }
      });
      // #endregion
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Debug failed (${resp.status})`);
      showNotice(`✅ Debug fetched ${Array.isArray(json?.debugOrders) ? json.debugOrders.length : 0} orders (see logs)`, 'success', 20000);
    } catch (e: any) {
      showNotice(`❌ Debug orders failed: ${e?.message || 'Unknown error'}`, 'error', 20000);
    } finally {
      setDebuggingOrders(false);
    }
  }, [debugOrderNumbersCsv, showNotice, userId]);

  const [linking, setLinking] = useState(false);
  const [allowWrites, setAllowWrites] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [simulatedDeliveryByPurchaseId, setSimulatedDeliveryByPurchaseId] = useState<Record<string, string>>({});

  const getSimulatedDeliveryYmd = useCallback(
    (purchaseId: string): string | null => {
      if (!simulateMissingDeliveries) return null;
      const range = clampYmdRange(simFromYmd, simToYmd);
      if (!range) return null;
      const spanDays = Math.max(1, Math.floor((range.endMs - range.startMs) / 86400000) + 1);
      const idx = hashToUint32(purchaseId) % spanDays;
      const ms = range.startMs + idx * 86400000;
      const d = new Date(ms);
      // Return yyyy-mm-dd
      return d.toISOString().slice(0, 10);
    },
    [simFromYmd, simToYmd, simulateMissingDeliveries]
  );

  const effectiveActualDelivery = useCallback(
    (p: PurchaseRow | null): string | null => {
      if (!p) return null;
      const sim = simulatedDeliveryByPurchaseId[p.id];
      const simulatedFallback = !p.actualDelivery ? getSimulatedDeliveryYmd(p.id) : null;
      const v = (sim || p.actualDelivery || simulatedFallback || '').toString().trim();
      return v ? v : null;
    },
    [getSimulatedDeliveryYmd, simulatedDeliveryByPurchaseId]
  );

  const previewLinkSelected = useCallback(async () => {
    if (!userId.trim()) return;
    if (!selectedSale) {
      showNotice('⚠️ Select a sale first.', 'warning');
      return;
    }
    if (!selectedPurchase) {
      showNotice('⚠️ Select a purchase first.', 'warning');
      return;
    }
    setLinking(true);
    setPreview(null);
    try {
      const resp = await fetch('/api/purchase-linking/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          saleId: selectedSale.id,
          purchaseId: selectedPurchase.id,
          action: 'link',
          dryRun: true
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Link failed (${resp.status})`);
      setPreview(json);
      showNotice('✅ Preview ready (no writes).', 'success');
    } catch (e: any) {
      showNotice(`❌ Link failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLinking(false);
    }
  }, [selectedPurchase, selectedSale, showNotice, userId]);

  const commitLinkSelected = useCallback(async () => {
    if (!allowWrites) {
      showNotice('⚠️ Enable “Allow writes” to commit links.', 'warning');
      return;
    }
    if (!userId.trim() || !selectedSale || !selectedPurchase) return;
    const ok = window.confirm('This will WRITE a link to Firestore. Continue?');
    if (!ok) return;
    setLinking(true);
    setPreview(null);
    try {
      const resp = await fetch('/api/purchase-linking/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          saleId: selectedSale.id,
          purchaseId: selectedPurchase.id,
          action: 'link',
          dryRun: false
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Commit failed (${resp.status})`);
      showNotice(`✅ Committed link for sale ${selectedSale.orderNumber || selectedSale.id}.`, 'success');
      await loadSales();
      await loadPurchases();
    } catch (e: any) {
      showNotice(`❌ Commit failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLinking(false);
    }
  }, [allowWrites, loadPurchases, loadSales, selectedPurchase, selectedSale, showNotice, userId]);

  const previewUnlinkSelectedSale = useCallback(async () => {
    if (!userId.trim()) return;
    if (!selectedSale) {
      showNotice('⚠️ Select a sale first.', 'warning');
      return;
    }
    setLinking(true);
    setPreview(null);
    try {
      const resp = await fetch('/api/purchase-linking/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          saleId: selectedSale.id,
          action: 'unlink',
          dryRun: true
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Unlink failed (${resp.status})`);
      setPreview(json);
      showNotice('✅ Preview ready (no writes).', 'success');
    } catch (e: any) {
      showNotice(`❌ Unlink failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLinking(false);
    }
  }, [selectedSale, showNotice, userId]);

  const commitUnlinkSelectedSale = useCallback(async () => {
    if (!allowWrites) {
      showNotice('⚠️ Enable “Allow writes” to commit unlink.', 'warning');
      return;
    }
    if (!userId.trim() || !selectedSale) return;
    const ok = window.confirm('This will WRITE an unlink to Firestore. Continue?');
    if (!ok) return;
    setLinking(true);
    setPreview(null);
    try {
      const resp = await fetch('/api/purchase-linking/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          saleId: selectedSale.id,
          action: 'unlink',
          dryRun: false
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) throw new Error(json?.error || `Unlink failed (${resp.status})`);
      showNotice(`✅ Committed unlink for sale ${selectedSale.orderNumber || selectedSale.id}.`, 'success');
      await loadSales();
      await loadPurchases();
    } catch (e: any) {
      showNotice(`❌ Commit unlink failed: ${e?.message || 'Unknown error'}`, 'error');
    } finally {
      setLinking(false);
    }
  }, [allowWrites, loadPurchases, loadSales, selectedSale, showNotice, userId]);


  const suggestPurchaseForSelectedSale = useCallback(() => {
    if (!selectedSale) {
      showNotice('⚠️ Select a sale first.', 'warning');
      return;
    }
    const styleId = String(selectedSale.styleId || '').trim();
    const size = normalizeSize(selectedSale.size);
    if (!styleId || !size) {
      showNotice('⚠️ Sale is missing styleId or size.', 'warning');
      return;
    }
    // Strict: only consider delivered purchases (actualDelivery), unlinked, matching styleId+size.
    const candidates = purchases.filter((p) => {
      const pStyle = String(p.styleId || p.style_id || p.product?.styleId || '').trim();
      const pSize = normalizeSize(p.size ?? p.extracted_size ?? p.product?.size);
      const delivered = Boolean(effectiveActualDelivery(p));
      const unlinked = !p.linkedSaleOrderNumber && !p.linkedSaleId;
      return delivered && unlinked && pStyle === styleId && pSize === size;
    });
    if (candidates.length === 0) {
      showNotice('ℹ️ No delivered/unlinked matching purchase found for this sale.', 'info');
      return;
    }
    candidates.sort((a, b) => {
      const aMs = Date.parse(String(effectiveActualDelivery(a) || '')) || Number.POSITIVE_INFINITY;
      const bMs = Date.parse(String(effectiveActualDelivery(b) || '')) || Number.POSITIVE_INFINITY;
      return aMs - bMs;
    });
    setSelectedPurchaseId(candidates[0].id);
    showNotice('✅ Suggested purchase selected (oldest delivered).', 'success');
  }, [effectiveActualDelivery, purchases, selectedSale, showNotice]);

  const saleDisplayProfit = useMemo(() => {
    if (!selectedSale) return null;
    // Profit definition: net payout - total paid
    return getProfitNetPayoutMinusPaid(selectedSale);
  }, [selectedSale]);

  const selectedPurchaseCost = useMemo(() => getPurchaseCost(selectedPurchase), [selectedPurchase]);

  const purchaseImage = useMemo(() => {
    if (!selectedPurchase) return '';
    return (
      String(selectedPurchase.productImageUrl || '') ||
      String(selectedPurchase.product?.image || '') ||
      ''
    );
  }, [selectedPurchase]);

  const purchaseName = useMemo(() => {
    if (!selectedPurchase) return '';
    return (
      String(selectedPurchase.product?.name || selectedPurchase.product?.productName || selectedPurchase.product?.title || '') ||
      'Purchase'
    );
  }, [selectedPurchase]);

  return (
    <div className={`min-h-screen p-6 ${isNeon ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <NeonNotification
        isVisible={notification.isVisible}
        message={notification.message}
        type={notification.type}
        duration={notification.durationMs}
        onClose={() => setNotification((p) => ({ ...p, isVisible: false }))}
      />

      <div className="max-w-6xl mx-auto space-y-6">
        <div className={`rounded-xl border p-6 ${isNeon ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h1 className="text-2xl font-bold">Purchase Linking (Test)</h1>
          <p className={`mt-2 ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>
            Use this page to validate FIFO auto-linking and manually link a specific purchase to a specific sale.
          </p>
          <div className={`mt-4 rounded-lg p-4 ${isNeon ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className={`text-sm font-semibold ${isNeon ? 'text-yellow-200' : 'text-yellow-800'}`}>
              Test mode: previews are safe. Writes require explicit opt-in.
            </div>
            <label className={`mt-2 flex items-center gap-2 text-sm ${isNeon ? 'text-yellow-100' : 'text-yellow-800'}`}>
              <input
                type="checkbox"
                checked={allowWrites}
                onChange={(e) => setAllowWrites(e.target.checked)}
              />
              Allow writes (commit link/unlink to Firestore)
            </label>

            <div className={`mt-4 rounded-lg p-3 ${isNeon ? 'bg-white/5 border border-white/10' : 'bg-white border border-yellow-200'}`}>
              <div className={`text-sm font-semibold ${isNeon ? 'text-gray-100' : 'text-gray-800'}`}>
                FIFO testing helper
              </div>
              <div className={`mt-1 text-xs ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                If a purchase is missing <span className="font-semibold">actualDelivery</span>, simulate one (no DB writes) so FIFO can be tested end-to-end.
              </div>
              <label className={`mt-2 flex items-center gap-2 text-sm ${isNeon ? 'text-gray-200' : 'text-gray-800'}`}>
                <input
                  type="checkbox"
                  checked={simulateMissingDeliveries}
                  onChange={(e) => setSimulateMissingDeliveries(e.target.checked)}
                />
                Simulate missing deliveries with a deterministic “random” date in range
              </label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>From</div>
                  <input
                    type="date"
                    value={simFromYmd}
                    max={todayYmd}
                    onChange={(e) => setSimFromYmd(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${
                      isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
                <div>
                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>To</div>
                  <input
                    type="date"
                    value={simToYmd}
                    max={todayYmd}
                    onChange={(e) => setSimToYmd(e.target.value)}
                    className={`w-full px-3 py-2 rounded-md border ${
                      isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              </div>
              <div className={`mt-1 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Default range: 2025-10-01 → today.
              </div>
            </div>
          </div>

          {/* StockX Connection (so Sales 2.0 can connect without visiting Arbitrage) */}
          <div className={`mt-4 rounded-xl border p-4 ${
            isNeon ? 'bg-gray-900/40 border border-white/10' : 'bg-gray-50 border border-gray-200'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">StockX Connection</div>
                <div className={`mt-1 text-sm ${
                  isNeon ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {stockxAuth.state === 'loading'
                    ? 'Checking…'
                    : stockxAuth.state === 'connected'
                      ? '✅ Connected'
                      : stockxAuth.state === 'warning'
                        ? `⚠️ ${stockxAuth.message || 'Connected, but verification failed'}`
                        : `❌ ${stockxAuth.message || 'Not connected'}`
                  }
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={refreshStockxAuthStatus}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const returnTo = '/dashboard?section=sales-2-0';
                    window.location.href = `/api/stockx/auth?returnTo=${encodeURIComponent(returnTo)}`;
                  }}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    isNeon
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  Connect StockX
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const returnTo = '/dashboard?section=sales-2-0';
                    window.location.href = `/api/stockx/disconnect?returnTo=${encodeURIComponent(returnTo)}`;
                  }}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    isNeon
                      ? 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-400 hover:to-pink-400 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  Disconnect
                </button>
              </div>
            </div>
            <div className={`mt-2 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Tip: If imports fail with “reconnect to StockX”, click <span className="font-semibold">Disconnect</span> then <span className="font-semibold">Connect StockX</span> here.
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="w-full">
              <label className={`block text-sm font-medium mb-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>User ID</label>
              <input
                value={userId}
                onChange={(e) => setUserId(sanitizeUserId(e.target.value))}
                className={`w-full px-3 py-2 rounded-md border ${
                  isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                }`}
                placeholder="siteUserId or Firebase uid"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={detectUserIdFromServer}
                  disabled={loadingSales || loadingPurchases}
                  className={`px-4 py-2 rounded-md font-semibold ${
                    isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  } disabled:opacity-60`}
                  title="Detect userId from cookies (useful on trycloudflare domains)"
                >
                  Detect ID
                </button>
                <button
                  onClick={loadSales}
                  disabled={loadingSales}
                  className={`px-4 py-2 rounded-md font-semibold ${
                    isNeon ? 'bg-cyan-500 text-black hover:bg-cyan-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                  } disabled:opacity-60`}
                >
                  {loadingSales ? 'Loading sales…' : 'Reload sales'}
                </button>
                <button
                  onClick={loadPurchases}
                  disabled={loadingPurchases}
                  className={`px-4 py-2 rounded-md font-semibold ${
                    isNeon ? 'bg-cyan-500 text-black hover:bg-cyan-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                  } disabled:opacity-60`}
                >
                  {loadingPurchases ? 'Loading purchases…' : 'Reload purchases'}
                </button>
                <button
                  onClick={runFifoDryRun}
                  disabled={fifoLoading}
                  className={`px-4 py-2 rounded-md font-semibold ${
                    isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-900 text-white hover:bg-gray-800'
                  } disabled:opacity-60`}
                >
                  {fifoLoading ? 'Running…' : 'Compute FIFO profit'}
                </button>
                <button
                  onClick={compareFifoMatchModes}
                  disabled={comparingModes || fifoLoading}
                  className={`px-3 py-2 rounded-md text-xs font-semibold ${
                    isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  } disabled:opacity-60`}
                  title="Run FIFO twice (product-name vs two-keys) and show a side-by-side comparison. Does not change your table."
                >
                  {comparingModes ? 'Comparing…' : 'Compare modes'}
                </button>
                <button
                  onClick={() => refreshNonFinalStockX({ force: false })}
                  disabled={refreshingStockX}
                  className={`px-4 py-2 rounded-md font-semibold ${
                    isNeon
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/25 text-emerald-100 border border-emerald-500/30'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  } disabled:opacity-60`}
                  title="Refresh non-final StockX orders (status/payout/fees) with a 12h TTL to reduce API calls."
                >
                  {refreshingStockX ? 'Refreshing…' : 'Refresh StockX (non-final)'}
                </button>
                <button
                  onClick={() => refreshNonFinalStockX({ force: true })}
                  disabled={refreshingStockX}
                  className={`px-3 py-2 rounded-md text-xs font-semibold ${
                    isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  } disabled:opacity-60`}
                  title="Force refresh even if TTL hasn't expired."
                >
                  Force
                </button>
                <button
                  onClick={() => backfillSaleIdentifiers({ force: false })}
                  disabled={backfillingSalesIds}
                  className={`px-4 py-2 rounded-md font-semibold ${
                    isNeon
                      ? 'bg-purple-500/20 hover:bg-purple-500/25 text-purple-100 border border-purple-500/30'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  } disabled:opacity-60`}
                  title="Backfill missing styleId/size/product/brand on your saved sales by fetching StockX order details. This directly fixes missing_sale_styleId no-matches."
                >
                  {backfillingSalesIds ? 'Backfilling…' : 'Backfill sale identifiers'}
                </button>
                <button
                  onClick={() => backfillSaleIdentifiers({ force: true })}
                  disabled={backfillingSalesIds || autoFixingIds}
                  className={`px-3 py-2 rounded-md text-xs font-semibold ${
                    isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  } disabled:opacity-60`}
                  title="Force identifier backfill even if TTL hasn't expired."
                >
                  Force IDs
                </button>
                <button
                  onClick={() => autoFixIdsAndMaybeCompute({ runCompute: true })}
                  disabled={autoFixingIds || backfillingSalesIds || fifoLoading}
                  className={`px-3 py-2 rounded-md text-xs font-semibold ${
                    isNeon ? 'bg-cyan-500/20 hover:bg-cyan-500/25 text-cyan-100 border border-cyan-500/30' : 'bg-cyan-600 text-white hover:bg-cyan-700'
                  } disabled:opacity-60`}
                  title="One-click: repeatedly backfill identifiers (cursor paging) then run Compute FIFO profit. Stops automatically on heavy rate limiting."
                >
                  {autoFixingIds ? 'Fixing IDs…' : 'Fix IDs (auto) + Compute'}
                </button>
                <div className={`flex items-center gap-2 rounded-md px-2 py-1 ${isNeon ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200'}`}>
                  <input
                    value={debugOrderNumbersCsv}
                    onChange={(e) => setDebugOrderNumbersCsv(e.target.value)}
                    placeholder="Debug order #s (csv)"
                    className={`w-56 rounded-md px-2 py-1 text-xs ${
                      isNeon ? 'bg-black/30 text-white placeholder:text-gray-400 border border-white/10' : 'bg-white text-gray-900 border border-gray-300'
                    }`}
                  />
                  <button
                    onClick={debugSpecificOrders}
                    disabled={debuggingOrders}
                    className={`px-3 py-2 rounded-md text-xs font-semibold ${
                      isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-900 text-white hover:bg-gray-800'
                    } disabled:opacity-60`}
                    title="Fetch order-details + product-details for these order numbers (no Firebase writes). See debug.log for results."
                  >
                    {debuggingOrders ? 'Debugging…' : 'Debug orders'}
                  </button>
                </div>
                {autoFixingIds && (
                  <button
                    onClick={() => {
                      autoFixStopRef.current = true;
                      showNotice('ℹ️ Stopping after the current batch finishes…', 'info', 12000);
                    }}
                    className={`px-3 py-2 rounded-md text-xs font-semibold ${
                      isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                    title="Stop the auto run after the current request finishes."
                  >
                    Stop
                  </button>
                )}
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={fifoStrictDelivery}
                    onChange={(e) => setFifoStrictDelivery(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Strict delivery (requires actualDelivery)
                </label>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={fifoUnlinkedOnly}
                    onChange={(e) => setFifoUnlinkedOnly(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Unlinked only
                </label>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={fifoSandboxWindowOnly}
                    onChange={(e) => setFifoSandboxWindowOnly(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Sandbox (allocate only this window)
                </label>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span className="opacity-80">Match mode:</span>
                  <select
                    value={fifoMatchMode}
                    onChange={(e) => setFifoMatchMode(e.target.value as any)}
                    className={`rounded-md px-2 py-1 text-xs ${
                      isNeon ? 'bg-black/30 text-white border border-white/10' : 'bg-white text-gray-900 border border-gray-300'
                    }`}
                  >
                    <option value="product_name">Product name (slug) + size (primary)</option>
                    <option value="two_keys">Only styleId+size OR urlKey+size</option>
                    <option value="full">Full (includes product-name fallback + fuzzy)</option>
                  </select>
                </label>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span className="opacity-80">Inventory start:</span>
                  <select
                    value={fifoInventoryStartMode}
                    onChange={(e) => setFifoInventoryStartMode(e.target.value as any)}
                    className={`rounded-md px-2 py-1 text-xs ${
                      isNeon ? 'bg-black/30 text-white border border-white/10' : 'bg-white text-gray-900 border border-gray-300'
                    }`}
                  >
                    <option value="first_purchase">Ignore sales before first tracked purchase</option>
                    <option value="none">Include all sales (strict FIFO)</option>
                  </select>
                </label>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span className="opacity-80">Sales start:</span>
                  <input
                    type="date"
                    value={fifoSalesAllocationStartYmd}
                    onChange={(e) => setFifoSalesAllocationStartYmd(e.target.value)}
                    className={`w-28 rounded-md px-2 py-1 text-xs ${
                      isNeon ? 'bg-black/30 text-white border border-white/10' : 'bg-white text-gray-900 border border-gray-300'
                    }`}
                    title="Sales allocation start date (calendar picker)"
                  />
                </label>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span className="opacity-80">Purchases start:</span>
                  <input
                    type="date"
                    value={fifoPurchaseStartYmd}
                    onChange={(e) => setFifoPurchaseStartYmd(e.target.value)}
                    className={`w-28 rounded-md px-2 py-1 text-xs ${
                      isNeon ? 'bg-black/30 text-white border border-white/10' : 'bg-white text-gray-900 border border-gray-300'
                    }`}
                    title="Purchase eligibility start date (calendar picker)"
                  />
                </label>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={fifoUsePurchaseLookback}
                    onChange={(e) => setFifoUsePurchaseLookback(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Purchase lookback
                </label>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span className="opacity-80">Days:</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={fifoPurchaseLookbackDays}
                    onChange={(e) => setFifoPurchaseLookbackDays(Math.max(1, Math.floor(Number(e.target.value || 0))))}
                    className={`w-16 rounded-md px-2 py-1 text-xs ${
                      isNeon ? 'bg-black/30 text-white border border-white/10' : 'bg-white text-gray-900 border border-gray-300'
                    }`}
                    title="If enabled, only purchases on/after (windowStart - N days) are eligible. This prevents old purchases from matching and speeds up testing."
                    disabled={!fifoUsePurchaseLookback}
                  />
                </label>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={fifoShowNoMatchOnly}
                    onChange={(e) => setFifoShowNoMatchOnly(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show only no_match
                </label>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <input
                    type="checkbox"
                    checked={fifoIncludePending}
                    onChange={(e) => setFifoIncludePending(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Include pending/active (exclude canceled/authfailed/didnotship/returned)
                </label>

                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span>COGS:</span>
                  <select
                    value={cogsMethod}
                    onChange={(e) => setCogsMethod(e.target.value === 'lifo' ? 'lifo' : 'fifo')}
                    className={`h-9 rounded-md border px-2 text-sm ${
                      isNeon ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    title="FIFO = oldest inventory first (recommended). LIFO = newest inventory first (debug/testing)."
                  >
                    <option value="fifo">FIFO (recommended)</option>
                    <option value="lifo">LIFO (debug)</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Window:</span>

                <button
                  onClick={() => setFifoWindowPreset('today')}
                  className={`h-9 rounded-md px-3 text-xs font-semibold ${
                    fifoWindowPreset === 'today'
                      ? isNeon
                        ? 'bg-cyan-500 text-black'
                        : 'bg-blue-600 text-white'
                      : isNeon
                        ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                  title="Profit for today (local time)"
                >
                  Today
                </button>
                <button
                  onClick={() => setFifoWindowPreset('this_month')}
                  className={`h-9 rounded-md px-3 text-xs font-semibold ${
                    fifoWindowPreset === 'this_month'
                      ? isNeon
                        ? 'bg-cyan-500 text-black'
                        : 'bg-blue-600 text-white'
                      : isNeon
                        ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                  title="Profit for a month (select year + month)"
                >
                  Month
                </button>
                <button
                  onClick={() => setFifoWindowPreset('custom')}
                  className={`h-9 rounded-md px-3 text-xs font-semibold ${
                    fifoWindowPreset === 'custom'
                      ? isNeon
                        ? 'bg-cyan-500 text-black'
                        : 'bg-blue-600 text-white'
                      : isNeon
                        ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                  title="Profit for a custom date range (local time)"
                >
                  Custom
                </button>

                {fifoWindowPreset === 'custom' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={fifoCustomFromYmd}
                      onChange={(e) => setFifoCustomFromYmd(e.target.value)}
                      className={`h-9 rounded-md border px-2 text-sm ${
                        isNeon ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                    <span className={isNeon ? 'text-gray-400' : 'text-gray-600'}>→</span>
                    <input
                      type="date"
                      value={fifoCustomToYmd}
                      onChange={(e) => setFifoCustomToYmd(e.target.value)}
                      className={`h-9 rounded-md border px-2 text-sm ${
                        isNeon ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>
                )}

                {fifoWindowPreset === 'this_month' && (
                  <>
                    <span className={`ml-2 text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      Year:
                    </span>
                    <select
                      value={fifoSelectedYear}
                      onChange={(e) => setFifoSelectedYear(Number(e.target.value))}
                      className={`h-9 rounded-md border px-2 text-sm ${
                        isNeon ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      title="Year used when selecting a month filter"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <div className="flex-1 overflow-x-auto">
                      <div className="inline-flex items-center gap-2 whitespace-nowrap pr-2">
                        {monthOptions.map((m) => (
                          <button
                            key={m.value}
                            onClick={() => setFifoSelectedMonth(m.value)}
                            className={`h-9 rounded-md px-3 text-xs font-semibold ${
                              fifoSelectedMonth === m.value
                                ? isNeon
                                  ? 'bg-cyan-500 text-black'
                                  : 'bg-blue-600 text-white'
                                : isNeon
                                  ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                            }`}
                            title={`Scan ${m.label} ${fifoSelectedYear} sales (local time)`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <StockXSalesImport
              userId={userId.trim()}
              onImportComplete={async (success, salesCount) => {
                if (success) {
                  showNotice(`✅ Imported ${salesCount} StockX sales. Reloading…`, 'success');
                  await loadSales();
                } else {
                  showNotice('❌ StockX sales import failed. Check StockX auth/tokens and try again.', 'error');
                }
              }}
            />
          </div>

          {fifoSummary && (
            <div className={`mt-4 rounded-lg p-4 ${isNeon ? 'bg-gray-900/40 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
              <div className="text-sm font-semibold">FIFO committed profit summary</div>
              <div className={`mt-1 text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                scanned={fifoSummary.totalSalesScanned} • rows={fifoSummary.returnedRows ?? fifoRows.length} • wouldLink={fifoSummary.wouldLink} • noMatch={fifoSummary.noMatch} • alreadyLinked={fifoSummary.alreadyLinked}
              </div>
              {fifoSummary?.allocated && (
                <div className={`mt-1 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                  Allocated (for FIFO correctness): wouldLink={fifoSummary.allocated.wouldLink} • noMatch={fifoSummary.allocated.noMatch} • alreadyLinked={fifoSummary.allocated.alreadyLinked}
                </div>
              )}

              {fifoSummary?.allocated?.noMatchTopReasons?.length > 0 && (
                <div className={`mt-3 rounded-md border p-3 text-xs ${isNeon ? 'bg-white/5 border-white/10 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}>
                  <div className="font-semibold">Allocated no_match breakdown (this is the big number)</div>
                  <div className={`mt-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                    {fifoSandboxWindowOnly
                      ? 'Sandbox mode is ON, so allocation is limited to the selected window. This breakdown should mostly mirror the window failures (great for validating matching quickly).'
                      : 'These failures occurred in pre-window sales that FIFO must allocate first. Fixing these improves FIFO accuracy for February.'}
                  </div>
                  <div className="mt-2 grid gap-2">
                    {fifoSummary.allocated.noMatchTopReasons.map((x: any) => (
                      <div key={String(x?.reason || 'unknown')} className={`rounded-md border p-2 ${isNeon ? 'border-white/10' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate font-mono">{String(x?.reason || 'unknown')}</div>
                          <div className="font-semibold tabular-nums">{Number(x?.count || 0)}</div>
                        </div>
                        {Array.isArray(x?.samples) && x.samples.length > 0 && (
                          <div className={`mt-1 space-y-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                            {x.samples.map((s: any, idx: number) => (
                              <div key={`${String(x?.reason)}-${idx}`} className="truncate">
                                ex: order={String(s?.saleOrderNumber || '—')} • styleId={String(s?.saleStyleId || '—')} • size={String(s?.saleSize || '—')} • date={String(s?.saleCutoffIso || '—')} • source={String(s?.saleSource || '—')}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className={`mt-2 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                    {fifoSandboxWindowOnly ? (
                      <>
                        Next step: click <span className="font-semibold">Show only no_match</span> to inspect the remaining failures in just this window.
                        When you’re confident matching works, turn Sandbox off to get FIFO-correct month totals.
                      </>
                    ) : (
                      <>
                        The next step is to click <span className="font-semibold">Show only no_match</span> and switch the window to a broader range (or month-by-month) while you fix the top reasons above.
                      </>
                    )}
                  </div>
                </div>
              )}

              {fifoSummary?.windowDebug &&
                (Number(fifoSummary?.returnedRows ?? fifoRows.length) === 0) &&
                (typeof fifoSummary?.totalSalesScanned === 'number' ? fifoSummary.totalSalesScanned : 0) > 0 && (
                  <div
                    className={`mt-3 rounded-md border p-3 text-xs ${
                      isNeon
                        ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
                        : 'bg-yellow-50 border-yellow-200 text-yellow-900'
                    }`}
                  >
                    <div className="font-semibold">No rows returned for this window</div>
                    <div className="mt-1">
                      We allocated FIFO across {fifoSummary.totalSalesScanned} sale(s), but <span className="font-semibold">none</span> have a parsed
                      sale timestamp inside this window.
                    </div>
                    <div className="mt-2">
                      Window: {String(fifoSummary.windowDebug.startIso || '—')} → {String(fifoSummary.windowDebug.endIso || '—')}
                    </div>
                    <div className="mt-1">
                      Sales date range in DB (parsed): {String(fifoSummary.windowDebug.minEventIso || '—')} → {String(fifoSummary.windowDebug.maxEventIso || '—')}
                    </div>
                    <div className="mt-1">
                      In-window by timestamp: {fifoSummary.windowDebug.inWindowByEventMs}
                      {typeof fifoSummary.windowDebug.scannedWithMissingEventMs === 'number' && fifoSummary.windowDebug.scannedWithMissingEventMs > 0
                        ? ` • missingEventMs=${fifoSummary.windowDebug.scannedWithMissingEventMs}`
                        : ''}
                    </div>
                    <div className="mt-2">
                      Next steps:
                      <div className="mt-1">
                        - If you expected Feb sales: run <span className="font-semibold">StockX Sales Import</span> for “Last 1 month” (Completed-only OFF), then reload + recompute.
                      </div>
                      <div className="mt-1">
                        - If sales exist but dates look wrong: click <span className="font-semibold">Refresh StockX (non-final)</span> to backfill status/payout/date, then recompute.
                      </div>
                    </div>
                  </div>
                )}
              <div className={`mt-1 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                {fifoWindowPreset === 'today'
                  ? 'Filtered to Today (local time).'
                  : fifoWindowPreset === 'custom'
                    ? `Filtered to ${fifoCustomFromYmd} → ${fifoCustomToYmd} (local time).`
                    : `Filtered to ${monthOptions[fifoSelectedMonth]?.label} ${fifoSelectedYear} (local time).`}
              </div>

              {fifoNoMatchBreakdown.totalNoMatch > 0 && (
                <div className={`mt-3 rounded-md border p-3 text-xs ${isNeon ? 'bg-white/5 border-white/10 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}>
                  <div className="font-semibold">Why no_match is happening (top reasons)</div>
                  <div className={`mt-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                    These are the most common failure reasons for this window. Toggle <span className="font-semibold">Show only no_match</span> to inspect rows.
                  </div>
                  <div className="mt-2 grid gap-1">
                    {fifoNoMatchBreakdown.topReasons.map((x) => (
                      <div key={x.reason} className="flex items-center justify-between gap-3">
                        <div className="truncate">
                          <span className="font-mono">{x.reason}</span>
                        </div>
                        <div className="font-semibold tabular-nums">{x.count}</div>
                      </div>
                    ))}
                  </div>
                  <div className={`mt-2 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                    Quick fixes:
                    <div className="mt-1">
                      - <span className="font-semibold">missing_sale_styleId</span>: sale import is missing styleId → re-import with catalog/details, or ensure styleId is saved on `user_sales`.
                    </div>
                    <div className="mt-1">
                      - <span className="font-semibold">missing_sale_size</span>: sale import missing size → fix normalization or enrich sale data.
                    </div>
                    <div className="mt-1">
                      - <span className="font-semibold">no_purchase_candidates</span>: we have no purchases matching styleId+size (or name+size fallback) → check purchases have styleId/size and are under the same userId.
                    </div>
                    <div className="mt-1">
                      - <span className="font-semibold">no_eligible_purchase</span>: candidates exist but are already used, after the sale date, or ineligible due to Strict delivery → toggle Strict delivery off for testing or backfill `actualDelivery`.
                    </div>
                  </div>
                </div>
              )}

              {lastStockXRefresh && (
                <div className={`mt-3 rounded-md border p-3 text-xs ${isNeon ? 'bg-white/5 border-white/10 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}>
                  <div className="font-semibold">Last StockX non-final refresh</div>
                  <div className={`mt-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                    {lastStockXRefresh?.skipped
                      ? 'Skipped (TTL not expired).'
                      : `Updated ${lastStockXRefresh?.summary?.updated ?? 0} sale(s), failed ${lastStockXRefresh?.summary?.failed ?? 0}.`}
                  </div>
                </div>
              )}

              {lastSalesIdBackfill && (
                <div className={`mt-3 rounded-md border p-3 text-xs ${isNeon ? 'bg-white/5 border-white/10 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}>
                  <div className="font-semibold">Last sale identifier backfill</div>
                  <div className={`mt-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                    {lastSalesIdBackfill?.skipped
                      ? (() => {
                          const ttlHours = typeof lastSalesIdBackfill?.ttlHours === 'number' ? lastSalesIdBackfill.ttlHours : 24;
                          const lastRunAtIso = typeof lastSalesIdBackfill?.lastRunAtIso === 'string' ? lastSalesIdBackfill.lastRunAtIso : null;
                          return `Skipped (TTL ${ttlHours}h not expired).${lastRunAtIso ? ` Last run: ${lastRunAtIso}.` : ''} Use “Force IDs” to bypass.`;
                        })()
                      : (() => {
                          const s = lastSalesIdBackfill?.summary || {};
                          const legacyUpdated = typeof s?.legacyUpdated === 'number' ? s.legacyUpdated : 0;
                          const remoteAttempted = typeof s?.remoteAttempted === 'number' ? s.remoteAttempted : 0;
                          const nextCursor = typeof s?.nextCursorId === 'string' ? s.nextCursorId : '';
                          return `Updated ${s.updated ?? 0} sale(s), failed ${s.failed ?? 0}, legacyUpdated ${legacyUpdated}, remoteAttempted ${remoteAttempted}, scannedPageCandidates ${s.candidateSales ?? 0}.${nextCursor ? ' (more pages available)' : ''}`;
                        })()}
                  </div>
                  {typeof lastSalesIdBackfill?.summary?.nextCursorId === 'string' && lastSalesIdBackfill.summary.nextCursorId && (
                    <div className={`mt-2 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      More sales to scan. Click “Force IDs” again to continue (cursor saved).
                    </div>
                  )}
                  {!!lastSalesIdBackfill?.summary?.failed && (
                    <div className={`mt-2 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      <div className="font-semibold">Failure breakdown</div>
                      <div className="mt-1">
                        <span className="font-semibold">blocked</span>: {lastSalesIdBackfill?.summary?.blockedCount ?? 0}{' '}
                        <span className="opacity-70">(403 PerimeterX)</span>
                      </div>
                      <div className="mt-1 whitespace-pre-wrap break-words">
                        <span className="font-semibold">statusCounts</span>: {JSON.stringify(lastSalesIdBackfill?.summary?.failureStatusCounts || {})}
                      </div>
                      {Array.isArray(lastSalesIdBackfill?.failures) && lastSalesIdBackfill.failures.length > 0 && (
                        <div className="mt-2">
                          <div className="font-semibold">Sample failures</div>
                          <div className="mt-1 space-y-1">
                            {lastSalesIdBackfill.failures.slice(0, 5).map((f: any, i: number) => (
                              <div key={i} className="opacity-90">
                                <span className="font-semibold">{f?.orderNumber || '—'}</span>: {f?.error || 'error'}
                                {typeof f?.status === 'number' ? ` (status=${f.status})` : ''}
                                {f?.blocked ? ' (blocked)' : ''}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {autoFixLogs.length > 0 && (
                <div className={`mt-3 rounded-md border p-3 text-xs ${isNeon ? 'bg-white/5 border-white/10 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`}>
                  <div className="font-semibold">Auto fix progress</div>
                  <div className={`mt-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                    {autoFixLogs.length} batch{autoFixLogs.length === 1 ? '' : 'es'} run (most recent first)
                  </div>
                  <div className="mt-2 space-y-1">
                    {autoFixLogs
                      .slice()
                      .reverse()
                      .slice(0, 8)
                      .map((l, i) => (
                        <div key={i} className="opacity-90 whitespace-pre-wrap break-words">
                          <span className="font-semibold">{l.atIso}</span> — updated={l.updated} legacyUpdated={l.legacyUpdated}{' '}
                          remoteAttempted={l.remoteAttempted} failed={l.failed}{' '}
                          {l.stoppedEarlyReason ? ` stoppedEarlyReason=${l.stoppedEarlyReason}` : ''}
                          {l.nextCursorId ? ' • more pages' : ''}
                          {' • '}
                          statusCounts={JSON.stringify(l.statusCounts)}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {fifoStrictDelivery &&
                typeof fifoSummary?.wouldLink === 'number' &&
                typeof fifoSummary?.noMatch === 'number' &&
                fifoSummary.wouldLink === 0 &&
                fifoSummary.noMatch > 0 && (
                  <div
                    className={`mt-3 rounded-md border p-3 text-xs ${
                      isNeon
                        ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
                        : 'bg-yellow-50 border-yellow-200 text-yellow-900'
                    }`}
                  >
                    <div className="font-semibold">Strict delivery is ON.</div>
                    <div className="mt-1">
                      Your purchases are only eligible if they have <span className="font-semibold">actualDelivery</span>. Right now, it looks like most purchases don’t have that field yet, so everything becomes <span className="font-semibold">no_match</span> and profit totals show $0.
                    </div>
                    <div className="mt-1">
                      Fix: toggle <span className="font-semibold">Strict delivery</span> OFF and re-run, or backfill delivery dates via tracking / Delivered-email fallback.
                    </div>
                  </div>
                )}

              {fifoCompare?.a?.summary && fifoCompare?.b?.summary && (
                <div
                  className={`mt-3 rounded-md border p-3 text-xs ${
                    isNeon ? 'bg-white/5 border-white/10 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-900'
                  }`}
                >
                  <div className="font-semibold">Match mode comparison</div>
                  <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(['a', 'b'] as const).map((k) => {
                      const entry = fifoCompare[k];
                      const s = entry?.summary || {};
                      const dbg = s?.purchasesDebug || {};
                      return (
                        <div key={k} className={`rounded-md p-2 ${isNeon ? 'bg-black/20' : 'bg-white border border-gray-200'}`}>
                          <div className="font-semibold">mode={entry?.matchMode}</div>
                          <div className="mt-1 opacity-90">
                            scanned={s?.totalSalesScanned ?? '—'} • matched={s?.wouldLink ?? '—'} • noMatch={s?.noMatch ?? '—'} • allocatedNoMatch=
                            {s?.allocated?.noMatch ?? '—'}
                          </div>
                          <div className="mt-1 opacity-90">
                            matchesByStyleId={dbg?.matchesByStyleId ?? '—'} • matchesByUrlKey={dbg?.matchesByUrlKey ?? '—'} • slugSuccessProductName=
                            {dbg?.slugSuccessProductName ?? '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 opacity-80">
                    Tip: pick the mode with higher <span className="font-semibold">matched</span> and lower <span className="font-semibold">allocatedNoMatch</span>.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sales-style table (but rows are FIFO dry-run results) */}
        <div
          id={fifoResultsAnchorId}
          className={`rounded-xl overflow-hidden ${
            isNeon
              ? 'bg-gradient-to-br from-gray-900/50 to-gray-900/30 border border-white/10 shadow-2xl'
              : 'bg-white border border-gray-200 shadow-lg'
          }`}
        >
          <div className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Sales (FIFO results)</h2>
              <div className="flex items-center gap-3">
                {(saleSearch.trim() || fifoShowNoMatchOnly) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSaleSearch('');
                      setFifoShowNoMatchOnly(false);
                    }}
                    className={`h-8 rounded-md px-3 text-xs font-semibold ${
                      isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                    title="Clear table filters"
                  >
                    Clear filters
                  </button>
                )}
                <div className={`text-sm ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>
                  Showing {fifoPagination.total === 0 ? 0 : fifoPagination.start + 1}–{fifoPagination.end} of {fifoPagination.total}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <input
                value={saleSearch}
                onChange={(e) => setSaleSearch(e.target.value)}
                className={`w-full px-3 py-2 rounded-md border ${
                  isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                }`}
                placeholder="Search sales (order #, product, size, style)…"
              />
            </div>
            {fifoRows.length > 0 && filteredFifoRows.length === 0 && (
              <div
                className={`mt-2 rounded-md border px-3 py-2 text-xs ${
                  isNeon ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200' : 'bg-yellow-50 border-yellow-200 text-yellow-900'
                }`}
              >
                No rows are showing because of active filters
                {fifoShowNoMatchOnly ? (
                  <>
                    {' '}
                    (<span className="font-semibold">Show only no_match</span> is ON, but there are 0 no_match rows).
                  </>
                ) : saleSearch.trim() ? (
                  <>
                    {' '}
                    (search query doesn’t match any rows).
                  </>
                ) : (
                  '.'
                )}{' '}
                Click <span className="font-semibold">Clear filters</span>.
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportFifoCsv}
                disabled={fifoRows.length === 0}
                className={`h-9 rounded-md px-3 text-xs font-semibold disabled:opacity-60 ${
                  isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                Export FIFO CSV
              </button>
              <div className="flex items-center gap-2">
                <label className={`text-xs font-semibold ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Rows</label>
                <select
                  value={fifoRowsPerPage}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFifoRowsPerPage(v === 'all' ? 'all' : Number(v));
                  }}
                  className={`h-9 rounded-md px-2 text-sm border ${
                    isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value="all">All</option>
                </select>
              </div>
              {fifoRowsPerPage !== 'all' && fifoPagination.pages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFifoTablePage((p) => Math.max(1, p - 1))}
                    disabled={fifoPagination.page <= 1}
                    className={`h-9 rounded-md px-3 text-xs font-semibold disabled:opacity-60 ${
                      isNeon ? 'bg-white/5 hover:bg-white/10 text-white border border-white/10' : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Prev
                  </button>
                  <div className={`text-xs ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                    Page {fifoPagination.page} / {fifoPagination.pages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setFifoTablePage((p) => Math.min(fifoPagination.pages, p + 1))}
                    disabled={fifoPagination.page >= fifoPagination.pages}
                    className={`h-9 rounded-md px-3 text-xs font-semibold disabled:opacity-60 ${
                      isNeon ? 'bg-white/5 hover:bg-white/10 text-white border border-white/10' : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Next
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowRawSalesTable((v) => !v)}
                className={`h-9 rounded-md px-3 text-xs font-semibold ${
                  isNeon ? 'bg-white/5 hover:bg-white/10 text-white border border-white/10' : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {showRawSalesTable ? 'Hide raw sales' : 'Show raw sales'}
              </button>
            </div>

            {/* FIFO averages / metrics (for matched rows in selected month/year) */}
            <div
              className={`mt-4 rounded-lg border p-3 text-sm ${
                isNeon ? 'bg-gray-900/40 border-gray-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-900'
              }`}
            >
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <span
                  className="font-semibold"
                  title="Total profit across matched FIFO rows for the selected period. Profit = sum(Net Payout − Total Paid)."
                >
                  Total Profit: {fifoMetrics.count === 0 ? '—' : currency(fifoMetrics.profitSum)}
                </span>
                <span
                  className="font-semibold"
                  title="Average profit per matched FIFO row (only rows with net payout + total paid). Profit = Net Payout − Total Paid."
                >
                  Avg Profit: {fifoMetrics.avgProfit === null ? '—' : currency(fifoMetrics.avgProfit)}
                </span>
                <span title="Average ROI across matched rows, where ROI = Profit ÷ Total Paid (computed per-row then averaged).">
                  Avg ROI:{' '}
                  <span className="font-semibold">{fifoMetrics.avgRoi === null ? '—' : `${(fifoMetrics.avgRoi * 100).toFixed(1)}%`}</span>
                </span>
                <span title="ROI using totals (more stable): Total Profit ÷ Total Paid, across matched rows.">
                  ROI (Totals):{' '}
                  <span className="font-semibold">{fifoMetrics.overallRoi === null ? '—' : `${(fifoMetrics.overallRoi * 100).toFixed(1)}%`}</span>
                </span>
                <span title="Average margin across matched rows, where Margin = Profit ÷ Net Payout (computed per-row then averaged).">
                  Avg Margin:{' '}
                  <span className="font-semibold">{fifoMetrics.avgMargin === null ? '—' : `${(fifoMetrics.avgMargin * 100).toFixed(1)}%`}</span>
                </span>
                <span title="Average net payout per matched row (sale proceeds after platform fees).">
                  Avg Net Payout:{' '}
                  <span className="font-semibold">{fifoMetrics.avgNetPayout === null ? '—' : currency(fifoMetrics.avgNetPayout)}</span>
                </span>
                <span title="Average total paid per matched row (what you paid for inventory, net of credits).">
                  Avg Total Paid:{' '}
                  <span className="font-semibold">{fifoMetrics.avgPaid === null ? '—' : currency(fifoMetrics.avgPaid)}</span>
                </span>
                <span title="Average holding time in days: Sale timestamp − Purchase available timestamp.">
                  Avg Days Held:{' '}
                  <span className="font-semibold">{fifoMetrics.avgDays === null ? '—' : `${fifoMetrics.avgDays.toFixed(1)}d`}</span>
                </span>
                <span
                  title="Percent of matched rows that are profitable (Profit ≥ 0). This is not a 'match rate'—it’s a profitability rate."
                >
                  Win rate:{' '}
                  <span className="font-semibold">
                    {fifoMetrics.count === 0 ? '—' : `${((fifoMetrics.profitable / fifoMetrics.count) * 100).toFixed(1)}%`}
                  </span>
                </span>
              </div>
              <div className={`mt-1 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Hover a metric to see how it’s calculated.
              </div>
            </div>
          </div>

          <div className="overflow-x-auto px-6 pb-6">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <thead
                className={`${
                  isNeon
                    ? 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-white/20 backdrop-blur-sm'
                    : 'bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 border-b border-gray-300'
                } sticky top-0 z-10`}
              >
                <tr className={`h-12 ${isNeon ? 'divide-x divide-white/5' : 'divide-x divide-gray-200'}`}>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <Hash className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors whitespace-nowrap`}>
                        Sale Order #
                      </span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <Box className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Product</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <Ruler className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Size</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Sale</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <HandCoins className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Fees</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Total Paid</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Profit</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <Link2 className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Linked</span>
                    </div>
                  </th>
                  <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                    <div className="flex items-center justify-center h-full gap-2">
                      <Settings2 className={`w-4 h-4 ${headerIconClass}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Actions</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className={`${isNeon ? 'text-gray-200 divide-y divide-white/5' : 'text-gray-900 divide-y divide-gray-200'}`}>
                {visibleFifoRows.map((r: any, idx: number) => {
                    const n = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
                    const salePrice = n(r.salePrice);
                    const fees = n(r.saleFees);
                    const netPayout = n(r.saleNetPayout) ?? (salePrice !== null ? salePrice - (fees ?? 0) : null);
                    const totalPaid = n(r.purchaseCost);
                    const profit = n(r.profit) ?? (netPayout !== null && totalPaid !== null ? netPayout - totalPaid : null);
                    const paidKnown = totalPaid !== null;
                    const saleOrder = String(r.saleOrderNumber || '');
                    const purchaseOrder = String(r.linkedPurchaseOrderNumber || '');
                    const linkedLabel = purchaseOrder || (r.linkedPurchaseId ? 'linked' : '—');
                    const details = [
                      String(r.status || ''),
                      String(r.method || ''),
                      String(r.reason || '')
                    ]
                      .filter(Boolean)
                      .join(' • ');

                    return (
                      <tr key={`${saleOrder || idx}`} className="group">
                        <td className="py-2 pr-3 whitespace-nowrap">{saleOrder || '—'}</td>
                        <td className="py-2 pr-3 max-w-[280px] truncate">{String(r.saleProduct || '—')}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{String(r.saleSize || '—')}</td>
                        <td className="py-2 pr-3 text-right">{salePrice === null ? '—' : currency(salePrice)}</td>
                        <td className="py-2 pr-3 text-right">{fees === null ? '—' : currency(fees)}</td>
                        <td className="py-2 pr-3 text-right">{paidKnown ? currency(totalPaid) : '—'}</td>
                        <td className="py-2 pr-3 text-right" title={paidKnown ? 'Profit = net payout − total paid' : ''}>
                          {paidKnown ? (
                            <span
                              className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 font-semibold ${
                                (profit ?? 0) >= 0
                                  ? isNeon
                                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-200'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : isNeon
                                    ? 'bg-red-500/20 border-red-500/30 text-red-200'
                                    : 'bg-red-50 border-red-200 text-red-800'
                              }`}
                            >
                              {currency(profit)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{linkedLabel}</td>
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                              isNeon
                                ? 'bg-gray-900 border border-white/20 text-cyan-400 hover:bg-gray-700 hover:border-cyan-500/50'
                                : 'bg-white border border-gray-300 text-blue-700 hover:bg-blue-50'
                            }`}
                            title={details || 'FIFO details'}
                            onClick={() => {
                              const txt = `Sale ${saleOrder} → Purchase ${purchaseOrder || '(none)'}\\n${details}`;
                              navigator.clipboard?.writeText(txt).catch(() => {});
                              showNotice('📋 Copied FIFO details to clipboard.', 'success');
                            }}
                          >
                            <Link2 className="w-4 h-4" />
                            Copy match
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {showRawSalesTable && (
          <div
            className={`rounded-xl overflow-hidden ${
              isNeon
                ? 'bg-gradient-to-br from-gray-900/50 to-gray-900/30 border border-white/10 shadow-2xl'
                : 'bg-white border border-gray-200 shadow-lg'
            }`}
          >
            <div className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Raw sales table (debug)</h2>
                <div className={`text-sm ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>{sales.length} loaded</div>
              </div>
              <div className="mt-3">
                <input
                  value={saleSearch}
                  onChange={(e) => setSaleSearch(e.target.value)}
                  className={`w-full px-3 py-2 rounded-md border ${
                    isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Search sales (order #, product, size, style)…"
                />
              </div>
            </div>
            <div className="overflow-x-auto px-6 pb-6">
              <table className="min-w-full text-sm">
                <thead
                  className={`${
                    isNeon
                      ? 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-white/20 backdrop-blur-sm'
                      : 'bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 border-b border-gray-300'
                  } sticky top-0 z-10`}
                >
                  <tr className="h-12">
                    <th
                      className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}
                    >
                      <div className="flex items-center justify-center h-full gap-2">
                        <Hash className={`w-4 h-4 ${headerIconClass}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors whitespace-nowrap`}>
                          Sale Order #
                        </span>
                      </div>
                    </th>
                    <th
                      className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}
                    >
                      <div className="flex items-center justify-center h-full gap-2">
                        <Box className={`w-4 h-4 ${headerIconClass}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Product</span>
                      </div>
                    </th>
                    <th
                      className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}
                    >
                      <div className="flex items-center justify-center h-full gap-2">
                        <Ruler className={`w-4 h-4 ${headerIconClass}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Size</span>
                      </div>
                    </th>
                    <th
                      className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}
                    >
                      <div className="flex items-center justify-center h-full gap-2">
                        <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Sale</span>
                      </div>
                    </th>
                    <th
                      className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}
                    >
                      <div className="flex items-center justify-center h-full gap-2">
                        <HandCoins className={`w-4 h-4 ${headerIconClass}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Fees</span>
                      </div>
                    </th>
                    <th
                      className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}
                    >
                      <div className="flex items-center justify-center h-full gap-2">
                        <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Total Paid</span>
                      </div>
                    </th>
                    <th
                      className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all text-right`}
                    >
                      <div className="flex items-center justify-center h-full gap-2">
                        <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Profit</span>
                      </div>
                    </th>
                    <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                      <div className="flex items-center justify-center h-full gap-2">
                        <Link2 className={`w-4 h-4 ${headerIconClass}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Linked</span>
                      </div>
                    </th>
                    <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                      <div className="flex items-center justify-center h-full gap-2">
                        <Settings2 className={`w-4 h-4 ${headerIconClass}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Actions</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className={`${isNeon ? 'text-gray-200 divide-y divide-white/5' : 'text-gray-900 divide-y divide-gray-200'}`}>
                  {filteredSales.slice(0, 50).map((s) => {
                    const netPayout = getNetPayout(s);
                    const totalPaid = getTotalPaid(s);
                    const paidKnown = hasKnownTotalPaid(s);
                    const profit = paidKnown ? netPayout - totalPaid : null;
                    return (
                      <tr key={s.id} className="group">
                        <td className="py-2 pr-3 whitespace-nowrap">{(s.orderNumber || s.id).slice(0, 18)}</td>
                        <td className="py-2 pr-3 max-w-[280px] truncate">{s.product || '—'}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{s.size || '—'}</td>
                        <td className="py-2 pr-3 text-right">{currency(s.salePrice)}</td>
                        <td className="py-2 pr-3 text-right">{currency(s.fees)}</td>
                        <td className="py-2 pr-3 text-right">{paidKnown ? currency(totalPaid) : '—'}</td>
                        <td className="py-2 pr-3 text-right" title="Profit = net payout − total paid">
                          {paidKnown ? (
                            <span
                              className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 font-semibold ${
                                (profit ?? 0) >= 0
                                  ? isNeon
                                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-200'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : isNeon
                                    ? 'bg-red-500/20 border-red-500/30 text-red-200'
                                    : 'bg-red-50 border-red-200 text-red-800'
                              }`}
                            >
                              {currency(profit)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {s.linkedPurchaseOrderNumber || (s.linkedPurchaseId ? 'linked' : '—')}
                        </td>
                        <td className="py-2 pr-3">
                          <button
                            onClick={() => {
                              setSelectedSaleId(s.id);
                              setShowLinkModal(true);
                            }}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                              isNeon
                                ? 'bg-gray-900 border border-white/20 text-cyan-400 hover:bg-gray-700 hover:border-cyan-500/50'
                                : 'bg-white border border-gray-300 text-blue-700 hover:bg-blue-50'
                            }`}
                          >
                            <Link2 className="w-4 h-4" />
                            Link purchase
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredSales.length > 50 && (
              <div className={`mt-1 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-500'}`}>
                {filteredSales.length > 50 ? `Showing first 50 of ${filteredSales.length} matches` : `Showing ${filteredSales.length} matches`}
              </div>
            )}
          </div>
        )}

        {showLinkModal && selectedSale && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-5xl rounded-xl border overflow-hidden ${isNeon ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className={`p-4 border-b flex items-center justify-between ${isNeon ? 'border-gray-700' : 'border-gray-200'}`}>
                <div>
                  <div className="text-lg font-semibold">Link purchase to sale</div>
                  <div className={`text-sm ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>
                    Sale: {selectedSale.orderNumber || selectedSale.id} • {selectedSale.product || 'Unknown'} • Size {selectedSale.size || '—'}
                  </div>
                </div>
                <button
                  onClick={() => setShowLinkModal(false)}
                  className={`p-2 rounded-lg ${isNeon ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold">Select a purchase</div>
                  <button
                    onClick={suggestPurchaseForSelectedSale}
                    disabled={linking}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                      isNeon ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-gray-900 text-white hover:bg-gray-800'
                    } disabled:opacity-60`}
                  >
                    Suggest FIFO purchase
                  </button>
                </div>

                <div className="overflow-x-auto max-h-[50vh] mb-4">
                  <table className="min-w-full text-sm">
                    <thead
                      className={`${
                        isNeon
                          ? 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-white/20 backdrop-blur-sm'
                          : 'bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 border-b border-gray-300'
                      } sticky top-0 z-10`}
                    >
                      <tr>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <Hash className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors whitespace-nowrap`}>Purchase Order #</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <Box className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Product</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <Ruler className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Size</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Unit</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Delivered</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <DollarSign className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Cost</span>
                          </div>
                        </th>
                        <th className={`px-4 py-0 h-12 select-none group ${isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-all`}>
                          <div className="flex items-center justify-center h-full gap-2">
                            <Link2 className={`w-4 h-4 ${headerIconClass}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${headerTextClass} transition-colors`}>Linked</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className={`${isNeon ? 'text-gray-200 divide-y divide-white/5' : 'text-gray-900 divide-y divide-gray-200'}`}>
                      {purchases.slice(0, 100).map((p) => {
                        const isSel = p.id === selectedPurchaseId;
                        const cost = getPurchaseCost(p);
                        const img = String(p.productImageUrl || '') || String(p.product?.image || '') || '';
                        const name = String(p.product?.name || p.product?.productName || p.product?.title || '') || 'Unknown Product';
                        const size = String(p.product?.size || p.size || p.extracted_size || '—');
                        return (
                          <tr
                            key={p.id}
                            className={`${isSel ? (isNeon ? 'bg-cyan-500/10' : 'bg-blue-50') : ''} cursor-pointer`}
                            onClick={() => setSelectedPurchaseId(p.id)}
                          >
                            <td className="py-2 pr-3 whitespace-nowrap">{(p.orderNumber || p.id).slice(0, 18)}</td>
                            <td className="py-2 pr-3 max-w-[280px] truncate">{name}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{size}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{p.unitNumber ? `#${p.unitNumber}` : '—'}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{(effectiveActualDelivery(p) || '').slice(0, 10) || '—'}</td>
                            <td className="py-2 pr-3 text-right">{currency(cost)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{p.linkedSaleOrderNumber || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedPurchase && (
                  <div className={`rounded-lg p-4 mb-4 ${isNeon ? 'bg-gray-800/60 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="text-sm font-semibold mb-2">Selected purchase</div>
                    <div className={`text-sm ${isNeon ? 'text-gray-200' : 'text-gray-800'}`}>
                      Order: {selectedPurchase.orderNumber || selectedPurchase.id} • Unit: {selectedPurchase.unitNumber || '—'}
                    </div>
                    <div className={`text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      Delivered: {effectiveActualDelivery(selectedPurchase) || '—'} • Cost: {currency(getPurchaseCost(selectedPurchase))}
                    </div>
                    <div className="mt-3">
                      <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>
                        Simulate actualDelivery (test only)
                      </label>
                      <input
                        type="date"
                        value={(effectiveActualDelivery(selectedPurchase) || '').slice(0, 10)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSimulatedDeliveryByPurchaseId((prev) => ({ ...prev, [selectedPurchase.id]: v }));
                        }}
                        className={`w-full px-3 py-2 rounded-md border ${
                          isNeon ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      />
                      <div className={`mt-1 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                        This only affects matching on this test page (no DB writes).
                      </div>
                    </div>

                    {!effectiveActualDelivery(selectedPurchase) && (
                      <div className={`mt-2 text-sm ${isNeon ? 'text-yellow-200' : 'text-yellow-700'}`}>
                        No <span className="font-semibold">actualDelivery</span> yet → strict mode cannot auto-suggest.
                      </div>
                    )}
                  </div>
                )}

                <div className={`rounded-lg p-4 ${isNeon ? 'bg-gray-800/60 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
                  <div className="text-sm font-semibold mb-2">Actions</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={previewLinkSelected}
                      disabled={linking || !selectedPurchase}
                      className={`px-3 py-2 rounded-md text-sm font-semibold ${
                        isNeon ? 'bg-cyan-500 text-black hover:bg-cyan-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                      } disabled:opacity-50`}
                    >
                      {linking ? 'Working…' : 'Preview link'}
                    </button>
                    <button
                      onClick={commitLinkSelected}
                      disabled={linking || !allowWrites || !selectedPurchase}
                      className={`px-3 py-2 rounded-md text-sm font-semibold ${
                        isNeon ? 'bg-cyan-600 text-black hover:bg-cyan-500' : 'bg-blue-700 text-white hover:bg-blue-800'
                      } disabled:opacity-50`}
                      title={!allowWrites ? 'Enable Allow writes above' : 'Writes to Firestore'}
                    >
                      Commit link
                    </button>
                    <button
                      onClick={previewUnlinkSelectedSale}
                      disabled={linking}
                      className={`px-3 py-2 rounded-md text-sm font-semibold ${
                        isNeon ? 'bg-red-500/20 border border-red-500/30 text-red-200 hover:bg-red-500/25' : 'bg-red-600 text-white hover:bg-red-700'
                      } disabled:opacity-60`}
                    >
                      {linking ? 'Working…' : 'Preview unlink'}
                    </button>
                    <button
                      onClick={commitUnlinkSelectedSale}
                      disabled={linking || !allowWrites}
                      className={`px-3 py-2 rounded-md text-sm font-semibold ${
                        isNeon ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-700 text-white hover:bg-red-800'
                      } disabled:opacity-50`}
                      title={!allowWrites ? 'Enable Allow writes above' : 'Writes to Firestore'}
                    >
                      Commit unlink
                    </button>
                  </div>
                  {!selectedPurchase && (
                    <div className={`mt-2 text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      No purchase selected yet. Pick one above.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {preview && (
          <div className={`rounded-xl border p-6 ${isNeon ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-lg font-semibold">Preview</h2>
            <div className={`mt-2 text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
              This is a dry-run response. No writes were performed.
            </div>
            <pre className={`mt-4 text-xs overflow-x-auto p-4 rounded-lg ${isNeon ? 'bg-gray-900/60 border border-gray-700 text-gray-200' : 'bg-gray-50 border border-gray-200 text-gray-800'}`}>
{JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        )}

        {/* FIFO results table moved above to replace the Sales 2.0 table. Keep this block disabled to avoid duplicate anchors. */}
        {false && fifoRows.length > 0 && (
          <div
            id="fifo-results-anchor"
            className={`rounded-xl border p-6 ${isNeon ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
          >
            <h2 className="text-lg font-semibold">FIFO dry-run results (sample)</h2>
            <div className={`mt-2 text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
              Strict mode: FIFO only considers purchases with <span className="font-semibold">actualDelivery</span>.
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`text-sm font-semibold ${isNeon ? 'text-gray-200' : 'text-gray-900'}`}>Month totals</div>
                <button
                  type="button"
                  onClick={exportFifoCsv}
                  disabled={fifoRows.length === 0}
                  className={`h-9 rounded-md px-3 text-xs font-semibold disabled:opacity-60 ${
                    isNeon
                      ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                  title="Download the current FIFO results as a CSV"
                >
                  Export CSV
                </button>
              </div>

              <div
                className={`rounded-lg border p-3 text-sm ${
                  isNeon ? 'bg-gray-900/40 border-gray-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-900'
                }`}
              >
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="font-semibold">
                  Included: {fifoProfitTotals.count}
                </span>
                <span>
                  Net Payout: <span className="font-semibold">{currency(fifoProfitTotals.netPayout)}</span>
                </span>
                <span>
                  Total Paid: <span className="font-semibold">{currency(fifoProfitTotals.totalPaid)}</span>
                </span>
                <span>
                  Profit: <span className="font-semibold">{currency(fifoProfitTotals.profit)}</span>
                </span>
              </div>
              <div className={`mt-1 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Totals are based on the FIFO committed-profit window you selected above.
              </div>
              {fifoProfitTotals.count === 0 && fifoRows.length > 0 && (
                <div className={`mt-2 text-xs ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                  If this seems wrong, check the FIFO summary above—often it’s because Strict delivery is ON and purchases are missing <span className="font-semibold">actualDelivery</span>.
                </div>
              )}
            </div>
            </div>

            {/* (moved above into the main Sales table header area) */}

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className={isNeon ? 'text-gray-300' : 'text-gray-700'}>
                    <th className="text-left py-2 pr-4">Sale Order</th>
                    <th className="text-left py-2 pr-4">Product</th>
                    <th className="text-left py-2 pr-4">Size</th>
                    <th className="text-left py-2 pr-4 whitespace-nowrap">Sale StyleId</th>
                    <th className="text-left py-2 pr-4 whitespace-nowrap">Sale Date (Local)</th>
                    <th className="text-right py-2 pr-4">Sale Price</th>
                    <th className="text-right py-2 pr-4">Fees</th>
                    <th className="text-right py-2 pr-4">Net Payout</th>
                    <th className="text-right py-2 pr-4">Total Paid</th>
                    <th className="text-right py-2 pr-4">Profit</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2 pr-4">Reason</th>
                    <th className="text-left py-2 pr-4">Method</th>
                    <th className="text-left py-2 pr-4">Purchase Order</th>
                    <th className="text-left py-2 pr-4 whitespace-nowrap">Purchase StyleId</th>
                    <th className="text-left py-2 pr-4 whitespace-nowrap">Purchase Available (Local)</th>
                    <th className="text-left py-2 pr-4">Delivered</th>
                  </tr>
                </thead>
                <tbody className={`${isNeon ? 'text-gray-200 divide-y divide-white/5' : 'text-gray-900 divide-y divide-gray-200'}`}>
                  {fifoRows.map((r, idx) => (
                    <tr key={idx} className="group">
                      {(() => {
                        const n = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
                        const salePrice = n(r.salePrice);
                        const fees = n(r.saleFees);
                        const netPayout = n(r.saleNetPayout) ?? (salePrice !== null ? salePrice - (fees ?? 0) : null);
                        const totalPaid = n(r.purchaseCost);
                        const profit = n(r.profit) ?? (netPayout !== null && totalPaid !== null ? netPayout - totalPaid : null);
                        const fmt = (v: number | null) => (v === null ? '—' : currency(v));
                        const reason = typeof r.reason === 'string' && r.reason ? r.reason : null;
                        const saleCutoffIso = typeof (r as any).saleCutoffIso === 'string' ? String((r as any).saleCutoffIso) : null;
                        const saleCutoffSource = typeof (r as any).saleCutoffSource === 'string' ? String((r as any).saleCutoffSource) : null;
                        const purchaseFifoIso = typeof (r as any).purchaseFifoIso === 'string' ? String((r as any).purchaseFifoIso) : null;
                        const purchaseFifoSource =
                          typeof (r as any).purchaseFifoSource === 'string' ? String((r as any).purchaseFifoSource) : null;
                        const candidatesTotal = typeof r.candidatesTotal === 'number' ? r.candidatesTotal : null;
                        const nameCandidatesTotal = typeof (r as any).nameCandidatesTotal === 'number' ? (r as any).nameCandidatesTotal : null;
                        const sizeCandidatesTotal = typeof (r as any).sizeCandidatesTotal === 'number' ? (r as any).sizeCandidatesTotal : null;
                        const candidatesConsidered = typeof r.candidatesConsidered === 'number' ? r.candidatesConsidered : null;
                        const nameMode = typeof (r as any).nameMatchMode === 'string' ? String((r as any).nameMatchMode) : null;
                        const nameAttempted = typeof (r as any).nameCandidatesAttempted === 'number' ? (r as any).nameCandidatesAttempted : null;
                        const nameConsidered = typeof (r as any).nameCandidatesConsidered === 'number' ? (r as any).nameCandidatesConsidered : null;
                        const nameSkippedUsed = typeof (r as any).nameCandidatesSkippedUsed === 'number' ? (r as any).nameCandidatesSkippedUsed : null;
                        const nameSkippedAfterSaleDate = typeof (r as any).nameCandidatesSkippedAfterSaleDate === 'number' ? (r as any).nameCandidatesSkippedAfterSaleDate : null;
                        const nameSkippedAfterSaleDateButUnreliable =
                          typeof (r as any).nameCandidatesSkippedAfterSaleDateButUnreliable === 'number'
                            ? (r as any).nameCandidatesSkippedAfterSaleDateButUnreliable
                            : null;
                        const bestNameScore = typeof (r as any).bestNameMatchScore === 'number' ? (r as any).bestNameMatchScore : null;
                        const bestNameOverlap = typeof (r as any).bestNameMatchOverlap === 'number' ? (r as any).bestNameMatchOverlap : null;
                        const bestNameCandidateOrder = typeof (r as any).bestNameMatchCandidateOrderNumber === 'string' ? (r as any).bestNameMatchCandidateOrderNumber : null;
                        const bestNameCandidateName =
                          typeof (r as any).bestNameMatchCandidateName === 'string' ? String((r as any).bestNameMatchCandidateName) : null;
                        const bestNameCandidateFifoIso =
                          typeof (r as any).bestNameMatchCandidateFifoIso === 'string' ? String((r as any).bestNameMatchCandidateFifoIso) : null;
                        const bestNameCandidateFifoSource =
                          typeof (r as any).bestNameMatchCandidateFifoSource === 'string'
                            ? String((r as any).bestNameMatchCandidateFifoSource)
                            : null;
                        const saleStyleId = typeof r.saleStyleId === 'string' && r.saleStyleId ? r.saleStyleId : null;
                        const purchaseStyleId =
                          typeof (r as any).linkedPurchaseStyleId === 'string' && (r as any).linkedPurchaseStyleId
                            ? String((r as any).linkedPurchaseStyleId)
                            : null;
                        const reasonDetail =
                          reason === null
                            ? '—'
                            : [
                                reason,
                                saleStyleId ? `styleId=${saleStyleId}` : null,
                                candidatesTotal !== null ? `candidates=${candidatesTotal}` : null,
                                nameCandidatesTotal !== null ? `nameCandidates=${nameCandidatesTotal}` : null,
                                sizeCandidatesTotal !== null ? `sizeCandidates=${sizeCandidatesTotal}` : null,
                                candidatesConsidered !== null ? `considered=${candidatesConsidered}` : null,
                                nameMode ? `nameMode=${nameMode}` : null,
                                nameAttempted !== null ? `nameAttempted=${nameAttempted}` : null,
                                nameConsidered !== null ? `nameConsidered=${nameConsidered}` : null,
                                nameSkippedUsed !== null ? `nameSkippedUsed=${nameSkippedUsed}` : null,
                                nameSkippedAfterSaleDate !== null ? `nameSkippedAfterSaleDate=${nameSkippedAfterSaleDate}` : null,
                                nameSkippedAfterSaleDateButUnreliable !== null
                                  ? `nameSkippedAfterSaleDateButUnreliable=${nameSkippedAfterSaleDateButUnreliable}`
                                  : null,
                                bestNameScore !== null ? `bestNameScore=${bestNameScore.toFixed(2)}` : null,
                                bestNameOverlap !== null ? `bestNameOverlap=${bestNameOverlap}` : null,
                                bestNameCandidateOrder ? `bestNameCandidateOrder=${bestNameCandidateOrder}` : null,
                                bestNameCandidateName ? `bestNameCandidateName=${bestNameCandidateName}` : null,
                                bestNameCandidateFifoIso ? `bestNameCandidateFifoIso=${bestNameCandidateFifoIso}` : null,
                                bestNameCandidateFifoSource ? `bestNameCandidateFifoSource=${bestNameCandidateFifoSource}` : null,
                              ]
                                .filter(Boolean)
                                .join(' • ');
                        return (
                          <>
                      <td className="py-2 pr-4">
                        <div className="inline-flex items-center gap-2">
                          <span className="font-mono">{r.saleOrderNumber || '—'}</span>
                          {r.saleOrderNumber && r.saleOrderNumber !== '—' && (
                            <a
                              href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(String(r.saleOrderNumber))}`}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                                isNeon
                                  ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                                  : 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50'
                              }`}
                              title="Search this order number in Gmail (new tab)"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              Gmail
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4">{r.saleProduct || '—'}</td>
                      <td className="py-2 pr-4">{r.saleSize || '—'}</td>
                      <td className="py-2 pr-4 font-mono text-xs" title={saleStyleId || undefined}>
                        {saleStyleId || '—'}
                      </td>
                      <td
                        className="py-2 pr-4 text-xs whitespace-nowrap"
                        title={saleCutoffIso ? `${saleCutoffIso}${saleCutoffSource ? ` (${saleCutoffSource})` : ''}` : undefined}
                      >
                        {formatIsoToLocal(saleCutoffIso)}
                      </td>
                      <td className="py-2 pr-4 text-right">{fmt(salePrice)}</td>
                      <td className="py-2 pr-4 text-right">{fmt(fees)}</td>
                      <td className="py-2 pr-4 text-right">{fmt(netPayout)}</td>
                      <td className="py-2 pr-4 text-right">{fmt(totalPaid)}</td>
                      <td className="py-2 pr-4 text-right">{fmt(profit)}</td>
                      <td className="py-2 pr-4">{r.status}</td>
                      <td className="py-2 pr-4">
                        <span
                          className="text-xs text-gray-200/90"
                          title={reasonDetail !== '—' ? reasonDetail : undefined}
                        >
                          {reasonDetail}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{r.method || '—'}</td>
                      <td className="py-2 pr-4">
                        <div className="inline-flex items-center gap-2">
                          <span className="font-mono">{r.linkedPurchaseOrderNumber || '—'}</span>
                          {r.linkedPurchaseOrderNumber && r.linkedPurchaseOrderNumber !== '—' && (
                            <a
                              href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(String(r.linkedPurchaseOrderNumber))}`}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                                isNeon
                                  ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                                  : 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50'
                              }`}
                              title="Search this order number in Gmail (new tab)"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              Gmail
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs" title={purchaseStyleId || undefined}>
                        {purchaseStyleId || '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs whitespace-nowrap" title={purchaseFifoIso || undefined}>
                        {purchaseFifoIso
                          ? `${formatIsoToLocal(purchaseFifoIso)}${purchaseFifoSource ? ` (${purchaseFifoSource})` : ''}`
                          : '—'}
                      </td>
                      <td className="py-2 pr-4">{r.purchaseActualDelivery || '—'}</td>
                          </>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


