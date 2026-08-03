"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_PROPS,
  ChartDataTable,
  ChartEmpty,
  ChartLegend,
  ChartTooltip,
  GRID_COLOR,
  compactNumber,
  fullNumber,
  seriesColor,
} from "./chart-kit";

/**
 * Time-series chart for reach/engagement trends (SPEC §6).
 *
 * Time is continuous, so the mark is a line — area fill only when a single
 * series is drawn (stacked translucent fills make two series hard to read).
 *
 * The SVG is hidden from assistive tech and paired with a visually-hidden table
 * carrying the same numbers.
 */

export interface TrendSeries {
  key: string;
  label: string;
}

export interface TrendChartProps {
  /** Rows keyed by `x` plus one numeric field per series key. */
  data: Array<Record<string, string | number>>;
  series: TrendSeries[];
  /** Field holding the category/date label. */
  xKey?: string;
  height?: number;
  /** Tooltip/axis value formatter. */
  format?: (v: number) => string;
  caption: string;
  className?: string;
}

export function TrendChart({
  data,
  series,
  xKey = "x",
  height = 240,
  format = fullNumber,
  caption,
  className,
}: TrendChartProps) {
  if (!data.length || !series.length) {
    return <ChartEmpty height={height} hint="Dữ liệu xuất hiện sau lần đồng bộ chỉ số đầu tiên." />;
  }

  const single = series.length === 1;
  const legend = series.map((s, i) => ({
    label: s.label,
    color: seriesColor(i),
  }));

  return (
    <div className={className}>
      <ChartLegend items={legend} className="mb-2" />

      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {single ? (
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={seriesColor(0)} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={seriesColor(0)} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={xKey} {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} width={48} tickFormatter={compactNumber} />
              <Tooltip
                content={<ChartTooltip format={(v) => format(v)} />}
                cursor={{ stroke: GRID_COLOR }}
              />
              <Area
                type="monotone"
                dataKey={series[0].key}
                name={series[0].label}
                stroke={seriesColor(0)}
                strokeWidth={2}
                fill="url(#trend-fill)"
                dot={false}
                activeDot={{ r: 3.5, strokeWidth: 0 }}
              />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={xKey} {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} width={48} tickFormatter={compactNumber} />
              <Tooltip
                content={<ChartTooltip format={(v) => format(v)} />}
                cursor={{ stroke: GRID_COLOR }}
              />
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={seriesColor(i)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption={caption}
        columns={["Mốc", ...series.map((s) => s.label)]}
        rows={data.map((row) => [
          String(row[xKey]),
          ...series.map((s) => format(Number(row[s.key] ?? 0))),
        ])}
      />
    </div>
  );
}
