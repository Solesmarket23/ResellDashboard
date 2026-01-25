'use client';

import React, { useMemo, useState } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useSales } from '@/lib/hooks/useSales';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RefreshCw,
  Target,
  Calendar,
  BadgeDollarSign,
  BarChart3,
  Lightbulb,
} from 'lucide-react';

type RangeKey = '7d' | '30d' | '90d';

function toMs(v: any): number | null {
  const candidates = [v?.payoutDate, v?.payout_date, v?.date, v?.updatedAt, v?.createdAt];
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const ms = Date.parse(c);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function extractBrand(name: string): string {
  const raw = (name || '').trim();
  if (!raw) return 'Unknown';
  const known = [
    'Nike',
    'Jordan',
    'Adidas',
    'Yeezy',
    'New Balance',
    'Asics',
    'Puma',
    'Vans',
    'Converse',
    'Reebok',
    'Under Armour',
    'Fear of God',
    'Polo Ralph Lauren',
    'Off-White',
    'Travis Scott',
    'Stone Island',
    'Supreme',
    'BAPE',
    'Kith',
  ];
  const lower = raw.toLowerCase();
  for (const b of known) {
    if (lower.startsWith(b.toLowerCase())) return b;
  }
  return raw.split(' ')[0] || 'Unknown';
}

function Sparkline({ values, isNeon }: { values: number[]; isNeon: boolean }) {
  const w = 240;
  const h = 64;
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
        <linearGradient id="spark" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={isNeon ? 'rgba(34,211,238,0.9)' : 'rgba(59,130,246,0.9)'} />
          <stop offset="1" stopColor={isNeon ? 'rgba(16,185,129,0.9)' : 'rgba(16,185,129,0.9)'} />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke="url(#spark)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function Insights() {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme?.name === 'Neon';
  const { sales, metrics, loading, error, forceRefresh, connectionState } = useSales();
  const [range, setRange] = useState<RangeKey>('30d');

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

  const rangeTotals = useMemo(() => {
    const revenue = salesInRange.reduce((sum, s: any) => sum + (Number(s?.salePrice) || Number(s?.amount) || Number(s?.payout?.amount) || 0), 0);
    const spend = salesInRange.reduce((sum, s: any) => sum + (Number(s?.purchasePrice) || 0), 0);
    const fees = salesInRange.reduce((sum, s: any) => sum + (Number(s?.fees) || 0), 0);
    const profit = revenue - spend - fees;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, spend, profit, margin };
  }, [salesInRange]);

  const dailyProfit = useMemo(() => {
    const days = range === '7d' ? 7 : range === '90d' ? 14 : 14; // keep sparkline readable
    const bucketMs = 24 * 60 * 60 * 1000;
    const start = now - (days - 1) * bucketMs;
    const buckets = new Array(days).fill(0);
    for (const s of salesInRange) {
      const ms = toMs(s);
      if (ms === null) continue;
      if (ms < start) continue;
      const idx = Math.min(days - 1, Math.max(0, Math.floor((ms - start) / bucketMs)));
      const revenue = Number(s?.salePrice) || Number(s?.amount) || Number(s?.payout?.amount) || 0;
      const spend = Number(s?.purchasePrice) || 0;
      const fees = Number(s?.fees) || 0;
      buckets[idx] += revenue - spend - fees;
    }
    return buckets;
  }, [now, range, salesInRange]);

  const topBrands = useMemo(() => {
    const map = new Map<string, { count: number; profit: number }>();
    for (const s of salesInRange) {
      const name = String(s?.productName || s?.product?.name || s?.name || '');
      const b = extractBrand(name);
      const revenue = Number(s?.salePrice) || Number(s?.amount) || Number(s?.payout?.amount) || 0;
      const spend = Number(s?.purchasePrice) || 0;
      const fees = Number(s?.fees) || 0;
      const profit = revenue - spend - fees;
      const cur = map.get(b) || { count: 0, profit: 0 };
      map.set(b, { count: cur.count + 1, profit: cur.profit + profit });
    }
    return [...map.entries()]
      .sort((a, b) => b[1].profit - a[1].profit)
      .slice(0, 5);
  }, [salesInRange]);

  const actionables = useMemo(() => {
    const items: Array<{ title: string; detail: string; tone: 'good' | 'warn' | 'bad' }> = [];
    if (salesInRange.length === 0) {
      items.push({
        title: 'No recent sales in this range',
        detail: 'Import sales or expand the date range to generate insights.',
        tone: 'warn',
      });
      return items;
    }
    if (rangeTotals.margin < 8) {
      items.push({
        title: 'Profit margin is tight',
        detail: `Margin is ${rangeTotals.margin.toFixed(1)}%. Consider raising floors on low-margin SKUs and avoiding deep discounts.`,
        tone: 'warn',
      });
    } else {
      items.push({
        title: 'Healthy margin',
        detail: `Margin is ${rangeTotals.margin.toFixed(1)}%. Keep pushing volume while protecting floors.`,
        tone: 'good',
      });
    }
    if (metrics.salesCount > 0 && metrics.avgProfitPerSale < 25) {
      items.push({
        title: 'Average profit per sale is low',
        detail: `Avg profit is ${money(metrics.avgProfitPerSale)}. Try focusing on higher spread items or reducing fees with batching.`,
        tone: 'warn',
      });
    }
    if (topBrands[0]?.[0]) {
      items.push({
        title: 'Best performing brand',
        detail: `${topBrands[0][0]} leads profit in this range. Consider sourcing more of it.`,
        tone: 'good',
      });
    }
    return items;
  }, [metrics.avgProfitPerSale, metrics.salesCount, rangeTotals.margin, salesInRange.length, topBrands]);

  const cardBase = isNeon
    ? 'bg-white/5 border-white/10'
    : 'bg-white border-gray-200';

  return (
    <div className={`flex-1 ${currentTheme.colors.background} p-4 sm:p-8`}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className={`w-5 h-5 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              <h1 className={`text-2xl sm:text-3xl font-bold ${currentTheme.colors.textPrimary}`}>Insights</h1>
            </div>
            <p className={`mt-1 text-sm ${currentTheme.colors.textSecondary}`}>
              High-signal metrics and next actions pulled from your sales data.
            </p>
            <div className={`mt-2 text-xs ${currentTheme.colors.textSecondary}`}>
              Status: {connectionState.status}{connectionState.lastUpdated ? ` • Updated ${connectionState.lastUpdated.toLocaleTimeString()}` : ''}
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
                isNeon
                  ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white/90'
                  : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-900'
              }`}
              title="Refresh insights"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {String(error)}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* KPI row */}
          <div className={`md:col-span-8 rounded-2xl border p-5 ${cardBase}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
                  <BarChart3 className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
                  Performance snapshot ({range.toUpperCase()})
                </div>
                <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>
                  Profit trend (daily)
                </div>
              </div>
              <div className={`text-xs ${currentTheme.colors.textSecondary} flex items-center gap-2`}>
                <Calendar className="w-4 h-4" />
                {salesInRange.length} sales in range
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Revenue</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{money(rangeTotals.revenue)}</div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Spend</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{money(rangeTotals.spend)}</div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Profit</div>
                <div className={`mt-1 text-lg font-bold ${rangeTotals.profit >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-rose-200' : 'text-rose-700')}`}>
                  {money(rangeTotals.profit)}
                </div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Margin</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{rangeTotals.margin.toFixed(1)}%</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border p-3 flex items-center gap-3 justify-between overflow-hidden"
              style={{ borderColor: isNeon ? 'rgba(255,255,255,0.10)' : undefined }}
            >
              <div className="min-w-0">
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Daily profit trend</div>
                <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
                  {dailyProfit[dailyProfit.length - 1] >= dailyProfit[0] ? (
                    <TrendingUp className={`w-4 h-4 ${isNeon ? 'text-emerald-200' : 'text-emerald-700'}`} />
                  ) : (
                    <TrendingDown className={`w-4 h-4 ${isNeon ? 'text-rose-200' : 'text-rose-700'}`} />
                  )}
                  {dailyProfit.length}-day sparkline
                </div>
              </div>
              <div className="w-[240px] shrink-0">
                <Sparkline values={dailyProfit} isNeon={isNeon} />
              </div>
            </div>
          </div>

          {/* Actionables */}
          <div className={`md:col-span-4 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <Target className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              Actionables
            </div>
            <div className="mt-3 space-y-3">
              {actionables.map((a) => (
                <div
                  key={a.title}
                  className={`rounded-xl border p-3 ${
                    a.tone === 'good'
                      ? (isNeon ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-emerald-200 bg-emerald-50')
                      : a.tone === 'bad'
                        ? (isNeon ? 'border-rose-500/25 bg-rose-500/10' : 'border-rose-200 bg-rose-50')
                        : (isNeon ? 'border-amber-500/25 bg-amber-500/10' : 'border-amber-200 bg-amber-50')
                  }`}
                >
                  <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>{a.title}</div>
                  <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>{a.detail}</div>
                </div>
              ))}
              <div className={`mt-2 text-xs ${currentTheme.colors.textSecondary} flex items-center gap-2`}>
                <Lightbulb className="w-4 h-4" />
                These suggestions update as your sales data changes.
              </div>
            </div>
          </div>

          {/* Brand focus */}
          <div className={`md:col-span-6 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <BadgeDollarSign className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              Top brands by profit ({range.toUpperCase()})
            </div>
            <div className="mt-4 space-y-2">
              {topBrands.length === 0 ? (
                <div className={`text-sm ${currentTheme.colors.textSecondary}`}>
                  No brand insights yet. Import sales or widen the range.
                </div>
              ) : (
                topBrands.map(([b, v]) => (
                  <div key={b} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                    isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'
                  }`}>
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>{b}</div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{v.count} sale{v.count === 1 ? '' : 's'}</div>
                    </div>
                    <div className={`text-sm font-bold ${v.profit >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-rose-200' : 'text-rose-700')}`}>
                      {money(v.profit)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Overall snapshot */}
          <div className={`md:col-span-6 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <DollarSign className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              Lifetime snapshot
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Total profit</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{money(metrics.totalProfit)}</div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Sales count</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{metrics.salesCount}</div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Avg profit / sale</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{money(metrics.avgProfitPerSale)}</div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Profit margin</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{metrics.profitMargin.toFixed(1)}%</div>
              </div>
            </div>
            <div className={`mt-4 text-xs ${currentTheme.colors.textSecondary}`}>
              Note: metrics are derived from your sales docs (manual + StockX) and update as imports complete.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

