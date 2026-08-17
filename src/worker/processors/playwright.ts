import { Worker, type Job } from "bullmq";
import pino from "pino";
import { QUEUE_NAMES, createRedisConnection } from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  actionPost,
  actionComment,
  actionReact,
  actionShare,
} from "@/lib/playwright/browser-actions";
import { runConnectFlow } from "@/lib/playwright/connect-flow";
import { getWorkerConcurrency } from "@/worker/config";
import { processScrapeTrackedAccount } from "@/worker/scrape-tracked-account";

/**
 * Playwright worker processor.
 *
 * Consumes jobs from the 'playwright' queue. Two job types:
 *  - 'seeding': execute a seeding_job row (post/comment/react/share)
 *  - 'connect': open visible browser for admin login
 *
 * concurrency=1 to run only one browser at a time (RAM efficiency).
 */

const logger = pino({ name: "worker:playwright" });

export interface PlaywrightSeedingJobData {
  type: "seeding";
  seedingJobId: string;
}

export interface PlaywrightConnectJobData {
  type: "connect";
  accountId: string;
  accountName: string;
}

export interface PlaywrightScrapeTrackedJobData {
  type?: undefined; // no 'type' field — dispatched by trackedAccountId presence
  trackedAccountId: string;
}

export type PlaywrightJobData =
  | PlaywrightSeedingJobData
  | PlaywrightConnectJobData
  | PlaywrightScrapeTrackedJobData;

export function createPlaywrightWorker(): Worker<PlaywrightJobData> {
  const worker = new Worker<PlaywrightJobData>(
    QUEUE_NAMES.playwright,
    async (job: Job<PlaywrightJobData>) => {
      // Route by job name first (most specific), then by data shape
      if (job.name === "scrape-tracked-account") {
        return processScrapeTrackedAccount(job);
      }
      if ((job.data as PlaywrightConnectJobData).type === "connect") {
        return handleConnect(job.data as PlaywrightConnectJobData);
      }
      return handleSeeding(job.data as PlaywrightSeedingJobData);
    },
    {
      connection: createRedisConnection(),
      // CRITICAL: concurrency=1 — only one browser at a time.
      concurrency: getWorkerConcurrency(QUEUE_NAMES.playwright),
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "playwright job failed");
  });

  return worker;
}

// ---------------------------------------------------------------------------
// Connect handler
// ---------------------------------------------------------------------------

async function handleConnect(data: PlaywrightConnectJobData): Promise<void> {
  const { accountId, accountName } = data;
  logger.info({ accountId }, "handling connect job");

  const db = createAdminClient();

  // Mark account as connecting
  await db
    .from("social_accounts")
    .update({ session_status: "unknown" })
    .eq("id", accountId);

  const result = await runConnectFlow(accountId, accountName);

  if (!result.success) {
    logger.error({ accountId, error: result.error }, "connect flow failed");
    await db
      .from("social_accounts")
      .update({ session_status: "needs_relogin" })
      .eq("id", accountId);
  } else {
    logger.info({ accountId }, "connect flow succeeded");
    // session_status already set to 'active' inside saveSession()
  }
}

// ---------------------------------------------------------------------------
// Seeding handler
// ---------------------------------------------------------------------------

async function handleSeeding(data: PlaywrightSeedingJobData): Promise<void> {
  const { seedingJobId } = data;
  const db = createAdminClient();

  // Load seeding job row
  const { data: job, error } = await db
    .from("seeding_jobs")
    .select("*")
    .eq("id", seedingJobId)
    .single();

  if (error || !job) {
    logger.error({ seedingJobId }, "seeding_job not found");
    return;
  }

  // Mark running
  await db
    .from("seeding_jobs")
    .update({ status: "running" })
    .eq("id", seedingJobId);

  logger.info({ seedingJobId, action: job.action, accountId: job.account_id }, "executing seeding action");

  let success = false;
  let resultPostUrl: string | null = null;
  let errorMsg: string | null = null;

  try {
    switch (job.action) {
      case "post": {
        const url = await actionPost({
          accountId: job.account_id,
          caption: job.post_caption ?? "",
          mediaUrls: job.post_media_urls ?? [],
          groupId: job.target_group_ids?.[0],
        });
        success = url !== null;
        resultPostUrl = url;
        break;
      }

      case "comment": {
        if (!job.target_post_url) throw new Error("target_post_url required for comment");
        success = await actionComment({
          accountId: job.account_id,
          targetPostUrl: job.target_post_url,
          commentText: job.comment_content ?? "",
        });
        break;
      }

      case "like":
      case "react": {
        if (!job.target_post_url) throw new Error("target_post_url required for react");
        success = await actionReact({
          accountId: job.account_id,
          targetPostUrl: job.target_post_url,
          reaction: (job.reaction_type as "like" | "love" | "haha" | "wow" | "sad" | "angry") ?? "like",
        });
        break;
      }

      case "share": {
        if (!job.target_post_url) throw new Error("target_post_url required for share");
        success = await actionShare({
          accountId: job.account_id,
          targetPostUrl: job.target_post_url,
          shareCaption: job.share_caption ?? undefined,
        });
        break;
      }

      default:
        errorMsg = `Unknown action: ${job.action}`;
    }
  } catch (err) {
    errorMsg = (err as Error).message;
    logger.error({ seedingJobId, err }, "seeding action threw");
  }

  // Write result back
  await db
    .from("seeding_jobs")
    .update({
      status: success ? "done" : "failed",
      result_post_url: resultPostUrl,
      error: errorMsg?.slice(0, 1000) ?? null,
      executed_at: new Date().toISOString(),
    })
    .eq("id", seedingJobId);

  logger.info({ seedingJobId, success }, "seeding job complete");
}
