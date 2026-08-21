import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractJson } from "@/lib/ai/json";
import type { NormalizedTextRegion, RemixOptions, TextInpaintMaskFrame } from "./types";
import { detectOnScreenTextWithPaddleOcr, shouldUsePaddleOcr } from "./ocr-service";

const _require = createRequire(import.meta.url);
const _ffmpegPath: string | null = _require("ffmpeg-static");

function ffmpegBin(): string {
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && envPath.trim()) return envPath.trim();
  if (_ffmpegPath && _ffmpegPath.trim()) return _ffmpegPath.trim();
  return "ffmpeg";
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: "pipe" });
    let err = "";
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-500)}`));
    });
    p.on("error", reject);
  });
}

export interface OnScreenTextTranslation {
  detectedText: string;
  translatedText: string;
  region: { x: number; y: number; w: number; h: number };
  textRegions?: NormalizedTextRegion[];
  sourceMaskFrames?: TextInpaintMaskFrame[];
  textAlign?: "left" | "center" | "right";
  startSec: number;
  endSec: number;
  toneMood: string;
  styleHint?: string;
  confidence: number;
  notes: string[];
}

export interface RawOnScreenTextItem {
  id?: string;
  detectedText?: string;
  translatedText?: string;
  region?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  };
  textRegions?: unknown;
  lineRegions?: unknown;
  wordRegions?: unknown;
  maskFrames?: unknown;
  textAlign?: unknown;
  frameIndex?: number;
  timestampSec?: number;
  startSec?: number;
  endSec?: number;
  styleHint?: string;
  confidence?: number;
  notes?: unknown;
}

interface RawOnScreenTextBatchResponse {
  hasOnScreenText?: boolean;
  toneMood?: string;
  items?: unknown;
  // Backward-compatible shape, useful if a model ignores the new schema.
  detectedTexts?: unknown;
  region?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  };
  translatedText?: string;
  confidence?: number;
  notes?: unknown;
}

interface OnScreenTextDetection extends OnScreenTextTranslation {
  timestampSec: number;
}

interface TranslationRefineResponse {
  items?: Array<{
    id?: string;
    detectedText?: string;
    translatedText?: string;
    preserveOriginal?: boolean;
    entityType?: string;
    confidence?: number;
    notes?: unknown;
  }>;
}

type TranslationRefineItem = NonNullable<TranslationRefineResponse["items"]>[number];

type OnScreenTextDropReason =
  | "too_short"
  | "too_small"
  | "too_narrow"
  | "low_confidence"
  | "ocr_noise"
  | "background_like";

export interface OnScreenTextClassification {
  keep: boolean;
  reason: "caption_like" | "dominant_overlay" | "central_label" | "large_label" | "top_title" | OnScreenTextDropReason;
}

export async function translateOnScreenTextFromVideo(input: {
  videoPath: string;
  durationSec: number;
  fps?: number;
  options: RemixOptions;
  prompt?: string | null;
}): Promise<OnScreenTextTranslation[]> {
  const paddleTimestamps = buildPaddleOcrRenderSampleTimestamps(input.durationSec, input.fps);
  const visionTimestamps = buildSampleTimestamps(input.durationSec);
  let paddleFailure: string | undefined;

  if (shouldUsePaddleOcr()) {
    try {
      const result = await detectOnScreenTextWithPaddleOcr({
        videoPath: input.videoPath,
        durationSec: input.durationSec,
        sampleTimestamps: paddleTimestamps,
        lang: process.env.PADDLEOCR_LANG ?? "en",
        frameWidthLimit: Number(process.env.PADDLEOCR_FRAME_WIDTH_LIMIT ?? 1920),
      });
      const detections = result.items
        .map((item) =>
          normalizeDetection(
            item,
            "OCR local PaddleOCR; translation refined separately",
            input.durationSec,
            paddleTimestamps,
            0,
          ),
        )
        .filter((item): item is OnScreenTextDetection => Boolean(item));
      const grouped = groupOnScreenTextTracks(detections, input.durationSec);
      const refined = await refineOnScreenTextTranslations({
        translations: grouped,
        options: input.options,
        prompt: input.prompt,
      });
      const forced = await forceTranslateUntranslatedTracks({
        translations: refined,
        options: input.options,
        prompt: input.prompt,
      });
      return clampSameSlotTiming(forced, input.durationSec).slice(0, 64);
    } catch (err) {
      paddleFailure = (err as Error).message;
      console.warn(
        "detectOnScreenTextWithPaddleOcr fallback:",
        paddleFailure,
      );
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const workDir = await mkdtemp(path.join(tmpdir(), "text-translate-"));
  try {
    // Gemini is a visual fallback, not a frame-level OCR engine. Reusing the
    // dense Paddle list here can create hundreds of frames and still cannot
    // provide source polygons required by the removal stage.
    const timestamps = visionTimestamps;
    const framePaths: string[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const framePath = path.join(workDir, `frame${i}.jpg`);
      await run(ffmpegBin(), [
        "-ss", String(timestamps[i]),
        "-i", input.videoPath,
        "-frames:v", "1",
        "-q:v", "4",
        "-vf", "scale=960:-1",
        "-y", framePath,
      ]);
      framePaths.push(framePath);
    }

    const allImageParts = await Promise.all(
      framePaths.map(async (fp) => ({
        inlineData: {
          data: (await readFile(fp)).toString("base64"),
          mimeType: "image/jpeg" as const,
        },
      })),
    );

    const targetLanguage = input.options.targetLanguage === "en" ? "English" : "Vietnamese";
    const protectedTerms = input.options.protectedTerms?.length
      ? input.options.protectedTerms.join(", ")
      : "(none)";
    const hint = input.options.textOverlay?.trim()
      ? `\nUser translation/context hint: ${input.options.textOverlay.trim()}`
      : "";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_VISION_MODEL ?? "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const detections: OnScreenTextDetection[] = [];
    // batchSize tăng từ 5 lên 8 để xử lý nhiều frame hơn mỗi lần gọi API
    // (cần thiết khi interval giảm từ 2.25s xuống 1.0s)
    const batchSize = 8;
    for (let startIndex = 0; startIndex < allImageParts.length; startIndex += batchSize) {
      const batchTimestamps = timestamps.slice(startIndex, startIndex + batchSize);
      const imageParts = allImageParts.slice(startIndex, startIndex + batchSize);
      const prompt = buildBatchPrompt({
        timestamps: batchTimestamps,
        frameOffset: startIndex,
        targetLanguage,
        protectedTerms,
        durationSec: input.durationSec,
        remixPrompt: input.prompt,
        hint,
      });

      const result = await model.generateContent([prompt, ...imageParts]);
      const raw = extractJson<RawOnScreenTextBatchResponse>(result.response.text());
      if (!raw?.hasOnScreenText) continue;

      const toneMood = typeof raw.toneMood === "string" ? raw.toneMood.trim() : "";
      const rawItems = Array.isArray(raw.items) ? raw.items : [];
      for (const item of rawItems) {
        const detection = normalizeDetection(
          item as RawOnScreenTextItem,
          toneMood,
          input.durationSec,
          timestamps,
          startIndex,
        );
        if (detection) detections.push(detection);
      }

      if (rawItems.length === 0) {
        const fallback = normalizeLegacyResponse(raw, toneMood, input.durationSec, batchTimestamps[0] ?? 0);
        if (fallback) detections.push(fallback);
      }
    }

    const refined = await refineDetectedTranslations({
      detections,
      options: input.options,
      prompt: input.prompt,
    });
    const grouped = groupOnScreenTextTracks(refined, input.durationSec);
    const forced = await forceTranslateUntranslatedTracks({
      translations: grouped,
      options: input.options,
      prompt: input.prompt,
    });
    const normalized = clampSameSlotTiming(forced, input.durationSec).slice(0, 64);
    if (!shouldUsePaddleOcr() || normalized.every((track) => track.sourceMaskFrames?.length)) {
      return normalized;
    }
    return repairMissingSourceMasksWithPaddleOcr({
      videoPath: input.videoPath,
      durationSec: input.durationSec,
      translations: normalized,
      paddleFailure,
    });
  } catch (err) {
    console.warn("translateOnScreenTextFromVideo:", (err as Error).message);
    return [];
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function detectOnScreenTextLayoutFromVideo(input: {
  videoPath: string;
  durationSec: number;
  fps?: number;
  options: RemixOptions;
}): Promise<OnScreenTextTranslation[]> {
  const timestamps = shouldUsePaddleOcr()
    ? buildPaddleOcrPreflightSampleTimestamps(input.durationSec, input.fps)
    : buildSampleTimestamps(input.durationSec);

  if (!shouldUsePaddleOcr()) return [];

  const result = await detectOnScreenTextWithPaddleOcr({
    videoPath: input.videoPath,
    durationSec: input.durationSec,
    sampleTimestamps: timestamps,
    lang: process.env.PADDLEOCR_LANG ?? "en",
    frameWidthLimit: Number(process.env.PADDLEOCR_FRAME_WIDTH_LIMIT ?? 1920),
  });
  const detections = result.items
    .map((item) =>
      normalizeDetection(
        item,
        "OCR local PaddleOCR layout preflight",
        input.durationSec,
        timestamps,
        0,
      ),
    )
    .filter((item): item is OnScreenTextDetection => Boolean(item));

  return clampSameSlotTiming(
    filterForegroundOnScreenTextTracks(groupOnScreenTextTracks(detections, input.durationSec)),
    input.durationSec,
  ).slice(0, 64);
}

export async function translatePlannedOnScreenTextTracks(input: {
  tracks: OnScreenTextTranslation[];
  options: RemixOptions;
  prompt?: string | null;
  durationSec: number;
}): Promise<OnScreenTextTranslation[]> {
  const grouped = groupOnScreenTextTracks(
    input.tracks.map((track) => ({
      ...track,
      timestampSec: (track.startSec + track.endSec) / 2,
    })),
    input.durationSec,
  );
  const refined = await refineOnScreenTextTranslations({
    translations: grouped,
    options: input.options,
    prompt: input.prompt,
  });
  const forced = await forceTranslateUntranslatedTracks({
    translations: refined,
    options: input.options,
    prompt: input.prompt,
  });
  return clampSameSlotTiming(forced, input.durationSec).slice(0, 64);
}

function buildBatchPrompt(input: {
  timestamps: number[];
  frameOffset: number;
  targetLanguage: string;
  protectedTerms: string;
  durationSec: number;
  remixPrompt?: string | null;
  hint: string;
}): string {
  return `You are a senior localization editor for social videos.

