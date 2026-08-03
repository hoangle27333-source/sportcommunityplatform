import { graph } from "./client";

/**
 * Meta Insights fetchers (SPEC §6 — Analytics & AI Learning).
 *
 * Reads performance metrics for OUR OWN published posts only, via the official
 * Graph API. Never scrapes third parties (compliance guardrail, SPEC §0).
 *
 * Meta retired the old impression-based metric family on 2026-06-15
 * (see constants.ts DEPRECATED_META_METRICS). We therefore avoid post-level
 * insight endpoints that only return deprecated metrics and instead read the
 * durable engagement fields (likes/comments/shares) plus the new media-view
 * metrics where available. Anything unavailable is left null rather than
 * guessed — metrics is append-only time-series (SPEC §6).
 */

export interface NormalizedMetric {
  reach: number | null;
  impressions: number | null;
  engagement: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** Raw API payload for audit / future backfill. */
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Facebook Page post
// ---------------------------------------------------------------------------

interface FbPostFields {
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
  insights?: {
    data?: Array<{ name: string; values?: Array<{ value?: number }> }>;
  };
}

/**
 * Fetch metrics for one Facebook Page post.
 *
 * Engagement counters (likes/comments/shares) come from the edge summaries,
 * which remain valid post-cutover. Reach is read from the post_total_media_view
 * family via the insights edge; if the post type does not expose it, reach is
 * left null.
 */
export async function fetchFacebookPostMetrics(
  externalPostId: string,
  pageToken: string,
): Promise<NormalizedMetric> {
  const { data } = await graph.get<FbPostFields>(externalPostId, {
    fields:
      "likes.summary(true).limit(0)," +
      "comments.summary(true).limit(0)," +
      "shares," +
      "insights.metric(post_total_media_view,post_total_media_view_unique)",
    access_token: pageToken,
  });

  const likes = data.likes?.summary?.total_count ?? null;
  const comments = data.comments?.summary?.total_count ?? null;
  const shares = data.shares?.count ?? null;

  const insightMap = new Map<string, number>();
  for (const row of data.insights?.data ?? []) {
    const v = row.values?.[0]?.value;
    if (typeof v === "number") insightMap.set(row.name, v);
  }
  const reach = insightMap.get("post_total_media_view_unique") ?? null;
  const impressions = insightMap.get("post_total_media_view") ?? null;

  const engagement = sumOrNull([likes, comments, shares]);

  return { reach, impressions, engagement, likes, comments, shares, raw: data };
}

// ---------------------------------------------------------------------------
// Instagram Business media
// ---------------------------------------------------------------------------

interface IgMediaFields {
  like_count?: number;
  comments_count?: number;
  insights?: {
    data?: Array<{ name: string; values?: Array<{ value?: number }> }>;
  };
}

/**
 * Fetch metrics for one Instagram Business media object.
 *
 * IG exposes `reach` and `total_interactions` on the media insights edge
 * (post-cutover family). like_count / comments_count come from the media node.
 */
export async function fetchInstagramMediaMetrics(
  externalMediaId: string,
  igToken: string,
): Promise<NormalizedMetric> {
  const { data } = await graph.get<IgMediaFields>(externalMediaId, {
    fields:
      "like_count,comments_count," +
      "insights.metric(reach,total_interactions,saved,shares)",
    access_token: igToken,
  });

  const likes = data.like_count ?? null;
  const comments = data.comments_count ?? null;

  const insightMap = new Map<string, number>();
  for (const row of data.insights?.data ?? []) {
    const v = row.values?.[0]?.value;
    if (typeof v === "number") insightMap.set(row.name, v);
  }

  const reach = insightMap.get("reach") ?? null;
  const shares = insightMap.get("shares") ?? null;
  // IG's total_interactions is the closest single engagement figure.
  const engagement =
    insightMap.get("total_interactions") ??
    sumOrNull([likes, comments, shares, insightMap.get("saved") ?? null]);

  return {
    reach,
    impressions: reach, // IG no longer exposes impressions post-cutover
    engagement,
    likes,
    comments,
    shares,
    raw: data,
  };
}

function sumOrNull(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => typeof v === "number");
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}
