"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_PROPS,
  ChartDataTable,
  ChartEmpty,
  ChartTooltip,
  GRID_COLOR,
  compactNumber,
  fullNumber,
  seriesColor,
} from "./chart-kit";

/**
 * Ranking chart for categorical comparisons (top posts, per-channel reach).
 *
 * Horizontal bars: the labels are long Vietnamese strings, and horizontal bars
 * give them a full row of width instead of a cramped rotated axis tick.
 *
 * One hue for a plain ranking — varying color per bar would imply a category
 * difference that isn't there. Pass `colorByIndex` only when each bar really is
 * a distinct series (e.g. per-platform).
 */

export interface BarDatum {
  label: string;
  value: number;
}

export function RankBarChart({
  data,
  height,
  format = fullNumber,
  caption,
  valueLabel = "Giá trị",
  colorByIndex = false,
  className,
}: {
  data: BarDatum[];
  /** Defaults to ~34px per row so bars keep a constant thickness. */
  height?: number;
  format?: (v: number) => string;
  caption: string;
  valueLabel?: string;
  colorByIndex?: boolean;
  className?: string;
}) {
  const h = height ?? Math.max(120, data.length * 34 + 16);

  if (!data.length) {
    return <ChartEmpty height={h} />;
  }

  return (
    <div className={className}>
      <div style={{ height: h }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
            barCategoryGap={8}
          >
            <CartesianGrid
              stroke={GRID_COLOR}
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis type="number" {...AXIS_PROPS} tickFormatter={compactNumber} />
            <YAxis
              type="category"
              dataKey="label"
              {...AXIS_PROPS}
              width={132}
              tickFormatter={(v: string) =>
                v.length > 20 ? `${v.slice(0, 19)}…` : v
              }
            />
            {/*
              Recharts clones `content` with its own tooltip props, so the
              element below receives active/label/payload at render time; the
              formatter is bound here.
            */}
            <Tooltip
              content={<ChartTooltip format={(v) => format(v)} />}
              cursor={{ fill: "hsl(var(--muted) / 0.6)" }}
            />
            <Bar dataKey="value" name={valueLabel} radius={[0, 3, 3, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={seriesColor(colorByIndex ? i : 0)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ChartDataTable
        caption={caption}
        columns={["Hạng mục", valueLabel]}
        rows={data.map((d) => [d.label, format(d.value)])}
      />
    </div>
  );
}
