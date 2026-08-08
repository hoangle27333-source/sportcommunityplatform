import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractJson } from "@/lib/ai/json";
import type { AlignedVoiceCue, AlignedVoiceWord, RemixOptions } from "./types";

const _require = createRequire(import.meta.url);
const _ffmpegPath: string | null = _require("ffmpeg-static");

function ffmpegBin(): string {
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && envPath.trim()) return envPath.trim();
  if (_ffmpegPath && _ffmpegPath.trim()) return _ffmpegPath.trim();
  return "ffmpeg";
}

export interface VoicePipelineSpeechSegment {
  startSec: number;
  endSec: number;
  confidence?: number;
}

export interface VoicePipelineDiagnostics {
  provider: string;
  language?: string;
  fallbackProvider?: string;
  speechSegmentCount?: number;
  wordCount?: number;
  sentenceCueCount?: number;
  averageConfidence?: number;
  warnings?: string[];
}

export interface VoicePipelineResult {
  language?: string;
  speechSegments: VoicePipelineSpeechSegment[];
  wordTimestamps: AlignedVoiceWord[];
  sentenceCues: AlignedVoiceCue[];
  diagnostics: VoicePipelineDiagnostics;
}

export interface AnalyzeVoiceTimelineInput {
  audioPath: string;
  targetLanguage?: RemixOptions["targetLanguage"];
  durationSec?: number;
}

export async function analyzeVoiceTimeline(
  input: AnalyzeVoiceTimelineInput,
): Promise<VoicePipelineResult> {
  const baseUrl = (process.env.VOICE_PIPELINE_URL ?? "").trim();
  if (!baseUrl) {
    throw new Error("VOICE_PIPELINE_URL chưa được cấu hình.");
  }

  const timeoutMs = clampInt(Number(process.env.VOICE_PIPELINE_TIMEOUT_MS ?? 300000), 1000, 900000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = await buildAnalyzeRequestBody(input);
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`voice pipeline lỗi ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = await res.json();
    const result = normalizeVoicePipelineResult(json);
    return result;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`voice pipeline timeout sau ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function translateAlignedCues(
  cues: AlignedVoiceCue[],
  targetLanguage: RemixOptions["targetLanguage"] = "vi",
  protectedTerms: string[] = [],
): Promise<AlignedVoiceCue[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Không có GEMINI_API_KEY để dịch voice cues.");

  const source = cues
    .map((cue, idx) => ({
      id: idx + 1,
      text: cue.sourceText.trim(),
    }))
    .filter((item) => item.text);
  if (!source.length) return [];

  const targetLabel = targetLanguage === "en" ? "English" : "Vietnamese";
  const modelName = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" },
  });

  const promptItems = source.slice(0, 300);
  const prompt = [
    `Translate subtitle voice cues to ${targetLabel}.`,
    `Keep each input item as exactly one output item with the same id.`,
    `Do NOT merge, split, reorder items. Do NOT add timestamps or explanations.`,
    `Each translated item must be a COMPLETE, NATURAL sentence in ${targetLabel}.`,
    protectedTerms.length
      ? `Preserve these protected terms exactly when they appear: ${protectedTerms.join(", ")}`
      : "",
    `Return ONLY valid JSON: {"items":[{"id":1,"translatedText":"..."}]}`,
    `Input JSON:\n${JSON.stringify({ items: promptItems })}`,
  ].filter(Boolean).join("\n");

  const result = await model.generateContent(prompt);
  const parsed = extractJson<{ items?: Array<{ id?: number; translatedText?: string }> }>(
    result.response.text(),
  );
  const byId = new Map<number, string>();
  for (const item of parsed?.items ?? []) {
    const id = Number(item.id);
    const text = String(item.translatedText ?? "").trim();
    if (Number.isInteger(id) && text) byId.set(id, text);
  }

  return cues.map((cue, idx) => ({
    ...cue,
    translatedText: byId.get(idx + 1) ?? cue.sourceText,
  }));
}

// ---------------------------------------------------------------------------
// Sentence grouping: merge short/mid-sentence cues into complete sentences
// ---------------------------------------------------------------------------

/**
 * Groups AlignedVoiceCues that don't end a sentence into complete sentences.
 * A cue is considered sentence-complete if its sourceText ends with ., !, ?, …
 * or is sufficiently long (>= 60 chars).
 */
