'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Database,
  Link2,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Unlink2,
} from 'lucide-react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useSales } from '@/lib/hooks/useSales';

type Preset = 'mtd' | 'last_30' | 'last_90' | 'ytd' | 'custom';

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
};

type CashflowResponse = {
  success: boolean;
  error?: string;
  userId: string;
  fromIso: string;
  toIso: string;
  summary: {
    moneyIn: number;
    moneyOut: number;
    net: number;
    salesCount: number;
    purchasesCount: number;
  };
  transactions: CashflowTx[];
  truncated?: boolean;
  truncatedTotal?: number;
};

type PurchaseDoc = Record<string, any> & { id: string };

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseMoney(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function currency(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function pct(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function dateMsFromAny(val: unknown): number | null {
  if (typeof val !== 'string' || !val.trim()) return null;
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? ms : null;
}

function saleDateMs(sale: any): number | null {
  // Prefer payoutDate for realized profit timing, else fall back.
  return (
    dateMsFromAny(sale?.payoutDate) ??
    dateMsFromAny(sale?.payout_date) ??
    dateMsFromAny(sale?.date) ??
    dateMsFromAny(sale?.updatedAt) ??
    dateMsFromAny(sale?.createdAt) ??
    null
  );
}

function purchaseDateMs(p: any): number | null {
  return (
    dateMsFromAny(p?.purchase_date) ??
    dateMsFromAny(p?.purchaseDate) ??
    dateMsFromAny(p?.email_date) ??
    dateMsFromAny(p?.emailDate) ??
    dateMsFromAny(p?.actualDelivery) ??
    dateMsFromAny(p?.deliveredAt) ??
    dateMsFromAny(p?.createdAt) ??
    dateMsFromAny(p?.syncedAt) ??
    null
  );
}

function normalizePlatform(v: unknown): 'stockx' | 'manual' {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return 'manual';
  if (s.includes('stockx')) return 'stockx';
  return 'manual';
}

function normalizeStatusKey(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const lower = s.toLowerCase().replace(/\s+/g, ' ');
  if (lower === 'cancelled') return 'canceled';
  if (lower === 'canceled') return 'canceled';
  if (lower === 'order canceled/refunded') return 'refunded';
  if (lower === 'refund issued') return 'refunded';
  if (lower === 'refunded') return 'refunded';
  if (lower === 'partially refunded') return 'partially refunded';
  if (lower === 'delivered') return 'delivered';
  if (lower === 'shipped') return 'shipped';
  if (lower === 'ordered' || lower === 'order placed') return 'ordered';
  return lower;
}

function looksDelivered(p: any): boolean {
  const st = normalizeStatusKey(p?.status);
  if (st === 'delivered') return true;
  return Boolean(dateMsFromAny(p?.actualDelivery) ?? dateMsFromAny(p?.deliveredAt));
}

function getPurchaseNetPaid(p: any): number {
  const netPaid = (typeof p?.netPaid === 'number' ? p.netPaid : parseMoney(p?.netPaid)) ?? null;
  if (typeof netPaid === 'number' && Number.isFinite(netPaid)) return Math.max(0, netPaid);
  const totalPayment = (typeof p?.totalPayment === 'number' ? p.totalPayment : parseMoney(p?.totalPayment)) ?? null;
  const totalAmount = (typeof p?.totalAmount === 'number' ? p.totalAmount : parseMoney(p?.totalAmount)) ?? null;
  const base = totalPayment ?? totalAmount ?? (parseMoney(p?.purchasePrice) ?? parseMoney(p?.price) ?? 0);
  const credits = parseMoney(p?.credits ?? p?.discounts ?? 0) ?? 0;
  return Math.max(0, (typeof base === 'number' ? base : 0) - Math.max(0, credits));
}

function getSaleRevenue(s: any): number {
  const direct = (typeof s?.salePrice === 'number' ? s.salePrice : parseMoney(s?.salePrice)) ?? null;
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) return direct;
  const fallback = parseMoney(s?.amount) ?? parseMoney(s?.payout?.amount) ?? 0;
  return Number.isFinite(fallback) ? fallback : 0;
}

function getSaleFees(s: any): number {
  const fees = (typeof s?.fees === 'number' ? s.fees : parseMoney(s?.fees)) ?? 0;
  return Number.isFinite(fees) ? Math.max(0, fees) : 0;
}

function getSaleCogs(s: any): number {
  const cogs = (typeof s?.purchasePrice === 'number' ? s.purchasePrice : parseMoney(s?.purchasePrice)) ?? 0;
  return Number.isFinite(cogs) ? Math.max(0, cogs) : 0;
}

function getSaleProfit(s: any): number {
  const explicit = (typeof s?.profit === 'number' ? s.profit : parseMoney(s?.profit)) ?? null;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  const rev = getSaleRevenue(s);
  const fees = getSaleFees(s);
  const cogs = getSaleCogs(s);
  const p = rev - fees - cogs;
  return Number.isFinite(p) ? p : 0;
}

function SparkBars({
  points,
  isNeon,
  height = 64,
}: {
  points: Array<{ label: string; value: number }>;
  isNeon: boolean;
  height?: number;
}) {
  const maxAbs = points.reduce((m, p) => Math.max(m, Math.abs(p.value)), 0) || 1;
  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-1">
      {points.length === 0 ? (
        <div className={isNeon ? 'text-slate-400 text-sm' : 'text-gray-500 text-sm'}>No data</div>
      ) : (
        points.map((p) => {
          const h = Math.round((Math.abs(p.value) / maxAbs) * (height - 6)) + 6;
          const pos = p.value >= 0;
          const bar = pos ? (isNeon ? 'bg-emerald-500/30' : 'bg-emerald-500') : isNeon ? 'bg-red-500/30' : 'bg-red-500';
          return (
            <div key={p.label} className="flex flex-col items-center gap-1" title={`${p.label}: ${currency(p.value)}`}>
              <div className={`${bar} w-3 rounded-md`} style={{ height: `${h}px` }} />
              <div
                className={`${isNeon ? 'text-slate-400' : 'text-gray-500'} text-[10px]`}
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                {p.label}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashToSeed(input: string): number {
  // Simple deterministic hash -> 32-bit seed
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

function maybe(rand: () => number, p: number): boolean {
  return rand() < p;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function isoAtLocalNoon(d: Date): string {
  // Stable-ish daily grouping without timezone edge cases
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x.toISOString();
}

function generateMockDataset(seedKey: string) {
  const rand = mulberry32(hashToSeed(seedKey));
  const now = new Date();
  const start = addDays(now, -179); // 180-day window

  const products = [
    { name: 'Nike Dunk Low “Panda”', brand: 'Nike' },
    { name: 'Jordan 1 Retro High OG “Chicago”', brand: 'Jordan' },
    { name: 'Adidas Yeezy Boost 350 V2 “Zebra”', brand: 'Yeezy' },
    { name: 'New Balance 2002R “Protection Pack”', brand: 'New Balance' },
    { name: 'Nike Air Max 1 “Patta”', brand: 'Nike' },
    { name: 'Jordan 4 Retro “Bred Reimagined”', brand: 'Jordan' },
    { name: 'Nike SB Dunk Low “Travis Scott”', brand: 'Nike' },
    { name: 'ASICS GEL-Kayano 14 “Silver”', brand: 'Asics' },
    { name: 'Vans Old Skool “Black/White”', brand: 'Vans' },
    { name: 'Converse Chuck 70 “Egret”', brand: 'Converse' },
  ];

  const sizes = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12'];

  const sales: any[] = [];
  const purchases: PurchaseDoc[] = [];

  let saleSeq = 1000;
  let purchaseSeq = 5000;

  // Keep a pool of delivered-but-unsold inventory to enable realistic linking
  const inventoryPool: PurchaseDoc[] = [];

  for (let i = 0; i < 180; i++) {
    const day = addDays(start, i);
    const weekday = day.getDay(); // 0 Sun
    const activityBias = weekday === 0 || weekday === 6 ? 0.7 : 1.0; // weekends slightly slower

    const purchasesToday = Math.floor(rand() * 3 * activityBias); // 0-2
    const salesToday = Math.floor(rand() * 3 * activityBias); // 0-2

    // Purchases
    for (let j = 0; j < purchasesToday; j++) {
      const prod = pick(rand, products);
      const size = pick(rand, sizes);
      const base = 80 + rand() * 320; // 80-400
      const taxShip = base * (0.05 + rand() * 0.08);
      const credits = maybe(rand, 0.18) ? round2(rand() * 25) : 0;
      const netPaid = round2(base + taxShip - credits);
      const status = maybe(rand, 0.08)
        ? 'canceled'
        : maybe(rand, 0.08)
          ? 'refunded'
          : maybe(rand, 0.45)
            ? 'delivered'
            : maybe(rand, 0.65)
              ? 'shipped'
              : 'ordered';

      const delivered = status === 'delivered';
      const deliveredAt = delivered ? isoAtLocalNoon(addDays(day, Math.floor(rand() * 6))) : null;

      const p: PurchaseDoc = {
        id: `mock_purchase_${purchaseSeq++}`,
        userId: 'mock-user',
        orderNumber: `03-${Math.floor(100000000 + rand() * 899999999)}`,
        productName: prod.name,
        product: { name: prod.name, brand: prod.brand, size },
        size,
        market: 'stockx',
        netPaid,
        totalPayment: netPaid,
        credits: credits > 0 ? credits : undefined,
        status,
        purchase_date: isoAtLocalNoon(day),
        actualDelivery: deliveredAt || undefined,
        createdAt: isoAtLocalNoon(day),
      };

      purchases.push(p);

      if (delivered && status !== 'refunded' && status !== 'canceled') {
        inventoryPool.push(p);
      }
    }

    // Sales
    for (let j = 0; j < salesToday; j++) {
      // Either sell from inventory or create “unknown” (unlinked) sale
      const willLink = inventoryPool.length > 0 && maybe(rand, 0.72);
      const inv = willLink ? inventoryPool.splice(Math.floor(rand() * inventoryPool.length), 1)[0] : null;

      const prodName = inv?.productName || pick(rand, products).name;
      const platform = maybe(rand, 0.78) ? 'stockx' : 'manual';

      const cogs = inv ? getPurchaseNetPaid(inv) : 70 + rand() * 260;
      const markup = 1.1 + rand() * 0.55; // 10% to 65%
      const salePrice = round2(cogs * markup);
      const fees = platform === 'stockx' ? round2(salePrice * (0.09 + rand() * 0.05)) : round2(salePrice * (0.03 + rand() * 0.04));
      const profit = round2(salePrice - fees - cogs);

      // Some sales are “pending payout”: keep date but omit payoutDate occasionally
      const payoutLagDays = 0 + Math.floor(rand() * 6);
      const payoutDate = maybe(rand, 0.82) ? isoAtLocalNoon(addDays(day, payoutLagDays)) : null;

      const s: any = {
        id: `mock_sale_${saleSeq++}`,
        userId: 'mock-user',
        orderNumber: `SX-${Math.floor(100000 + rand() * 899999)}`,
        product: prodName,
        platform,
        salePrice,
        fees,
        purchasePrice: round2(cogs),
        profit,
        date: isoAtLocalNoon(day),
        payoutDate: payoutDate || undefined,
        linkedPurchaseId: inv ? inv.id : null,
        linkedPurchaseOrderNumber: inv ? inv.orderNumber || null : null,
        createdAt: isoAtLocalNoon(day),
      };

      sales.push(s);

      // Back-link onto purchase doc sometimes (simulate linking completeness)
      if (inv && maybe(rand, 0.85)) {
        inv.linkedSaleId = s.id;
        inv.linkedSaleOrderNumber = s.orderNumber;
      }
    }
  }

  return { sales, purchases };
}

export default function Analytics() {
  const { currentTheme } = useTheme();
  const { user: authUser } = useAuth();
  const { sales, loading: salesLoading, error: salesError, forceRefresh: refreshSales } = useSales();

  const isNeon = currentTheme.name.toLowerCase() === 'neon';
  const headerText = isNeon ? 'text-white' : 'text-gray-900';
  const subText = isNeon ? 'text-slate-300' : 'text-gray-600';
  const cardBg = isNeon ? 'bg-slate-900/60 border border-slate-700/50' : 'bg-white border border-gray-200';

  const effectiveUserId = useMemo(() => {
    if (typeof window === 'undefined') return authUser?.uid || '';
    const siteUserId = localStorage.getItem('siteUserId') || localStorage.getItem('userId') || '';
    return authUser?.uid || siteUserId || '';
  }, [authUser?.uid]);

  const [mockEnabled, setMockEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('analyticsMockEnabled') === 'true';
  });

  const [preset, setPreset] = useState<Preset>('last_30');
  const [customFrom, setCustomFrom] = useState(() => ymdLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(() => ymdLocal(new Date()));

  const { fromIso, toIso, label } = useMemo(() => {
    const now = new Date();
    if (preset === 'mtd') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now);
      return { fromIso: start.toISOString(), toIso: end.toISOString(), label: 'Month to date' };
    }
    if (preset === 'last_30') {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { fromIso: start.toISOString(), toIso: end.toISOString(), label: 'Last 30 days' };
    }
    if (preset === 'last_90') {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 90);
      return { fromIso: start.toISOString(), toIso: end.toISOString(), label: 'Last 90 days' };
    }
    if (preset === 'ytd') {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(now);
      return { fromIso: start.toISOString(), toIso: end.toISOString(), label: `${now.getFullYear()} YTD` };
    }
    // custom
    const start = new Date(`${customFrom}T00:00:00`);
    const end = new Date(`${customTo}T23:59:59`);
    return { fromIso: start.toISOString(), toIso: end.toISOString(), label: `${customFrom} → ${customTo}` };
  }, [preset, customFrom, customTo]);

  const rangeMs = useMemo(() => {
    const fromMs = Date.parse(fromIso);
    const toMs = Date.parse(toIso);
    return {
      fromMs: Number.isFinite(fromMs) ? fromMs : 0,
      toMs: Number.isFinite(toMs) ? toMs : Date.now(),
    };
  }, [fromIso, toIso]);

  const [purchases, setPurchases] = useState<PurchaseDoc[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);

  const [cashflow, setCashflow] = useState<CashflowResponse | null>(null);
  const [cashflowLoading, setCashflowLoading] = useState(false);
  const [cashflowError, setCashflowError] = useState<string | null>(null);

  const purchasesLoadedRef = useRef(false);

  const mockSeedKey = useMemo(() => {
    const base = effectiveUserId || 'anonymous';
    return `analytics-mock:${base}`;
  }, [effectiveUserId]);

  const mockData = useMemo(() => generateMockDataset(mockSeedKey), [mockSeedKey]);

  const loadPurchases = async () => {
    if (mockEnabled) return;
    if (!effectiveUserId) {
      setPurchasesError('Missing userId (sign in or site password session)');
      return;
    }
    setPurchasesLoading(true);
    setPurchasesError(null);
    try {
      const qp = new URLSearchParams({ userId: effectiveUserId });
      const res = await fetch(`/api/purchases/list?${qp.toString()}`, {
        headers: { 'x-user-id': effectiveUserId },
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as { purchases?: PurchaseDoc[]; error?: string } | null;
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setPurchases(Array.isArray(json?.purchases) ? json!.purchases! : []);
      purchasesLoadedRef.current = true;
    } catch (e: any) {
      setPurchasesError(e?.message || 'Failed to load purchases');
      setPurchases([]);
    } finally {
      setPurchasesLoading(false);
    }
  };

  const loadCashflow = async () => {
    if (mockEnabled) return;
    if (!effectiveUserId) {
      setCashflowError('Missing userId (sign in or site password session)');
      return;
    }
    setCashflowLoading(true);
    setCashflowError(null);
    try {
      const qp = new URLSearchParams({
        userId: effectiveUserId,
        fromIso,
        toIso,
        includePendingSales: 'false',
        maxTx: '5000',
      });
      const res = await fetch(`/api/cashflow/summary?${qp.toString()}`, {
        headers: { 'x-user-id': effectiveUserId },
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as CashflowResponse | null;
      if (!res.ok || !json?.success) throw new Error(json?.error || `Request failed (${res.status})`);
      setCashflow(json);
    } catch (e: any) {
      setCashflowError(e?.message || 'Failed to load cashflow');
      setCashflow(null);
    } finally {
      setCashflowLoading(false);
    }
  };

  const refreshAll = async () => {
    if (mockEnabled) return;
    await Promise.all([loadCashflow(), loadPurchases(), refreshSales()]);
  };

  useEffect(() => {
    if (!purchasesLoadedRef.current && !mockEnabled) loadPurchases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, mockEnabled]);

  useEffect(() => {
    if (!mockEnabled) loadCashflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, fromIso, toIso, mockEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('analyticsMockEnabled', mockEnabled ? 'true' : 'false');
  }, [mockEnabled]);

  const activeSales = mockEnabled ? mockData.sales : sales || [];
  const activePurchases = mockEnabled ? mockData.purchases : purchases || [];

  const filteredSales = useMemo(() => {
    const { fromMs, toMs } = rangeMs;
    return (activeSales || []).filter((s: any) => {
      const ms = saleDateMs(s);
      if (ms === null) return false;
      return ms >= fromMs && ms <= toMs;
    });
  }, [activeSales, rangeMs]);

  const filteredPurchases = useMemo(() => {
    const { fromMs, toMs } = rangeMs;
    return (activePurchases || []).filter((p: any) => {
      const ms = purchaseDateMs(p);
      if (ms === null) return false;
      return ms >= fromMs && ms <= toMs;
    });
  }, [activePurchases, rangeMs]);

  const mockCashflow = useMemo<CashflowResponse>(() => {
    const tx: CashflowTx[] = [];
    let moneyIn = 0;
    let moneyOut = 0;

    for (const s of filteredSales) {
      const ms = saleDateMs(s) ?? Date.now();
      const payout = clamp(getSaleRevenue(s) - getSaleFees(s), 0, Number.POSITIVE_INFINITY);
      moneyIn += payout;
      tx.push({
        id: String(s?.id || Math.random()),
        type: 'sale',
        dateIso: new Date(ms).toISOString(),
        orderNumber: (s?.orderNumber ? String(s.orderNumber) : null) || null,
        productName: (s?.product ? String(s.product) : null) || null,
        platform: (s?.platform ? String(s.platform) : null) || 'stockx',
        moneyIn: round2(payout),
        moneyOut: null,
        net: round2(payout),
      });
    }

    for (const p of filteredPurchases) {
      const ms = purchaseDateMs(p) ?? Date.now();
      const paid = getPurchaseNetPaid(p);
      moneyOut += paid;
      tx.push({
        id: String(p?.id || Math.random()),
        type: 'purchase',
        dateIso: new Date(ms).toISOString(),
        orderNumber: (p?.orderNumber ? String(p.orderNumber) : null) || null,
        productName: (p?.productName ? String(p.productName) : null) || null,
        platform: (p?.market ? String(p.market) : null) || (p?.platform ? String(p.platform) : null) || 'stockx',
        moneyIn: null,
        moneyOut: round2(paid),
        net: round2(-paid),
      });
    }

    tx.sort((a, b) => Date.parse(b.dateIso) - Date.parse(a.dateIso));
    return {
      success: true,
      userId: effectiveUserId || 'mock-user',
      fromIso,
      toIso,
      summary: {
        moneyIn: round2(moneyIn),
        moneyOut: round2(moneyOut),
        net: round2(moneyIn - moneyOut),
        salesCount: filteredSales.length,
        purchasesCount: filteredPurchases.length,
      },
      transactions: tx.slice(0, 5000),
      truncated: tx.length > 5000,
      truncatedTotal: tx.length,
    };
  }, [effectiveUserId, filteredPurchases, filteredSales, fromIso, toIso]);

  const effectiveCashflow = mockEnabled ? mockCashflow : cashflow;

  const profitKpis = useMemo(() => {
    const salesCount = filteredSales.length;
    const revenue = filteredSales.reduce((sum: number, s: any) => sum + getSaleRevenue(s), 0);
    const fees = filteredSales.reduce((sum: number, s: any) => sum + getSaleFees(s), 0);
    const cogs = filteredSales.reduce((sum: number, s: any) => sum + getSaleCogs(s), 0);
    const profit = filteredSales.reduce((sum: number, s: any) => sum + getSaleProfit(s), 0);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const avgProfit = salesCount > 0 ? profit / salesCount : 0;

    const spend = filteredPurchases.reduce((sum: number, p: any) => sum + getPurchaseNetPaid(p), 0);
    const purchaseCount = filteredPurchases.length;
    const avgPurchase = purchaseCount > 0 ? spend / purchaseCount : 0;

    return { salesCount, revenue, fees, cogs, profit, margin, avgProfit, spend, purchaseCount, avgPurchase };
  }, [filteredSales, filteredPurchases]);

  const linking = useMemo(() => {
    const salesTotal = filteredSales.length;
    const salesLinked = filteredSales.filter((s: any) => Boolean(s?.linkedPurchaseId)).length;
    const salesUnlinked = Math.max(0, salesTotal - salesLinked);

    const purchasesTotal = filteredPurchases.length;
    const purchasesLinked = filteredPurchases.filter((p: any) => Boolean(p?.linkedSaleId) || Boolean(p?.linkedSaleOrderNumber)).length;
    const purchasesUnlinked = Math.max(0, purchasesTotal - purchasesLinked);

    return {
      salesTotal,
      salesLinked,
      salesUnlinked,
      purchasesTotal,
      purchasesLinked,
      purchasesUnlinked,
      salesLinkedPct: salesTotal > 0 ? (salesLinked / salesTotal) * 100 : 0,
      purchasesLinkedPct: purchasesTotal > 0 ? (purchasesLinked / purchasesTotal) * 100 : 0,
    };
  }, [filteredSales, filteredPurchases]);

  const inventoryHealth = useMemo(() => {
    const total = filteredPurchases.length;
    const delivered = filteredPurchases.filter((p: any) => looksDelivered(p)).length;
    const inTransitLike = filteredPurchases.filter((p: any) => {
      const st = normalizeStatusKey(p?.status);
      return st === 'shipped' || st === 'in_transit' || st === 'out for delivery' || st === 'out_for_delivery';
    }).length;
    const canceled = filteredPurchases.filter((p: any) => normalizeStatusKey(p?.status) === 'canceled').length;
    const refunded = filteredPurchases.filter((p: any) => normalizeStatusKey(p?.status) === 'refunded' || normalizeStatusKey(p?.status) === 'partially refunded').length;
    const deliveredUnlinked = filteredPurchases.filter((p: any) => looksDelivered(p) && !p?.linkedSaleId && !p?.linkedSaleOrderNumber).length;
    return { total, delivered, inTransitLike, canceled, refunded, deliveredUnlinked };
  }, [filteredPurchases]);

  const platformMix = useMemo(() => {
    const by = {
      stockx: { count: 0, revenue: 0, profit: 0 },
      manual: { count: 0, revenue: 0, profit: 0 },
    };
    for (const s of filteredSales) {
      const platform = normalizePlatform(s?.platform || s?.source);
      const rev = getSaleRevenue(s);
      const prof = getSaleProfit(s);
      by[platform].count += 1;
      by[platform].revenue += rev;
      by[platform].profit += prof;
    }
    const totalCount = by.stockx.count + by.manual.count;
    return {
      by,
      totalCount,
      stockxPct: totalCount > 0 ? (by.stockx.count / totalCount) * 100 : 0,
      manualPct: totalCount > 0 ? (by.manual.count / totalCount) * 100 : 0,
    };
  }, [filteredSales]);

  const profitByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filteredSales) {
      const ms = saleDateMs(s);
      if (ms === null) continue;
      const key = ymdLocal(new Date(ms));
      map.set(key, (map.get(key) || 0) + getSaleProfit(s));
    }
    const keys = Array.from(map.keys()).sort();
    const points = keys.map((k) => ({ label: k.slice(5), value: map.get(k) || 0 }));
    return points.slice(Math.max(0, points.length - 28));
  }, [filteredSales]);

  const cashflowByDay = useMemo(() => {
    const tx = effectiveCashflow?.transactions || [];
    const map = new Map<string, number>();
    for (const t of tx) {
      const ms = Date.parse(t.dateIso);
      if (!Number.isFinite(ms)) continue;
      const key = ymdLocal(new Date(ms));
      map.set(key, (map.get(key) || 0) + (typeof t.net === 'number' ? t.net : 0));
    }
    const keys = Array.from(map.keys()).sort();
    const points = keys.map((k) => ({ label: k.slice(5), value: map.get(k) || 0 }));
    return points.slice(Math.max(0, points.length - 28));
  }, [effectiveCashflow?.transactions]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { product: string; count: number; revenue: number; profit: number; avgProfit: number; platform: string }>();
    for (const s of filteredSales) {
      const product = String(s?.product || s?.productName || s?.product?.name || s?.product?.productName || 'Unknown').trim();
      const platform = normalizePlatform(s?.platform || s?.source);
      const cur = map.get(`${platform}::${product}`) || { product, count: 0, revenue: 0, profit: 0, avgProfit: 0, platform };
      cur.count += 1;
      cur.revenue += getSaleRevenue(s);
      cur.profit += getSaleProfit(s);
      cur.avgProfit = cur.count > 0 ? cur.profit / cur.count : 0;
      map.set(`${platform}::${product}`, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.profit - a.profit).slice(0, 10);
  }, [filteredSales]);

  const unlinkedSales = useMemo(() => {
    return filteredSales
      .filter((s: any) => !s?.linkedPurchaseId)
      .slice()
      .sort((a: any, b: any) => (saleDateMs(b) ?? 0) - (saleDateMs(a) ?? 0))
      .slice(0, 8);
  }, [filteredSales]);

  const showAnyError = Boolean(salesError || purchasesError || cashflowError);
  const isLoading = mockEnabled ? false : Boolean(salesLoading || purchasesLoading || cashflowLoading);

  return (
    <div className={`flex-1 overflow-y-auto ${currentTheme.colors.background}`}>
      <div className="px-6 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className={isNeon ? 'h-6 w-6 text-cyan-300' : 'h-6 w-6 text-blue-600'} />
              <h1 className={`text-2xl sm:text-3xl font-bold ${headerText}`}>Analytics</h1>
            </div>
            <p className={`mt-1 text-sm ${subText}`}>
              Performance + cashflow snapshot for <span className="font-semibold">{label}</span>
              {effectiveCashflow?.truncated ? (
                <span className="ml-2 opacity-80">
                  (Tx: {effectiveCashflow.transactions.length} of {effectiveCashflow.truncatedTotal})
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setMockEnabled((v) => {
                  const next = !v;
                  if (next === false) {
                    setTimeout(() => {
                      refreshAll();
                    }, 0);
                  } else {
                    setPurchasesError(null);
                    setCashflowError(null);
                  }
                  return next;
                });
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border ${
                mockEnabled
                  ? isNeon
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : isNeon
                    ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60'
                    : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
              }`}
              title="Toggle mock vs real data"
            >
              <Database className="h-4 w-4" />
              {mockEnabled ? 'Mock Data: ON' : 'Mock Data: OFF'}
            </button>

            <button
              onClick={refreshAll}
              disabled={isLoading || mockEnabled}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border ${
                isNeon ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/15' : 'border-gray-300 bg-white hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className={`mt-5 rounded-xl p-4 ${cardBg}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPreset('mtd')}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  preset === 'mtd'
                    ? isNeon
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-gray-900 bg-gray-900 text-white'
                    : isNeon
                      ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60'
                      : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                MTD
              </button>
              <button
                onClick={() => setPreset('last_30')}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  preset === 'last_30'
                    ? isNeon
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-gray-900 bg-gray-900 text-white'
                    : isNeon
                      ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60'
                      : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                Last 30
              </button>
              <button
                onClick={() => setPreset('last_90')}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  preset === 'last_90'
                    ? isNeon
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-gray-900 bg-gray-900 text-white'
                    : isNeon
                      ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60'
                      : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                Last 90
              </button>
              <button
                onClick={() => setPreset('ytd')}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  preset === 'ytd'
                    ? isNeon
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-gray-900 bg-gray-900 text-white'
                    : isNeon
                      ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60'
                      : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                YTD
              </button>

              <div className="ml-2 flex items-center gap-2">
                <Calendar className={`h-4 w-4 ${subText}`} />
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setPreset('custom');
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    isNeon ? 'border-slate-700 bg-slate-950/60 text-slate-100' : 'border-gray-300 bg-white text-gray-900'
                  }`}
                />
                <span className={subText}>→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setPreset('custom');
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    isNeon ? 'border-slate-700 bg-slate-950/60 text-slate-100' : 'border-gray-300 bg-white text-gray-900'
                  }`}
                />
              </div>
            </div>

            <div className={`text-xs ${subText}`}>
              User: <span className="font-mono">{effectiveUserId || '—'}</span>
            </div>
          </div>

          {!mockEnabled && showAnyError ? (
            <div className={`mt-3 rounded-lg border p-3 text-sm ${isNeon ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {salesError ? <div>Sales: {salesError}</div> : null}
              {purchasesError ? <div>Purchases: {purchasesError}</div> : null}
              {cashflowError ? <div>Cashflow: {cashflowError}</div> : null}
            </div>
          ) : null}
        </div>

        {/* KPI grid */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Profit</div>
            <div className={`mt-2 text-2xl font-bold ${profitKpis.profit >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-red-200' : 'text-red-700')}`}>
              {currency(profitKpis.profit)}
            </div>
            <div className={`mt-1 text-sm ${subText}`}>
              {profitKpis.salesCount} sale(s) • Margin {pct(profitKpis.margin)}
            </div>
          </div>

          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Revenue</div>
            <div className={`mt-2 text-2xl font-bold ${headerText}`}>{currency(profitKpis.revenue)}</div>
            <div className={`mt-1 text-sm ${subText}`}>Avg profit / sale {currency(profitKpis.avgProfit)}</div>
          </div>

          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Cashflow (Net)</div>
            <div className={`mt-2 text-2xl font-bold ${(effectiveCashflow?.summary.net ?? 0) >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-red-200' : 'text-red-700')}`}>
              {currency(effectiveCashflow?.summary.net ?? 0)}
            </div>
            <div className={`mt-1 text-sm ${subText}`}>
              In {currency(effectiveCashflow?.summary.moneyIn ?? 0)} • Out {currency(effectiveCashflow?.summary.moneyOut ?? 0)}
            </div>
          </div>

          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Linking Coverage</div>
            <div className={`mt-2 text-2xl font-bold ${headerText}`}>{pct(linking.salesLinkedPct)}</div>
            <div className={`mt-1 text-sm ${subText}`}>{linking.salesLinked}/{linking.salesTotal} sales linked</div>
          </div>
        </div>

        {/* Charts */}
        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`text-sm font-semibold ${headerText}`}>Profit by day</div>
                <div className={`text-xs ${subText}`}>Realized profit (sales in range)</div>
              </div>
              <div className={`text-xs ${subText}`}>{profitByDay.length} day(s)</div>
            </div>
            <div className="mt-4">
              <SparkBars points={profitByDay} isNeon={isNeon} />
            </div>
          </div>

          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`text-sm font-semibold ${headerText}`}>Cashflow net by day</div>
                <div className={`text-xs ${subText}`}>Money in − money out</div>
              </div>
              <div className={`text-xs ${subText}`}>{cashflowByDay.length} day(s)</div>
            </div>
            <div className="mt-4">
              <SparkBars points={cashflowByDay} isNeon={isNeon} />
            </div>
          </div>
        </div>

        {/* Mix + inventory health */}
        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-semibold ${headerText}`}>Platform mix</div>
                <div className={`text-xs ${subText}`}>Sales count split</div>
              </div>
              <div className={`text-xs ${subText}`}>{platformMix.totalCount} total</div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <div className={subText}>StockX</div>
                <div className={headerText}>
                  {platformMix.by.stockx.count} • {pct(platformMix.stockxPct)}
                </div>
              </div>
              <div className={`mt-2 h-2 rounded-full ${isNeon ? 'bg-slate-800' : 'bg-gray-200'}`}>
                <div
                  className={`h-2 rounded-full ${isNeon ? 'bg-cyan-400/60' : 'bg-blue-600'}`}
                  style={{ width: `${Math.min(100, Math.max(0, platformMix.stockxPct))}%` }}
                />
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <div className={subText}>Manual</div>
                <div className={headerText}>
                  {platformMix.by.manual.count} • {pct(platformMix.manualPct)}
                </div>
              </div>
              <div className={`mt-2 h-2 rounded-full ${isNeon ? 'bg-slate-800' : 'bg-gray-200'}`}>
                <div
                  className={`h-2 rounded-full ${isNeon ? 'bg-emerald-400/60' : 'bg-emerald-600'}`}
                  style={{ width: `${Math.min(100, Math.max(0, platformMix.manualPct))}%` }}
                />
              </div>
            </div>

            <div className={`mt-4 text-xs ${subText}`}>
              StockX profit {currency(platformMix.by.stockx.profit)} • Manual profit {currency(platformMix.by.manual.profit)}
            </div>
          </div>

          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-semibold ${headerText}`}>Inventory health</div>
                <div className={`text-xs ${subText}`}>Purchases in range</div>
              </div>
              <div className={`text-xs ${subText}`}>{inventoryHealth.total} total</div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className={`text-xs uppercase tracking-wide ${subText}`}>Delivered</div>
                <div className={`mt-1 text-xl font-bold ${headerText}`}>{inventoryHealth.delivered}</div>
              </div>
              <div>
                <div className={`text-xs uppercase tracking-wide ${subText}`}>In transit</div>
                <div className={`mt-1 text-xl font-bold ${headerText}`}>{inventoryHealth.inTransitLike}</div>
              </div>
              <div>
                <div className={`text-xs uppercase tracking-wide ${subText}`}>Canceled</div>
                <div className={`mt-1 text-xl font-bold ${headerText}`}>{inventoryHealth.canceled}</div>
              </div>
              <div>
                <div className={`text-xs uppercase tracking-wide ${subText}`}>Refunded</div>
                <div className={`mt-1 text-xl font-bold ${headerText}`}>{inventoryHealth.refunded}</div>
              </div>
            </div>

            <div className={`mt-4 rounded-lg p-3 ${isNeon ? 'bg-slate-950/40 border border-slate-700/40' : 'bg-gray-50 border border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className={`text-sm font-medium ${headerText}`}>Delivered but unlinked</div>
                <div className={`text-sm font-semibold ${inventoryHealth.deliveredUnlinked > 0 ? (isNeon ? 'text-amber-200' : 'text-amber-700') : headerText}`}>
                  {inventoryHealth.deliveredUnlinked}
                </div>
              </div>
              <div className={`mt-1 text-xs ${subText}`}>Good targets for quick ROI reporting</div>
            </div>
          </div>

          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-semibold ${headerText}`}>Quick insights</div>
                <div className={`text-xs ${subText}`}>High-signal todo list</div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className={`rounded-lg p-3 ${isNeon ? 'bg-slate-950/40 border border-slate-700/40' : 'bg-gray-50 border border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  {linking.salesUnlinked > 0 ? (
                    <Unlink2 className={isNeon ? 'h-4 w-4 text-amber-300' : 'h-4 w-4 text-amber-700'} />
                  ) : (
                    <Link2 className={isNeon ? 'h-4 w-4 text-emerald-300' : 'h-4 w-4 text-emerald-700'} />
                  )}
                  <div className={`text-sm font-semibold ${headerText}`}>Linking coverage</div>
                </div>
                <div className={`mt-1 text-sm ${subText}`}>
                  {linking.salesUnlinked > 0
                    ? `${linking.salesUnlinked} sale(s) in this range are missing purchase links.`
                    : 'All sales in this range are linked — nice.'}
                </div>
              </div>

              <div className={`rounded-lg p-3 ${isNeon ? 'bg-slate-950/40 border border-slate-700/40' : 'bg-gray-50 border border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  {profitKpis.profit >= 0 ? (
                    <TrendingUp className={isNeon ? 'h-4 w-4 text-emerald-300' : 'h-4 w-4 text-emerald-700'} />
                  ) : (
                    <TrendingDown className={isNeon ? 'h-4 w-4 text-red-300' : 'h-4 w-4 text-red-700'} />
                  )}
                  <div className={`text-sm font-semibold ${headerText}`}>Profit vs cashflow</div>
                </div>
                <div className={`mt-1 text-sm ${subText}`}>
                  Profit {currency(profitKpis.profit)} • Cashflow {currency(effectiveCashflow?.summary.net ?? 0)}
                </div>
              </div>

              <div className={`rounded-lg p-3 ${isNeon ? 'bg-slate-950/40 border border-slate-700/40' : 'bg-gray-50 border border-gray-200'}`}>
                <div className={`text-sm font-semibold ${headerText}`}>Spend velocity</div>
                <div className={`mt-1 text-sm ${subText}`}>
                  {profitKpis.purchaseCount} purchase(s) • Avg {currency(profitKpis.avgPurchase)} per purchase
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tables */}
        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <div className={`rounded-xl ${cardBg}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isNeon ? 'border-slate-700/40' : 'border-gray-200'}`}>
              <div>
                <div className={`text-sm font-semibold ${headerText}`}>Top products (by profit)</div>
                <div className={`text-xs ${subText}`}>Aggregated across sales in range</div>
              </div>
              <div className={`text-xs ${subText}`}>{topProducts.length} shown</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed">
                <thead className={isNeon ? 'bg-slate-950/40' : 'bg-gray-50'}>
                  <tr className={isNeon ? 'divide-x divide-slate-700/50' : 'divide-x divide-gray-200'}>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subText}`}>Product</th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subText}`}>Platform</th>
                    <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider ${subText}`}>Sales</th>
                    <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider ${subText}`}>Profit</th>
                  </tr>
                </thead>
                <tbody className={isNeon ? 'divide-y divide-slate-700/40' : 'divide-y divide-gray-200'}>
                  {topProducts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={`px-4 py-6 text-center text-sm ${subText}`}>
                        No sales in this range yet.
                      </td>
                    </tr>
                  ) : (
                    topProducts.map((r) => (
                      <tr key={`${r.platform}-${r.product}`} className={isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-50'}>
                        <td className={`px-4 py-3 text-sm ${headerText} truncate`} title={r.product}>
                          {r.product}
                        </td>
                        <td className={`px-4 py-3 text-sm ${subText}`}>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            r.platform === 'stockx'
                              ? isNeon ? 'bg-cyan-500/15 text-cyan-200' : 'bg-blue-100 text-blue-800'
                              : isNeon ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {r.platform}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${headerText}`}>{r.count}</td>
                        <td className={`px-4 py-3 text-sm text-right ${r.profit >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-red-200' : 'text-red-700')}`}>
                          {currency(r.profit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`rounded-xl ${cardBg}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isNeon ? 'border-slate-700/40' : 'border-gray-200'}`}>
              <div>
                <div className={`text-sm font-semibold ${headerText}`}>Unlinked sales (recent)</div>
                <div className={`text-xs ${subText}`}>Best place to start improving accuracy</div>
              </div>
              <div className={`text-xs ${subText}`}>{unlinkedSales.length} shown</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed">
                <thead className={isNeon ? 'bg-slate-950/40' : 'bg-gray-50'}>
                  <tr className={isNeon ? 'divide-x divide-slate-700/50' : 'divide-x divide-gray-200'}>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subText}`}>Order</th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subText}`}>Product</th>
                    <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider ${subText}`}>Est. Profit</th>
                  </tr>
                </thead>
                <tbody className={isNeon ? 'divide-y divide-slate-700/40' : 'divide-y divide-gray-200'}>
                  {unlinkedSales.length === 0 ? (
                    <tr>
                      <td colSpan={3} className={`px-4 py-6 text-center text-sm ${subText}`}>
                        No unlinked sales in this range.
                      </td>
                    </tr>
                  ) : (
                    unlinkedSales.map((s: any) => {
                      const order = String(s?.orderNumber || s?.orderId || s?.id || '—');
                      const product = String(s?.product || s?.productName || s?.product?.name || s?.product?.productName || 'Unknown');
                      const prof = getSaleProfit(s);
                      return (
                        <tr key={String(s?.id || order)} className={isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-50'}>
                          <td className={`px-4 py-3 text-sm ${headerText} truncate`} title={order}>
                            {order}
                          </td>
                          <td className={`px-4 py-3 text-sm ${subText} truncate`} title={product}>
                            {product}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right ${prof >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-red-200' : 'text-red-700')}`}>
                            {currency(prof)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

