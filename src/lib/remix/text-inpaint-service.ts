import { readFile, writeFile } from "node:fs/promises";
import type { TextInpaintMaskFrame } from "./types";

export type GpuTextInpaintEngine = "propainter" | "e2fgvi_hq";

export interface TextInpaintTrack {
  id: string;
  startSec: number;
  endSec: number;
  frames: TextInpaintMaskFrame[];
}

export interface TextInpaintDiagnostics {
  engine: string;
  sourceMaskFrameCount: number;
  renderedMaskFrameCount: number;
  coverageRatio: number;
  durationMs: number;
  fallbackReason?: string;
}

interface TextInpaintJobResponse {
  id?: unknown;
  status?: unknown;
  resultUrl?: unknown;
  diagnostics?: unknown;
  error?: unknown;
}

export function requestedGpuTextInpaintEngine(): GpuTextInpaintEngine | null {
  const engine = (process.env.TEXT_INPAINT_ENGINE ?? "").trim().toLowerCase();
  return engine === "propainter" || engine === "e2fgvi_hq" ? engine : null;
}

export async function inpaintVideoTextWithGpu(input: {
  videoPath: string;
  outputPath: string;
  tracks: TextInpaintTrack[];
  engine: GpuTextInpaintEngine;
}): Promise<TextInpaintDiagnostics> {
  if (!input.tracks.length) throw new Error("No OCR mask tracks supplied for GPU inpainting");
  const serviceUrl = (process.env.TEXT_INPAINT_SERVICE_URL ?? "http://text-inpaint:8090").replace(/\/+$/, "");
  const timeoutMs = clampNumber(Number(process.env.TEXT_INPAINT_TIMEOUT_MS), 30_000, 3_600_000, 900_000);
  const video = await readFile(input.videoPath);
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(video)], { type: "video/mp4" }), "input.mp4");
  form.set("engine", input.engine);
  form.set("tracksJson", JSON.stringify(input.tracks));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const create = await fetch(`${serviceUrl}/jobs`, { method: "POST", body: form, signal: controller.signal });
    const created = await readJson(create, "GPU text inpaint submit");
    const jobId = typeof created.id === "string" ? created.id : "";
    if (!jobId) throw new Error("GPU text inpaint service returned no job id");

    while (true) {
      await sleep(750);
      const status = await fetch(`${serviceUrl}/jobs/${encodeURIComponent(jobId)}`, { signal: controller.signal });
      const job = await readJson(status, "GPU text inpaint status");
      if (job.status === "failed") throw new Error(typeof job.error === "string" ? job.error : "GPU inpaint job failed");
      if (job.status !== "completed") continue;
      const resultUrl = typeof job.resultUrl === "string" ? job.resultUrl : `${serviceUrl}/jobs/${encodeURIComponent(jobId)}/result`;
      const result = await fetch(resultUrl.startsWith("http") ? resultUrl : `${serviceUrl}${resultUrl}`, { signal: controller.signal });
      if (!result.ok) throw new Error(`GPU text inpaint result ${result.status}: ${(await result.text()).slice(0, 300)}`);
      await writeFile(input.outputPath, Buffer.from(await result.arrayBuffer()));
      return normalizeDiagnostics(job.diagnostics, input.engine, input.tracks);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response: Response, action: string): Promise<TextInpaintJobResponse> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${action} ${response.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text) as TextInpaintJobResponse;
  } catch {
    throw new Error(`${action} returned invalid JSON`);
  }
}

function normalizeDiagnostics(value: unknown, engine: GpuTextInpaintEngine, tracks: TextInpaintTrack[]): TextInpaintDiagnostics {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sourceMaskFrameCount = tracks.reduce((sum, track) => sum + track.frames.length, 0);
  return {
    engine: typeof raw.engine === "string" ? raw.engine : engine,
    sourceMaskFrameCount: clampNumber(Number(raw.sourceMaskFrameCount), 0, 1_000_000, sourceMaskFrameCount),
    renderedMaskFrameCount: clampNumber(Number(raw.renderedMaskFrameCount), 0, 1_000_000, 0),
    coverageRatio: clampNumber(Number(raw.coverageRatio), 0, 1, 0),
    durationMs: clampNumber(Number(raw.durationMs), 0, 3_600_000, 0),
    fallbackReason: typeof raw.fallbackReason === "string" ? raw.fallbackReason : undefined,
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
