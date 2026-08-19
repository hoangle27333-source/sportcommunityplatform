import { readFile } from "node:fs/promises";
import type { RawOnScreenTextItem } from "./on-screen-text";
import type { NormalizedTextRegion } from "./types";

export interface PaddleOcrDetectionResult {
  items: RawOnScreenTextItem[];
  warnings: string[];
}

interface PaddleOcrServiceItem {
  detectedText?: unknown;
  region?: {
    x?: unknown;
    y?: unknown;
    w?: unknown;
    h?: unknown;
  };
  timestampSec?: unknown;
  startSec?: unknown;
  endSec?: unknown;
  firstSeenSec?: unknown;
  lastSeenSec?: unknown;
  confidence?: unknown;
  detections?: unknown;
  sampleIntervalSec?: unknown;
  sampleCount?: unknown;
  maxGapSec?: unknown;
  source?: unknown;
  textRegions?: unknown;
  lineRegions?: unknown;
  wordRegions?: unknown;
}

interface PaddleOcrServiceResponse {
  items?: unknown;
  warnings?: unknown;
}

export function shouldUsePaddleOcr(): boolean {
  return (process.env.ON_SCREEN_TEXT_ENGINE ?? "gemini").toLowerCase() === "paddleocr";
}

export async function detectOnScreenTextWithPaddleOcr(input: {
  videoPath: string;
  durationSec: number;
  sampleTimestamps: number[];
  lang?: string;
  frameWidthLimit?: number;
}): Promise<PaddleOcrDetectionResult> {
  const serviceUrl = (process.env.PADDLEOCR_SERVICE_URL ?? "http://ocr:8080").replace(/\/+$/, "");
  const timeoutMs = clampNumber(Number(process.env.PADDLEOCR_TIMEOUT_MS), 5_000, 600_000, 120_000);
  const video = await readFile(input.videoPath);

  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(video)], { type: "video/mp4" }), "input.mp4");
  form.set("durationSec", String(input.durationSec));
  form.set("sampleTimestamps", JSON.stringify(input.sampleTimestamps));
  form.set("lang", input.lang ?? process.env.PADDLEOCR_LANG ?? "en");
  form.set("frameWidthLimit", String(input.frameWidthLimit ?? 1280));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${serviceUrl}/detect-video-text`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`PaddleOCR service ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = JSON.parse(text) as PaddleOcrServiceResponse;
    return normalizePaddleOcrResponse(json, input.durationSec);
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizePaddleOcrResponse(
  raw: PaddleOcrServiceResponse,
  durationSec: number,
): PaddleOcrDetectionResult {
  const maxDuration = Math.max(0.2, durationSec || 0.2);
  const items = Array.isArray(raw.items) ? raw.items : [];
  const normalizedItems = items
    .map((item) => normalizePaddleOcrItem(item as PaddleOcrServiceItem, maxDuration))
    .filter((item): item is RawOnScreenTextItem => Boolean(item));
  return {
    items: normalizedItems,
    warnings: stringArray(raw.warnings).slice(0, 20),
  };
}

function normalizePaddleOcrItem(
  item: PaddleOcrServiceItem,
  durationSec: number,
): RawOnScreenTextItem | null {
  const detectedText = typeof item.detectedText === "string" ? item.detectedText.trim() : "";
  if (!detectedText) return null;
  const region = normalizeRegion(item.region);
  if (!region) return null;
  const textRegions = normalizeTextRegions(item);
  const timestampSec = clampNumber(Number(item.timestampSec), 0, durationSec, 0);
  const firstSeenSec = clampNumber(Number(item.firstSeenSec), 0, durationSec, timestampSec);
  const lastSeenSec = clampNumber(Number(item.lastSeenSec), firstSeenSec, durationSec, timestampSec);
  const sampleIntervalSec = clampNumber(Number(item.sampleIntervalSec), 0.01, 3, 0.25);
  const startSec = clampNumber(
    Number(item.startSec),
    0,
    Math.max(0, durationSec - 0.1),
    Math.max(0, firstSeenSec - sampleIntervalSec / 2),
  );
  const endSec = clampNumber(
    Number(item.endSec),
    startSec + 0.2,
    durationSec,
    Math.min(durationSec, lastSeenSec + sampleIntervalSec / 2),
  );
  const confidence = clampNumber(Number(item.confidence), 0, 1, 0);
  if (confidence < 0.25) return null;

  return {
    detectedText,
    translatedText: detectedText,
    region,
    textRegions,
    timestampSec,
    startSec,
    endSec,
    confidence,
    notes: [
      `source=${typeof item.source === "string" ? item.source : "paddleocr"}`,
      `detections=${clampNumber(Number(item.detections), 1, 999, 1)}`,
      `sampleIntervalSec=${sampleIntervalSec.toFixed(3)}`,
      `sampleCount=${clampNumber(Number(item.sampleCount), 1, 9999, 1)}`,
      `firstSeenSec=${firstSeenSec.toFixed(2)}`,
      `lastSeenSec=${lastSeenSec.toFixed(2)}`,
      `maxGapSec=${clampNumber(Number(item.maxGapSec), 0.25, 9, Math.max(0.25, sampleIntervalSec * 6)).toFixed(2)}`,
    ],
  };
}

function normalizeTextRegions(item: PaddleOcrServiceItem): NormalizedTextRegion[] | undefined {
  for (const value of [item.textRegions, item.lineRegions, item.wordRegions]) {
    const regions = normalizeRegionArray(value);
    if (regions.length) return regions;
  }
  return undefined;
}

function normalizeRegionArray(value: unknown): NormalizedTextRegion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((region) => normalizeRegion(regionCandidate(region)))
    .filter((region): region is NormalizedTextRegion => Boolean(region))
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .slice(0, 48);
}

function regionCandidate(value: unknown): PaddleOcrServiceItem["region"] {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return (record.region && typeof record.region === "object"
    ? record.region
    : value) as PaddleOcrServiceItem["region"];
}

function normalizeRegion(region: PaddleOcrServiceItem["region"]): RawOnScreenTextItem["region"] | null {
  const x = Number(region?.x);
  const y = Number(region?.y);
  const w = Number(region?.w);
  const h = Number(region?.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  const clampedX = clampNumber(x, 0, 0.98, 0);
  const clampedY = clampNumber(y, 0, 0.98, 0);
  return {
    x: clampedX,
    y: clampedY,
    w: clampNumber(w, 0.01, 1 - clampedX, 0.01),
    h: clampNumber(h, 0.01, 1 - clampedY, 0.01),
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
