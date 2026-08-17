"use client";

import { TrendChart } from "@/components/charts/trend-chart";
import { RankBarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import type { BarDatum } from "@/components/charts/bar-chart";

interface DashboardChartsProps {
  trend: Array<{ x: string; reach: number; engagement: number }>;
  topPosts: Array<{ caption: string; engagement: number }>;
  engagementBreakdown: { likes: number; comments: number; shares: number };
}

export function DashboardCharts({ trend, topPosts, engagementBreakdown }: DashboardChartsProps) {
  const topPostsData: BarDatum[] = topPosts.map((p) => ({
    label: p.caption.length > 28 ? p.caption.slice(0, 27) + "…" : p.caption,
    value: p.engagement,
  }));

  const donutData = [
    { label: "Likes", value: engagementBreakdown.likes },
    { label: "Comments", value: engagementBreakdown.comments },
    { label: "Shares", value: engagementBreakdown.shares },
  ];

  return (
    <div className="space-y-6">
      {/* Full-width trend */}
      <TrendChart
        data={trend}
        series={[
          { key: "reach", label: "Reach" },
          { key: "engagement", label: "Engagement" },
        ]}
        xKey="x"
        height={280}
        caption="Reach và Engagement theo ngày (30 ngày qua)"
      />

      {/* 2-col breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Top 5 bài đăng</h3>
          <RankBarChart
            data={topPostsData}
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
