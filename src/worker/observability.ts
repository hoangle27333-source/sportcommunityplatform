import { Queue, QueueEvents } from "bullmq";
import pino from "pino";
import { createRedisConnection, type QueueName } from "@/lib/queue";

const logger = pino({ name: "worker:queue-events" });

export interface QueueObserver {
  close(): Promise<void>;
}

export function observeQueue(queueName: QueueName): QueueObserver {
  const connection = createRedisConnection();
  const queue = new Queue(queueName, { connection });
  const events = new QueueEvents(queueName, { connection });

  events.on("failed", async ({ jobId, failedReason }) => {
    logger.warn({ queueName, jobId, failedReason }, "queue job failed");
  });

  events.on("stalled", ({ jobId }) => {
    logger.warn({ queueName, jobId }, "queue job stalled");
  });

  events.on("completed", async ({ jobId }) => {
    const job = jobId ? await queue.getJob(jobId).catch(() => null) : null;
    const durationMs =
      job && typeof job.timestamp === "number" ? Date.now() - job.timestamp : undefined;
    logger.info({ queueName, jobId, durationMs }, "queue job completed");
  });

  return {
    async close() {
      await Promise.allSettled([events.close(), queue.close(), connection.quit()]);
    },
  };
}
