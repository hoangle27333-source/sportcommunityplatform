"use client";

import { TrendChart } from "@/components/charts/trend-chart";
import { RankBarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import type { BarDatum } from "@/components/charts/bar-chart";

export interface AnalyticsChartsProps {
  timeSeries: Array<{ x: string; reach: number; engagement: number }>;
  topPosts: Array<{ label: string; value: number }>;
  breakdown: { likes: number; comments: number; shares: number };
}

export function AnalyticsCharts({ timeSeries, topPosts, breakdown }: AnalyticsChartsProps) {
  const donutData = [
    { label: "Likes", value: breakdown.likes },
    { label: "Comments", value: breakdown.comments },
    { label: "Shares", value: breakdown.shares },
  ];

  return (
    <div className="space-y-6">
      {/* Time-series trend */}
      <TrendChart
        data={timeSeries}
        series={[
          { key: "reach", label: "Reach" },
          { key: "engagement", label: "Engagement" },
        ]}
        xKey="x"
        height={280}
        caption="Daily reach and engagement trend"
      />

      {/* Side-by-side breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Top Performing Posts</h3>
          <RankBarChart
            data={topPosts as BarDatum[]}
            caption="Top posts ranked by engagement"
            valueLabel="Engagement"
            colorByIndex={false}
          />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Engagement Distribution</h3>
          <DonutChart
            data={donutData}
            height={220}
            caption="Engagement breakdown (Likes / Comments / Shares)"
            centerLabel="Engagements"
          />
        </div>
      </div>
    </div>
  );
}
