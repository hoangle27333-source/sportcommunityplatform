"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Shared chart chrome: palette, tooltip, legend, axis defaults.
 *
 * All colors come from the CSS variables in globals.css. Recharts needs concrete
 * strings (it writes them into SVG attributes) so we resolve `hsl(var(--x))`
 * strings rather than Tailwind classes — the browser still evaluates the
 * variable, so a light/dark switch re-themes charts with no JS.
 *
 * Series colors are ordered for maximum separation at the start: most charts
 * here draw 1–3 series, so the first three must be unmistakable from each other
 * both in hue and in luminance (protanopia-safe: blue → amber → teal).
 */

export const SERIES = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
] as const;

export const AXIS_COLOR = "hsl(var(--muted-foreground))";
export const GRID_COLOR = "hsl(var(--chart-grid))";

/** Defaults shared by every cartesian axis so ticks read the same everywhere. */
export const AXIS_PROPS = {
  stroke: AXIS_COLOR,
  tick: { fill: AXIS_COLOR, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export function seriesColor(i: number): string {
  return SERIES[i % SERIES.length];
}

/* ------------------------------------------------------------------ formats */

const NF = new Intl.NumberFormat("vi-VN");
const NF1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

/** Compact axis labels: 12.400 → 12,4K. Keeps dense axes readable. */
export function compactNumber(v: number): string {
  const n = Math.abs(v);
  if (n >= 1_000_000_000) return `${NF1.format(v / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${NF1.format(v / 1_000_000)}M`;
  if (n >= 1_000) return `${NF1.format(v / 1_000)}K`;
  return NF.format(v);
}

export function fullNumber(v: number): string {
  return NF.format(v);
}

export function percent(v: number, digits = 1): string {
  return `${NF1.format(Number(v.toFixed(digits)))}%`;
}

export function vnd(v: number): string {
  return `${NF.format(Math.round(v))}₫`;
}

/* ----------------------------------------------------------------- tooltip */

interface TooltipEntry {
  name?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  /** Per-series value formatter; defaults to full grouped numbers. */
  format?: (value: number, name: string) => string;
  /** Extra line under the series list, e.g. a computed rate. */
  footer?: (payload: Record<string, unknown>) => React.ReactNode;
}

export function ChartTooltip({
  active,
  label,
  payload,
  format,
  footer,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="pointer-events-none rounded-lg border border-border bg-card px-2.5 py-2 shadow-lg">
      {label !== undefined && label !== "" && (
        <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((entry, i) => {
          const name = String(entry.name ?? entry.dataKey ?? "");
          const raw = Array.isArray(entry.value) ? entry.value[0] : entry.value;
          const num = typeof raw === "number" ? raw : Number(raw);
          const text = Number.isFinite(num)
            ? (format ?? ((v) => fullNumber(v)))(num, name)
            : String(raw ?? "—");
          return (
            <li key={`${name}-${i}`} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ background: entry.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {name}
              </span>
              <span className="tabular font-medium text-foreground">{text}</span>
            </li>
          );
        })}
      </ul>
      {footer && payload[0]?.payload && (
        <div className="mt-1.5 border-t border-border pt-1.5 text-2xs text-muted-foreground">
          {footer(payload[0].payload)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ legend */

export interface LegendItem {
  label: string;
  color: string;
  /** Optional value shown right of the label (donut/breakdown charts). */
  value?: string;
}

/**
 * Custom legend. Recharts' built-in legend eats vertical space and can't be
 * styled with tokens, so charts render this above the plot instead.
 */
export function ChartLegend({
  items,
  className,
}: {
  items: LegendItem[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-xs">
          <span
            className="size-2 shrink-0 rounded-sm"
            style={{ background: it.color }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">{it.label}</span>
          {it.value && (
            <span className="tabular font-medium text-foreground">{it.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- empty state */

/**
 * Placeholder that occupies the chart's final height, so a chart arriving after
 * data loads doesn't shift the page (CLS budget).
 */
export function ChartEmpty({
  height,
  message = "Chưa có dữ liệu",
  hint,
}: {
  height: number;
  message?: string;
  hint?: string;
}) {
  return (
    <div
      style={{ height }}
      className="flex flex-col items-center justify-center gap-1 rounded border border-dashed border-border text-center"
    >
      <p className="text-xs font-medium text-muted-foreground">{message}</p>
      {hint && <p className="max-w-xs text-2xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Accessible fallback for the chart's data. Charts are `aria-hidden` SVG; this
 * table carries the same numbers for screen readers (visually hidden).
 */
export function ChartDataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