export function groupIntoCompleteSentences(cues: AlignedVoiceCue[]): AlignedVoiceCue[] {
  if (!cues.length) return [];

  const result: AlignedVoiceCue[] = [];
  let pending: AlignedVoiceCue[] = [];

  const isSentenceEnd = (text: string): boolean => {
    const trimmed = text.trimEnd();
    // Ends with sentence-terminal punctuation (any language)
    if (/[.!?。！？…]+$/.test(trimmed)) return true;
    // Long enough to stand alone (unlikely to be a fragment)
    if (trimmed.length >= 60) return true;
    return false;
  };

  const flush = (): void => {
    if (!pending.length) return;
    if (pending.length === 1) {
      result.push(pending[0]);
    } else {
      const merged: AlignedVoiceCue = {
        startSec: pending[0].startSec,
        endSec: pending[pending.length - 1].endSec,
        sourceText: pending.map((c) => c.sourceText).join(" "),
        translatedText: pending
          .map((c) => c.translatedText ?? c.sourceText)
          .filter(Boolean)
          .join(" ") || undefined,
        confidence:
          pending.reduce((sum, c) => sum + (c.confidence ?? 1), 0) / pending.length,
        words: pending.flatMap((c) => c.words ?? []),
      };
      result.push(merged);
    }
    pending = [];
  };

  for (const cue of cues) {
    pending.push(cue);
    if (isSentenceEnd(cue.sourceText)) {
      flush();
    }
    // Safety: don't let pending grow too large (>= 5 cues → force flush)
    if (pending.length >= 5) {
      flush();
    }
  }
  flush(); // flush any trailing incomplete sentence

  return result;
}

// ---------------------------------------------------------------------------
// Speech-segment realignment
// ---------------------------------------------------------------------------

/**
 * Detects speech segments in the audio using FFmpeg silencedetect.
 * Returns segments sorted by startSec.
 */
