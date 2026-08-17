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
        caption="Xu hướng reach và engagement theo ngày"
      />

      {/* Side-by-side breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Top bài đăng</h3>
          <RankBarChart
            data={topPosts as BarDatum[]}
            caption="Top bài đăng theo engagement"
            valueLabel="Engagement"
            colorByIndex={false}
          />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Phân bổ tương tác</h3>
          <DonutChart
            data={donutData}
            height={220}
            caption="Phân bổ tương tác (Likes / Comments / Shares)"
            centerLabel="Tương tác"
          />
        </div>
      </div>
    </div>
  );
}
