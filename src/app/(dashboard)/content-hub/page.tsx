import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section } from "@/components/ui/page-header";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { Status, PlatformBadge } from "@/components/ui/badge";
import { DashboardCharts } from "./dashboard-charts";
import Link from "next/link";
import {
  AlertTriangle,
  FileText,
  Eye,
  Heart,
  Zap,
  PenSquare,
  Wand2,
  MessageSquare,
  BarChart3,
} from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Executive Dashboard — Overview.
 *
 * Server component that fetches all dashboard data directly from Supabase
 * (no client fetch waterfall). Charts are rendered by the DashboardCharts
 * client component so they can use Recharts browser APIs.
 */
export default async function DashboardPage() {
  const db = await createClient();

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString();

  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayOfMonthIso = firstDayOfMonth.toISOString();

  // ─── KPI: published posts ───────────────────────────────────────────────────
  const { count: publishedPostsCount } = await db
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("status", "published");

  // ─── Metrics 30d ─────────────────────────────────────────────────────────────
  const { data: metricsData } = await db
    .from("metrics")
    .select("reach, engagement, likes, comments, shares, captured_at")
    .gte("captured_at", thirtyDaysAgoIso);

  let reach30d = 0;
  let engagement30d = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  const trendMap: Record<string, { reach: number; engagement: number }> = {};

  for (const m of metricsData ?? []) {
    reach30d += Number(m.reach ?? 0);
    engagement30d += Number(m.engagement ?? 0);
    totalLikes += Number((m as { likes?: number }).likes ?? 0);
    totalComments += Number((m as { comments?: number }).comments ?? 0);
    totalShares += Number((m as { shares?: number }).shares ?? 0);

    if (m.captured_at) {
      const d = new Date(m.captured_at);
      const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!trendMap[key]) trendMap[key] = { reach: 0, engagement: 0 };
      trendMap[key].reach += Number(m.reach ?? 0);
      trendMap[key].engagement += Number(m.engagement ?? 0);
    }
  }

  // Fill every day in the last 30 days (zero-pad missing dates)
  const trend: Array<{ x: string; reach: number; engagement: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    trend.push({ x: key, reach: trendMap[key]?.reach ?? 0, engagement: trendMap[key]?.engagement ?? 0 });
  }

  // ─── AI cost this month ───────────────────────────────────────────────────────
  let aiCostMonthVnd = 0;
  const { data: aiCostData, error: aiCostError } = await db
    .from("ai_generations")
    .select("cost_vnd")
    .gte("created_at", firstDayOfMonthIso);
  if (aiCostData && !aiCostError) {
    aiCostMonthVnd = aiCostData.reduce(
      (acc, row) => acc + Number((row as { cost_vnd?: number }).cost_vnd ?? 0),
      0,
    );
  }

  // ─── Top 5 posts by engagement ────────────────────────────────────────────────
  const { data: topPostsRaw } = await db
    .from("metrics")
    .select("engagement, post_targets!inner(posts!inner(id, caption))")
    .order("engagement", { ascending: false })
    .limit(5);

  type TopPostRaw = {
    engagement: number | null;
    post_targets: { posts: { id: string; caption: string | null } };
  };

  const topPostsForChart = (topPostsRaw ?? []).map((m) => {
    const row = m as unknown as TopPostRaw;
    return {
      caption: row.post_targets?.posts?.caption ?? "",
      engagement: row.engagement ?? 0,
    };
  });

  // ─── Alerts ───────────────────────────────────────────────────────────────────
  const { count: needsReauthCount } = await db
    .from("social_accounts")
    .select("*", { count: "exact", head: true })
    .eq("status", "needs_reauth");

  const { count: failedPostsCount } = await db
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("updated_at", sevenDaysAgoIso);

  // ─── Recent posts ─────────────────────────────────────────────────────────────
  const { data: recentPostsRaw } = await db
    .from("posts")
    .select("id, caption, status, primary_platform")
    .order("created_at", { ascending: false })
    .limit(10);

  const recentPosts = (recentPostsRaw ?? []).map((p) => ({
    id: p.id as string,
    caption: (p.caption as string | null)
      ? ((p.caption as string).length > 70
          ? (p.caption as string).slice(0, 70) + "…"
          : (p.caption as string))
      : "—",
    status: (p.status as string) ?? "",
    platform: (p.primary_platform as string) ?? "",
  }));

  const hasAlerts = (needsReauthCount ?? 0) > 0 || (failedPostsCount ?? 0) > 0;

  return (
    <div className="space-y-8 p-4 sm:p-6">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title="Overview"
        description="Executive dashboard tracking content automation performance and engagement metrics."
      />

      {/* ── Quick actions ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { href: "/compose", icon: PenSquare, label: "Create Post" },
          { href: "/remix", icon: Wand2, label: "Remix Video" },
          { href: "/engagement", icon: MessageSquare, label: "Review Engagement" },
          { href: "/analytics", icon: BarChart3, label: "View Analytics" },
        ].map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </div>

      {/* ── Alert banner ──────────────────────────────────────────────────────── */}
      {hasAlerts && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-warning bg-warning-muted px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="text-warning">
            {(needsReauthCount ?? 0) > 0 &&
              `${needsReauthCount} channel(s) require reconnection. `}
            {(failedPostsCount ?? 0) > 0 &&
              `${failedPostsCount} post(s) failed in the last 7 days.`}
          </span>
        </div>
      )}

      {/* ── KPI cards ─────────────────────────────────────────────────────────── */}
      <StatGrid>
        <StatCard
          label="Published Posts"
          value={(publishedPostsCount ?? 0).toLocaleString("en-US")}
          icon={FileText}
          tone="primary"
        />
        <StatCard
          label="30-Day Reach"
          value={reach30d.toLocaleString("en-US")}
          icon={Eye}
          tone="info"
          hint="last 30 days"
        />
        <StatCard
          label="30-Day Engagement"
          value={engagement30d.toLocaleString("en-US")}
          icon={Heart}
          tone="success"
          hint="last 30 days"
        />
        <StatCard
          label="AI Cost This Month"
          value={`${aiCostMonthVnd.toLocaleString("en-US")} VND`}
          icon={Zap}
          tone="warning"
          positiveIsGood={false}
          hint="this month"
        />
      </StatGrid>

      {/* ── Charts ────────────────────────────────────────────────────────────── */}
      <Section title="30-Day Trends">
        <DashboardCharts
          trend={trend}
          topPosts={topPostsForChart}
          engagementBreakdown={{ likes: totalLikes, comments: totalComments, shares: totalShares }}
        />
      </Section>

      {/* ── Recent posts table ────────────────────────────────────────────────── */}
      <Section title="Recent Posts">
        <div className="overflow-hidden rounded-lg border border-border">
          {recentPosts.length === 0 ? (
            <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
              No posts found.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Title
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Platform
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentPosts.map((post) => (
                  <tr key={post.id} className="transition-colors hover:bg-muted/30">
                    <td className="max-w-xs truncate px-4 py-3 text-sm">{post.caption}</td>
                    <td className="px-4 py-3">
                      <PlatformBadge platform={post.platform} />
                    </td>
                    <td className="px-4 py-3">
                      <Status value={post.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>
    </div>
  );
}