export async function detectSpeechSegments(
  audioPath: string,
  durationSec?: number,
): Promise<VoicePipelineSpeechSegment[]> {
  const silenceDb = process.env.VOICE_SILENCE_THRESHOLD_DB ?? "-35dB";
  const silenceDur = process.env.VOICE_SILENCE_MIN_DURATION_SEC ?? "0.18";
  const bin = ffmpegBin();

  const stderr = await new Promise<string>((resolve, reject) => {
    const proc = spawn(bin, [
      "-i", audioPath,
      "-af", `silencedetect=noise=${silenceDb}:d=${silenceDur}`,
      "-f", "null", "-",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stderr.on("data", (d) => (out += d.toString()));
    proc.on("error", (err) => reject(new Error(`ffmpeg silencedetect: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffmpeg silencedetect exit ${code}`));
      else resolve(out);
    });
  });

  return parseSpeechSegmentsFromSilenceLog(stderr, durationSec);
}

function parseSpeechSegmentsFromSilenceLog(
  log: string,
  durationSec?: number,
): VoicePipelineSpeechSegment[] {
  const events: Array<{ type: "start" | "end"; sec: number }> = [];
  for (const m of log.matchAll(/silence_start:\s*([0-9.]+)/g)) {
    events.push({ type: "start", sec: Number(m[1]) });
  }
  for (const m of log.matchAll(/silence_end:\s*([0-9.]+)/g)) {
    events.push({ type: "end", sec: Number(m[1]) });
  }
  events.sort((a, b) => a.sec - b.sec || (a.type === "end" ? -1 : 1));

  const maxDur = durationSec && durationSec > 0
    ? durationSec
    : Math.max(0, ...events.map((e) => e.sec));
  if (maxDur <= 0) return [];

  const raw: Array<{ startSec: number; endSec: number }> = [];
  let cursor = 0;
  let inSilence = false;

  for (const event of events) {
    const sec = Math.min(Math.max(0, event.sec), maxDur);
    if (event.type === "start" && !inSilence) {
      if (sec - cursor >= 0.15) raw.push({ startSec: cursor, endSec: sec });
      inSilence = true;
    } else if (event.type === "end") {
      cursor = sec;
      inSilence = false;
    }
  }
  if (!inSilence && maxDur - cursor >= 0.15) {
    raw.push({ startSec: cursor, endSec: maxDur });
  }

  // Merge gaps <= 0.14s
  const merged: VoicePipelineSpeechSegment[] = [];
  for (const seg of raw) {
    const padded = {
      startSec: Math.max(0, seg.startSec - 0.03),
      endSec: Math.min(maxDur, seg.endSec + 0.05),
    };
    const last = merged[merged.length - 1];
    if (last && padded.startSec - last.endSec <= 0.14) {
      last.endSec = Math.max(last.endSec, padded.endSec);
    } else {
      merged.push(padded);
    }
  }
  return merged.filter((s) => s.endSec - s.startSec >= 0.15);
}

/**
 * Realigns cue timings from sidecar/ASR to actual speech segments detected
 * in the audio. Proportionally maps N cues onto M speech segments.
 */
export function realignCuesToSpeech(
  cues: AlignedVoiceCue[],
  segments: VoicePipelineSpeechSegment[],
  totalDurationSec: number,
): AlignedVoiceCue[] {
  if (!cues.length || !segments.length) return cues;
  const maxDur = totalDurationSec > 0 ? totalDurationSec : segments[segments.length - 1].endSec;

  if (cues.length <= segments.length) {
    // 1 cue → 1+ segments
    return cues.map((cue, idx) => {
      const startIdx = Math.floor((idx * segments.length) / cues.length);
      const endIdx = Math.max(startIdx, Math.ceil(((idx + 1) * segments.length) / cues.length) - 1);
      return {
        ...cue,
        startSec: round2(Math.max(0, segments[startIdx].startSec)),
        endSec: round2(Math.min(maxDur, Math.max(segments[startIdx].startSec + 0.2, segments[endIdx].endSec))),
      };
    });
  }

  // More cues than segments → subdivide segments
  return cues.map((cue, idx) => {
    const segIdx = Math.min(segments.length - 1, Math.floor((idx * segments.length) / cues.length));
    const seg = segments[segIdx];
    const firstCueInSeg = Math.ceil((segIdx * cues.length) / segments.length);
    const nextSegCue = Math.ceil(((segIdx + 1) * cues.length) / segments.length);
    const cuesInSeg = Math.max(1, nextSegCue - firstCueInSeg);
    const localIdx = Math.max(0, idx - firstCueInSeg);
    const slice = (seg.endSec - seg.startSec) / cuesInSeg;
    const startSec = seg.startSec + localIdx * slice;
    const endSec = localIdx === cuesInSeg - 1 ? seg.endSec : startSec + slice;
    return {
      ...cue,
      startSec: round2(Math.max(0, startSec)),
      endSec: round2(Math.min(maxDur, Math.max(startSec + 0.2, endSec))),
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildAnalyzeRequestBody(input: AnalyzeVoiceTimelineInput): Promise<Record<string, unknown>> {
  const targetLanguage = input.targetLanguage ?? "vi";
  const pathOnly = (process.env.VOICE_PIPELINE_SEND_BASE64 ?? "auto").toLowerCase() === "false";
  if (pathOnly) {
    return {
      audioPath: input.audioPath,
      targetLanguage,
      durationSec: input.durationSec,
    };
  }

  const audio = await readFile(input.audioPath);
  return {
    audioPath: input.audioPath,
    audioBase64: audio.toString("base64"),
    targetLanguage,
    durationSec: input.durationSec,
  };
}

function normalizeVoicePipelineResult(raw: any): VoicePipelineResult {
  const sentenceCues = normalizeCues(raw?.sentenceCues);
  const speechSegments = normalizeSegments(raw?.speechSegments);
  const wordTimestamps = normalizeWords(raw?.wordTimestamps);
  if (!sentenceCues.length) {
    throw new Error("voice pipeline không trả sentenceCues hợp lệ.");
  }
  return {
    language: typeof raw?.language === "string" ? raw.language : undefined,
    speechSegments,
    wordTimestamps,
    sentenceCues,
    diagnostics: {
      provider: String(raw?.diagnostics?.provider ?? process.env.VOICE_ALIGNMENT_PROVIDER ?? "unknown"),
      language: typeof raw?.diagnostics?.language === "string" ? raw.diagnostics.language : undefined,
      fallbackProvider: typeof raw?.diagnostics?.fallbackProvider === "string" ? raw.diagnostics.fallbackProvider : undefined,
      speechSegmentCount: speechSegments.length,
      wordCount: wordTimestamps.length,
      sentenceCueCount: sentenceCues.length,
      averageConfidence: finiteNumber(raw?.diagnostics?.averageConfidence),
      warnings: Array.isArray(raw?.diagnostics?.warnings)
        ? raw.diagnostics.warnings.map(String).filter(Boolean)
        : [],
    },
  };
}

function normalizeCues(value: unknown): AlignedVoiceCue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): AlignedVoiceCue | null => {
      const startSec = finiteNumber((item as any)?.startSec);
      const endSec = finiteNumber((item as any)?.endSec);
      const sourceText = String((item as any)?.sourceText ?? "").trim();
      if (startSec === undefined || endSec === undefined || endSec <= startSec || !sourceText) return null;
      return {
        startSec,
        endSec,
        sourceText,
        translatedText: String((item as any)?.translatedText ?? "").trim() || undefined,
        confidence: finiteNumber((item as any)?.confidence),
        words: normalizeWords((item as any)?.words),
      };
    })
    .filter((cue): cue is AlignedVoiceCue => Boolean(cue))
    .sort((a, b) => a.startSec - b.startSec);
}

function normalizeSegments(value: unknown): VoicePipelineSpeechSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): VoicePipelineSpeechSegment | null => {
      const startSec = finiteNumber((item as any)?.startSec);
      const endSec = finiteNumber((item as any)?.endSec);
      if (startSec === undefined || endSec === undefined || endSec <= startSec) return null;
      return { startSec, endSec, confidence: finiteNumber((item as any)?.confidence) };
    })
    .filter((segment): segment is VoicePipelineSpeechSegment => Boolean(segment));
}

function normalizeWords(value: unknown): AlignedVoiceWord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): AlignedVoiceWord | null => {
      const startSec = finiteNumber((item as any)?.startSec);
      const endSec = finiteNumber((item as any)?.endSec);
      const word = String((item as any)?.word ?? "").trim();
      if (startSec === undefined || endSec === undefined || endSec < startSec || !word) return null;
      return { word, startSec, endSec, confidence: finiteNumber((item as any)?.confidence) };
    })
    .filter((word): word is AlignedVoiceWord => Boolean(word));
}

function finiteNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
