import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard
 * Returns aggregated data for the executive dashboard:
 * - KPIs (published posts, reach/engagement 30d, AI cost)
 * - 30-day trend series
 * - Top 5 posts by engagement
 * - Alerts (needs_reauth channels, failed posts)
 * - Recent 10 posts
 */
export async function GET() {
  try {
    const { db } = await requireUser();

    const now = new Date();

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoIso = sevenDaysAgo.toISOString();

    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfMonthIso = firstDayOfMonth.toISOString();

    // 1. Published posts count
    const { count: publishedPostsCount } = await db
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("status", "published");

    // 2. Metrics 30d — reach, engagement, trend
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

    // Build last-30-days series (all days, zero-fill gaps)
    const trend: Array<{ x: string; reach: number; engagement: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      trend.push({ x: key, reach: trendMap[key]?.reach ?? 0, engagement: trendMap[key]?.engagement ?? 0 });
    }

    // 3. AI cost this month
    let aiCostMonthVnd = 0;
    const { data: aiCostData, error: aiCostError } = await db
      .from("ai_generations")
      .select("cost_vnd")
      .gte("created_at", firstDayOfMonthIso);
    if (aiCostData && !aiCostError) {
      aiCostMonthVnd = aiCostData.reduce((acc, row) => acc + Number((row as { cost_vnd?: number }).cost_vnd ?? 0), 0);
    }

    // 4. Top 5 posts by engagement (with caption via join)
    const { data: topPostsRaw } = await db
      .from("metrics")
      .select("reach, engagement, likes, comments, shares, post_targets!inner(posts!inner(id, caption))")
      .order("engagement", { ascending: false })
      .limit(5);

    type TopPostRaw = {
      reach: number | null;
      engagement: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      post_targets: { posts: { id: string; caption: string | null } };
    };

    const topPosts = (topPostsRaw ?? []).map((m) => {
      const row = m as unknown as TopPostRaw;
      return {
        id: row.post_targets?.posts?.id ?? "",
        caption: row.post_targets?.posts?.caption ?? "",
        reach: row.reach ?? 0,
        engagement: row.engagement ?? 0,
        likes: row.likes ?? 0,
        comments: row.comments ?? 0,
        shares: row.shares ?? 0,
      };
    });

    // 5. Alerts
    const { count: needsReauthCount } = await db
      .from("social_accounts")
      .select("*", { count: "exact", head: true })
      .eq("status", "needs_reauth");

    const { count: failedPostsCount } = await db
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("updated_at", sevenDaysAgoIso);

    // 6. Recent posts
    const { data: recentPostsRaw } = await db
      .from("posts")
      .select("id, caption, status, primary_platform")
      .order("created_at", { ascending: false })
      .limit(10);

    const recentPosts = (recentPostsRaw ?? []).map((p) => ({
      id: p.id as string,
      caption: (p.caption as string | null)
        ? ((p.caption as string).length > 60 ? (p.caption as string).slice(0, 60) + "…" : (p.caption as string))
        : "",
      status: (p.status as string) ?? "",
      platform: (p.primary_platform as string) ?? "",
    }));

    return NextResponse.json({
      kpis: {
        publishedPosts: publishedPostsCount ?? 0,
        reach30d,
        engagement30d,
        aiCostMonthVnd,
      },
      trend,
      topPosts,
      engagementBreakdown: { likes: totalLikes, comments: totalComments, shares: totalShares },
      alerts: {
        needsReauthCount: needsReauthCount ?? 0,
        failedPostsCount: failedPostsCount ?? 0,
      },
      recentPosts,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message ?? "internal error" }, { status: 500 });
  }
}
