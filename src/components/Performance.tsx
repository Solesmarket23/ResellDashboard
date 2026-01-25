'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useSales } from '@/lib/hooks/useSales';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Activity,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Gauge,
  Database,
  Clock,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
} from 'lucide-react';

type RangeKey = '7d' | '30d' | '90d';

function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function toMs(v: any): number | null {
  const candidates = [v?.payoutDate, v?.payout_date, v?.date, v?.updatedAt, v?.createdAt];
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const ms = Date.parse(c);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function Sparkline({ values, isNeon }: { values: number[]; isNeon: boolean }) {
  const w = 240;
  const h = 56;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = Math.max(1, max - min);
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * (w - 8) + 4;
      const y = h - 6 - ((v - min) / span) * (h - 12);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="block">
      <defs>
        <linearGradient id="sparkPerf" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={isNeon ? 'rgba(34,211,238,0.85)' : 'rgba(59,130,246,0.85)'} />
          <stop offset="1" stopColor={isNeon ? 'rgba(16,185,129,0.85)' : 'rgba(16,185,129,0.85)'} />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke="url(#sparkPerf)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

type ApiCheck = { ok: boolean; ms: number; label: string; detail?: string };

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function Performance() {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme?.name === 'Neon';
  const { user } = useAuth();
  const { sales, loading, error, metrics, forceRefresh, connectionState } = useSales();
  const [range, setRange] = useState<RangeKey>('30d');
  const [cashflowCheck, setCashflowCheck] = useState<ApiCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const userId = useMemo(() => {
    if (user?.uid) return user.uid;
    if (typeof window === 'undefined') return '';
    return (localStorage.getItem('siteUserId') || '').trim();
  }, [user?.uid]);

  const rangeMs = useMemo(() => {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    return days * 24 * 60 * 60 * 1000;
  }, [range]);

  const now = Date.now();
  const salesInRange = useMemo(() => {
    const cutoff = now - rangeMs;
    return (sales || []).filter((s) => {
      const ms = toMs(s);
      return ms !== null && ms >= cutoff && ms <= now;
    });
  }, [now, rangeMs, sales]);

  const totals = useMemo(() => {
    const revenue = salesInRange.reduce(
      (sum, s: any) => sum + (Number(s?.salePrice) || Number(s?.amount) || Number(s?.payout?.amount) || 0),
      0
    );
    const spend = salesInRange.reduce((sum, s: any) => sum + (Number(s?.purchasePrice) || 0), 0);
    const fees = salesInRange.reduce((sum, s: any) => sum + (Number(s?.fees) || 0), 0);
    const profit = revenue - spend - fees;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const avgProfit = salesInRange.length > 0 ? profit / salesInRange.length : 0;
    return { revenue, spend, fees, profit, margin, avgProfit, count: salesInRange.length };
  }, [salesInRange]);

  const dailySales = useMemo(() => {
    const days = 14;
    const bucketMs = 24 * 60 * 60 * 1000;
    const start = now - (days - 1) * bucketMs;
    const buckets = new Array(days).fill(0);
    for (const s of salesInRange) {
      const ms = toMs(s);
      if (ms === null) continue;
      if (ms < start) continue;
      const idx = Math.min(days - 1, Math.max(0, Math.floor((ms - start) / bucketMs)));
      buckets[idx] += 1;
    }
    return buckets;
  }, [now, salesInRange]);

  const performanceScore = useMemo(() => {
    // A simple “ops” score (0–100) based on margin, volume, and data freshness.
    const marginScore = Math.max(0, Math.min(40, (totals.margin / 25) * 40)); // 25% margin => 40pts
    const volumeScore = Math.max(0, Math.min(30, totals.count * 3)); // ~10 sales => 30pts
    const freshnessScore = connectionState.lastUpdated ? Math.max(0, 30 - Math.min(30, (Date.now() - connectionState.lastUpdated.getTime()) / (60 * 1000))) : 10;
    return Math.round(marginScore + volumeScore + freshnessScore);
  }, [connectionState.lastUpdated, totals.count, totals.margin]);

  const caches = useMemo(() => {
    if (typeof window === 'undefined') return [];
    const items: Array<{ key: string; label: string; sizeBytes: number; updatedAt: string | null }> = [];
    const keys: Array<{ key: string; label: string; updatedAtPath?: Array<string> }> = [
      { key: 'stockx_listings_cache_v1', label: 'Repricing listings cache', updatedAtPath: ['cachedAt'] },
      { key: 'stockx_product_image_cache_v1', label: 'StockX product image cache' },
      { key: 'stockx_purchase_image_cache_v1', label: 'Purchase image cache' },
      { key: 'stockxCoupons_cache_' + userId + '_all', label: 'Coupons cache', updatedAtPath: ['savedAt'] },
    ];
    for (const k of keys) {
      if (!k.key) continue;
      let raw = '';
      try {
        raw = localStorage.getItem(k.key) || '';
      } catch {
        raw = '';
      }
      if (!raw) continue;
      let updatedAt: string | null = null;
      try {
        const parsed = JSON.parse(raw);
        const v = k.updatedAtPath?.reduce<any>((acc, p) => (acc ? acc[p] : undefined), parsed);
        if (typeof v === 'string') updatedAt = v;
        if (typeof v === 'number' && Number.isFinite(v)) updatedAt = new Date(v).toISOString();
      } catch {
        // ignore
      }
      items.push({ key: k.key, label: k.label, sizeBytes: raw.length, updatedAt });
    }
    return items;
  }, [userId]);

  const runCashflowCheck = useCallback(async () => {
    if (!userId) return;
    setChecking(true);
    try {
      const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const to = new Date();
      const qp = new URLSearchParams({
        userId,
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
        includePendingSales: 'false',
      });
      const started = performance.now();
      const res = await fetch(`/api/cashflow/summary?${qp.toString()}`, { headers: { 'x-user-id': userId } });
      const ms = Math.round(performance.now() - started);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setCashflowCheck({ ok: false, ms, label: 'Cashflow API', detail: json?.error || `HTTP ${res.status}` });
      } else {
        setCashflowCheck({ ok: true, ms, label: 'Cashflow API' });
      }
    } catch (e: any) {
      setCashflowCheck({ ok: false, ms: 0, label: 'Cashflow API', detail: e?.message || 'Request failed' });
    } finally {
      setChecking(false);
    }
  }, [range, userId]);

  const cardBase = isNeon ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200';

  return (
    <div className={`flex-1 ${currentTheme.colors.background} p-4 sm:p-8`}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className={`w-5 h-5 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              <h1 className={`text-2xl sm:text-3xl font-bold ${currentTheme.colors.textPrimary}`}>Performance</h1>
            </div>
            <p className={`mt-1 text-sm ${currentTheme.colors.textSecondary}`}>
              A quick read on your selling performance and system health.
            </p>
            <div className={`mt-2 text-xs ${currentTheme.colors.textSecondary}`}>
              Status: {connectionState.status}
              {connectionState.lastUpdated ? ` • Updated ${connectionState.lastUpdated.toLocaleTimeString()}` : ''}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex rounded-lg border overflow-hidden ${isNeon ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'}`}>
              {(['7d', '30d', '90d'] as RangeKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setRange(k)}
                  className={`px-3 py-2 text-sm font-semibold transition-colors ${
                    range === k
                      ? (isNeon ? 'bg-cyan-500/15 text-cyan-200' : 'bg-blue-50 text-blue-900')
                      : (isNeon ? 'text-white/75 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-50')
                  }`}
                >
                  {k.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => void forceRefresh()}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 ${
                isNeon ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white/90' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-900'
              }`}
              title="Refresh sales data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh data
            </button>
            <button
              onClick={() => void runCashflowCheck()}
              disabled={checking || !userId}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 ${
                isNeon ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white/90' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-900'
              }`}
              title="Run a quick API health check"
            >
              <Gauge className="w-4 h-4" />
              Check health
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {String(error)}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Score + trend */}
          <div className={`md:col-span-8 rounded-2xl border p-5 ${cardBase}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
                  <Gauge className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
                  Performance score
                </div>
                <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>
                  A quick heuristic combining margin, volume, and data freshness.
                </div>
              </div>
              <div className={`text-2xl font-extrabold ${isNeon ? 'text-cyan-200' : 'text-blue-700'}`}>
                {performanceScore}/100
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Profit</div>
                <div className={`mt-1 text-lg font-bold ${totals.profit >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-rose-200' : 'text-rose-700')}`}>
                  {money(totals.profit)}
                </div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Margin</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{totals.margin.toFixed(1)}%</div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Sales</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{totals.count}</div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Avg profit / sale</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{money(totals.avgProfit)}</div>
              </div>
            </div>

            <div className={`mt-4 rounded-xl border p-3 flex items-center justify-between gap-3 ${isNeon ? 'border-white/10 bg-black/10' : 'border-gray-200 bg-gray-50'}`}>
              <div className="min-w-0">
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Sales velocity</div>
                <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
                  {dailySales[dailySales.length - 1] >= dailySales[0] ? (
                    <TrendingUp className={`w-4 h-4 ${isNeon ? 'text-emerald-200' : 'text-emerald-700'}`} />
                  ) : (
                    <TrendingDown className={`w-4 h-4 ${isNeon ? 'text-rose-200' : 'text-rose-700'}`} />
                  )}
                  Last {dailySales.length} days (sales/day)
                </div>
              </div>
              <div className="w-[240px] shrink-0">
                <Sparkline values={dailySales} isNeon={isNeon} />
              </div>
            </div>
          </div>

          {/* System health */}
          <div className={`md:col-span-4 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <BarChart3 className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              System health
            </div>

            <div className="mt-4 space-y-3">
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Sales data</div>
                  {connectionState.status === 'connected' ? (
                    <CheckCircle2 className={`w-4 h-4 ${isNeon ? 'text-emerald-200' : 'text-emerald-700'}`} />
                  ) : (
                    <AlertTriangle className={`w-4 h-4 ${isNeon ? 'text-amber-200' : 'text-amber-700'}`} />
                  )}
                </div>
                <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>
                  Loaded: {sales?.length || 0} sales • Lifetime profit: {money(metrics.totalProfit)}
                </div>
              </div>

              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Cashflow API</div>
                  {cashflowCheck ? (
                    cashflowCheck.ok ? (
                      <CheckCircle2 className={`w-4 h-4 ${isNeon ? 'text-emerald-200' : 'text-emerald-700'}`} />
                    ) : (
                      <AlertTriangle className={`w-4 h-4 ${isNeon ? 'text-amber-200' : 'text-amber-700'}`} />
                    )
                  ) : (
                    <Clock className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                  )}
                </div>
                <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>
                  {cashflowCheck
                    ? `${cashflowCheck.ok ? 'OK' : 'Error'} • ${cashflowCheck.ms ? `${cashflowCheck.ms}ms` : ''} ${cashflowCheck.detail ? `• ${cashflowCheck.detail}` : ''}`
                    : 'Run “Check health” to test this endpoint.'}
                </div>
              </div>
            </div>
          </div>

          {/* Caches */}
          <div className={`md:col-span-12 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <Database className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              Local caches (client)
            </div>
            <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>
              Helps diagnose “blank images” / “stale values” issues quickly.
            </div>

            {caches.length === 0 ? (
              <div className={`mt-4 text-sm ${currentTheme.colors.textSecondary}`}>
                No caches detected yet (open a few sections like Repricing/Coupons and refresh).
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {caches.map((c) => (
                  <div key={c.key} className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>{c.label}</div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{formatBytes(c.sizeBytes)}</div>
                    </div>
                    <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>
                      Key: <span className="font-mono">{c.key}</span>
                    </div>
                    <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>
                      Updated: {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

