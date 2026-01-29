'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, LineChart, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useAuth } from '@/lib/contexts/AuthContext';

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
};

type ExpenseCategory =
  | 'shipping'
  | 'supplies'
  | 'subscriptions'
  | 'mileage'
  | 'platform_fees'
  | 'returns'
  | 'storage'
  | 'labor'
  | 'taxes'
  | 'other';

type Expense = {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  merchant?: string;
  notes?: string;
  recurrence: 'once' | 'monthly' | 'yearly';
};

type Adjustment = {
  id: string;
  label: string;
  amount: number; // positive adds profit, negative reduces profit
  createdAtMs: number;
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  shipping: 'Shipping',
  supplies: 'Supplies',
  subscriptions: 'Subscriptions',
  mileage: 'Mileage',
  platform_fees: 'Platform fees',
  returns: 'Returns',
  storage: 'Storage',
  labor: 'Labor',
  taxes: 'Taxes',
  other: 'Other',
};

function currency(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ym(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function safeParseMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function enumerateMonths(fromIso: string, toIso: string): string[] {
  const fromMs = safeParseMs(fromIso);
  const toMs = safeParseMs(toIso);
  if (fromMs === null || toMs === null) return [];
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    out.push(ym(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function isBetweenYmd(d: string, fromYmd: string, toYmd: string): boolean {
  // Lexicographic works for YYYY-MM-DD.
  return d >= fromYmd && d <= toYmd;
}

function downloadCsv(filename: string, rows: Array<Record<string, any>>) {
  const keys = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );
  const escape = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    const needs = /[",\n]/.test(s);
    const out = s.replace(/"/g, '""');
    return needs ? `"${out}"` : out;
  };
  const lines = [keys.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\n');
  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ProfitAndLoss() {
  const { currentTheme } = useTheme();
  const { user: authUser } = useAuth();
  const isNeon = currentTheme.name.toLowerCase() === 'neon';

  const effectiveUserId = useMemo(() => {
    if (typeof window === 'undefined') return authUser?.uid || '';
    const siteUserId = localStorage.getItem('siteUserId') || localStorage.getItem('userId') || '';
    return authUser?.uid || siteUserId || '';
  }, [authUser?.uid]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cashflow, setCashflow] = useState<CashflowResponse | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [preset, setPreset] = useState<'this_month' | 'last_month' | 'last_90' | 'ytd' | 'custom'>('this_month');
  const [customFrom, setCustomFrom] = useState(() => ymdLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(() => ymdLocal(new Date()));
  const [includePendingSales, setIncludePendingSales] = useState(false);

  const { fromIso, toIso, label, fromYmd, toYmd } = useMemo(() => {
    const now = new Date();
    if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
      end.setMilliseconds(end.getMilliseconds() - 1);
      return {
        fromIso: start.toISOString(),
        toIso: end.toISOString(),
        label: `${start.toLocaleString('en-US', { month: 'long' })} ${start.getFullYear()}`,
        fromYmd: ymdLocal(start),
        toYmd: ymdLocal(end),
      };
    }
    if (preset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end.setMilliseconds(end.getMilliseconds() - 1);
      return {
        fromIso: start.toISOString(),
        toIso: end.toISOString(),
        label: `${start.toLocaleString('en-US', { month: 'long' })} ${start.getFullYear()}`,
        fromYmd: ymdLocal(start),
        toYmd: ymdLocal(end),
      };
    }
    if (preset === 'last_90') {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 90);
      return {
        fromIso: start.toISOString(),
        toIso: end.toISOString(),
        label: 'Last 90 days',
        fromYmd: ymdLocal(start),
        toYmd: ymdLocal(end),
      };
    }
    if (preset === 'ytd') {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(now);
      return {
        fromIso: start.toISOString(),
        toIso: end.toISOString(),
        label: `${now.getFullYear()} YTD`,
        fromYmd: ymdLocal(start),
        toYmd: ymdLocal(end),
      };
    }
    // custom
    const start = new Date(`${customFrom}T00:00:00`);
    const end = new Date(`${customTo}T23:59:59`);
    return {
      fromIso: start.toISOString(),
      toIso: end.toISOString(),
      label: `${customFrom} → ${customTo}`,
      fromYmd: customFrom,
      toYmd: customTo,
    };
  }, [preset, customFrom, customTo]);

  const adjustmentsStorageKey = useMemo(() => {
    const userId = (effectiveUserId || '').trim() || 'anon';
    return `pnl_adjustments_${userId}_${fromYmd}_${toYmd}`;
  }, [effectiveUserId, fromYmd, toYmd]);

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [adjLabel, setAdjLabel] = useState('');
  const [adjAmount, setAdjAmount] = useState('');

  // Load adjustments for this range
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(adjustmentsStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return setAdjustments([]);
      const clean = parsed
        .map((x: any) => ({
          id: typeof x?.id === 'string' ? x.id : randomId(),
          label: typeof x?.label === 'string' ? x.label : 'Adjustment',
          amount: typeof x?.amount === 'number' && Number.isFinite(x.amount) ? x.amount : 0,
          createdAtMs: typeof x?.createdAtMs === 'number' ? x.createdAtMs : Date.now(),
        }))
        .filter((x: Adjustment) => x.amount !== 0);
      setAdjustments(clean);
    } catch {
      setAdjustments([]);
    }
  }, [adjustmentsStorageKey]);

  // Persist adjustments
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(adjustmentsStorageKey, JSON.stringify(adjustments));
    } catch {
      // ignore
    }
  }, [adjustmentsStorageKey, adjustments]);

  const load = async () => {
    if (!effectiveUserId) {
      setError('Missing userId (sign in or site password session)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qp = new URLSearchParams({
        userId: effectiveUserId,
        fromIso,
        toIso,
        includePendingSales: includePendingSales ? 'true' : 'false',
      });
      const res = await fetch(`/api/cashflow/summary?${qp.toString()}`, { headers: { 'x-user-id': effectiveUserId } });
      const json = (await res.json().catch(() => null)) as CashflowResponse | null;
      if (!res.ok || !json?.success) throw new Error(json?.error || `Request failed (${res.status})`);
      setCashflow(json);

      const months = enumerateMonths(fromIso, toIso);
      const expenseRes = await Promise.all(
        months.map(async (m) => {
          const r = await fetch(`/api/expenses?month=${encodeURIComponent(m)}`, { headers: { 'x-user-id': effectiveUserId } });
          const j = (await r.json().catch(() => null)) as any;
          if (!r.ok || !j?.success) throw new Error(j?.error || `Expenses failed (${r.status})`);
          return (Array.isArray(j.expenses) ? j.expenses : []) as Expense[];
        })
      );
      const all = expenseRes.flat();
      const filtered = all.filter((e) => typeof e?.date === 'string' && isBetweenYmd(e.date, fromYmd, toYmd));
      setExpenses(filtered);
    } catch (e: any) {
      setError(e?.message || 'Failed to load P&L');
      setCashflow(null);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const sales = cashflow?.summary.moneyIn ?? 0;
    const inventoryPurchases = cashflow?.summary.moneyOut ?? 0;
    const grossProfit = sales - inventoryPurchases;
    const operatingExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const adjustmentsTotal = adjustments.reduce((sum, a) => sum + (a.amount || 0), 0);
    const netProfit = grossProfit - operatingExpenses + adjustmentsTotal;
    const margin = sales > 0 ? netProfit / sales : 0;
    return { sales, inventoryPurchases, grossProfit, operatingExpenses, adjustmentsTotal, netProfit, margin };
  }, [cashflow?.summary.moneyIn, cashflow?.summary.moneyOut, expenses, adjustments]);

  const byCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const e of expenses) {
      map.set(e.category, (map.get(e.category) || 0) + (e.amount || 0));
    }
    const rows = Array.from(map.entries()).map(([category, amount]) => ({ category, amount }));
    rows.sort((a, b) => b.amount - a.amount);
    return rows;
  }, [expenses]);

  const maxCat = useMemo(() => Math.max(1, ...byCategory.map((r) => r.amount)), [byCategory]);

  const headerText = isNeon ? 'text-white' : 'text-gray-900';
  const subText = isNeon ? 'text-slate-300' : 'text-gray-600';
  const cardBg = isNeon ? 'bg-slate-900/60 border border-slate-700/50' : 'bg-white border border-gray-200';
  const inputBg = isNeon
    ? 'border-slate-700 bg-slate-950/60 text-slate-100 placeholder:text-slate-400'
    : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400';

  return (
    <div className={`flex-1 overflow-y-auto ${currentTheme.colors.background}`}>
      <div className="px-6 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 h-11 w-11 rounded-2xl flex items-center justify-center ${cardBg}`}>
              <LineChart className={isNeon ? 'text-cyan-300' : 'text-blue-600'} />
            </div>
            <div>
              <h1 className={`text-2xl sm:text-3xl font-bold ${headerText}`}>P&amp;L</h1>
              <p className={`mt-1 text-sm ${subText}`}>
                Cash-basis profit &amp; loss for <span className="font-semibold">{label}</span>
              </p>
              <p className={`mt-1 text-xs ${subText}`}>
                Uses cashflow (sales payouts + inventory purchases) plus logged expenses. Add manual adjustments for edge cases.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border ${
                isNeon ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/15' : 'border-gray-300 bg-white hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              onClick={() => {
                const rows: Array<Record<string, any>> = [
                  { type: 'Summary', line: 'Sales (cash in)', amount: totals.sales, range: label },
                  { type: 'Summary', line: 'Inventory purchases (cash out)', amount: -totals.inventoryPurchases, range: label },
                  { type: 'Summary', line: 'Gross profit', amount: totals.grossProfit, range: label },
                  { type: 'Summary', line: 'Operating expenses', amount: -totals.operatingExpenses, range: label },
                  { type: 'Summary', line: 'Manual adjustments', amount: totals.adjustmentsTotal, range: label },
                  { type: 'Summary', line: 'Net profit', amount: totals.netProfit, range: label },
                  ...expenses.map((e) => ({
                    type: 'Expense',
                    date: e.date,
                    category: CATEGORY_LABELS[e.category],
                    merchant: e.merchant || '',
                    notes: e.notes || '',
                    amount: -Math.abs(e.amount || 0),
                  })),
                  ...adjustments.map((a) => ({
                    type: 'Adjustment',
                    date: new Date(a.createdAtMs).toISOString(),
                    label: a.label,
                    amount: a.amount,
                  })),
                ];
                downloadCsv(`pnl-${label.replace(/\s+/g, '_')}.csv`, rows);
              }}
              disabled={loading}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border ${
                isNeon ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15' : 'border-gray-300 bg-white hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className={`mt-5 rounded-xl p-4 ${cardBg}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPreset('this_month')}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  preset === 'this_month'
                    ? isNeon
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-gray-900 bg-gray-900 text-white'
                    : isNeon
                    ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60'
                    : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                This month
              </button>
              <button
                onClick={() => setPreset('last_month')}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  preset === 'last_month'
                    ? isNeon
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                      : 'border-gray-900 bg-gray-900 text-white'
                    : isNeon
                    ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60'
                    : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                Last month
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
                Last 90 days
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
                <span className={`text-sm ${subText}`}>Custom:</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setPreset('custom');
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                />
                <span className={subText}>→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setPreset('custom');
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className={`flex items-center gap-2 text-sm ${subText}`}>
                <input type="checkbox" checked={includePendingSales} onChange={(e) => setIncludePendingSales(e.target.checked)} />
                Include pending sales
              </label>

              <button
                onClick={load}
                disabled={loading}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  isNeon ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/30 hover:bg-cyan-500/25' : 'bg-gray-900 text-white hover:bg-gray-800'
                } disabled:opacity-50`}
              >
                Apply
              </button>
            </div>
          </div>

          {error ? (
            <div
              className={`mt-3 rounded-lg border p-3 text-sm ${
                isNeon ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {error}
            </div>
          ) : null}
        </div>

        {/* Summary cards */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Sales (cash in)</div>
            <div className={`mt-2 text-2xl font-bold ${headerText}`}>{currency(totals.sales)}</div>
            <div className={`mt-1 text-sm ${subText}`}>{cashflow?.summary.salesCount ?? 0} sales</div>
          </div>
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Inventory (cash out)</div>
            <div className={`mt-2 text-2xl font-bold ${headerText}`}>{currency(totals.inventoryPurchases)}</div>
            <div className={`mt-1 text-sm ${subText}`}>{cashflow?.summary.purchasesCount ?? 0} purchases</div>
          </div>
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Operating expenses</div>
            <div className={`mt-2 text-2xl font-bold ${headerText}`}>{currency(totals.operatingExpenses)}</div>
            <div className={`mt-1 text-sm ${subText}`}>{expenses.length} entries</div>
          </div>
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Net profit</div>
            <div
              className={`mt-2 text-2xl font-bold ${
                totals.netProfit >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : isNeon ? 'text-red-200' : 'text-red-700'
              }`}
            >
              {currency(totals.netProfit)}
            </div>
            <div className={`mt-1 text-sm ${subText}`}>
              Margin: <span className="font-semibold">{(totals.margin * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Breakdown + right rail */}
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={`rounded-xl p-4 ${cardBg} lg:col-span-2`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-semibold ${headerText}`}>Statement</div>
                <div className={`text-xs ${subText}`}>A quick view of what happened in this period.</div>
              </div>
              <div className={`text-xs ${subText}`}>
                {fromYmd} → {toYmd}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-white/5">
              <div className={`${isNeon ? 'bg-slate-950/40' : 'bg-gray-50'} px-4 py-2 text-xs font-semibold uppercase tracking-wide ${subText}`}>
                Line items
              </div>
              <div className={`${isNeon ? 'divide-y divide-slate-700/40' : 'divide-y divide-gray-200'}`}>
                {[
                  { label: 'Sales (cash in)', value: totals.sales, tone: totals.sales >= 0 ? 'pos' : 'neg' },
                  { label: 'Inventory purchases (cash out)', value: -totals.inventoryPurchases, tone: 'neg' },
                  { label: 'Gross profit', value: totals.grossProfit, tone: totals.grossProfit >= 0 ? 'pos' : 'neg' },
                  { label: 'Operating expenses', value: -totals.operatingExpenses, tone: 'neg' },
                  { label: 'Manual adjustments', value: totals.adjustmentsTotal, tone: totals.adjustmentsTotal >= 0 ? 'pos' : 'neg' },
                  { label: 'Net profit', value: totals.netProfit, tone: totals.netProfit >= 0 ? 'pos' : 'neg', bold: true },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-3">
                    <div className={`${row.bold ? `font-semibold ${headerText}` : headerText} text-sm`}>{row.label}</div>
                    <div
                      className={`text-sm font-semibold ${
                        row.tone === 'pos'
                          ? isNeon
                            ? 'text-emerald-200'
                            : 'text-emerald-700'
                          : row.tone === 'neg'
                          ? isNeon
                            ? 'text-red-200'
                            : 'text-red-700'
                          : headerText
                      }`}
                    >
                      {currency(row.value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className={`text-xs ${subText}`}>Quick visual</div>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Sales', value: totals.sales, color: isNeon ? 'bg-emerald-500/30' : 'bg-emerald-400', show: totals.sales },
                  { label: 'Purchases', value: totals.inventoryPurchases, color: isNeon ? 'bg-amber-500/30' : 'bg-amber-400', show: totals.inventoryPurchases },
                  { label: 'Expenses', value: totals.operatingExpenses, color: isNeon ? 'bg-red-500/30' : 'bg-red-400', show: totals.operatingExpenses },
                  {
                    label: 'Net',
                    value: Math.abs(totals.netProfit),
                    color:
                      totals.netProfit >= 0 ? (isNeon ? 'bg-cyan-500/30' : 'bg-blue-500') : isNeon ? 'bg-red-500/30' : 'bg-red-500',
                    show: totals.netProfit,
                  },
                ].map((b) => {
                  const max = Math.max(1, totals.sales, totals.inventoryPurchases, totals.operatingExpenses, Math.abs(totals.netProfit));
                  const w = Math.max(8, Math.round((Math.abs(b.value) / max) * 100));
                  return (
                    <div key={b.label} className="rounded-lg border border-white/5 p-3">
                      <div className={`text-xs ${subText}`}>{b.label}</div>
                      <div className={`mt-1 text-sm font-semibold ${headerText}`}>{currency(b.show)}</div>
                      <div className={`mt-2 h-2 rounded-full ${isNeon ? 'bg-white/10' : 'bg-gray-100'}`}>
                        <div className={`h-2 rounded-full ${b.color}`} style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`rounded-xl p-4 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-sm font-semibold ${headerText}`}>Manual adjustments</div>
                  <div className={`text-xs ${subText}`}>Refunds, bonuses, tax estimates, corrections.</div>
                </div>
                <div className={`text-xs ${subText}`}>{currency(totals.adjustmentsTotal)}</div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2">
                <input
                  value={adjLabel}
                  onChange={(e) => setAdjLabel(e.target.value)}
                  placeholder="Label (e.g. Refunds, Tax estimate)"
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value)}
                    placeholder="+100 or -50"
                    inputMode="decimal"
                    className={`col-span-2 w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                  />
                  <button
                    onClick={() => {
                      const amt = Number(String(adjAmount || '').trim());
                      const label = String(adjLabel || '').trim();
                      if (!Number.isFinite(amt) || amt === 0) return;
                      setAdjustments((prev) => [
                        { id: randomId(), label: label || 'Adjustment', amount: Math.round(amt * 100) / 100, createdAtMs: Date.now() },
                        ...prev,
                      ]);
                      setAdjAmount('');
                      setAdjLabel('');
                    }}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                      isNeon ? 'bg-white/5 text-white border border-white/10 hover:bg-white/10' : 'bg-gray-900 text-white hover:bg-gray-800'
                    }`}
                    title="Add adjustment"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {adjustments.length === 0 ? (
                  <div className={`text-sm ${subText}`}>No adjustments yet for this range.</div>
                ) : (
                  adjustments.slice(0, 8).map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2">
                      <div className="min-w-0">
                        <div className={`truncate text-sm font-medium ${headerText}`}>{a.label}</div>
                        <div className={`text-xs ${subText}`}>{new Date(a.createdAtMs).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`text-sm font-semibold ${a.amount >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : isNeon ? 'text-red-200' : 'text-red-700'}`}>
                          {currency(a.amount)}
                        </div>
                        <button
                          onClick={() => setAdjustments((prev) => prev.filter((x) => x.id !== a.id))}
                          className={`rounded-lg p-2 ${
                            isNeon ? 'text-slate-200 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={`rounded-xl p-4 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-sm font-semibold ${headerText}`}>Expense breakdown</div>
                  <div className={`text-xs ${subText}`}>Only logged expenses are included.</div>
                </div>
                <div className={`text-xs ${subText}`}>{currency(totals.operatingExpenses)}</div>
              </div>

              <div className="mt-3 space-y-3">
                {byCategory.length === 0 ? (
                  <div className={`text-sm ${subText}`}>No expense data in this range.</div>
                ) : (
                  byCategory.slice(0, 8).map((r) => (
                    <div key={r.category}>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${headerText}`}>{CATEGORY_LABELS[r.category]}</span>
                        <span className={`text-sm font-semibold ${headerText}`}>{currency(r.amount)}</span>
                      </div>
                      <div className={`mt-2 h-2 rounded-full ${isNeon ? 'bg-white/10' : 'bg-gray-100'}`}>
                        <div
                          className={`h-2 rounded-full ${isNeon ? 'bg-gradient-to-r from-emerald-500 to-cyan-500' : 'bg-gradient-to-r from-blue-500 to-purple-500'}`}
                          style={{ width: `${Math.max(4, Math.round((r.amount / maxCat) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-4 text-xs ${subText}`}>
          User: <span className="font-mono">{effectiveUserId || '—'}</span> • Range: <span className="font-mono">{fromIso}</span> →{' '}
          <span className="font-mono">{toIso}</span>
        </div>
      </div>
    </div>
  );
}

