import type { SupabaseClient } from "@supabase/supabase-js";
import { QUEUE_NAMES, getQueue } from "@/lib/queue";
import type { PublishJobData } from "@/worker/processors/publish";

/**
 * Post scheduling / publish-now service (SPEC §5).
 *
 * Turns a draft post into scheduled or publishing state and fans out ONE
 * BullMQ publish job per PostTarget. Fan-out is per-channel so a failure on
 * one channel never blocks a sibling (SPEC §5, §9).
 *
 * Idempotency (SPEC §9): each job uses a deterministic jobId of the form
 * `publish:<postTargetId>`. Re-enqueuing the same target while a prior job is
 * still waiting/active is a no-op in BullMQ, so double-clicking "publish" or a
 * retried request never produces duplicate posts.
 */

const MAX_SCHEDULE_HORIZON_MS = 6 * 30 * 24 * 3600 * 1000; // ~6 months

export class ScheduleError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ScheduleError";
    this.status = status;
  }
}

interface TargetRow {
  id: string;
  status: string;
  external_post_id: string | null;
}

interface PostRow {
  id: string;
  status: string;
}

/**
 * Load a post and its targets, guarding common preconditions. Uses the caller's
 * (RLS-scoped) client so an editor cannot schedule a post they cannot see.
 */
async function loadPostWithTargets(
  db: SupabaseClient,
  postId: string,
): Promise<{ post: PostRow; targets: TargetRow[] }> {
  const { data: post, error: postErr } = await db
    .from("posts")
    .select("id, status")
    .eq("id", postId)
    .single<PostRow>();

  if (postErr || !post) {
    throw new ScheduleError(404, "post not found");
  }

  const { data: targets, error: targetErr } = await db
    .from("post_targets")
    .select("id, status, external_post_id")
    .eq("post_id", postId);

  if (targetErr) {
    throw new ScheduleError(500, `load targets: ${targetErr.message}`);
  }
  if (!targets || targets.length === 0) {
    throw new ScheduleError(
      422,
      "post has no target channels; attach at least one social account",
    );
  }

  return { post, targets };
}

/** Deterministic, idempotent job id for a target's publish job. */
function publishJobId(postTargetId: string): string {
  return `publish:${postTargetId}`;
}

/** Enqueue one publish job per not-yet-published target. */
async function enqueueTargets(
  postId: string,
  targets: TargetRow[],
  delayMs: number,
): Promise<string[]> {
  const queue = getQueue(QUEUE_NAMES.publish);
  const enqueuedJobIds: string[] = [];

  for (const target of targets) {
    // Skip targets already published (idempotency / dedupe).
    if (target.external_post_id) continue;

    const data: PublishJobData = { postTargetId: target.id, postId };
    const jobId = publishJobId(target.id);
    await queue.add("publish", data, {
      jobId,
      delay: delayMs > 0 ? delayMs : undefined,
    });
    enqueuedJobIds.push(jobId);
  }

  return enqueuedJobIds;
}

export interface ScheduleResult {
  status: "scheduled" | "publishing";
  scheduledAt: string | null;
  targetsEnqueued: number;
  enqueuedJobIds: string[];
}

/**
 * Schedule a post for future publishing at `runAt`.
 * Sets posts.status = 'scheduled', posts.scheduled_at, records schedule_jobs
 * rows, and enqueues delayed publish jobs.
 *
 * @param db     RLS-scoped client (authorization) for reads/post updates.
 * @param admin  service-role client for schedule_jobs bookkeeping.
 */
export async function schedulePost(
  db: SupabaseClient,
  admin: SupabaseClient,
  postId: string,
  runAt: Date,
): Promise<ScheduleResult> {
  const now = Date.now();
  const delayMs = runAt.getTime() - now;

  if (Number.isNaN(runAt.getTime())) {
    throw new ScheduleError(422, "invalid runAt timestamp");
  }
  if (delayMs < 0) {
    throw new ScheduleError(422, "runAt is in the past");
  }
  if (delayMs > MAX_SCHEDULE_HORIZON_MS) {
    throw new ScheduleError(422, "runAt is too far in the future (max ~6 months)");
  }

  const { post, targets } = await loadPostWithTargets(db, postId);
  if (post.status === "publishing") {
    throw new ScheduleError(409, "post is already publishing");
  }

  const runAtIso = runAt.toISOString();

  // Mark scheduled first (RLS-scoped write authorizes the actor).
  const { error: updateErr } = await db
    .from("posts")
    .update({ status: "scheduled", scheduled_at: runAtIso })
    .eq("id", postId);
  if (updateErr) {
    throw new ScheduleError(500, `update post: ${updateErr.message}`);
  }

  const enqueuedJobIds = await enqueueTargets(postId, targets, delayMs);

  // Bookkeeping row for observability (worker/admin can inspect).
  await admin.from("schedule_jobs").insert({
    post_id: postId,
    run_at: runAtIso,
    bull_job_id: JSON.stringify(enqueuedJobIds),
    status: "queued",
  });

  return {
    status: "scheduled",
    scheduledAt: runAtIso,
    targetsEnqueued: enqueuedJobIds.length,
    enqueuedJobIds,
  };
}

/**
 * Publish a post immediately: sets posts.status = 'publishing' and enqueues
 * publish jobs with no delay.
 */
export async function publishPostNow(
  db: SupabaseClient,
  admin: SupabaseClient,
  postId: string,
): Promise<ScheduleResult> {
  const { post, targets } = await loadPostWithTargets(db, postId);
  if (post.status === "publishing") {
    throw new ScheduleError(409, "post is already publishing");
  }

  const { error: updateErr } = await db
    .from("posts")
    .update({ status: "publishing", scheduled_at: new Date().toISOString() })
    .eq("id", postId);
  if (updateErr) {
    throw new ScheduleError(500, `update post: ${updateErr.message}`);
  }

  const enqueuedJobIds = await enqueueTargets(postId, targets, 0);

  await admin.from("schedule_jobs").insert({
    post_id: postId,
    run_at: new Date().toISOString(),
    bull_job_id: JSON.stringify(enqueuedJobIds),
    status: "queued",
  });

  return {
    status: "publishing",
    scheduledAt: null,
    targetsEnqueued: enqueuedJobIds.length,
    enqueuedJobIds,
  };
}
