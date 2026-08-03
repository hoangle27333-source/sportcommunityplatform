import { NextResponse, type NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics (SPEC §6 — read model for the dashboard)
 *   ?campaignId=...   scope to one campaign (optional)
 *
 * Returns the latest metric snapshot per published post target, joined to the
 * post/account, so the dashboard can render per-post performance without doing
 * N round-trips. Any authenticated user may read (RLS scopes visible rows).
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

export async function GET(req: NextRequest) {
  try {
    const { db } = await requireUser();
    const campaignId = req.nextUrl.searchParams.get("campaignId");

    // 1. Resolve the target set (optionally scoped to a campaign's posts).
    let targetIds: string[] | null = null;
    if (campaignId) {
      const { data: posts } = await db
        .from("posts")
        .select("id")
        .eq("campaign_id", campaignId);
      const postIds = (posts ?? []).map((p) => p.id as string);
      if (postIds.length === 0) return NextResponse.json({ metrics: [] });

      const { data: targets } = await db
        .from("post_targets")
        .select("id")
        .in("post_id", postIds);
      targetIds = (targets ?? []).map((t) => t.id as string);
      if (targetIds.length === 0) return NextResponse.json({ metrics: [] });
    }

    // 2. Pull metric snapshots (most recent first), then keep latest per target.
    let query = db
      .from("metrics")
      .select(
        "post_target_id, reach, impressions, engagement, likes, comments, shares, captured_at",
      )
      .order("captured_at", { ascending: false })
      .limit(2000);
    if (targetIds) query = query.in("post_target_id", targetIds);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const latestByTarget = new Map<string, MetricRow>();
    for (const row of (data ?? []) as MetricRow[]) {
      if (!latestByTarget.has(row.post_target_id)) {
        latestByTarget.set(row.post_target_id, row);
      }
    }

    const metrics = [...latestByTarget.values()];
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

    return NextResponse.json({ metrics, totals });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: (e as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}
