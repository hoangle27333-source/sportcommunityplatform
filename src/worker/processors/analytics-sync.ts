import { Worker, type Job } from "bullmq";
import pino from "pino";
import { QUEUE_NAMES, createRedisConnection } from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAllMetrics, type SyncResult } from "@/lib/analytics/sync-metrics";

/**
 * Analytics sync worker processor (SPEC §6).
 *
 * Consumes `analytics-sync` jobs. A job with no scope syncs every published
 * target; a job with { socialAccountId } scopes to one account (per-account
 * sharding for the ~100-account scale, SPEC §12). Runs under the service-role
 * client (system work) so it can read encrypted tokens and write metrics.
 *
 * The repeatable cron job is registered by the worker entrypoint.
 */

const logger = pino({ name: "worker:analytics-sync" });

export interface AnalyticsSyncJobData {
  socialAccountId?: string;
  limit?: number;
}

export function createAnalyticsSyncWorker(): Worker<
  AnalyticsSyncJobData,
  SyncResult
> {
  const worker = new Worker<AnalyticsSyncJobData, SyncResult>(
    QUEUE_NAMES.analyticsSync,
    async (job: Job<AnalyticsSyncJobData>) => {
      const db = createAdminClient();
      logger.info({ jobId: job.id, data: job.data }, "analytics sync start");
      const result = await syncAllMetrics(db, {
        socialAccountId: job.data.socialAccountId,
        limit: job.data.limit,
      });
      logger.info({ jobId: job.id, result }, "analytics sync done");
      return result;
    },
    {
      connection: createRedisConnection(),
      // Insights reads are rate-limited per account; keep concurrency modest.
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message },
      "analytics sync job failed",
    );
  });

  return worker;
}
