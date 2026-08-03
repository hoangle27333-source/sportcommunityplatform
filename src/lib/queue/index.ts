import { Queue, type JobsOptions } from "bullmq";
import IORedis, { type RedisOptions } from "ioredis";

/**
 * Shared BullMQ infrastructure (SPEC §2, §5, §6, §7).
 *
 * One Redis connection factory + a registry of queue names so producers
 * (API routes, cron) and consumers (worker) agree on names and default
 * job options (retry/backoff, cleanup). Import `getQueue(name)` to enqueue.
 */

export const QUEUE_NAMES = {
  publish: "publish",
  analyticsSync: "analytics-sync",
  contentGen: "content-gen",
  videoRender: "video-render",
  imageEdit: "image-edit",
  engagement: "engagement",
  /** Content Remix pipeline (ffmpeg/TTS) — chạy lâu nên tách hàng đợi riêng. */
  remix: "remix",
  /** Playwright browser automation — unofficial channel connector + seeding. */
  playwright: "playwright",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * BullMQ requires `maxRetriesPerRequest: null` on its blocking connection.
 * Reuse a single connection per process for producers.
 */
export function createRedisConnection(opts?: RedisOptions): IORedis {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null, ...opts });
}

let sharedConnection: IORedis | null = null;

function getSharedConnection(): IORedis {
  if (!sharedConnection) sharedConnection = createRedisConnection();
  return sharedConnection;
}

/** Sensible default job options: retry with exponential backoff, auto-clean. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
};

const queues = new Map<QueueName, Queue>();

/** Get (or lazily create) a Queue by name, sharing one Redis connection. */
export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: getSharedConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queues.set(name, q);
  }
  return q;
}

/**
 * Enqueue a job. `jobId` makes enqueues idempotent — re-enqueuing the same
 * jobId while it is waiting/active is a no-op (SPEC §9 idempotency).
 */
export async function enqueue(
  queueName: QueueName,
  name: string,
  data: any,
  opts?: JobsOptions,
) {
  const client = getSharedConnection();
  try {
    // Fail fast if Redis is completely down to prevent the API from hanging indefinitely.
    // ioredis buffers commands if offline, so ping() will just wait. We use Promise.race.
    if (client.status !== 'ready') {
      await Promise.race([
        new Promise((resolve, reject) => {
          client.once('ready', resolve);
          client.once('error', reject);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 2000))
      ]);
    }
  } catch (e) {
    throw new Error('Hệ thống hàng đợi (Redis) không phản hồi. Hãy đảm bảo redis-server đang chạy.');
  }

  const queue = new Queue(queueName, { connection: client });
  return queue.add(name, data, opts);
}

/**
 * Register a repeatable (cron) job. BullMQ dedupes repeatable schedules by their
 * pattern + name, so calling this on every worker boot is safe — it will not
 * stack duplicate schedules (SPEC §6 analytics-sync cron).
 */
export async function scheduleRepeatable<T>(
  name: QueueName,
  jobName: string,
  pattern: string,
  data: T,
  tz?: string,
): Promise<void> {
  await getQueue(name).add(jobName, data, {
    repeat: { pattern, tz: tz ?? process.env.APP_TIMEZONE },
    // Repeatable job instances still honor retry/cleanup defaults.
  });
}

/** Close all producer queues + shared connection (graceful shutdown). */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}
