import type { Worker } from "bullmq";
import pino from "pino";
import { writeFile } from "node:fs/promises";
import {
  QUEUE_NAMES,
  createRedisConnection,
} from "@/lib/queue";
import { createSocialScoutWorker } from "./processors/social-scout";
import { shouldRunQueue } from "./config";
import { observeQueue, type QueueObserver } from "./observability";

/**
 * BullMQ worker entrypoint for Sport Influencer Hub.
 * Manages the socialScout queue for Apify scouting runs.
 */

const logger = pino({ name: "scout-worker" });
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/worker-heartbeat";
const HEARTBEAT_INTERVAL_MS = 30_000;

const connection = createRedisConnection(undefined, QUEUE_NAMES.socialScout);
connection.on("connect", () => logger.info("redis connected"));
connection.on("error", (err) => logger.error({ err }, "redis error"));

const workers: Worker[] = [];
const observers: QueueObserver[] = [];
let heartbeatTimer: NodeJS.Timeout | null = null;

function registerWorkers() {
  if (shouldRunQueue(QUEUE_NAMES.socialScout)) {
    workers.push(createSocialScoutWorker());
    observers.push(observeQueue(QUEUE_NAMES.socialScout));
  }
  logger.info({ queues: workers.map((w) => w.name) }, "workers registered");
}

registerWorkers();

void writeHeartbeat();
heartbeatTimer = setInterval(() => {
  void writeHeartbeat();
}, HEARTBEAT_INTERVAL_MS);
logger.info("scout worker started");

async function writeHeartbeat() {
  await writeFile(
    HEARTBEAT_FILE,
    JSON.stringify({
      pid: process.pid,
      updatedAt: new Date().toISOString(),
      queues: workers.map((w) => w.name),
    }),
  );
}

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down scout worker");
  try {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await Promise.all(observers.map((observer) => observer.close()));
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
