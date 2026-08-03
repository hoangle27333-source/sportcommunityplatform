import { Worker, type Job } from "bullmq";
import pino from "pino";
import { QUEUE_NAMES, createRedisConnection } from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRemixJob, type RunRemixResult } from "@/lib/remix/remix-service";

/**
 * Remix worker processor (SPEC §7 — Content Remix).
 *
 * Chạy một vòng remix cho một job: lập kế hoạch → xử lý media → chuyển sang
 * trạng thái `review` để người dùng xem. Job có `feedback` là vòng sửa lại.
 *
 * Concurrency thấp vì ffmpeg tốn CPU — chạy song song nhiều video sẽ làm chậm
 * tất cả và có thể hết RAM trên VPS.
 */

const logger = pino({ name: "worker:remix" });

export interface RemixJobData {
  remixJobId: string;
  /** Có feedback = vòng sửa lại theo phản hồi người dùng. */
  feedback?: string;
}

export function createRemixWorker(): Worker<RemixJobData, RunRemixResult> {
  const worker = new Worker<RemixJobData, RunRemixResult>(
    QUEUE_NAMES.remix,
    async (job: Job<RemixJobData>) => {
      const db = createAdminClient();
      const { remixJobId, feedback } = job.data;

      logger.info(
        { jobId: job.id, remixJobId, isRevision: Boolean(feedback) },
        "remix bắt đầu",
      );

      const result = await runRemixJob(db, remixJobId, feedback);

      logger.info(
        {
          jobId: job.id,
          remixJobId,
          status: result.status,
          iteration: result.iteration,
          warnings: result.warnings.length,
        },
        "remix xong",
      );
      return result;
    },
    {
      connection: createRedisConnection(),
      // ffmpeg là CPU-bound: giữ 1 để không tranh CPU trên VPS nhỏ.
      concurrency: Number(process.env.REMIX_CONCURRENCY ?? "1"),
      // Video dài có thể chạy lâu; cho phép tới 10 phút mỗi job.
      lockDuration: 10 * 60 * 1000,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, remixJobId: job?.data.remixJobId, err: err.message },
      "remix job thất bại",
    );
  });

  return worker;
}
