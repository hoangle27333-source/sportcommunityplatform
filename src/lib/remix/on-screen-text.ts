import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractJson } from "@/lib/ai/json";
import type { RemixOptions } from "./types";
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
    confidence?: number;
    notes?: unknown;
  }>;
}

export async function translateOnScreenTextFromVideo(input: {
  videoPath: string;
  durationSec: number;
  fps?: number;
  options: RemixOptions;
  prompt?: string | null;
}): Promise<OnScreenTextTranslation[]> {
  const timestamps = shouldUsePaddleOcr()
    ? buildPaddleOcrSampleTimestamps(input.durationSec, input.fps)
    : buildSampleTimestamps(input.durationSec);

  if (shouldUsePaddleOcr()) {
    try {
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
            "OCR local PaddleOCR; translation refined separately",
            input.durationSec,
            timestamps,
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
      console.warn(
        "detectOnScreenTextWithPaddleOcr fallback:",
        (err as Error).message,
      );
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const workDir = await mkdtemp(path.join(tmpdir(), "text-translate-"));
  try {
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
    return clampSameSlotTiming(forced, input.durationSec).slice(0, 64);
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
    ? buildPaddleOcrSampleTimestamps(input.durationSec, input.fps)
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

  return clampSameSlotTiming(groupOnScreenTextTracks(detections, input.durationSec), input.durationSec).slice(0, 64);
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

First infer the video's tone and mood from visual style, context, facial expression, typography, and any visible on-screen words. Then OCR every distinct text block that is actually rendered into the video image, such as title cards, meme text, stickers, labels, lower captions, callouts, or words that appear later in the clip.

Translate each detected on-screen text into ${input.targetLanguage}. The translation must be natural, idiomatic, and faithful to the tone/mood of the original video, not word-for-word. Preserve protected terms exactly: ${input.protectedTerms}.

Do NOT translate app/player UI, watermarks, usernames, timestamps, or platform chrome. Do NOT create new marketing copy if there is no on-screen text.
${input.remixPrompt ? `\nRemix prompt/context: ${input.remixPrompt}` : ""}${input.hint}

Return ONLY JSON:
{
  "hasOnScreenText": true,
  "toneMood": "brief tone/mood review",
  "items": [
    {
      "id": "frame${input.frameOffset}-item0",
      "detectedText": "original visible text",
      "translatedText": "direct ${input.targetLanguage} translation of detectedText only, max 2 lines",
      "region": { "x": 0.08, "y": 0.10, "w": 0.84, "h": 0.12 },
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
- translatedText must translate detectedText only. Never use dialogue/script context as replacement text for a visual label.
- Do not keep text unchanged just because it is ALL CAPS. Translate ALL CAPS labels into the target language too.
- Keep text unchanged only when it exactly matches a protected term.
- For single-word object labels, translate the word literally and tersely; do not infer a different object/action from the scene.
- For ambiguous English words in food/object labels, prefer the visible-object meaning, not conversational filler. For example COURSE near food means a meal course, not "of course".
- Include both top text and lower/mid-screen captions if both are visible.
- Include small one-word labels such as names, reactions, or captions in the middle/lower frame.
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
    { "id": "item0", "detectedText": "same OCR text", "translatedText": "faithful translation", "confidence": 0.9, "notes": ["short QA note"] }
  ]
}

Rules:
- Keep the number of items and ids exactly the same.
- translatedText must translate detectedText completely, including all visible words and line breaks.
- If target is Vietnamese, translatedText must be Vietnamese, not the original English, except protected terms.
- Preserve line breaks when the original has multiple visual lines.
- Never replace a short visual label with a sentence from the voiceover.
- Do not keep text unchanged just because it is ALL CAPS. Translate ALL CAPS labels into the target language too.
- Keep text unchanged only when it exactly matches a protected term.
- Single-word labels must stay terse. If the word is ambiguous, use the visual label/object meaning.

Items:
${JSON.stringify(payload)}`;
    const result = await model.generateContent(prompt);
    const raw = extractJson<TranslationRefineResponse>(result.response.text());
    const byId = new Map((raw?.items ?? []).map((item) => [item.id, item]));

    return input.detections.map((item, idx) => {
      const refined = byId.get(`item${idx}`);
      const translatedText =
        typeof refined?.translatedText === "string" && refined.translatedText.trim()
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
    { "id": "force0", "translatedText": "Vietnamese translation", "confidence": 0.9, "notes": ["why"] }
  ]
}

Rules:
- Keep ids exactly the same.
- Translate all visible words completely, including multi-line text.
- Preserve line breaks when detectedText has line breaks.
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
      const candidate =
        typeof refined?.translatedText === "string" && refined.translatedText.trim()
          ? normalizeTranslatedText(item.detectedText, refined.translatedText.trim()).slice(0, 260)
          : item.translatedText;
      const translatedText = enforceTargetTranslation(
        item.detectedText,
        candidate,
        input.options.targetLanguage ?? "vi",
      );
      const stillUntranslated = translationLooksUntranslated(item.detectedText, translatedText);
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
    .map((item) => {
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

  return {
    detectedText,
    translatedText,
    region,
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
  const textCompleteness = Math.min(normalizedText(track.detectedText).length, 40) * 0.12;
  return track.confidence * 10 + Math.min(detections, 6) * 1.5 + Math.min(duration, 8) * 0.3 + textCompleteness - area * 0.8;
}

function normalizeTranslatedText(detectedText: string, translatedText: string): string {
  const detected = detectedText.trim();
  const translated = translatedText.trim();
  const literal = literalVietnameseVisualLabel(detected);
  if (
    literal &&
    (translationLooksWrongForLiteralLabel(translated, literal) ||
      translationLooksUntranslated(detected, translated))
  ) {
    return literal;
  }
  if (normalizedText(translated).includes(normalizedText(detected)) && translated.length > detected.length * 2.2) {
    return translated.slice(0, Math.max(1, detected.length * 2)).trim();
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
