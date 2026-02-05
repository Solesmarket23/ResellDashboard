'use client';

import React, { useId, useMemo } from 'react';

export type DonutDatum = {
  label: string;
  value: number;
  color?: string; // CSS color
};

type Props = {
  data: DonutDatum[];
  size?: number; // px
  thickness?: number; // px
  title?: string;
  subtitle?: string;
  isNeon?: boolean;
  valueFormatter?: (v: number) => string;
};

function clampNumber(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export default function NeonDonutChart({
  data,
  size = 220,
  thickness = 18,
  title,
  subtitle,
  isNeon = true,
  valueFormatter,
}: Props) {
  // Multiple charts can exist on the page; make SVG ids unique to avoid filter collisions.
  const rid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const glowFilterId = `neonGlow-${rid}`;
  const ringMaskId = `ringMask-${rid}`;

  const prepared = useMemo(() => {
    const clean = (Array.isArray(data) ? data : [])
      .map((d) => ({
        label: String(d?.label ?? ''),
        value: clampNumber(Number(d?.value ?? 0)),
        color: typeof d?.color === 'string' ? d.color : undefined,
      }))
      .filter((d) => d.label && d.value > 0);
    const total = clean.reduce((s, d) => s + d.value, 0);

    // A neon-ish default palette.
    const palette = ['#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#c084fc'];

    const withColors = clean.map((d, idx) => ({ ...d, color: d.color || palette[idx % palette.length] }));
    return { rows: withColors, total };
  }, [data]);

  const cx = size / 2;
  const cy = size / 2;
  const r = Math.max(2, size / 2 - thickness);
  const fmt = valueFormatter || ((v: number) => v.toFixed(0));

  // Add a small angular gap so rounded caps don't visually "bleed" into neighbors.
  const gapDeg = prepared.rows.length > 1 ? Math.min(2.2, Math.max(1.2, thickness * 0.08)) : 0;
  let cursor = 0;
  const arcs = prepared.rows
    .map((d, idx) => {
      const pct = prepared.total > 0 ? d.value / prepared.total : 0;
      const startRaw = cursor * 360;
      const endRaw = (cursor + pct) * 360;
      cursor += pct;

      // If it's effectively the whole circle, we'll special-case below.
      const start = startRaw + gapDeg / 2;
      const end = endRaw - gapDeg / 2;
      return { ...d, startRaw, endRaw, start, end, idx, pct };
    })
    .filter((a) => a.pct > 0 && (a.endRaw - a.startRaw > 0.0001));

  return (
    <div
      className={`rounded-xl border p-3 ${isNeon ? 'bg-gray-950/40 border-white/10 text-gray-100' : 'bg-white border-gray-200 text-gray-900'}`}
    >
      {(title || subtitle) && (
        <div className="mb-2">
          {title && <div className="text-sm font-semibold">{title}</div>}
          {subtitle && <div className={`text-xs ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>{subtitle}</div>}
        </div>
      )}

      <div className="flex gap-3 items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg className="relative z-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <defs>
              <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Clip/mask the glow to the ring so it doesn't spill into the center and obscure labels. */}
              <mask id={ringMaskId}>
                <rect x="0" y="0" width={size} height={size} fill="black" />
                {/* Reveal outer circle */}
                <circle cx={cx} cy={cy} r={r + thickness / 2 + 6} fill="white" />
                {/* Punch out inner hole */}
                <circle cx={cx} cy={cy} r={Math.max(0, r - thickness / 2 - 6)} fill="black" />
              </mask>
            </defs>
            {/* Base ring */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={isNeon ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
              strokeWidth={thickness}
            />
            <g mask={`url(#${ringMaskId})`}>
              {arcs.map((a) => {
                // If there's only one segment, draw a full ring to avoid arc edge artifacts.
                const isFullCircle = prepared.rows.length === 1 || a.pct >= 0.999;
                const angle = Math.max(0, a.end - a.start);
                // Tiny segments + rounded caps can look like glitches; use butt caps for very small angles.
                const cap: 'round' | 'butt' = isFullCircle ? 'round' : angle < 10 ? 'butt' : 'round';
                const d = isFullCircle ? null : describeArc(cx, cy, r, a.start, a.end);
                return isFullCircle ? (
                  <circle
                    key={`${a.label}-${a.idx}`}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={thickness}
                    strokeLinecap={cap}
                    filter={isNeon ? `url(#${glowFilterId})` : undefined}
                    opacity={0.95}
                  />
                ) : (
                  <path
                    key={`${a.label}-${a.idx}`}
                    d={d as string}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={thickness}
                    strokeLinecap={cap}
                    filter={isNeon ? `url(#${glowFilterId})` : undefined}
                    opacity={0.95}
                  />
                );
              })}
            </g>
          </svg>
          {/* Center label */}
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center pointer-events-none">
            <div className={`text-xs ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>Total</div>
            <div className="text-lg font-bold">{fmt(prepared.total)}</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {prepared.rows.length === 0 ? (
            <div className={`text-xs ${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>No data.</div>
          ) : (
            <div className="space-y-1">
              {prepared.rows.map((d) => {
                const pct = prepared.total > 0 ? (d.value / prepared.total) * 100 : 0;
                return (
                  <div
                    key={d.label}
                    className="grid grid-cols-[minmax(140px,1fr)_auto] items-start gap-x-3 gap-y-0 text-xs"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="mt-1 inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                      <span className="whitespace-normal break-words leading-snug">{d.label}</span>
                    </div>
                    <div className="tabular-nums text-right whitespace-nowrap">
                      {fmt(d.value)} <span className={isNeon ? 'text-gray-400' : 'text-gray-500'}>({pct.toFixed(1)}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