Analyze these video frames in order. Sample timestamps in seconds are:
${input.timestamps.map((sec, idx) => `frame${input.frameOffset + idx}: ${sec}s`).join("\n")}

First infer the video's tone and mood from visual style, context, facial expression, typography, and foreground on-screen words. Then OCR only creator-added or viewer-facing text blocks rendered into the video image, such as title cards, meme text, sticker text, lower captions/subtitles, callouts, or prominent overlay words that appear later in the clip.

Translate each detected on-screen text into ${input.targetLanguage}. The translation must be natural, idiomatic, and faithful to the tone/mood of the original video, not word-for-word. Preserve protected terms exactly: ${input.protectedTerms}.

Do NOT translate app/player UI, watermarks, usernames, timestamps, platform chrome, environmental/background text, distant signage, banners, jersey/logos, road signs, race/event boards, or tiny labels printed on objects. Do NOT create new marketing copy if there is no foreground on-screen text.
${input.remixPrompt ? `\nRemix prompt/context: ${input.remixPrompt}` : ""}${input.hint}

Return ONLY JSON:
{
  "hasOnScreenText": true,
  "toneMood": "brief tone/mood review",
  "items": [
    {
      "id": "frame${input.frameOffset}-item0",
      "detectedText": "original visible text",
      "translatedText": "direct ${input.targetLanguage} translation of the full detectedText only",
      "region": { "x": 0.08, "y": 0.10, "w": 0.84, "h": 0.12 },
      "textRegions": [
        { "x": 0.08, "y": 0.10, "w": 0.84, "h": 0.05 },
        { "x": 0.18, "y": 0.16, "w": 0.64, "h": 0.05 }
      ],
      "frameIndex": ${input.frameOffset},
      "timestampSec": ${input.timestamps[0] ?? 0},
      "startSec": 0.0,
      "endSec": ${Math.round(input.durationSec * 10) / 10},
      "styleHint": "white uppercase meme text with black outline",
      "confidence": 0.85,
      "notes": ["translation decisions or uncertainty"]
    }
  ]
}

