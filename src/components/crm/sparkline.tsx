"use client";

import * as React from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  className?: string;
  showDots?: boolean;
  strokeWidth?: number;
}

/**
 * Lightweight SVG sparkline for inline trend visualization.
 * No external chart library needed — pure SVG for fast rendering.
 */
export function Sparkline({
  data,
  width = 100,
  height = 28,
  color = "oklch(0.55 0.12 175)",
  fillOpacity = 0.1,
  className,
  showDots = false,
  strokeWidth = 1.5,
}: SparklineProps) {
  const gradientId = React.useId();

  if (data.length === 0) {
    return <div style={{ width, height }} className={className} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return { x, y, v };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="sparkline-draw"
      />
      {showDots && points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.5} fill={color} />
      ))}
    </svg>
  );
}

/**
 * Health metric card with sparkline trend
 */
export function HealthMetricSpark({
  label,
  value,
  unit,
  data,
  color,
  trend,
  trendLabel,
}: {
  label: string;
  value: string | number;
  unit?: string;
  data: number[];
  color?: string;
  trend?: "up" | "down" | "stable";
  trendLabel?: string;
}) {
  const trendColor = trend === "down" ? "text-emerald-600 dark:text-emerald-400"
    : trend === "up" ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";
  const trendIcon = trend === "down" ? "↓" : trend === "up" ? "↑" : "→";

  return (
    <div className="rounded-xl border bg-card p-3 card-hover-lift">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">{label}</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl font-bold tabular-nums">{value}</span>
            {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
          </div>
        </div>
        {trend && data.length >= 2 && (
          <span className={`text-[10px] font-semibold ${trendColor} shrink-0`}>
            {trendIcon} {trendLabel}
          </span>
        )}
      </div>
      {data.length >= 2 && (
        <div className="mt-2">
          <Sparkline data={data} width={120} height={24} color={color} showDots />
        </div>
      )}
      {data.length < 2 && (
        <p className="text-[10px] text-muted-foreground/60 mt-2 italic">Not enough data for trend</p>
      )}
    </div>
  );
}
