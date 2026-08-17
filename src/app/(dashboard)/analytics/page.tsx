import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { AnalyticsFilters } from "./analytics-filters";
import { AnalyticsCharts } from "./analytics-charts";
import { AnalyticsSuggestions } from "./analytics-suggestions";
import { Eye, Heart, BarChart3, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Analytics page (SPEC §6) — Performance dashboard with charts, filters,
 * AI Learning Suggestions, and raw metrics table.
 *
 * Filters: platform (facebook | instagram | all), dateRange (7d|14d|30d|90d)
 * Charts: TrendChart (reach+engagement over time), RankBarChart (top posts),
 *         DonutChart (likes/comments/shares breakdown)
 */

interface MetricRow {
  post_target_id: string;
  reach: number | null;
  impressions: number | null;
  engagement: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  captured_at: string;
}

interface SuggestionRow {
  id: string;
  type: string;
  content: string;
  rationale: string | null;
}

function num(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("vi-VN");
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; dateRange?: string }>;
}) {
  const params = await searchParams;
  const platform = params.platform ?? "";
  const dateRange = params.dateRange ?? "30d";

  const days =
    dateRange === "7d" ? 7 : dateRange === "14d" ? 14 : dateRange === "90d" ? 90 : 30;

  const db = await createClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // ── Optional platform filter: resolve which post_target_ids to include ───────
  let allowedTargetIds: string[] | null = null;
  if (platform) {
    const { data: accounts } = await db
      .from("social_accounts")
      .select("id")
      .eq("platform", platform);
    const accountIds = (accounts ?? []).map((a) => a.id as string);

    if (accountIds.length > 0) {
      const { data: targets } = await db
        .from("post_targets")
        .select("id")
        .in("social_account_id", accountIds);
      allowedTargetIds = (targets ?? []).map((t) => t.id as string);
    } else {
      allowedTargetIds = [];
    }
  }

  // ── Fetch metrics ─────────────────────────────────────────────────────────────
  let metricsQuery = db
    .from("metrics")
    .select(
      "post_target_id, reach, impressions, engagement, likes, comments, shares, captured_at",
    )
    .gte("captured_at", since)
    .order("captured_at", { ascending: false })
    .limit(2000);

  if (allowedTargetIds !== null) {
    if (allowedTargetIds.length === 0) {
      metricsQuery = metricsQuery.in("post_target_id", ["__none__"]);
    } else {
      metricsQuery = metricsQuery.in("post_target_id", allowedTargetIds);
    }
  }

  const { data: metricsRaw } = await metricsQuery;

  // Deduplicate to latest snapshot per target
  const latestByTarget = new Map<string, MetricRow>();
  for (const m of (metricsRaw ?? []) as MetricRow[]) {
    if (!latestByTarget.has(m.post_target_id)) latestByTarget.set(m.post_target_id, m);
  }
  const metrics = [...latestByTarget.values()];

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totals = metrics.reduce(
    (acc, m) => ({
      reach: acc.reach + (m.reach ?? 0),
      engagement: acc.engagement + (m.engagement ?? 0),
      likes: acc.likes + (m.likes ?? 0),
      comments: acc.comments + (m.comments ?? 0),
      shares: acc.shares + (m.shares ?? 0),
    }),
    { reach: 0, engagement: 0, likes: 0, comments: 0, shares: 0 },
  );

  const engagementRate =
    totals.reach > 0 ? ((totals.engagement / totals.reach) * 100).toFixed(1) + "%" : "—";

  // ── Time-series for TrendChart ────────────────────────────────────────────────
  const trendMap: Record<string, { reach: number; engagement: number }> = {};
  for (const m of (metricsRaw ?? []) as MetricRow[]) {
    const d = new Date(m.captured_at);
    const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!trendMap[key]) trendMap[key] = { reach: 0, engagement: 0 };
    trendMap[key].reach += m.reach ?? 0;
    trendMap[key].engagement += m.engagement ?? 0;
  }

  // Build full date range with zero-fill
  const timeSeries: Array<{ x: string; reach: number; engagement: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    timeSeries.push({ x: key, reach: trendMap[key]?.reach ?? 0, engagement: trendMap[key]?.engagement ?? 0 });
  }

  // ── Top 5 posts ───────────────────────────────────────────────────────────────
  const topPosts = [...metrics]
    .sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))
    .slice(0, 5)
    .map((m) => ({
      label: m.post_target_id.slice(0, 12) + "…", // fallback — real caption needs a join
      value: m.engagement ?? 0,
    }));

  // ── AI Suggestions ────────────────────────────────────────────────────────────
  const { data: suggestions } = await db
    .from("ai_suggestions")
    .select("id, type, content, rationale")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-8 p-4 sm:p-6">
      {/* Header */}
      <PageHeader
        title="Phân tích"
        description="Hiệu suất bài đăng và học hỏi từ dữ liệu thực tế."
      />

      {/* Filter bar */}
      <Suspense fallback={null}>
        <AnalyticsFilters />
      </Suspense>

      {/* KPI row */}
      <StatGrid>
        <StatCard
          label="Bài có dữ liệu"
          value={metrics.length.toLocaleString("vi-VN")}
          icon={BarChart3}
          tone="primary"
        />
        <StatCard
          label="Tổng reach"
          value={totals.reach.toLocaleString("vi-VN")}
          icon={Eye}
          tone="info"
          hint={`${days} ngày qua`}
        />
        <StatCard
          label="Tổng engagement"
          value={totals.engagement.toLocaleString("vi-VN")}
          icon={Heart}
          tone="success"
          hint={`${days} ngày qua`}
        />
        <StatCard
          label="Avg. Engagement Rate"
          value={engagementRate}
          icon={TrendingUp}
          tone="primary"
          hint="engagement / reach"
        />
      </StatGrid>

      {/* Charts */}
      <Section title="Biểu đồ hiệu suất">
        <AnalyticsCharts
          timeSeries={timeSeries}
          topPosts={topPosts}
          breakdown={{
            likes: totals.likes,
            comments: totals.comments,
            shares: totals.shares,
          }}
        />
      </Section>

      {/* AI Suggestions */}
      <Section title="Đề xuất AI Learning">
        <AnalyticsSuggestions suggestions={(suggestions ?? []) as SuggestionRow[]} />
      </Section>

      {/* Metrics table */}
      <Section title="Bảng chỉ số">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm tabular">
            <thead className="border-b border-border bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Reach</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Impressions
                </th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Engagement
                </th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Likes</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Comments
                </th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Shares</th>
                <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Cập nhật
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {metrics.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    Chưa có dữ liệu. Analytics sync chạy mỗi 6 giờ.
                  </td>
                </tr>
              )}
              {metrics.map((m) => (
                <tr
                  key={m.post_target_id}
                  className="transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3">{num(m.reach)}</td>
                  <td className="px-4 py-3">{num(m.impressions)}</td>
                  <td className="px-4 py-3 font-medium">{num(m.engagement)}</td>
                  <td className="px-4 py-3">{num(m.likes)}</td>
                  <td className="px-4 py-3">{num(m.comments)}</td>
                  <td className="px-4 py-3">{num(m.shares)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(m.captured_at).toLocaleString("vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
