import { Worker, type Job } from "bullmq";
import pino from "pino";
import { QUEUE_NAMES, createRedisConnection } from "@/lib/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRemixJob, resumeAfterHeyGen, type RunRemixResult } from "@/lib/remix/remix-service";
import { getWorkerConcurrency } from "@/worker/config";

/**
 * Remix worker processor (SPEC §7 — Content Remix).
 *
 * Chạy một vòng remix cho một job: lập kế hoạch → xử lý media → chuyển sang
 * trạng thái `review` để người dùng xem. Job có `feedback` là vòng sửa lại.
 *
 * Job kind:
 *   - 'run' (default): vòng đầu hoặc vòng sửa theo feedback.
 *   - 'heygen_continue': giai đoạn 2 sau khi HeyGen webhook callback — burn sub + text overlay.
 *
 * Concurrency thấp vì ffmpeg tốn CPU — chạy song song nhiều video sẽ làm chậm
 * tất cả và có thể hết RAM trên VPS.
 */

const logger = pino({ name: "worker:remix" });

export interface RemixJobData {
  remixJobId: string;
  /** Có feedback = vòng sửa lại theo phản hồi người dùng. */
  feedback?: string;
  /** Phân biệt loại job. Default: 'run'. */
  kind?: "run" | "heygen_continue";
  /** Giai đoạn 2 HeyGen: URL video đã dịch (Supabase Storage hoặc HeyGen CDN). */
  heygenVideoUrl?: string;
  /** Giai đoạn 2 HeyGen: Nội dung file SRT phụ đề từ HeyGen (có thể thiếu). */
  captionSrt?: string;
}

export function createRemixWorker(): Worker<RemixJobData, RunRemixResult> {
  const worker = new Worker<RemixJobData, RunRemixResult>(
    QUEUE_NAMES.remix,
    async (job: Job<RemixJobData>) => {
      const db = createAdminClient();
      const { remixJobId, feedback, kind, heygenVideoUrl, captionSrt } = job.data;

      if (kind === "heygen_continue") {
        logger.info(
          { jobId: job.id, remixJobId, heygenVideoUrl: heygenVideoUrl?.slice(0, 80) },
          "remix heygen_continue bắt đầu",
        );

        if (!heygenVideoUrl) {
          throw new Error("heygen_continue thiếu heygenVideoUrl.");
        }

        const result = await resumeAfterHeyGen(db, remixJobId, heygenVideoUrl, captionSrt);

        logger.info(
          {
            jobId: job.id,
            remixJobId,
            status: result.status,
            warnings: result.warnings.length,
          },
          "remix heygen_continue xong",
        );
        return result;
      }

      // Default: 'run' — vòng đầu hoặc revision
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
      concurrency: getWorkerConcurrency(QUEUE_NAMES.remix),
      // Video dài có thể chạy lâu; cho phép tới 10 phút mỗi job.
      lockDuration: 10 * 60 * 1000,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, remixJobId: job?.data.remixJobId, kind: job?.data.kind, err: err.message },
      "remix job thất bại",
    );
  });

  return worker;
}
