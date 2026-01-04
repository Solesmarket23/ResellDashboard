'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useAuth } from '@/lib/contexts/AuthContext';

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

function currency(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

export default function Cashflow() {
  const { currentTheme } = useTheme();
  const { user: authUser } = useAuth();
  const isNeon = currentTheme.name.toLowerCase() === 'neon';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CashflowResponse | null>(null);
  const [search, setSearch] = useState('');
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const effectiveUserId = useMemo(() => {
    if (typeof window === 'undefined') return authUser?.uid || '';
    const siteUserId = localStorage.getItem('siteUserId') || localStorage.getItem('userId') || '';
    return authUser?.uid || siteUserId || '';
  }, [authUser?.uid]);

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth()); // 0-based
  const [preset, setPreset] = useState<'this_month' | 'last_month' | 'last_90' | 'ytd' | 'custom'>('this_month');
  const [customFrom, setCustomFrom] = useState(() => ymdLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(() => ymdLocal(new Date()));
  const [includePendingSales, setIncludePendingSales] = useState(false);

  const { fromIso, toIso, label } = useMemo(() => {
    const now = new Date();
    if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
      end.setMilliseconds(end.getMilliseconds() - 1);
      return { fromIso: start.toISOString(), toIso: end.toISOString(), label: `${start.toLocaleString('en-US', { month: 'long' })} ${start.getFullYear()}` };
    }
    if (preset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end.setMilliseconds(end.getMilliseconds() - 1);
      return { fromIso: start.toISOString(), toIso: end.toISOString(), label: `${start.toLocaleString('en-US', { month: 'long' })} ${start.getFullYear()}` };
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
    if (preset === 'custom') {
      const start = new Date(`${customFrom}T00:00:00`);
      const end = new Date(`${customTo}T23:59:59`);
      return { fromIso: start.toISOString(), toIso: end.toISOString(), label: `${customFrom} → ${customTo}` };
    }
    // month picker
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
    end.setMilliseconds(end.getMilliseconds() - 1);
    return { fromIso: start.toISOString(), toIso: end.toISOString(), label: `${start.toLocaleString('en-US', { month: 'long' })} ${start.getFullYear()}` };
  }, [preset, year, month, customFrom, customTo]);

  const months = useMemo(
    () => Array.from({ length: 12 }).map((_, i) => new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' })),
    []
  );
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 8 }).map((_, i) => y - i);
  }, []);

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
      const res = await fetch(`/api/cashflow/summary?${qp.toString()}`, {
        headers: { 'x-user-id': effectiveUserId },
      });
      const json = (await res.json().catch(() => null)) as CashflowResponse | null;
      if (!res.ok || !json?.success) throw new Error(json?.error || `Request failed (${res.status})`);
      setData(json);
      // nudge user to results after load
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e: any) {
      setError(e?.message || 'Failed to load cashflow');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial load
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const rows = data?.transactions || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) => {
      const hay = `${t.type} ${t.orderNumber || ''} ${t.productName || ''} ${t.platform || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.transactions, search]);

  const daily = useMemo(() => {
    const rows = filtered;
    const map = new Map<string, number>();
    for (const t of rows) {
      const d = new Date(t.dateIso);
      if (Number.isNaN(d.getTime())) continue;
      const key = ymdLocal(d);
      map.set(key, (map.get(key) || 0) + (typeof t.net === 'number' ? t.net : 0));
    }
    const keys = Array.from(map.keys()).sort();
    const points = keys.map((k) => ({ day: k, net: map.get(k) || 0 }));
    const maxAbs = points.reduce((m, p) => Math.max(m, Math.abs(p.net)), 0) || 1;
    return { points, maxAbs };
  }, [filtered]);

  const headerText = isNeon ? 'text-white' : 'text-gray-900';
  const subText = isNeon ? 'text-slate-300' : 'text-gray-600';
  const cardBg = isNeon ? 'bg-slate-900/60 border border-slate-700/50' : 'bg-white border border-gray-200';

  return (
    <div className={`flex-1 overflow-y-auto ${currentTheme.colors.background}`}>
      <div className="px-6 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className={`text-2xl sm:text-3xl font-bold ${headerText}`}>Cash Flow</h1>
            <p className={`mt-1 text-sm ${subText}`}>
              Money in vs money out for <span className="font-semibold">{label}</span>
              {data?.truncated ? (
                <span className="ml-2 opacity-80">(Showing {data.transactions.length} of {data.truncatedTotal} transactions)</span>
              ) : null}
            </p>
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
                const rows = (data?.transactions || []).map((t) => ({
                  dateLocal: fmtDateTimeLocal(t.dateIso),
                  dateIso: t.dateIso,
                  type: t.type,
                  orderNumber: t.orderNumber,
                  productName: t.productName,
                  platform: t.platform,
                  moneyIn: t.moneyIn,
                  moneyOut: t.moneyOut,
                  net: t.net,
                }));
                downloadCsv(`cashflow-${label.replace(/\s+/g, '_')}.csv`, rows);
              }}
              disabled={!data || (data?.transactions?.length || 0) === 0}
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
                    ? isNeon ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-gray-900 bg-gray-900 text-white'
                    : isNeon ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60' : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                This month
              </button>
              <button
                onClick={() => setPreset('last_month')}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  preset === 'last_month'
                    ? isNeon ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-gray-900 bg-gray-900 text-white'
                    : isNeon ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60' : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                Last month
              </button>
              <button
                onClick={() => setPreset('last_90')}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  preset === 'last_90'
                    ? isNeon ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-gray-900 bg-gray-900 text-white'
                    : isNeon ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60' : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                Last 90 days
              </button>
              <button
                onClick={() => setPreset('ytd')}
                className={`rounded-lg px-3 py-2 text-sm border ${
                  preset === 'ytd'
                    ? isNeon ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-gray-900 bg-gray-900 text-white'
                    : isNeon ? 'border-slate-700/60 bg-slate-950/40 text-slate-200 hover:bg-slate-950/60' : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                YTD
              </button>

              <div className="ml-2 flex items-center gap-2">
                <span className={`text-sm ${subText}`}>Month:</span>
                <select
                  value={month}
                  onChange={(e) => {
                    setMonth(Number(e.target.value));
                    setPreset('custom');
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    isNeon ? 'border-slate-700 bg-slate-950/60 text-slate-100' : 'border-gray-300 bg-white text-gray-900'
                  }`}
                >
                  {months.map((m, idx) => (
                    <option key={m} value={idx}>{m}</option>
                  ))}
                </select>
                <select
                  value={year}
                  onChange={(e) => {
                    setYear(Number(e.target.value));
                    setPreset('custom');
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    isNeon ? 'border-slate-700 bg-slate-950/60 text-slate-100' : 'border-gray-300 bg-white text-gray-900'
                  }`}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="ml-2 flex items-center gap-2">
                <span className={`text-sm ${subText}`}>Custom:</span>
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

            <div className="flex flex-wrap items-center gap-3">
              <label className={`flex items-center gap-2 text-sm ${subText}`}>
                <input
                  type="checkbox"
                  checked={includePendingSales}
                  onChange={(e) => setIncludePendingSales(e.target.checked)}
                />
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
            <div className={`mt-3 rounded-lg border p-3 text-sm ${isNeon ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {error}
            </div>
          ) : null}
        </div>

        {/* Summary cards */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Money In</div>
            <div className={`mt-2 text-2xl font-bold ${headerText}`}>{currency(data?.summary.moneyIn ?? 0)}</div>
            <div className={`mt-1 text-sm ${subText}`}>{data?.summary.salesCount ?? 0} sales</div>
          </div>
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Money Out</div>
            <div className={`mt-2 text-2xl font-bold ${headerText}`}>{currency(data?.summary.moneyOut ?? 0)}</div>
            <div className={`mt-1 text-sm ${subText}`}>{data?.summary.purchasesCount ?? 0} purchases</div>
          </div>
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Net Cash Flow</div>
            <div className={`mt-2 text-2xl font-bold ${data?.summary.net ?? 0 >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-red-200' : 'text-red-700')}`}>
              {currency(data?.summary.net ?? 0)}
            </div>
            <div className={`mt-1 text-sm ${subText}`}>In − Out</div>
          </div>
          <div className={`rounded-xl p-4 ${cardBg}`}>
            <div className={`text-xs uppercase tracking-wide ${subText}`}>Avg / Sale</div>
            <div className={`mt-2 text-2xl font-bold ${headerText}`}>
              {currency((data?.summary.moneyIn ?? 0) / Math.max(1, data?.summary.salesCount ?? 0))}
            </div>
            <div className={`mt-1 text-sm ${subText}`}>Avg net payout</div>
          </div>
        </div>

        {/* Chart */}
        <div ref={resultsRef} className={`mt-5 rounded-xl p-4 ${cardBg}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={`text-sm font-semibold ${headerText}`}>Daily net</div>
              <div className={`text-xs ${subText}`}>Net per day from filtered transactions</div>
            </div>
            <div className={`text-xs ${subText}`}>{daily.points.length} day(s)</div>
          </div>

          <div className="mt-4 flex items-end gap-1 overflow-x-auto pb-2">
            {daily.points.length === 0 ? (
              <div className={subText}>No transactions in this period.</div>
            ) : (
              daily.points.map((p) => {
                const h = Math.round((Math.abs(p.net) / daily.maxAbs) * 72) + 4;
                const isPos = p.net >= 0;
                const bar = isPos ? (isNeon ? 'bg-emerald-500/30' : 'bg-emerald-400') : (isNeon ? 'bg-red-500/30' : 'bg-red-400');
                return (
                  <div key={p.day} className="flex flex-col items-center gap-1" title={`${p.day}: ${currency(p.net)}`}>
                    <div className={`${bar} w-3 rounded-md`} style={{ height: `${h}px` }} />
                    <div className={`text-[10px] ${subText}`} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {p.day.slice(5)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Transactions */}
        <div className={`mt-5 rounded-xl ${cardBg}`}>
          <div className="flex flex-col gap-3 border-b border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className={`text-sm font-semibold ${headerText}`}>Transactions</div>
            <div className="relative w-full sm:w-96">
              <Search className={`absolute left-3 top-2.5 h-4 w-4 ${subText}`} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order #, product, platform…"
                className={`w-full rounded-lg border pl-9 pr-3 py-2 text-sm ${
                  isNeon ? 'border-slate-700 bg-slate-950/60 text-slate-100 placeholder:text-slate-400' : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400'
                }`}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed">
              <thead className={`${isNeon ? 'bg-slate-950/40' : 'bg-gray-50'}`}>
                <tr className={`${isNeon ? 'divide-x divide-slate-700/50' : 'divide-x divide-gray-200'}`}>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subText}`}>Date</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subText}`}>Type</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subText}`}>Order #</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subText}`}>Product</th>
                  <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subText}`}>Platform</th>
                  <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider ${subText}`}>In</th>
                  <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider ${subText}`}>Out</th>
                  <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider ${subText}`}>Net</th>
                </tr>
              </thead>
              <tbody className={`${isNeon ? 'divide-y divide-slate-700/40' : 'divide-y divide-gray-200'}`}>
                {loading ? (
                  <tr>
                    <td colSpan={8} className={`px-4 py-6 text-center text-sm ${subText}`}>
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={`px-4 py-6 text-center text-sm ${subText}`}>
                      No matching transactions.
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => {
                    const isSale = t.type === 'sale';
                    const net = t.net;
                    return (
                      <tr key={`${t.type}-${t.id}`} className={`${isNeon ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}>
                        <td className={`px-4 py-3 text-sm ${headerText}`} title={t.dateIso}>
                          {fmtDateTimeLocal(t.dateIso)}
                        </td>
                        <td className={`px-4 py-3 text-sm ${headerText}`}>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            isSale ? (isNeon ? 'bg-emerald-500/15 text-emerald-200' : 'bg-emerald-100 text-emerald-800') : (isNeon ? 'bg-amber-500/15 text-amber-200' : 'bg-amber-100 text-amber-800')
                          }`}>
                            {isSale ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {isSale ? 'Sale' : 'Purchase'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-sm ${headerText} truncate`} title={t.orderNumber || ''}>
                          {t.orderNumber || '—'}
                        </td>
                        <td className={`px-4 py-3 text-sm ${headerText} truncate`} title={t.productName || ''}>
                          {t.productName || '—'}
                        </td>
                        <td className={`px-4 py-3 text-sm ${subText} truncate`} title={t.platform || ''}>
                          {t.platform || '—'}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${isSale ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : subText}`}>
                          {currency(t.moneyIn)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${!isSale ? (isNeon ? 'text-amber-200' : 'text-amber-700') : subText}`}>
                          {currency(t.moneyOut)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            net >= 0 ? (isNeon ? 'bg-green-500/20 text-green-200' : 'bg-green-100 text-green-800') : (isNeon ? 'bg-red-500/20 text-red-200' : 'bg-red-100 text-red-800')
                          }`}>
                            {currency(net)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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


