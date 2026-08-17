import type { QueueName } from "@/lib/queue";

export type WorkerGroup = "all" | "core" | "remix" | "playwright";

const DEFAULT_CONCURRENCY: Record<QueueName, number> = {
  publish: 3,
  "analytics-sync": 2,
  "content-gen": 2,
  "video-render": 1,
  "image-edit": 1,
  engagement: 2,
  remix: 1,
  playwright: 1,
};

const CONCURRENCY_ENV: Record<QueueName, string> = {
  publish: "WORKER_CONCURRENCY_PUBLISH",
  "analytics-sync": "WORKER_CONCURRENCY_ANALYTICS",
  "content-gen": "WORKER_CONCURRENCY_CONTENT_GEN",
  "video-render": "WORKER_CONCURRENCY_VIDEO_RENDER",
  "image-edit": "WORKER_CONCURRENCY_IMAGE_EDIT",
  engagement: "WORKER_CONCURRENCY_ENGAGEMENT",
  remix: "WORKER_CONCURRENCY_REMIX",
  playwright: "WORKER_CONCURRENCY_PLAYWRIGHT",
};

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export function getWorkerConcurrency(name: QueueName): number {
  return readPositiveInt(
    process.env[CONCURRENCY_ENV[name]],
    DEFAULT_CONCURRENCY[name],
  );
}

export function getWorkerGroup(): WorkerGroup {
  const group = (process.env.WORKER_GROUP ?? "all").toLowerCase();
  if (
    group === "all" ||
    group === "core" ||
    group === "remix" ||
    group === "playwright"
  ) {
    return group;
  }
  return "all";
}

export function isPlaywrightWorkerEnabled(): boolean {
  return (process.env.ENABLE_PLAYWRIGHT_WORKER ?? "false").toLowerCase() === "true";
}

export function shouldRunQueue(name: QueueName): boolean {
  const group = getWorkerGroup();
  switch (group) {
    case "core":
      return name !== "remix" && name !== "playwright";
    case "remix":
      return name === "remix";
    case "playwright":
      return name === "playwright" && isPlaywrightWorkerEnabled();
    case "all":
    default:
      if (name === "playwright") return isPlaywrightWorkerEnabled();
      return true;
  }
}

