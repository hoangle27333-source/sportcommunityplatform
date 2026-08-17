import { Worker, type Job } from "bullmq";
import pino from "pino";
import { QUEUE_NAMES, createRedisConnection } from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishTarget } from "@/lib/posts/publish-post";
import { getWorkerConcurrency } from "@/worker/config";

/**
 * Publish worker processor (SPEC §5).
 *
 * Consumes `publish` jobs. Each job publishes ONE PostTarget (one channel),
 * so cross-post fan-out is N independent jobs — a failure on one channel never
 * affects a sibling. After each target resolves, recomputes the parent Post's
 * aggregate status (published if any target published, failed if all failed).
 *
 * Job data: { postTargetId }
 */

const logger = pino({ name: "worker:publish" });

export interface PublishJobData {
  postTargetId: string;
  postId: string;
}

export function createPublishWorker(): Worker<PublishJobData> {
  const worker = new Worker<PublishJobData>(
    QUEUE_NAMES.publish,
    async (job: Job<PublishJobData>) => {
      const db = createAdminClient();
      const { postTargetId, postId } = job.data;

      logger.info({ jobId: job.id, postTargetId }, "publishing target");
      const outcome = await publishTarget(db, { postTargetId });
      logger.info({ jobId: job.id, postTargetId, outcome }, "target resolved");

      // Recompute the parent post's aggregate status from its targets.
      await reconcilePostStatus(db, postId);

      return outcome;
    },
    {
      connection: createRedisConnection(),
      // Publishing is network-bound; keep modest concurrency to respect
      // per-account Graph API rate limits (SPEC §9).
      concurrency: getWorkerConcurrency(QUEUE_NAMES.publish),
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "publish job failed");
  });

  return worker;
}

/**
 * Set Post.status based on its targets:
 *   - published  if at least one target published
 *   - failed     if all targets failed
 *   - publishing otherwise (some still pending/publishing)
 */
async function reconcilePostStatus(
  db: ReturnType<typeof createAdminClient>,
  postId: string,
): Promise<void> {
  const { data: targets } = await db
    .from("post_targets")
    .select("status")
    .eq("post_id", postId);

  if (!targets || targets.length === 0) return;

  const statuses = targets.map((t) => t.status as string);
  const anyPublished = statuses.includes("published");
  const allFailed = statuses.every((s) => s === "failed");
  const allSettled = statuses.every(
    (s) => s === "published" || s === "failed",
  );

  let postStatus: string;
  if (anyPublished && allSettled) postStatus = "published";
  else if (anyPublished) postStatus = "published";
  else if (allFailed) postStatus = "failed";
  else postStatus = "publishing";

  const update: Record<string, unknown> = { status: postStatus };
  if (postStatus === "published") update.published_at = new Date().toISOString();

  await db.from("posts").update(update).eq("id", postId);
}