Rules for items:
- Return one item per distinct visual text block, not one combined translation for the whole video.
- If multiple words belong to the same label/card/caption, keep them together as one detectedText, preserving line breaks when helpful. For example "BALLS\\nFROM" must not become only "BALLS".
- When possible, include textRegions as tight normalized boxes for each visible line or word inside region. Include punctuation, quote marks, emoji/sticker speaker icons, and text outline/shadow in these boxes.
- translatedText must translate detectedText only. Never use dialogue/script context as replacement text for a visual label.
- translatedText must include every visible word from detectedText. Do not shorten, summarize, or drop speaker labels/quoted text.
- Do not keep text unchanged just because it is ALL CAPS. Translate ALL CAPS labels into the target language too.
- Keep text unchanged only when it exactly matches a protected term.
- For single-word object labels, translate the word literally and tersely; do not infer a different object/action from the scene.
- For ambiguous English words in food/object labels, prefer the visible-object meaning, not conversational filler. For example COURSE near food means a meal course, not "of course".
- Include both top text and lower/mid-screen captions if both are foreground viewer-facing overlays.
- Include a small label only when it is clearly creator-added foreground text, not background/environment signage.
- Prefer omitting uncertain tiny or distant text over creating a false replacement box.
- Do not omit text just because it is already in English.
- Use the exact frameIndex/timestampSec where this item is visible.
- If a text appears across most sampled frames, set startSec=0 and endSec=${Math.round(input.durationSec * 10) / 10}.
- If a text only appears near one sampled frame, estimate a conservative time range around that sample, usually 1.5-4 seconds.
- Region is the smallest normalized bounding rectangle that covers the original text to replace, with a small margin. x/y/w/h are 0..1 relative to the video frame.
- If you cannot determine a real region, omit that item instead of inventing a default region.`;
}

export function buildSampleTimestamps(durationSec: number): number[] {
  const duration = Math.max(1, durationSec || 1);
  // Interval giảm xuống 1.0s (từ 2.25s) để bắt text xuất hiện ngắn hơn,
  // tương tự mật độ mẫu của PaddleOCR setup.
  const interval = duration <= 60 ? 1.0 : 1.5;
  const maxFrames = duration <= 60 ? 30 : 40;
  const count = Math.min(maxFrames, Math.max(8, Math.ceil(duration / interval)));
  const step = duration / count;
  const preferred = Array.from({ length: count }, (_, idx) =>
    clamp(Math.round((step * idx + step / 2) * 10) / 10, 0.2, Math.max(0.2, duration - 0.2)),
  );
  preferred.unshift(0.5);
  preferred.push(Math.max(0.2, Math.round((duration - 0.5) * 10) / 10));
  return Array.from(new Set(preferred)).sort((a, b) => a - b).slice(0, maxFrames);
}

export function buildPaddleOcrSampleTimestamps(durationSec: number, fps?: number): number[] {
  const duration = Math.max(1, durationSec || 1);
  const boundedFps = clamp(Number.isFinite(fps ?? NaN) ? fps! : 30, 24, 60);
  const derivedInterval = 1 / boundedFps;
  const interval = Number(process.env.PADDLEOCR_SAMPLE_INTERVAL_SEC ?? derivedInterval);
  const safeInterval = Number.isFinite(interval) ? clamp(interval, 0.01, 2.5) : derivedInterval;
  const derivedMaxFrames = Math.ceil(duration / safeInterval) + 2;
  const maxFrames = Number(process.env.PADDLEOCR_MAX_SAMPLE_FRAMES ?? Math.min(duration <= 60 ? 3600 : 7200, derivedMaxFrames));
  const safeMaxFrames = Math.round(clamp(Number.isFinite(maxFrames) ? maxFrames : derivedMaxFrames, 12, 10000));
  const timestamps: number[] = [];
  for (let ts = 0.35; ts < duration - 0.2 && timestamps.length < safeMaxFrames - 1; ts += safeInterval) {
    timestamps.push(clamp(Math.round(ts * 100) / 100, 0.2, Math.max(0.2, duration - 0.2)));
  }
  timestamps.push(Math.max(0.2, Math.round((duration - 0.35) * 100) / 100));
  return Array.from(new Set(timestamps)).sort((a, b) => a - b).slice(0, safeMaxFrames);
}

/**
 * Full frame-level sampling is useful as a primitive, but is too expensive for
 * the CPU render path on medium videos. Keep evenly distributed samples so
 * short text remains detectable without routinely timing out the whole job.
 */
export function buildPaddleOcrRenderSampleTimestamps(durationSec: number, fps?: number): number[] {
  const full = buildPaddleOcrSampleTimestamps(durationSec, fps);
  const maxFrames = Math.round(clamp(
    Number(process.env.PADDLEOCR_RENDER_MAX_SAMPLE_FRAMES ?? 480),
    24,
    2400,
  ));
  return thinTimestamps(full, maxFrames);
}

function buildPaddleOcrPreflightSampleTimestamps(durationSec: number, fps?: number): number[] {
  const full = buildPaddleOcrSampleTimestamps(durationSec, fps);
  const maxFrames = Math.round(clamp(Number(process.env.PADDLEOCR_PREFLIGHT_MAX_SAMPLE_FRAMES ?? 240), 12, 1200));
  return thinTimestamps(full, maxFrames);
}

function thinTimestamps(timestamps: number[], maxFrames: number): number[] {
  if (timestamps.length <= maxFrames) return timestamps;
  if (maxFrames <= 1) return timestamps.slice(0, 1);
  const selected = Array.from({ length: maxFrames }, (_, index) => {
    const sourceIndex = Math.round(index * (timestamps.length - 1) / (maxFrames - 1));
    return timestamps[sourceIndex];
  });
  return Array.from(new Set(selected)).sort((a, b) => a - b);
}

export function buildPaddleOcrMaskRepairTimestamps(
  translations: OnScreenTextTranslation[],
  durationSec: number,
): number[] {
  const duration = Math.max(0.2, durationSec || 0.2);
  const timestamps: number[] = [];
  for (const track of translations.filter((item) => !item.sourceMaskFrames?.length)) {
    const start = clamp(track.startSec, 0, duration);
    const end = clamp(track.endSec, start, duration);
    const span = Math.max(0.2, end - start);
    const sampleCount = Math.min(6, Math.max(2, Math.ceil(span / 0.65) + 1));
    for (let index = 0; index < sampleCount; index += 1) {
      const ratio = sampleCount === 1 ? 0.5 : index / (sampleCount - 1);
      const timestamp = clamp(start + span * ratio, 0.05, Math.max(0.05, duration - 0.05));
      timestamps.push(Math.round(timestamp * 100) / 100);
    }
  }
  return Array.from(new Set(timestamps)).sort((a, b) => a - b).slice(0, 120);
}

async function repairMissingSourceMasksWithPaddleOcr(input: {
  videoPath: string;
  durationSec: number;
  translations: OnScreenTextTranslation[];
  paddleFailure?: string;
}): Promise<OnScreenTextTranslation[]> {
  const sampleTimestamps = buildPaddleOcrMaskRepairTimestamps(input.translations, input.durationSec);
  if (!sampleTimestamps.length) return input.translations;

  try {
    const result = await detectOnScreenTextWithPaddleOcr({
      videoPath: input.videoPath,
      durationSec: input.durationSec,
      sampleTimestamps,
      lang: process.env.PADDLEOCR_LANG ?? "en",
      frameWidthLimit: Number(process.env.PADDLEOCR_MASK_REPAIR_FRAME_WIDTH_LIMIT ?? 1280),
      timeoutMs: Number(process.env.PADDLEOCR_MASK_REPAIR_TIMEOUT_MS ?? 240_000),
    });
    const repairs = result.items
      .map((item) => normalizeDetection(
        item,
        "PaddleOCR targeted source-mask repair",
        input.durationSec,
        sampleTimestamps,
        0,
      ))
      .filter((item): item is OnScreenTextDetection => Boolean(item?.sourceMaskFrames?.length));

    return input.translations.map((translation) => {
      if (translation.sourceMaskFrames?.length) return translation;
      const match = bestMaskRepairMatch(translation, repairs);
      if (!match) {
        return {
          ...translation,
          notes: [...translation.notes, `maskRepair=missing${input.paddleFailure ? ` after ${input.paddleFailure}` : ""}`].slice(0, 10),
        };
      }
      return {
        ...translation,
        textRegions: match.textRegions?.length ? match.textRegions : translation.textRegions,
        sourceMaskFrames: match.sourceMaskFrames,
        notes: [...translation.notes, `maskRepair=attached:${match.sourceMaskFrames?.length ?? 0}`].slice(0, 10),
      };
    });
  } catch (err) {
    const message = (err as Error).message;
    console.warn("PaddleOCR targeted mask repair failed:", message);
    return input.translations.map((translation) => translation.sourceMaskFrames?.length
      ? translation
      : { ...translation, notes: [...translation.notes, `maskRepair=failed:${message}`].slice(0, 10) });
  }
}

function bestMaskRepairMatch(
  translation: OnScreenTextTranslation,
  candidates: OnScreenTextDetection[],
): OnScreenTextDetection | undefined {
  return candidates
    .map((candidate) => {
      const overlapStart = Math.max(translation.startSec, candidate.startSec);
      const overlapEnd = Math.min(translation.endSec, candidate.endSec);
      const temporalOverlap = Math.max(0, overlapEnd - overlapStart);
      const spatialIou = regionIou(translation.region, candidate.region);
      const distance = centerDistance(translation.region, candidate.region);
      const similarity = textSimilarity(translation.detectedText, candidate.detectedText);
      const eligible = temporalOverlap > 0 && (spatialIou >= 0.08 || distance <= 0.16);
      return {
        candidate,
        eligible,
        score: similarity * 5 + spatialIou * 4 + Math.max(0, 0.2 - distance) * 3,
      };
    })
    .filter((item) => item.eligible)
    .sort((a, b) => b.score - a.score)[0]?.candidate;
}

function normalizeDetection(
  raw: RawOnScreenTextItem,
  toneMood: string,
  durationSec: number,
  allTimestamps: number[],
  batchOffset: number,
): OnScreenTextDetection | null {
  const translatedText =
    typeof raw.translatedText === "string" ? raw.translatedText.trim() : "";
  if (!translatedText) return null;
  const region = normalizeRegion(raw.region);
  if (!region) return null;
  const textRegions = normalizeTextRegions(raw);
  const sourceMaskFrames = normalizeMaskFrames(raw.maskFrames);
  const textAlign = normalizeTextAlign(raw.textAlign) ?? inferOnScreenTextAlign(region, textRegions);

  const maxDuration = Math.max(0.2, durationSec);
  const timestamp = normalizeTimestamp(raw, allTimestamps, batchOffset, maxDuration);
  const start = clamp(
    typeof raw.startSec === "number" ? raw.startSec : Math.max(0, timestamp - 1.2),
    0,
    Math.max(0, maxDuration - 0.2),
  );
  const fallbackEnd = Math.min(maxDuration, Math.max(timestamp + 1.8, start + 1.8));
  const rawEnd =
    typeof raw.endSec === "number" && raw.endSec > start ? raw.endSec : fallbackEnd;
  const end = Math.min(maxDuration, Math.max(start + 0.2, rawEnd));

  const detectedText = typeof raw.detectedText === "string" ? raw.detectedText.trim() : translatedText;
  const normalizedTranslation = normalizeTranslatedText(
    detectedText,
    translatedText,
  ).slice(0, 260);
  if (!isPlausibleVisualTranslation(detectedText, normalizedTranslation)) return null;

  return {
    detectedText,
    translatedText: normalizedTranslation,
    region,
    textRegions,
    sourceMaskFrames,
    textAlign,
    startSec: start,
    endSec: end,
    timestampSec: timestamp,
    toneMood,
    styleHint: typeof raw.styleHint === "string" ? raw.styleHint.trim() : undefined,
    confidence: clamp(typeof raw.confidence === "number" ? raw.confidence : 0, 0, 1),
    notes: stringArray(raw.notes).slice(0, 8),
  };
}

async function refineDetectedTranslations(input: {
  detections: OnScreenTextDetection[];
  options: RemixOptions;
  prompt?: string | null;
}): Promise<OnScreenTextDetection[]> {
  if (input.detections.length === 0) return input.detections;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return input.detections.map((item) => ({
      ...item,
      translatedText: enforceTargetTranslation(
        item.detectedText,
        item.translatedText,
        input.options.targetLanguage ?? "vi",
      ),
      notes: Array.from(new Set([...item.notes, "translationFallback=missing_gemini_key"])).slice(0, 8),
    }));
  }

  const targetLanguage = input.options.targetLanguage === "en" ? "English" : "Vietnamese";
  const protectedTerms = input.options.protectedTerms?.length
    ? input.options.protectedTerms.join(", ")
    : "(none)";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_TEXT_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });
    const payload = input.detections.map((item, idx) => ({
      id: `item${idx}`,
      detectedText: item.detectedText,
      currentTranslation: item.translatedText,
      toneMood: item.toneMood,
      styleHint: item.styleHint,
      notes: item.notes,
    }));
    const prompt = `You are a meticulous localization QA editor for text burned into social videos.

