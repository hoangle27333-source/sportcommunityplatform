"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  ChartDataTable,
  ChartEmpty,
  ChartLegend,
  ChartTooltip,
  fullNumber,
  percent,
  seriesColor,
} from "./chart-kit";

/**
 * Part-to-whole breakdown (cost by kind, posts by status).
 *
 * Donut rather than pie so the total can sit in the hole — the number people
 * actually want to read. Capped at 5 slices plus "Khác": beyond that, angles get
 * too close to compare and the ranking bar chart is the better form.
 */

export interface DonutDatum {
  label: string;
  value: number;
  /** Override the palette slot, e.g. status colors that must stay semantic. */
  color?: string;
}

export function DonutChart({
  data,
  height = 200,
  format = fullNumber,
  caption,
  centerLabel,
  className,
}: {
  data: DonutDatum[];
  height?: number;
  format?: (v: number) => string;
  caption: string;
  /** Small caption under the total in the hole. */
  centerLabel?: string;
  className?: string;
}) {
  const nonZero = data.filter((d) => d.value > 0);
  const total = nonZero.reduce((s, d) => s + d.value, 0);

  if (!nonZero.length || total <= 0) {
    return <ChartEmpty height={height} />;
  }

  // Keep the five biggest slices; fold the tail into "Khác".
  const sorted = [...nonZero].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, 5);
  const tail = sorted.slice(5);
  const slices: DonutDatum[] =
    tail.length > 0
      ? [...head, { label: "Khác", value: tail.reduce((s, d) => s + d.value, 0) }]
      : head;

  const colored = slices.map((s, i) => ({ ...s, fill: s.color ?? seriesColor(i) }));

  return (
    <div className={className}>
      <div className="relative" style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={
                <ChartTooltip
                  format={(v) => `${format(v)} · ${percent((v / total) * 100)}`}
                />
              }
            />
            <Pie
              data={colored}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={1.5}
              stroke="hsl(var(--card))"
              strokeWidth={2}
              // Motion 3/10: a short fade-in, no rotating reveal.
              animationDuration={260}
            >
              {colored.map((s, i) => (
                <Cell key={i} fill={s.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular font-mono text-lg font-semibold text-foreground">
            {format(total)}
          </span>
          {centerLabel && (
            <span className="text-2xs text-muted-foreground">{centerLabel}</span>
          )}
        </div>
      </div>

      <ChartLegend
        className="mt-2"
        items={colored.map((s) => ({
          label: s.label,
          color: s.fill,
          value: percent((s.value / total) * 100),
        }))}
      />

      <ChartDataTable
        caption={caption}
        columns={["Hạng mục", "Giá trị", "Tỷ lệ"]}
        rows={colored.map((s) => [
          s.label,
          format(s.value),
          percent((s.value / total) * 100),
        ])}
      />
    </div>
  );
}
