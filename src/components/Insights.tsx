'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  AlertTriangle,
  ArrowRight,
  Percent,
  Layers,
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

function pct(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toFixed(1)}%`;
}

function toNum(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function revenueOf(s: any): number {
  return toNum(s?.salePrice) || toNum(s?.amount) || toNum(s?.payout?.amount) || toNum(s?.payout) || 0;
}

function feesOf(s: any): number {
  return toNum(s?.fees) || toNum(s?.totalFees) || 0;
}

function spendOf(s: any): number {
  return toNum(s?.purchasePrice) || toNum(s?.costBasis) || 0;
}

function saleDateMs(s: any): number | null {
  // Prefer “sale date”, but fall back to created/import timestamps.
  const candidates = [s?.date, s?.saleDate, s?.soldAt, s?.sold_at, s?.createdAt, s?.updatedAt];
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const ms = Date.parse(c);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function payoutDateMs(s: any): number | null {
  const candidates = [s?.payoutDate, s?.payout_date, s?.payout?.date, s?.payoutAt];
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const ms = Date.parse(c);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function purchaseDateMs(s: any): number | null {
  const candidates = [
    s?.purchaseDate,
    s?.purchase_date,
    s?.linkedPurchaseDate,
    s?.linkedPurchase?.purchaseDate,
    s?.purchase?.purchaseDate,
  ];
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const ms = Date.parse(c);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
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
  const router = useRouter();
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
    const revenue = salesInRange.reduce((sum, s: any) => sum + revenueOf(s), 0);
    const spend = salesInRange.reduce((sum, s: any) => sum + spendOf(s), 0);
    const fees = salesInRange.reduce((sum, s: any) => sum + feesOf(s), 0);
    const profit = revenue - spend - fees;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const feeRate = revenue > 0 ? (fees / revenue) * 100 : 0;
    return { revenue, spend, fees, profit, margin, feeRate };
  }, [salesInRange]);

  const profitTrend = useMemo(() => {
    // Match the selected range:
    // - 7d: daily buckets (7)
    // - 30d: daily buckets (30)
    // - 90d: weekly buckets (~13) to keep the sparkline readable
    const is90 = range === '90d';
    const bucketMs = is90 ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const bucketsCount = is90 ? 13 : range === '7d' ? 7 : 30;
    const start = now - (bucketsCount - 1) * bucketMs;
    const buckets = new Array(bucketsCount).fill(0);

    for (const s of salesInRange) {
      const ms = saleDateMs(s) ?? toMs(s);
      if (ms === null) continue;
      if (ms < start) continue;
      const idx = Math.min(bucketsCount - 1, Math.max(0, Math.floor((ms - start) / bucketMs)));
      buckets[idx] += revenueOf(s) - spendOf(s) - feesOf(s);
    }

    return {
      buckets,
      label: is90 ? 'weekly' : 'daily',
    };
  }, [now, range, salesInRange]);

  const rangePlatform = useMemo(() => {
    const out = new Map<string, { count: number; revenue: number; profit: number }>();
    for (const s of salesInRange) {
      const platform = String(s?.platform || (s?.source?.includes?.('stockx') ? 'stockx' : 'manual') || 'unknown').toLowerCase();
      const revenue = revenueOf(s);
      const profit = revenue - spendOf(s) - feesOf(s);
      const cur = out.get(platform) || { count: 0, revenue: 0, profit: 0 };
      out.set(platform, { count: cur.count + 1, revenue: cur.revenue + revenue, profit: cur.profit + profit });
    }
    const rows = [...out.entries()]
      .map(([platform, v]) => ({ platform, ...v }))
      .sort((a, b) => b.profit - a.profit);
    return rows;
  }, [salesInRange]);

  const dataQuality = useMemo(() => {
    const total = salesInRange.length;
    let missingPurchase = 0;
    let missingFees = 0;
    let missingDate = 0;
    let missingName = 0;
    for (const s of salesInRange) {
      const hasPurchase = spendOf(s) > 0 || Boolean(s?.purchasePrice) || Boolean(s?.costBasis);
      const hasFees = feesOf(s) > 0 || Boolean(s?.fees) || Boolean(s?.totalFees);
      const hasDate = Boolean(saleDateMs(s) ?? toMs(s));
      const name = String(s?.productName || s?.product?.name || s?.name || '').trim();
      if (!hasPurchase) missingPurchase++;
      if (!hasFees) missingFees++;
      if (!hasDate) missingDate++;
      if (!name) missingName++;
    }
    return { total, missingPurchase, missingFees, missingDate, missingName };
  }, [salesInRange]);

  const skuStats = useMemo(() => {
    type Row = {
      key: string;
      name: string;
      size: string;
      styleId: string;
      count: number;
      revenue: number;
      spend: number;
      fees: number;
      profit: number;
      margin: number;
      feeRate: number;
    };

    const normalize = (v: unknown) =>
      String(v || '')
        .trim()
        .replace(/\s+/g, ' ');

    const map = new Map<string, Row>();
    for (const s of salesInRange) {
      const name = normalize(s?.productName || s?.product?.name || s?.name);
      const size = normalize(s?.size || s?.variant?.variantValue || s?.variantValue);
      const styleId = normalize(s?.styleId || s?.product?.styleId);
      const key = [styleId || 'na', name || 'unknown', size || 'na'].join('::');

      const revenue = revenueOf(s);
      const spend = spendOf(s);
      const fees = feesOf(s);
      const profit = revenue - spend - fees;

      const cur = map.get(key) || {
        key,
        name: name || 'Unknown product',
        size: size || '',
        styleId: styleId || '',
        count: 0,
        revenue: 0,
        spend: 0,
        fees: 0,
        profit: 0,
        margin: 0,
        feeRate: 0,
      };
      cur.count += 1;
      cur.revenue += revenue;
      cur.spend += spend;
      cur.fees += fees;
      cur.profit += profit;
      cur.margin = cur.revenue > 0 ? (cur.profit / cur.revenue) * 100 : 0;
      cur.feeRate = cur.revenue > 0 ? (cur.fees / cur.revenue) * 100 : 0;
      map.set(key, cur);
    }

    const rows = [...map.values()].sort((a, b) => b.profit - a.profit);
    const top = rows.slice(0, 5);
    const worst = [...rows].sort((a, b) => a.profit - b.profit).slice(0, 5);
    return { top, worst };
  }, [salesInRange]);

  const feeOutliers = useMemo(() => {
    const rows = salesInRange
      .map((s: any) => {
        const revenue = revenueOf(s);
        const fees = feesOf(s);
        const rate = revenue > 0 ? (fees / revenue) * 100 : 0;
        const name = String(s?.productName || s?.product?.name || s?.name || '').trim();
        const platform = String(s?.platform || (s?.source?.includes?.('stockx') ? 'stockx' : 'manual') || 'unknown');
        return { revenue, fees, rate, name, platform };
      })
      .filter((r) => r.revenue > 0 && r.fees > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
    return rows;
  }, [salesInRange]);

  const timing = useMemo(() => {
    // “Time to sell” requires a purchase date on the sale doc (or embedded link). If absent, show N/A.
    const toDays = (ms: number) => ms / (24 * 60 * 60 * 1000);
    const tts: number[] = [];
    const payoutLag: number[] = [];
    for (const s of salesInRange) {
      const p = purchaseDateMs(s);
      const sold = saleDateMs(s) ?? toMs(s);
      if (p !== null && sold !== null && sold >= p) tts.push(toDays(sold - p));
      const pay = payoutDateMs(s);
      if (sold !== null && pay !== null && pay >= sold) payoutLag.push(toDays(pay - sold));
    }
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    return {
      avgTimeToSellDays: avg(tts),
      avgPayoutLagDays: avg(payoutLag),
      coverage: {
        timeToSell: tts.length,
        payoutLag: payoutLag.length,
      }
    };
  }, [salesInRange]);

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
    if (rangeTotals.feeRate > 14) {
      items.push({
        title: 'Fees are eating margin',
        detail: `Fees are ${pct(rangeTotals.feeRate)} of revenue in this range. Consider increasing floors or focusing on higher ASP items.`,
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
  }, [metrics.avgProfitPerSale, metrics.salesCount, rangeTotals.feeRate, rangeTotals.margin, salesInRange.length, topBrands]);

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
            <div className={`hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${
              isNeon ? 'bg-white/5 border-white/10 text-white/80' : 'bg-white border-gray-200 text-gray-800'
            }`}>
              <button
                onClick={() => router.push('/dashboard?section=sales')}
                className={`inline-flex items-center gap-1 ${isNeon ? 'hover:text-white' : 'hover:text-gray-900'}`}
                title="Open Sales"
              >
                Sales <ArrowRight className="w-4 h-4" />
              </button>
              <span className={isNeon ? 'text-white/20' : 'text-gray-300'}>•</span>
              <button
                onClick={() => router.push('/dashboard?section=cashflow')}
                className={`inline-flex items-center gap-1 ${isNeon ? 'hover:text-white' : 'hover:text-gray-900'}`}
                title="Open Cashflow"
              >
                Cashflow <ArrowRight className="w-4 h-4" />
              </button>
              <span className={isNeon ? 'text-white/20' : 'text-gray-300'}>•</span>
              <button
                onClick={() => router.push('/dashboard?section=stockx-repricing')}
                className={`inline-flex items-center gap-1 ${isNeon ? 'hover:text-white' : 'hover:text-gray-900'}`}
                title="Open Repricing"
              >
                Repricing <ArrowRight className="w-4 h-4" />
              </button>
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
                  Profit trend ({profitTrend.label})
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
                  {profitTrend.buckets[profitTrend.buckets.length - 1] >= profitTrend.buckets[0] ? (
                    <TrendingUp className={`w-4 h-4 ${isNeon ? 'text-emerald-200' : 'text-emerald-700'}`} />
                  ) : (
                    <TrendingDown className={`w-4 h-4 ${isNeon ? 'text-rose-200' : 'text-rose-700'}`} />
                  )}
                  {profitTrend.buckets.length}-{profitTrend.label === 'weekly' ? 'wk' : 'day'} sparkline
                </div>
              </div>
              <div className="w-[240px] shrink-0">
                <Sparkline values={profitTrend.buckets} isNeon={isNeon} />
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

          {/* Top / Worst SKUs */}
          <div className={`md:col-span-6 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <Layers className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              Top SKUs by profit ({range.toUpperCase()})
            </div>
            <div className="mt-4 space-y-2">
              {skuStats.top.length === 0 ? (
                <div className={`text-sm ${currentTheme.colors.textSecondary}`}>No SKU insights yet.</div>
              ) : (
                skuStats.top.map((r) => (
                  <div
                    key={r.key}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                      isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} truncate`}>
                        {r.name}
                      </div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>
                        {r.size ? `Size ${r.size}` : '—'}{r.styleId ? ` • ${r.styleId}` : ''} • {r.count} sale{r.count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${r.profit >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-rose-200' : 'text-rose-700')}`}>
                        {money(r.profit)}
                      </div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{pct(r.margin)} margin</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`md:col-span-6 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <AlertTriangle className={`w-4 h-4 ${isNeon ? 'text-amber-200' : 'text-amber-700'}`} />
              Worst SKUs by profit ({range.toUpperCase()})
            </div>
            <div className="mt-4 space-y-2">
              {skuStats.worst.length === 0 ? (
                <div className={`text-sm ${currentTheme.colors.textSecondary}`}>No SKU insights yet.</div>
              ) : (
                skuStats.worst.map((r) => (
                  <div
                    key={r.key}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                      isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} truncate`}>
                        {r.name}
                      </div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>
                        {r.size ? `Size ${r.size}` : '—'}{r.styleId ? ` • ${r.styleId}` : ''} • {r.count} sale{r.count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${r.profit >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-rose-200' : 'text-rose-700')}`}>
                        {money(r.profit)}
                      </div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{pct(r.margin)} margin</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Fees leakage + Channel breakdown */}
          <div className={`md:col-span-6 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <Percent className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              Fees leakage ({range.toUpperCase()})
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Fees (total)</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>{money(rangeTotals.fees)}</div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Fees (% of revenue)</div>
                <div className={`mt-1 text-lg font-bold ${rangeTotals.feeRate > 14 ? (isNeon ? 'text-amber-200' : 'text-amber-700') : currentTheme.colors.textPrimary}`}>
                  {pct(rangeTotals.feeRate)}
                </div>
              </div>
            </div>
            <div className={`mt-4 text-xs ${currentTheme.colors.textSecondary}`}>
              Highest fee rates (top 5):
            </div>
            <div className="mt-2 space-y-2">
              {feeOutliers.length === 0 ? (
                <div className={`text-sm ${currentTheme.colors.textSecondary}`}>No fee details available yet.</div>
              ) : (
                feeOutliers.map((r, i) => (
                  <div
                    key={`${r.name}-${i}`}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                      isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} truncate`}>{r.name || 'Unknown'}</div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{r.platform}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${isNeon ? 'text-amber-200' : 'text-amber-700'}`}>{pct(r.rate)}</div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{money(r.fees)} on {money(r.revenue)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`md:col-span-6 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <DollarSign className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              Channel breakdown ({range.toUpperCase()})
            </div>
            <div className="mt-4 space-y-2">
              {rangePlatform.length === 0 ? (
                <div className={`text-sm ${currentTheme.colors.textSecondary}`}>No channel data yet.</div>
              ) : (
                rangePlatform.map((r) => (
                  <div
                    key={r.platform}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                      isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>{r.platform}</div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{r.count} sale{r.count === 1 ? '' : 's'}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${r.profit >= 0 ? (isNeon ? 'text-emerald-200' : 'text-emerald-700') : (isNeon ? 'text-rose-200' : 'text-rose-700')}`}>
                        {money(r.profit)}
                      </div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{money(r.revenue)} revenue</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Data quality + timing */}
          <div className={`md:col-span-6 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <AlertTriangle className={`w-4 h-4 ${isNeon ? 'text-amber-200' : 'text-amber-700'}`} />
              Data quality ({range.toUpperCase()})
            </div>
            <div className={`mt-2 text-xs ${currentTheme.colors.textSecondary}`}>
              Counts below impact accuracy of profit + timing insights.
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: 'Missing purchasePrice', v: dataQuality.missingPurchase },
                { label: 'Missing fees', v: dataQuality.missingFees },
                { label: 'Missing date', v: dataQuality.missingDate },
                { label: 'Missing product name', v: dataQuality.missingName },
              ].map((x) => (
                <div
                  key={x.label}
                  className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}
                >
                  <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{x.label}</div>
                  <div className={`mt-1 text-lg font-bold ${x.v > 0 ? (isNeon ? 'text-amber-200' : 'text-amber-700') : currentTheme.colors.textPrimary}`}>
                    {x.v}
                  </div>
                  <div className={`text-xs ${currentTheme.colors.textSecondary}`}>
                    {dataQuality.total ? `${pct((x.v / dataQuality.total) * 100)}` : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`md:col-span-6 rounded-2xl border p-5 ${cardBase}`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary} flex items-center gap-2`}>
              <Calendar className={`w-4 h-4 ${isNeon ? 'text-cyan-300' : 'text-blue-600'}`} />
              Timing signals ({range.toUpperCase()})
            </div>
            <div className={`mt-2 text-xs ${currentTheme.colors.textSecondary}`}>
              These show only when the underlying fields exist on sales docs.
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Avg time-to-sell</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>
                  {timing.avgTimeToSellDays === null ? '—' : `${timing.avgTimeToSellDays.toFixed(1)}d`}
                </div>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{timing.coverage.timeToSell} sale(s) w/ purchaseDate</div>
              </div>
              <div className={`rounded-xl border p-3 ${isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-gray-50'}`}>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Avg payout lag</div>
                <div className={`mt-1 text-lg font-bold ${currentTheme.colors.textPrimary}`}>
                  {timing.avgPayoutLagDays === null ? '—' : `${timing.avgPayoutLagDays.toFixed(1)}d`}
                </div>
                <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{timing.coverage.payoutLag} sale(s) w/ payoutDate</div>
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