Rewrite translations into ${targetLanguage}, using ONLY each item's detectedText. Do not use dialogue, subtitles, scripts, or scene guesses as replacement copy.
Preserve protected terms exactly: ${protectedTerms}.
${input.prompt ? `Video/remix context for disambiguation only: ${input.prompt}` : ""}

Return ONLY JSON:
{
  "items": [
    { "id": "item0", "detectedText": "same OCR text", "translatedText": "faithful translation", "preserveOriginal": false, "entityType": "translatable_text", "confidence": 0.9, "notes": ["short QA note"] }
  ]
}

Rules:
- Keep the number of items and ids exactly the same.
- translatedText must translate detectedText completely, including all visible words and line breaks.
- If target is Vietnamese, translatedText must be Vietnamese, not the original English, except protected terms.
- Preserve line breaks when the original has multiple visual lines.
- Never replace a short visual label with a sentence from the voiceover.
- Do not keep text unchanged just because it is ALL CAPS.
- If the text is a proper noun or title that should stay original in context, set preserveOriginal=true and keep translatedText equal to detectedText.
- Use entityType values such as proper_noun, title, brand, username, place, mixed, translatable_text.
- Keep text unchanged when it is a protected term, or when it is clearly a proper noun/title/brand in context.
- Single-word labels must stay terse. If the word is ambiguous, use the visual label/object meaning.

Items:
${JSON.stringify(payload)}`;
    const result = await model.generateContent(prompt);
    const raw = extractJson<TranslationRefineResponse>(result.response.text());
    const byId = new Map((raw?.items ?? []).map((item) => [item.id, item]));

    return input.detections.map((item, idx) => {
      const refined = byId.get(`item${idx}`);
      const preserveOriginal = shouldPreserveOriginalText(refined);
      const translatedText =
        preserveOriginal
          ? item.detectedText
          : typeof refined?.translatedText === "string" && refined.translatedText.trim()
          ? enforceTargetTranslation(
              item.detectedText,
              normalizeTranslatedText(item.detectedText, refined.translatedText.trim()),
              input.options.targetLanguage ?? "vi",
            ).slice(0, 260)
          : enforceTargetTranslation(
              item.detectedText,
              item.translatedText,
              input.options.targetLanguage ?? "vi",
            ).slice(0, 260);
      if (!isPlausibleVisualTranslation(item.detectedText, translatedText)) return item;
      return {
        ...item,
        translatedText,
        confidence: clamp(
          Math.max(item.confidence, typeof refined?.confidence === "number" ? refined.confidence : item.confidence),
          0,
          1,
        ),
        notes: Array.from(new Set([...item.notes, ...stringArray(refined?.notes)])).slice(0, 8),
      };
    });
  } catch (err) {
    console.warn("refineDetectedTranslations:", (err as Error).message);
    return input.detections;
  }
}

async function refineOnScreenTextTranslations(input: {
  translations: OnScreenTextTranslation[];
  options: RemixOptions;
  prompt?: string | null;
}): Promise<OnScreenTextTranslation[]> {
  if (input.translations.length === 0) return input.translations;
  const asDetections: OnScreenTextDetection[] = input.translations.map((item) => ({
    ...item,
    timestampSec: (item.startSec + item.endSec) / 2,
  }));
  const refined: OnScreenTextDetection[] = [];
  const batchSize = 12;
  for (let idx = 0; idx < asDetections.length; idx += batchSize) {
    refined.push(
      ...(await refineDetectedTranslations({
        detections: asDetections.slice(idx, idx + batchSize),
        options: input.options,
        prompt: input.prompt,
      })),
    );
  }
  return refined.map(({ timestampSec: _timestampSec, ...item }) => item);
}

async function forceTranslateUntranslatedTracks(input: {
  translations: OnScreenTextTranslation[];
  options: RemixOptions;
  prompt?: string | null;
}): Promise<OnScreenTextTranslation[]> {
  if (input.options.targetLanguage === "en") return input.translations;

  const locallyFixed = input.translations.map((item) => {
    const translatedText = enforceTargetTranslation(
      item.detectedText,
      item.translatedText,
      input.options.targetLanguage ?? "vi",
    );
    return translatedText === item.translatedText ? item : { ...item, translatedText };
  });
  const pending = locallyFixed.filter((item) =>
    translationLooksUntranslated(item.detectedText, item.translatedText),
  );
  if (pending.length === 0) return locallyFixed;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return locallyFixed.map((item) =>
      pending.includes(item)
        ? {
            ...item,
            notes: Array.from(new Set([...item.notes, "translationStillUntranslated=missing_gemini_key"])).slice(0, 8),
          }
        : item,
    );
  }

  const protectedTerms = input.options.protectedTerms?.length
    ? input.options.protectedTerms.join(", ")
    : "(none)";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_TEXT_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });
    const payload = pending.map((item, idx) => ({
      id: `force${idx}`,
      detectedText: item.detectedText,
      currentTranslation: item.translatedText,
      visualSlot: item.region,
      styleHint: item.styleHint,
    }));
    const prompt = `You are fixing untranslated burned-in video captions.

