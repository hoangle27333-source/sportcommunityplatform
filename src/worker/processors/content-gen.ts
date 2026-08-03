import { Worker, type Job } from "bullmq";
import pino from "pino";
import { QUEUE_NAMES, createRedisConnection } from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeCampaign } from "@/lib/analytics/analyze-campaign";
import { renderBannerToStorage } from "@/lib/content/banner";

/**
 * Content-generation worker processor (SPEC §6, §7).
 *
 * Handles the async, potentially slow generation tasks off the request path:
 *   - `analyze-campaign` : run the AI Learning pass for a campaign (§6).
 *   - `render-banner`    : render a Satori/Sharp banner to storage (§7.2).
 *
 * Caption generation (§7.1) is synchronous and small, so it is served directly
 * by the API route rather than queued. Job kind is discriminated by `job.name`.
 */

const logger = pino({ name: "worker:content-gen" });

export type ContentGenJobData =
  | { kind: "analyze-campaign"; campaignId: string }
  | {
      kind: "render-banner";
      template: string;
      data: Record<string, unknown>;
      width?: number;
      height?: number;
      createdBy?: string;
    };

export function createContentGenWorker(): Worker<ContentGenJobData> {
  const worker = new Worker<ContentGenJobData>(
    QUEUE_NAMES.contentGen,
    async (job: Job<ContentGenJobData>) => {
      const db = createAdminClient();
      logger.info({ jobId: job.id, kind: job.data.kind }, "content-gen start");

      switch (job.data.kind) {
        case "analyze-campaign": {
          const result = await analyzeCampaign(db, job.data.campaignId);
          logger.info({ jobId: job.id, result }, "analyze-campaign done");
          return result;
        }
        case "render-banner": {
          const asset = await renderBannerToStorage(db, {
            template: job.data.template,
            data: job.data.data,
            width: job.data.width,
            height: job.data.height,
            createdBy: job.data.createdBy,
          });
          logger.info({ jobId: job.id, assetId: asset.id }, "render-banner done");
          return asset;
        }
        default: {
          const _exhaustive: never = job.data;
          throw new Error(`unknown content-gen job: ${JSON.stringify(_exhaustive)}`);
        }
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "content-gen job failed");
  });

  return worker;
}
