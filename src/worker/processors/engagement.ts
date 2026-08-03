import { Worker, type Job } from "bullmq";
import pino from "pino";
import { QUEUE_NAMES, createRedisConnection } from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestComments, suggestReply } from "@/lib/engagement/engagement";

/**
 * Engagement worker processor (SPEC §8).
 *
 * Handles the async engagement tasks:
 *   - `ingest-comments` : pull recent comments on our own posts for an account.
 *   - `suggest-reply`   : generate an AI-suggested reply for one item.
 *
 * Sending replies is NOT done here — it happens synchronously via the review
 * API after a human approves (human-in-the-loop, §8). Job kind is discriminated
 * by `job.name`.
 */

const logger = pino({ name: "worker:engagement" });

export type EngagementJobData =
  | { kind: "ingest-comments"; socialAccountId: string; limit?: number }
  | { kind: "suggest-reply"; engagementItemId: string };

export function createEngagementWorker(): Worker<EngagementJobData> {
  const worker = new Worker<EngagementJobData>(
    QUEUE_NAMES.engagement,
    async (job: Job<EngagementJobData>) => {
      const db = createAdminClient();
      logger.info({ jobId: job.id, kind: job.data.kind }, "engagement start");

      switch (job.data.kind) {
        case "ingest-comments": {
          const result = await ingestComments(db, job.data.socialAccountId, {
            limit: job.data.limit,
          });
          logger.info({ jobId: job.id, result }, "ingest-comments done");
          return result;
        }
        case "suggest-reply": {
          const reply = await suggestReply(db, job.data.engagementItemId);
          logger.info(
            { jobId: job.id, itemId: job.data.engagementItemId, hasReply: !!reply },
            "suggest-reply done",
          );
          return { reply };
        }
        default: {
          const _exhaustive: never = job.data;
          throw new Error(`unknown engagement job: ${JSON.stringify(_exhaustive)}`);
        }
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "engagement job failed");
  });

  return worker;
}
