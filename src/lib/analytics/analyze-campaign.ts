import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "@/lib/ai";
import type { MetricSample } from "@/lib/ai/types";

/**
 * AI Learning analysis service (SPEC §6, Stage 1).
 *
 * Aggregates the latest metric snapshot per published post in a campaign, hands
 * the samples to AIProvider.analyze(), and persists the returned learnings as
 * ai_suggestions rows tied to the campaign. Suggestions feed the next
 * campaign's caption generation (§7.1 learnings input).
 *
 * Runs under a service-role client in the worker (system work).
 */

export interface AnalyzeResult {
  campaignId: string;
  samples: number;
  suggestionsCreated: number;
  model?: string;
}

interface CampaignPostRow {
  id: string;
  caption: string | null;
  hashtags: string[] | null;
  primary_platform: "facebook" | "instagram";
  published_at: string | null;
}

/**
 * Analyze one campaign's performance and write ai_suggestions.
 * Replaces prior suggestions for the campaign so the table always reflects the
 * latest learning pass (idempotent per run).
 */
export async function analyzeCampaign(
  db: SupabaseClient,
  campaignId: string,
): Promise<AnalyzeResult> {
  // 1. Posts in the campaign that have actually published.
  const { data: posts, error: postsErr } = await db
    .from("posts")
    .select("id, caption, hashtags, primary_platform, published_at")
    .eq("campaign_id", campaignId)
    .eq("status", "published");

  if (postsErr) throw new Error(`load campaign posts: ${postsErr.message}`);
  if (!posts || posts.length === 0) {
    return { campaignId, samples: 0, suggestionsCreated: 0 };
  }

  // 2. Latest metric snapshot per post (via its targets).
  const samples: MetricSample[] = [];
  for (const post of posts as CampaignPostRow[]) {
    const metric = await latestMetricForPost(db, post.id);
    samples.push({
      postId: post.id,
      caption: post.caption ?? undefined,
      hashtags: post.hashtags ?? undefined,
      platform: post.primary_platform,
      reach: metric?.reach ?? undefined,
      impressions: metric?.impressions ?? undefined,
      engagement: metric?.engagement ?? undefined,
      publishedAt: post.published_at ?? undefined,
    });
  }

  // 3. Ask the AI provider for learnings.
  const goal = await campaignGoal(db, campaignId);
  const ai = getAIProvider();
  const analysis = await ai.analyze({
    samples,
    context: goal ? `Campaign goal: ${goal}` : undefined,
    language: "vi",
  });

  // 4. Replace prior suggestions for this campaign, then insert fresh ones.
  await db.from("ai_suggestions").delete().eq("campaign_id", campaignId);

  let created = 0;
  if (analysis.suggestions.length > 0) {
    const rows = analysis.suggestions.map((s) => ({
      campaign_id: campaignId,
      type: s.type,
      content: s.content,
      rationale: s.rationale,
    }));
    const { error: insErr } = await db.from("ai_suggestions").insert(rows);
    if (insErr) throw new Error(`insert suggestions: ${insErr.message}`);
    created = rows.length;
  }

  return {
    campaignId,
    samples: samples.length,
    suggestionsCreated: created,
    model: analysis.model,
  };
}

interface MetricRow {
  reach: number | null;
  impressions: number | null;
  engagement: number | null;
  captured_at: string;
}

/** The most recent metric snapshot across all targets of a post. */
async function latestMetricForPost(
  db: SupabaseClient,
  postId: string,
): Promise<MetricRow | null> {
  const { data: targets } = await db
    .from("post_targets")
    .select("id")
    .eq("post_id", postId);

  const targetIds = (targets ?? []).map((t) => t.id as string);
  if (targetIds.length === 0) return null;

  const { data: metrics } = await db
    .from("metrics")
    .select("reach, impressions, engagement, captured_at")
    .in("post_target_id", targetIds)
    .order("captured_at", { ascending: false })
    .limit(1);

  return (metrics?.[0] as MetricRow | undefined) ?? null;
}

async function campaignGoal(
  db: SupabaseClient,
  campaignId: string,
): Promise<string | null> {
  const { data } = await db
    .from("campaigns")
    .select("goal")
    .eq("id", campaignId)
    .single<{ goal: string | null }>();
  return data?.goal ?? null;
}
