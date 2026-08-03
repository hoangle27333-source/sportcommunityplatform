import type { SupabaseClient } from "@supabase/supabase-js";
import type { TokenUsage } from "@/lib/ai/types";

/**
 * AI cost tracking (SPEC §6/§7, requirements R4.7, R9.2, R9.3).
 *
 * Records one ai_generations row per AI call: provider, model, tokens, VND cost,
 * duration, and the produced asset/post/campaign. Powers the cost dashboard and
 * the monthly-budget alert. Writes go via the service-role client in workers, or
 * the RLS-scoped client in API routes (the table has no insert policy, so API
 * writes must pass a service-role client — callers decide).
 *
 * Cost model: providers report USD (or tokens we price ourselves). We convert to
 * VND with USD_TO_VND_RATE so the dashboard is in local currency. When a provider
 * gives no usage, we still log the call with null costs for auditability.
 */

export type GenerationKind =
  | "caption"
  | "banner"
  | "image-edit"
  | "video"
  | "analysis";

/** Per-1M-token USD prices, overridable via env. Defaults ~ Gemini Flash. */
function tokenPricesUsd(): { input: number; output: number } {
  return {
    input: Number(process.env.AI_PRICE_INPUT_PER_M_USD ?? "0.075"),
    output: Number(process.env.AI_PRICE_OUTPUT_PER_M_USD ?? "0.30"),
  };
}

function usdToVnd(usd: number): number {
  const rate = Number(process.env.USD_TO_VND_RATE ?? "25000");
  return usd * rate;
}

/** Estimate USD cost from token usage using configured per-token prices. */
export function estimateCostUsd(usage?: TokenUsage): number | null {
  if (!usage) return null;
  const { input, output } = tokenPricesUsd();
  const inTok = usage.promptTokens ?? 0;
  const outTok = usage.completionTokens ?? 0;
  return (inTok / 1_000_000) * input + (outTok / 1_000_000) * output;
}

export interface RecordGenerationInput {
  provider: string;
  model: string;
  kind: GenerationKind;
  usage?: TokenUsage;
  durationMs?: number;
  mediaAssetId?: string;
  postId?: string;
  campaignId?: string;
  createdBy?: string;
}

/**
 * Insert an ai_generations row. Best-effort: never throws into the caller's
 * critical path — a cost-logging failure must not fail the generation itself.
 */
export async function recordGeneration(
  db: SupabaseClient,
  input: RecordGenerationInput,
): Promise<void> {
  const costUsd = estimateCostUsd(input.usage);
  const costVnd = costUsd == null ? null : usdToVnd(costUsd);

  try {
    await db.from("ai_generations").insert({
      provider: input.provider,
      model: input.model,
      kind: input.kind,
      prompt_tokens: input.usage?.promptTokens ?? null,
      output_tokens: input.usage?.completionTokens ?? null,
      total_tokens: input.usage?.totalTokens ?? null,
      cost_usd: costUsd,
      cost_vnd: costVnd,
      duration_ms: input.durationMs ?? null,
      media_asset_id: input.mediaAssetId ?? null,
      post_id: input.postId ?? null,
      campaign_id: input.campaignId ?? null,
      created_by: input.createdBy ?? null,
    });
  } catch {
    // swallow — cost logging is observability, not correctness.
  }
}

export interface CostRollup {
  totalVnd: number;
  totalUsd: number;
  byKind: Record<string, number>;
  byProvider: Record<string, number>;
  count: number;
}

/**
 * Roll up AI cost over a window (R9.2). Aggregated in-app from rows; for the
 * ~1000 generations/month scale this is trivial and avoids a SQL view.
 */
export async function costRollup(
  db: SupabaseClient,
  opts: { since?: string; until?: string } = {},
): Promise<CostRollup> {
  let q = db
    .from("ai_generations")
    .select("kind, provider, cost_usd, cost_vnd")
    .limit(10000);
  if (opts.since) q = q.gte("created_at", opts.since);
  if (opts.until) q = q.lte("created_at", opts.until);

  const { data, error } = await q;
  if (error) throw new Error(`cost rollup: ${error.message}`);

  const rollup: CostRollup = {
    totalVnd: 0,
    totalUsd: 0,
    byKind: {},
    byProvider: {},
    count: data?.length ?? 0,
  };
  for (const row of data ?? []) {
    const vnd = Number(row.cost_vnd ?? 0);
    const usd = Number(row.cost_usd ?? 0);
    rollup.totalVnd += vnd;
    rollup.totalUsd += usd;
    rollup.byKind[row.kind] = (rollup.byKind[row.kind] ?? 0) + vnd;
    rollup.byProvider[row.provider] =
      (rollup.byProvider[row.provider] ?? 0) + vnd;
  }
  return rollup;
}
