import type { Worker } from "bullmq";
import pino from "pino";
import {
  QUEUE_NAMES,
  createRedisConnection,
  scheduleRepeatable,
} from "@/lib/queue";
import { createPublishWorker } from "./processors/publish";
import { createAnalyticsSyncWorker } from "./processors/analytics-sync";
import { createContentGenWorker } from "./processors/content-gen";
import { createEngagementWorker } from "./processors/engagement";
import { createRemixWorker } from "./processors/remix";
import { createPlaywrightWorker } from "./processors/playwright";

/**
 * BullMQ worker entrypoint (SPEC §2, §5, §6, §7, §8).
 *
 * Registers every queue processor and the repeatable analytics-sync cron, then
 * keeps a long-running process alive for the `worker` container.
 */

const logger = pino({ name: "worker" });

// Health/liveness connection so we surface Redis connectivity in the logs even
// before a job arrives. Each Worker manages its own blocking connection.
const connection = createRedisConnection();
connection.on("connect", () => logger.info("redis connected"));
connection.on("error", (err) => logger.error({ err }, "redis error"));

const workers: Worker[] = [];

function registerWorkers() {
  workers.push(createPublishWorker());
  workers.push(createAnalyticsSyncWorker());
  workers.push(createContentGenWorker());
  workers.push(createEngagementWorker());
  workers.push(createRemixWorker());
  workers.push(createPlaywrightWorker());
  logger.info({ queues: workers.map((w) => w.name) }, "workers registered");
}

/**
 * Repeatable jobs. Analytics sync every 6h (SPEC §6). BullMQ dedupes the
 * schedule by pattern+name, so registering on every boot is idempotent.
 */
async function registerCron() {
  const pattern = process.env.ANALYTICS_SYNC_CRON ?? "0 */6 * * *";
  await scheduleRepeatable(
    QUEUE_NAMES.analyticsSync,
    "scheduled-sync",
    pattern,
    {},
  );
  logger.info({ pattern }, "analytics-sync cron registered");
}

registerWorkers();
registerCron().catch((err) =>
  logger.error({ err }, "failed to register cron jobs"),
);
logger.info("worker started");

// Keep the process alive until a signal arrives, draining workers cleanly so
// in-flight jobs finish (or are re-queued) rather than being lost.
async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down worker");
  try {
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
  } catch (err) {
    logger.error({ err }, "error during shutdown");
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