Translate EVERY item into Vietnamese. Use only detectedText. Do not leave ALL CAPS, short labels, names, or English words unchanged unless the whole text exactly matches a protected term.
Preserve protected terms exactly: ${protectedTerms}.
${input.prompt ? `Video/remix context for disambiguation only: ${input.prompt}` : ""}

Return ONLY JSON:
{
  "items": [
    { "id": "force0", "translatedText": "Vietnamese translation", "preserveOriginal": false, "entityType": "translatable_text", "confidence": 0.9, "notes": ["why"] }
  ]
}

Rules:
- Keep ids exactly the same.
- Translate all visible words completely, including multi-line text.
- Preserve line breaks when detectedText has line breaks.
- If detectedText is clearly a proper noun, title, person name, brand, team, place, or username in context, set preserveOriginal=true and keep the original text unchanged.
- Single-word labels should be terse Vietnamese labels.
- Food/object labels use object meaning. COURSE near food means "món", not "tất nhiên".

Items:
${JSON.stringify(payload)}`;
    const result = await model.generateContent(prompt);
    const raw = extractJson<TranslationRefineResponse>(result.response.text());
    const byId = new Map((raw?.items ?? []).map((item) => [item.id, item]));

    return locallyFixed.map((item) => {
      const pendingIdx = pending.indexOf(item);
      if (pendingIdx < 0) return item;
      const refined = byId.get(`force${pendingIdx}`);
      const preserveOriginal = shouldPreserveOriginalText(refined);
      const candidate =
        preserveOriginal
          ? item.detectedText
          : typeof refined?.translatedText === "string" && refined.translatedText.trim()
          ? normalizeTranslatedText(item.detectedText, refined.translatedText.trim()).slice(0, 260)
          : item.translatedText;
      const translatedText = enforceTargetTranslation(
        item.detectedText,
        candidate,
        input.options.targetLanguage ?? "vi",
      );
      const stillUntranslated = !preserveOriginal && translationLooksUntranslated(item.detectedText, translatedText);
      if (stillUntranslated || !isPlausibleVisualTranslation(item.detectedText, translatedText)) {
        return {
          ...item,
          notes: Array.from(new Set([...item.notes, "translationStillUntranslated=force_retry_failed"])).slice(0, 8),
        };
      }
      return {
        ...item,
        translatedText,
        confidence: clamp(
          Math.max(item.confidence, typeof refined?.confidence === "number" ? refined.confidence : item.confidence),
          0,
          1,
        ),
        notes: Array.from(new Set([...item.notes, "translationForceRetry=applied", ...stringArray(refined?.notes)])).slice(0, 8),
      };
    });
  } catch (err) {
    console.warn("forceTranslateUntranslatedTracks:", (err as Error).message);
    return locallyFixed;
  }
}

function normalizeLegacyResponse(
  raw: RawOnScreenTextBatchResponse,
  toneMood: string,
  durationSec: number,
  timestampSec: number,
): OnScreenTextDetection | null {
  return normalizeDetection(
    {
      detectedText: stringArray(raw.detectedTexts)[0],
      translatedText: raw.translatedText,
      region: raw.region,
      timestampSec,
      confidence: raw.confidence,
      notes: raw.notes,
    },
    toneMood,
    durationSec,
    [timestampSec],
    0,
  );
}

function normalizeTimestamp(
  raw: RawOnScreenTextItem,
  allTimestamps: number[],
  batchOffset: number,
  durationSec: number,
): number {
  if (typeof raw.timestampSec === "number" && Number.isFinite(raw.timestampSec)) {
    return clamp(raw.timestampSec, 0, durationSec);
  }
  if (typeof raw.frameIndex === "number" && Number.isFinite(raw.frameIndex)) {
    return allTimestamps[Math.round(raw.frameIndex)] ?? allTimestamps[batchOffset] ?? 0;
  }
  return allTimestamps[batchOffset] ?? 0;
}

export function groupOnScreenTextTracks(
  detections: OnScreenTextDetection[],
  durationSec: number,
): OnScreenTextTranslation[] {
  const sorted = detections
    .filter((item) => item.translatedText && item.region)
    .sort((a, b) => a.timestampSec - b.timestampSec || a.region.y - b.region.y);
  const tracks: OnScreenTextDetection[][] = [];

  for (const detection of sorted) {
    const track = tracks.find((candidate) => shouldJoinTrack(candidate, detection));
    if (track) track.push(detection);
    else tracks.push([detection]);
  }

  const merged = tracks
    .map((track) => mergeTrack(track, durationSec))
    .filter((track) => track.confidence >= 0.25)
    .sort((a, b) => a.startSec - b.startSec || a.region.y - b.region.y);
  return resolveTrackConflicts(merged);
}

export function filterForegroundOnScreenTextTracks<T extends OnScreenTextTranslation>(tracks: T[]): T[] {
  const summary = summarizeOnScreenTextFilter(tracks);
  return tracks
    .map((track, idx) => {
      const classification = summary.classifications[idx];
      if (!classification?.keep) return null;
      return {
        ...track,
        notes: Array.from(new Set([
          ...track.notes,
          `foreground=${classification.reason}`,
          `ocrFilter=kept:${summary.kept},dropped:${summary.dropped}`,
          ...Object.entries(summary.dropReasons).map(([reason, count]) => `drop_${reason}=${count}`),
        ])).slice(0, 12),
      };
    })
    .filter((track): track is T => Boolean(track));
}

export function summarizeOnScreenTextFilter<T extends OnScreenTextTranslation>(tracks: T[]): {
  total: number;
  kept: number;
  dropped: number;
  dropReasons: Record<OnScreenTextDropReason, number>;
  classifications: OnScreenTextClassification[];
} {
  const classifications = tracks.map(classifyOnScreenTextTrack);
  const dropReasons = {
    too_short: 0,
    too_small: 0,
    too_narrow: 0,
    low_confidence: 0,
    ocr_noise: 0,
    background_like: 0,
  } satisfies Record<OnScreenTextDropReason, number>;
  classifications.forEach((classification) => {
    if (!classification.keep && classification.reason in dropReasons) {
      dropReasons[classification.reason as OnScreenTextDropReason] += 1;
    }
  });
  const kept = classifications.filter((item) => item.keep).length;
  return {
    total: tracks.length,
    kept,
    dropped: tracks.length - kept,
    dropReasons,
    classifications,
  };
}

export function classifyOnScreenTextTrack(track: OnScreenTextTranslation): OnScreenTextClassification {
  const area = track.region.w * track.region.h;
  const centerX = track.region.x + track.region.w / 2;
  const centerY = track.region.y + track.region.h / 2;
  const words = track.detectedText.split(/\s+/).filter(Boolean).length;
  const normalizedLength = normalizedText(track.detectedText).length;
  const detections = onScreenTextDetectionCount(track);

  if (!/[a-zA-ZÀ-ỹ]/.test(track.detectedText) || /^[\d\s.:-]+$/.test(track.detectedText.trim())) {
    return { keep: false, reason: "ocr_noise" };
  }
  if (area < 0.0016 || track.region.h < 0.018) return { keep: false, reason: "too_small" };
  if (track.region.w < 0.075) return { keep: false, reason: "too_narrow" };
  if (detections < 2 && track.confidence < 0.58) return { keep: false, reason: "low_confidence" };

  const shortProminentOverlay =
    normalizedLength <= 3 &&
    track.region.w >= 0.1 &&
    track.region.h >= 0.04 &&
    area >= 0.006 &&
    (detections >= 2 || track.confidence >= 0.72);
  if (shortProminentOverlay) return { keep: true, reason: "dominant_overlay" };

  if (normalizedLength <= 2) return { keep: false, reason: "too_short" };

  const captionLike =
    words >= 4 &&
    track.region.w >= 0.24 &&
    track.region.h >= 0.018 &&
    centerY >= 0.42 &&
    centerY <= 0.90;
  if (captionLike) return { keep: true, reason: "caption_like" };

  const topTitle =
    words <= 3 &&
    normalizedLength >= 5 &&
    centerY <= 0.2 &&
    track.region.w >= 0.16 &&
    track.region.h >= 0.026 &&
    area >= 0.0042 &&
    (detections >= 2 || track.confidence >= 0.72);
  if (topTitle) return { keep: true, reason: "top_title" };

  const dominantOverlay =
    track.region.w >= 0.18 &&
    track.region.h >= 0.04 &&
    area >= 0.008;
  if (dominantOverlay) return { keep: true, reason: "dominant_overlay" };

  const centralLabel =
    words >= 2 &&
    centerX >= 0.18 &&
    centerX <= 0.82 &&
    centerY >= 0.18 &&
    centerY <= 0.86 &&
    track.region.w >= 0.16 &&
    track.region.h >= 0.026 &&
    area >= 0.0048 &&
    (detections >= 2 || track.confidence >= 0.68);
  if (centralLabel) return { keep: true, reason: "central_label" };

  const largeLabel =
    words <= 3 &&
    normalizedLength >= 5 &&
    track.region.w >= 0.18 &&
    track.region.h >= 0.04 &&
    area >= 0.0065 &&
    (detections >= 2 || track.confidence >= 0.72);
  if (largeLabel) return { keep: true, reason: "large_label" };

  return { keep: false, reason: words <= 2 ? "background_like" : "too_small" };
}

function onScreenTextDetectionCount(track: OnScreenTextTranslation): number {
  const note = track.notes.find((item) => item.startsWith("detections="));
  const count = Number(note?.split("=")[1]);
  return Number.isFinite(count) ? Math.max(1, count) : 1;
}

function shouldJoinTrack(track: OnScreenTextDetection[], detection: OnScreenTextDetection): boolean {
  const last = track[track.length - 1];
  const textSimilar = textSimilarity(last.detectedText, detection.detectedText) >= 0.78;
  const translatedSimilar = textSimilarity(last.translatedText, detection.translatedText) >= 0.78;
  const spatiallyClose = regionIou(last.region, detection.region) >= 0.35 || centerDistance(last.region, detection.region) <= 0.10;
  const temporallyClose = detection.timestampSec - last.timestampSec <= maxTrackGapSec([last, detection]);
  return spatiallyClose && temporallyClose && (textSimilar || translatedSimilar);
}

function maxTrackGapSec(items: Array<Pick<OnScreenTextDetection, "notes">>): number {
  const explicit = items
    .map((item): number | null => {
      const note = item.notes.find((entry) => entry.startsWith("maxGapSec="));
      const value = Number(note?.split("=")[1]);
      return Number.isFinite(value) ? value : null;
    })
    .filter((value): value is number => value !== null);
  if (explicit.length > 0) return Math.max(...explicit);
  return 2.5;
}

function mergeTrack(track: OnScreenTextDetection[], durationSec: number): OnScreenTextTranslation {
  const sorted = [...track].sort((a, b) => a.timestampSec - b.timestampSec);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Timing: dùng startSec/endSec thực từ OCR nếu có, fallback chỉ ±0.3s quanh timestamp
  // (thay vì ±1.1/1.6s cũ gây text xuất hiện quá sớm/muộn)
  const rawStarts = sorted.map((item) => item.startSec);
  const rawEnds = sorted.map((item) => item.endSec);
  const hasExplicitTiming = sorted.some((item) => item.startSec < item.timestampSec - 0.05);
  const startSec = hasExplicitTiming
    ? Math.max(0, Math.min(...rawStarts))
    : Math.max(0, first.timestampSec - 0.3);
  const endSec = hasExplicitTiming
    ? Math.min(Math.max(0.2, durationSec), Math.max(...rawEnds))
    : Math.min(Math.max(0.2, durationSec), last.timestampSec + 0.3);

  const representative = bestTextDetection(sorted);
  const detectedText = representative.detectedText;
  const translatedText = normalizeTranslatedText(
    detectedText,
    representative.translatedText,
  ).slice(0, 260);

  // Dùng unionRegion để đảm bảo blur bao trùm toàn bộ vùng text thực tế
  const region = unionRegion(sorted.map((item) => item.region));
  const textRegions = mergeTextRegions(sorted, region);
  const sourceMaskFrames = mergeMaskFrames(sorted);
  const textAlign = mostCommonTextAlign(sorted.map((item) => item.textAlign)) ?? inferOnScreenTextAlign(region, textRegions);

  return {
    detectedText,
    translatedText,
    region,
    textRegions,
    sourceMaskFrames,
    textAlign,
    startSec,
    endSec: Math.max(startSec + 0.3, endSec),
    toneMood: first.toneMood,
    styleHint: first.styleHint,
    confidence: Math.round((sorted.reduce((sum, item) => sum + item.confidence, 0) / sorted.length) * 100) / 100,
    notes: Array.from(new Set([
      `detections=${sorted.length}`,
      ...sorted.flatMap((item) => item.notes),
    ])).slice(0, 8),
  };
}

function bestTextDetection(items: OnScreenTextDetection[]): OnScreenTextDetection {
  return [...items].sort((a, b) => representativeScore(b) - representativeScore(a))[0] ?? items[0];
}

function representativeScore(item: OnScreenTextDetection): number {
  const words = item.detectedText.split(/\s+/).filter(Boolean).length;
  const normalizedLength = normalizedText(item.detectedText).length;
  const lines = item.detectedText.split(/\n+/).filter(Boolean).length;
  return normalizedLength * 1.2 + words * 5 + lines * 3 + item.confidence * 4;
}

function resolveTrackConflicts(tracks: OnScreenTextTranslation[]): OnScreenTextTranslation[] {
  const accepted: OnScreenTextTranslation[] = [];
  const candidates = [...tracks].sort((a, b) => trackScore(b) - trackScore(a));

  for (const candidate of candidates) {
    const conflict = accepted.find((track) => tracksConflict(track, candidate));
    if (!conflict) {
      accepted.push(candidate);
      continue;
    }
    if (trackScore(candidate) > trackScore(conflict)) {
      const idx = accepted.indexOf(conflict);
      accepted[idx] = candidate;
    }
  }

  return accepted.sort((a, b) => a.startSec - b.startSec || a.region.y - b.region.y);
}

export function clampSameSlotTiming(
  tracks: OnScreenTextTranslation[],
  durationSec: number,
): OnScreenTextTranslation[] {
  const maxDuration = Math.max(0.2, durationSec || 0.2);
  const sorted = tracks
    .map((track) => ({ ...track }))
    .sort((a, b) => a.startSec - b.startSec || a.region.y - b.region.y);

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const current = sorted[i];
      const next = sorted[j];
      if (next.startSec >= current.endSec) continue;
      // OCR lines from the same frame can be close enough to look like one
      // visual slot while still being distinct, simultaneous captions. Only
      // clamp genuinely sequential replacements.
      if (Math.abs(next.startSec - current.startSec) <= 0.12) continue;
      if (!sameVisualSlot(current.region, next.region)) continue;
      if (textSimilarity(current.detectedText, next.detectedText) >= 0.78) continue;
      const boundary = clamp(next.startSec - 0.05, current.startSec + 0.25, maxDuration);
      current.endSec = Math.min(current.endSec, boundary);
    }
  }

  return sorted
    .map((track) => ({
      ...track,
      startSec: clamp(track.startSec, 0, Math.max(0, maxDuration - 0.2)),
      endSec: clamp(Math.max(track.startSec + 0.2, track.endSec), 0.2, maxDuration),
    }))
    .filter((track) => track.endSec - track.startSec >= 0.2);
}

function sameVisualSlot(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return regionIou(a, b) >= 0.18 || centerDistance(a, b) <= 0.12;
}

function tracksConflict(a: OnScreenTextTranslation, b: OnScreenTextTranslation): boolean {
  const sameSlot = regionIou(a.region, b.region) >= 0.28 || centerDistance(a.region, b.region) <= 0.1;
  const timeOverlap = timeOverlapRatio(a, b) >= 0.18;
  if (!sameSlot || !timeOverlap) return false;
  const sameMeaning =
    textSimilarity(a.detectedText, b.detectedText) >= 0.5 ||
    textSimilarity(a.translatedText, b.translatedText) >= 0.5 ||
    textContainsMeaning(a.detectedText, b.detectedText) ||
    textContainsMeaning(a.translatedText, b.translatedText);
  if (!sameMeaning) return false;
  const nested = regionContains(a.region, b.region) || regionContains(b.region, a.region);
  return nested || regionIou(a.region, b.region) >= 0.45;
}

function trackScore(track: OnScreenTextTranslation): number {
  const detectionNote = track.notes.find((note) => note.startsWith("detections="));
  const detections = Number(detectionNote?.split("=")[1] ?? 1);
  const duration = Math.max(0.1, track.endSec - track.startSec);
  const area = track.region.w * track.region.h;
  const narrowPenalty = track.region.w < 0.16 ? 3 : 0;
  const tinyPenalty = area < 0.006 ? 4 : 0;
  const classification = classifyOnScreenTextTrack(track);
  const foregroundBonus = classification.keep ? 4 : -6;
  const textCompleteness = Math.min(normalizedText(track.detectedText).length, 40) * 0.12;
  return (
    track.confidence * 10 +
    Math.min(detections, 4) * 0.8 +
    Math.min(duration, 8) * 0.25 +
    textCompleteness +
    foregroundBonus -
    narrowPenalty -
    tinyPenalty +
    Math.min(area, 0.04) * 18
  );
}

function normalizeTranslatedText(detectedText: string, translatedText: string): string {
  const detected = detectedText.trim();
  const translated = translatedText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();
  const literal = literalVietnameseVisualLabel(detected);
  if (
    literal &&
    (translationLooksWrongForLiteralLabel(translated, literal) ||
      translationLooksUntranslated(detected, translated))
  ) {
    return literal;
  }
  return translated;
}

function enforceTargetTranslation(
  detectedText: string,
  translatedText: string,
  targetLanguage: RemixOptions["targetLanguage"],
): string {
  if (targetLanguage === "en") return translatedText;
  const literal = literalVietnameseVisualLabel(detectedText);
  if (literal && translationLooksUntranslated(detectedText, translatedText)) return literal;
  return translatedText;
}

function shouldPreserveOriginalText(
  refined: TranslationRefineItem | undefined,
): boolean {
  if (!refined) return false;
  if (refined.preserveOriginal === true) return true;
  const entityType = typeof refined.entityType === "string" ? refined.entityType.trim().toLowerCase() : "";
  return ["proper_noun", "title", "brand", "username", "place", "person", "team"].includes(entityType);
}

function literalVietnameseVisualLabel(text: string): string | null {
  const key = normalizedText(text);
  const map: Record<string, string> = {
    abadhelper: "Một trợ thủ tệ",
    badhelper: "Trợ thủ tệ",
    balls: "Những quả bóng",
    ballsfrom: "Những quả bóng\nTừ",
    butter: "Bơ",
    butterballs: "Bóng bơ",
    from: "Từ",
    course: "Món",
    courses: "Các món",
    dish: "Món ăn",
    dishes: "Các món ăn",
    meal: "Bữa ăn",
    delicious: "Ngon tuyệt",
    helper: "Trợ thủ",
    source: "Nguồn",
  };
  if (map[key]) return map[key];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    const translatedLines = lines.map((line) => map[normalizedText(line)]);
    if (translatedLines.every(Boolean)) return translatedLines.join("\n");
  }
  return null;
}

function translationLooksWrongForLiteralLabel(translated: string, literal: string): boolean {
  const wrongReadings = new Set(["tatnhien", "khoahoc"]);
  const normalized = normalizedText(translated);
  return wrongReadings.has(normalized) && normalized !== normalizedText(literal);
}

function translationLooksUntranslated(detectedText: string, translatedText: string): boolean {
  const detected = normalizedText(detectedText);
  const translated = normalizedText(translatedText);
  if (!detected || !translated) return false;
  return detected === translated || translated.includes(detected);
}

function textContainsMeaning(a: string, b: string): boolean {
  const left = normalizedText(a);
  const right = normalizedText(b);
  if (left.length < 3 || right.length < 3 || left === right) return false;
  return left.includes(right) || right.includes(left);
}

function isPlausibleVisualTranslation(detectedText: string, translatedText: string): boolean {
  const detectedWords = detectedText.split(/\s+/).filter(Boolean).length;
  const translatedWords = translatedText.split(/\s+/).filter(Boolean).length;
  if (detectedWords <= 2 && translatedWords > 6) return false;
  if (detectedText.length <= 16 && translatedText.length > Math.max(48, detectedText.length * 5)) return false;
  return true;
}

function normalizedText(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

function textSimilarity(a: string, b: string): number {
  const left = normalizedText(a);
  const right = normalizedText(b);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length >= 5 && right.length >= 5 && (left.includes(right) || right.includes(left))) return 0.86;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, idx) => idx);
  for (let i = 1; i <= a.length; i++) {
    let last = i - 1;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      last = tmp;
    }
  }
  return prev[b.length];
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, { value: string; count: number }>();
  for (const value of values.filter(Boolean)) {
    const key = normalizedText(value);
    const current = counts.get(key);
    counts.set(key, { value, count: (current?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.value ?? values[0] ?? "";
}

function unionRegion(regions: Array<{ x: number; y: number; w: number; h: number }>) {
  const left = Math.min(...regions.map((region) => region.x));
  const top = Math.min(...regions.map((region) => region.y));
  const right = Math.max(...regions.map((region) => region.x + region.w));
  const bottom = Math.max(...regions.map((region) => region.y + region.h));
  return {
    x: clamp(left, 0, 0.98),
    y: clamp(top, 0, 0.98),
    w: clamp(right - left, 0.02, 1 - left),
    h: clamp(bottom - top, 0.02, 1 - top),
  };
}

function normalizeTextRegions(raw: RawOnScreenTextItem): NormalizedTextRegion[] | undefined {
  const candidates = [raw.textRegions, raw.lineRegions, raw.wordRegions];
  for (const candidate of candidates) {
    const regions = normalizeRegionArray(candidate);
    if (regions.length) return regions;
  }
  return undefined;
}

function normalizeMaskFrames(value: unknown): TextInpaintMaskFrame[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const frames = value
    .map((item): TextInpaintMaskFrame | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const timestampSec = Number(record.timestampSec);
      const regions = normalizeRegionArray(record.regions);
      if (!Number.isFinite(timestampSec) || !regions.length) return null;
      const polygons = normalizeMaskPolygons(record.polygons);
      return {
        timestampSec: Math.max(0, timestampSec),
        regions,
        ...(polygons ? { polygons } : {}),
      };
    })
    .filter((item): item is TextInpaintMaskFrame => Boolean(item))
    .sort((a, b) => a.timestampSec - b.timestampSec)
    .slice(0, 512);
  return frames.length ? frames : undefined;
}

function normalizeMaskPolygons(value: unknown): Array<Array<{ x: number; y: number }>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const polygons = value
    .map((polygon) => Array.isArray(polygon)
      ? polygon
          .map((point) => {
            if (!point || typeof point !== "object") return null;
            const record = point as Record<string, unknown>;
            const x = Number(record.x);
            const y = Number(record.y);
            return Number.isFinite(x) && Number.isFinite(y)
              ? { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
              : null;
          })
          .filter((point): point is { x: number; y: number } => Boolean(point))
      : [])
    .filter((polygon) => polygon.length >= 3)
    .slice(0, 48);
  return polygons.length ? polygons : undefined;
}

function mergeMaskFrames(detections: OnScreenTextDetection[]): TextInpaintMaskFrame[] | undefined {
  const frames = detections.flatMap((item) => item.sourceMaskFrames ?? []);
  if (!frames.length) return undefined;
  const merged = new Map<number, TextInpaintMaskFrame>();
  for (const frame of frames) {
    const key = Math.round(frame.timestampSec * 100) / 100;
    const previous = merged.get(key);
    merged.set(key, {
      timestampSec: key,
      regions: previous ? [...previous.regions, ...frame.regions] : [...frame.regions],
      polygons: [...(previous?.polygons ?? []), ...(frame.polygons ?? [])],
    });
  }
  return [...merged.values()].sort((a, b) => a.timestampSec - b.timestampSec).slice(0, 512);
}

function normalizeRegionArray(value: unknown): NormalizedTextRegion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeRegion(regionCandidate(item)))
    .filter((item): item is NormalizedTextRegion => Boolean(item))
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .slice(0, 24);
}

function regionCandidate(value: unknown): RawOnScreenTextItem["region"] {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return (record.region && typeof record.region === "object"
    ? record.region
    : value) as RawOnScreenTextItem["region"];
}

function mergeTextRegions(
  detections: OnScreenTextDetection[],
  fallbackRegion: NormalizedTextRegion,
): NormalizedTextRegion[] | undefined {
  const regionSets = detections
    .map((item) => (item.textRegions?.length ? item.textRegions : [item.region]))
    .filter((items) => items.length);
  if (!regionSets.length) return undefined;
  const maxRegions = Math.max(...regionSets.map((items) => items.length));
  if (maxRegions <= 1) return [fallbackRegion];

  const merged: NormalizedTextRegion[] = [];
  for (let index = 0; index < maxRegions; index += 1) {
    const byIndex = regionSets
      .map((items) => items[index])
      .filter((item): item is NormalizedTextRegion => Boolean(item));
    if (byIndex.length) merged.push(unionRegion(byIndex));
  }
  return merged.length ? merged.slice(0, 24) : undefined;
}

function normalizeTextAlign(value: unknown): "left" | "center" | "right" | undefined {
  return value === "left" || value === "center" || value === "right" ? value : undefined;
}

function mostCommonTextAlign(
  values: Array<"left" | "center" | "right" | undefined>,
): "left" | "center" | "right" | undefined {
  const counts = new Map<"left" | "center" | "right", number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function inferOnScreenTextAlign(
  region: { x: number; y: number; w: number; h: number },
  textRegions?: Array<{ x: number; y: number; w: number; h: number }>,
): "left" | "center" | "right" {
  const lines = (textRegions ?? []).filter((item) =>
    Number.isFinite(item.x) &&
    Number.isFinite(item.w) &&
    item.w > 0 &&
    item.h > 0,
  );
  if (lines.length >= 2 && region.w > 0) {
    const lefts = lines.map((item) => (item.x - region.x) / region.w);
    const rights = lines.map((item) => (region.x + region.w - (item.x + item.w)) / region.w);
    const centers = lines.map((item) => (item.x + item.w / 2 - (region.x + region.w / 2)) / region.w);
    const leftSpread = averageAbsDeviation(lefts);
    const rightSpread = averageAbsDeviation(rights);
    const centerSpread = averageAbsDeviation(centers);
    const avgLeft = average(lefts);
    const avgRight = average(rights);
    const avgCenterAbs = Math.abs(average(centers));

    if (avgCenterAbs <= 0.08 && centerSpread <= Math.min(leftSpread, rightSpread) * 1.08) {
      return "center";
    }
    if (avgLeft + 0.06 < avgRight || leftSpread < rightSpread * 0.85) return "left";
    if (avgRight + 0.06 < avgLeft || rightSpread < leftSpread * 0.85) return "right";
    return "center";
  }

  const centerX = region.x + region.w / 2;
  if (centerX < 0.38) return "left";
  if (centerX > 0.62) return "right";
  return "center";
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function averageAbsDeviation(values: number[]): number {
  const mean = average(values);
  return average(values.map((value) => Math.abs(value - mean)));
}

function medianRegion(regions: Array<{ x: number; y: number; w: number; h: number }>) {
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  const base = {
    x: median(regions.map((region) => region.x)),
    y: median(regions.map((region) => region.y)),
    w: median(regions.map((region) => region.w)),
    h: median(regions.map((region) => region.h)),
  };
  const union = unionRegion(regions);
  return {
    x: clamp(Math.min(base.x, union.x), 0, 0.98),
    y: clamp(Math.min(base.y, union.y), 0, 0.98),
    w: clamp(Math.max(base.w, union.w * 0.72), 0.02, 1 - Math.min(base.x, union.x)),
    h: clamp(Math.max(base.h, union.h * 0.72), 0.02, 1 - Math.min(base.y, union.y)),
  };
}

function regionIou(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.w * a.h + b.w * b.h - intersection;
  return union > 0 ? intersection / union : 0;
}

function regionContains(
  outer: { x: number; y: number; w: number; h: number },
  inner: { x: number; y: number; w: number; h: number },
): boolean {
  const tolerance = 0.015;
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.w <= outer.x + outer.w + tolerance &&
    inner.y + inner.h <= outer.y + outer.h + tolerance
  );
}

function centerDistance(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  return Math.hypot(ax - bx, ay - by);
}

function timeOverlapRatio(
  a: { startSec: number; endSec: number },
  b: { startSec: number; endSec: number },
): number {
  const overlap = Math.max(0, Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec));
  const shorter = Math.max(0.1, Math.min(a.endSec - a.startSec, b.endSec - b.startSec));
  return overlap / shorter;
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function normalizeRegion(raw: RawOnScreenTextItem["region"]): OnScreenTextTranslation["region"] | null {
  if (
    typeof raw?.x !== "number" ||
    typeof raw.y !== "number" ||
    typeof raw.w !== "number" ||
    typeof raw.h !== "number"
  ) {
    return null;
  }
  const x = clamp(raw.x, 0, 0.98);
  const y = clamp(raw.y, 0, 0.98);
  const w = clamp(raw.w, 0.02, 1);
  const h = clamp(raw.h, 0.02, 0.5);
  return {
    x,
    y,
    w: Math.min(w, 1 - x),
    h: Math.min(h, 1 - y),
  };
}
