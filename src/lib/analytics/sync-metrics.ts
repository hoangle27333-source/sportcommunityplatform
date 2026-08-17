import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto/token-encryption";
import { GraphApiError } from "@/lib/meta/client";
import {
  fetchFacebookPostMetrics,
  fetchInstagramMediaMetrics,
  type NormalizedMetric,
} from "@/lib/meta/insights";

/**
 * Analytics sync service (SPEC §6).
 *
 * For every published PostTarget with an externalPostId, fetch current metrics
 * from Meta and append a Metric row (append-only time-series). Runs under a
 * service-role client in the analytics-sync worker (system work, bypasses RLS).
 *
 * Design:
 *   - Per-target: a failure on one target never blocks the rest.
 *   - Auth errors (expired token) mark the account needs_reauth and are skipped
 *     for the remainder of the run (SPEC §5 edge cases).
 *   - Metrics are append-only: each run inserts a fresh snapshot with captured_at.
 */

interface SyncTargetRow {
  id: string;
  external_post_id: string | null;
  social_account_id: string;
}

interface SyncAccountRow {
  id: string;
  platform: "facebook" | "instagram";
  access_token_enc: string;
  status: string;
}

export interface SyncResult {
  totalTargets: number;
  synced: number;
  skipped: number;
  failed: number;
  accountsNeedingReauth: string[];
  shard?: {
    totalAccounts: number;
    accountIndex: number;
    shardSize: number;
  };
}

/** Sync metrics for all published targets (optionally scoped to one account). */
export async function syncAllMetrics(
  db: SupabaseClient,
  opts: { socialAccountId?: string; limit?: number; shardKey?: number; shardSize?: number } = {},
): Promise<SyncResult> {
  const result: SyncResult = {
    totalTargets: 0,
    synced: 0,
    skipped: 0,
    failed: 0,
    accountsNeedingReauth: [],
  };

  // Only published targets carry an externalPostId worth polling.
  let query = db
    .from("post_targets")
    .select("id, external_post_id, social_account_id")
    .eq("status", "published")
    .not("external_post_id", "is", null)
    .order("social_account_id", { ascending: true })
    .limit(resolveAnalyticsLimit(opts.limit, opts.shardSize));

  if (opts.socialAccountId) {
    query = query.eq("social_account_id", opts.socialAccountId);
  }

  const { data: targets, error } = await query;
  if (error) throw new Error(`load targets: ${error.message}`);
  if (!targets || targets.length === 0) return result;

  const filteredTargets = applyAccountShard(targets as SyncTargetRow[], opts);
  if (filteredTargets.length === 0) return result;

  result.totalTargets = filteredTargets.length;

  // Cache decrypted tokens + reauth state per account across the run.
  const accountCache = new Map<
    string,
    { platform: "facebook" | "instagram"; token: string } | null
  >();
  const reauthNeeded = new Set<string>();

  for (const target of filteredTargets) {
    if (!target.external_post_id) {
      result.skipped++;
      continue;
    }
    if (reauthNeeded.has(target.social_account_id)) {
      result.skipped++;
      continue;
    }

    // Resolve the account token (cached).
    let account = accountCache.get(target.social_account_id);
    if (account === undefined) {
      account = await loadAccount(db, target.social_account_id);
      accountCache.set(target.social_account_id, account);
    }
    if (!account) {
      result.skipped++;
      continue;
    }

    try {
      const metric =
        account.platform === "facebook"
          ? await fetchFacebookPostMetrics(
              target.external_post_id,
              account.token,
            )
          : await fetchInstagramMediaMetrics(
              target.external_post_id,
              account.token,
            );

      await insertMetric(db, target.id, metric);
      result.synced++;
    } catch (e) {
      if (e instanceof GraphApiError && e.isAuthError) {
        reauthNeeded.add(target.social_account_id);
        await markNeedsReauth(db, target.social_account_id);
        result.accountsNeedingReauth.push(target.social_account_id);
        result.skipped++;
      } else {
        result.failed++;
      }
    }
  }

  return result;
}

async function loadAccount(
  db: SupabaseClient,
  socialAccountId: string,
): Promise<{ platform: "facebook" | "instagram"; token: string } | null> {
  const { data, error } = await db
    .from("social_accounts")
    .select("id, platform, access_token_enc, status")
    .eq("id", socialAccountId)
    .single<SyncAccountRow>();

  if (error || !data) return null;
  if (
    data.status === "revoked" ||
    data.status === "expired" ||
    data.status === "needs_reauth"
  ) {
    return null;
  }

  try {
    return {
      platform: data.platform,
      token: decryptSecret(data.access_token_enc),
    };
  } catch {
    return null;
  }
}

async function insertMetric(
  db: SupabaseClient,
  postTargetId: string,
  metric: NormalizedMetric,
): Promise<void> {
  await db.from("metrics").insert({
    post_target_id: postTargetId,
    reach: metric.reach,
    impressions: metric.impressions,
    engagement: metric.engagement,
    likes: metric.likes,
    comments: metric.comments,
    shares: metric.shares,
    raw: metric.raw ?? {},
    captured_at: new Date().toISOString(),
  });
}

async function markNeedsReauth(
  db: SupabaseClient,
  socialAccountId: string,
): Promise<void> {
  await db
    .from("social_accounts")
    .update({ status: "needs_reauth" })
    .eq("id", socialAccountId);
}

function resolveAnalyticsLimit(explicitLimit?: number, shardSize?: number): number {
  if (typeof explicitLimit === "number") return explicitLimit;
  const envLimit = Number(process.env.ANALYTICS_SYNC_LIMIT ?? "250");
  const baseLimit = !Number.isFinite(envLimit) || envLimit < 1 ? 250 : Math.floor(envLimit);
  const multiplier =
    typeof shardSize === "number" && Number.isFinite(shardSize) && shardSize > 1
      ? Math.floor(shardSize)
      : 1;
  return baseLimit * multiplier;
}

function applyAccountShard(
  targets: SyncTargetRow[],
  opts: { shardKey?: number; shardSize?: number },
): SyncTargetRow[] {
  const shardSize = resolveShardSize(opts.shardSize);
  if (shardSize <= 1) return targets;

  const uniqueAccounts = [...new Set(targets.map((target) => target.social_account_id))];
  const accountIndex = normalizeShardKey(opts.shardKey, shardSize);
  const allowedAccounts = new Set(
    uniqueAccounts.filter((_, index) => index % shardSize === accountIndex),
  );
  return targets.filter((target) => allowedAccounts.has(target.social_account_id));
}

function resolveShardSize(explicitShardSize?: number): number {
  if (typeof explicitShardSize === "number") return Math.max(1, Math.floor(explicitShardSize));
  const envValue = Number(process.env.ANALYTICS_SYNC_ACCOUNT_SHARDING ?? "1");
  if (!Number.isFinite(envValue) || envValue < 1) return 1;
  return Math.floor(envValue);
}

function normalizeShardKey(explicitShardKey: number | undefined, shardSize: number): number {
  if (typeof explicitShardKey === "number" && Number.isFinite(explicitShardKey)) {
    return ((Math.floor(explicitShardKey) % shardSize) + shardSize) % shardSize;
  }
  const dayOfMonth = new Date().getUTCDate();
  return dayOfMonth % shardSize;
}
