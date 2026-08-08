import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type { RemixFinalReview, VideoOp, RemixOptions } from "./types";
export { sanitizeTranscriptText } from "./utils";
import { sanitizeTranscriptText } from "./utils";

// Use createRequire to bypass ESM/CJS interop issues with binary packages.
// tsx ESM import of CJS packages can return null/undefined in some contexts.
const _require = createRequire(import.meta.url);
const _ffmpegPath: string | null = _require("ffmpeg-static");
const _ffprobeStatic: { path: string } = _require("ffprobe-static");

/**
 * Thực thi op video bằng ffmpeg (SPEC §7.3, mở rộng cho remix).
 *
 * Mọi biến đổi là xác định — không có bước "AI sinh pixel". AI chỉ chọn op và
 * tham số; file này chạy chúng. Một lần gọi = một chuỗi filter được ghép lại,
 * encode một lần (tránh nhiều lần re-encode làm giảm chất lượng).
 *
 * ffmpeg/ffprobe lấy từ package static để không phụ thuộc cài đặt hệ thống;
 * ghi đè được bằng FFMPEG_PATH / FFPROBE_PATH.
 */

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

function ffmpegBin(): string {
  // Guard against empty-string env (FFMPEG_PATH= in .env means "use static").
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && envPath.trim()) return envPath.trim();
  if (_ffmpegPath && _ffmpegPath.trim()) return _ffmpegPath.trim();
  return "ffmpeg";
}

function ffprobeBin(): string {
  const envPath = process.env.FFPROBE_PATH;
  if (envPath && envPath.trim()) return envPath.trim();
  if (_ffprobeStatic?.path?.trim()) return _ffprobeStatic.path.trim();
  return "ffprobe";
}

function run(bin: string, args: string[]): Promise<string> {
  // Validate bin early to give a clear error instead of a cryptic spawn exception
  if (!bin || !bin.trim()) {
    return Promise.reject(new Error(`ffmpeg binary path is empty — cannot run ffmpeg. Check FFMPEG_PATH env or ffmpeg-static installation.`));
  }
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      return reject(new Error(`spawn failed for "${bin}": ${(err as Error).message}`));
    }
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) =>
      reject(new Error(`không chạy được ${path.basename(bin)}: ${err.message}`)),
    );
    proc.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(
            new Error(
              `${path.basename(bin)} thoát với mã ${code}: ${stderr.slice(-800)}`,
            ),
          ),
    );
  });
}

// ---------------------------------------------------------------------------
// Probe — đọc thông tin video để AI lập kế hoạch có cơ sở
// ---------------------------------------------------------------------------

export interface VideoInfo {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  codec?: string;
  fileSizeBytes?: number;
}

/** Đọc metadata video bằng ffprobe. */
export async function probeVideo(filePath: string): Promise<VideoInfo> {
  const out = await run(ffprobeBin(), [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const json = JSON.parse(out) as any;
  const streams = json.streams ?? [];
  const video = streams.find((s: any) => s.codec_type === "video");
  const hasAudio = streams.some((s: any) => s.codec_type === "audio");

  let fps = 30;
  if (video?.avg_frame_rate) {
    const [num, den] = video.avg_frame_rate.split("/").map(Number);
    if (num && den) fps = num / den;
  }

  let width = video?.width ?? 0;
  let height = video?.height ?? 0;

  let rotate = Number(video?.tags?.rotate ?? 0);
  if (video?.side_data_list) {
    for (const sd of video.side_data_list) {
      if (sd.side_data_type === "Display Matrix") {
        const rot = Number(sd.rotation ?? 0);
        if (rot !== 0) rotate = rot;
      }
    }
  }

  // FFmpeg auto-rotates 90 or 270 degrees, swapping width and height
  if (Math.abs(rotate) === 90 || Math.abs(rotate) === 270) {
    const tmp = width;
    width = height;
    height = tmp;
  }

  const fileStat = await stat(filePath).catch(() => null);

  return {
    durationSec: Number(json.format?.duration ?? 0),
    width,
    height,
    fps: Math.round(fps * 100) / 100,
    hasAudio,
    codec: video?.codec_name,
    fileSizeBytes: fileStat?.size,
  };
}

export interface ReviewRenderedVideoInput {
  outputPath: string;
  expected?: {
    durationSec?: number;
    width?: number;
    height?: number;
    hasAudio?: boolean;
    subtitlesExpected?: boolean;
    subtitlesPlanned?: boolean;
  };
}

/**
 * Post-render QA gate inspired by production pipelines: validate the actual
 * rendered file before presenting it as a usable remix result.
 */
export async function reviewRenderedVideo(
  input: ReviewRenderedVideoInput,
): Promise<RemixFinalReview> {
  const technicalIssues: string[] = [];
  const visualIssues: string[] = [];
  const audioIssues: string[] = [];
  const subtitleIssues: string[] = [];

  const fileStat = await stat(input.outputPath).catch(() => null);
  let info: VideoInfo | null = null;
  try {
    info = await probeVideo(input.outputPath);
  } catch (err) {
    technicalIssues.push(`Không đọc được file render bằng ffprobe: ${(err as Error).message}`);
  }

  if (!fileStat || fileStat.size === 0) {
    technicalIssues.push("File render không tồn tại hoặc rỗng.");
  }
  if (info && (!info.width || !info.height || info.durationSec <= 0)) {
    technicalIssues.push("Container video thiếu stream hình hoặc duration không hợp lệ.");
  }

  const expectedResolution =
    input.expected?.width && input.expected?.height
      ? `${input.expected.width}x${input.expected.height}`
      : undefined;
  const actualResolution = info ? `${info.width}x${info.height}` : undefined;
  const resolutionMatches =
    !expectedResolution || expectedResolution === actualResolution;
  if (!resolutionMatches) {
    visualIssues.push(
      `Resolution lệch kế hoạch: mong đợi ${expectedResolution}, thực tế ${actualResolution ?? "không rõ"}.`,
    );
  }

  if (
    info &&
    input.expected?.durationSec &&
    input.expected.durationSec > 0 &&
    Math.abs(info.durationSec - input.expected.durationSec) > Math.max(1.5, input.expected.durationSec * 0.12)
  ) {
    technicalIssues.push(
      `Duration lệch kế hoạch: mong đợi khoảng ${input.expected.durationSec.toFixed(1)}s, thực tế ${info.durationSec.toFixed(1)}s.`,
    );
  }

  const audioExpected = input.expected?.hasAudio ?? false;
  const audioPresent = info?.hasAudio ?? false;
  if (audioExpected && !audioPresent) {
    audioIssues.push("Kế hoạch cần audio nhưng file render không có audio track.");
  }

  const subtitlesExpected = input.expected?.subtitlesExpected ?? false;
  const subtitlesPlanned = input.expected?.subtitlesPlanned ?? false;
  if (subtitlesExpected && !subtitlesPlanned) {
    subtitleIssues.push("Người dùng bật phụ đề nhưng kế hoạch render không có subtitle op.");
  }

  const issuesFound = [
    ...technicalIssues,
    ...visualIssues,
    ...audioIssues,
    ...subtitleIssues,
  ];
  const critical = !fileStat || fileStat.size === 0 || !info || !info.width || !info.height || info.durationSec <= 0;
  const status: RemixFinalReview["status"] = critical
    ? "fail"
    : issuesFound.length
      ? "revise"
      : "pass";

  return {
    version: "1.0",
    outputPath: input.outputPath,
    status,
    checks: {
      technicalProbe: {
        validContainer: Boolean(info && info.width && info.height && info.durationSec > 0),
        durationSec: info?.durationSec,
        resolution: actualResolution,
        fps: info?.fps,
        hasAudio: info?.hasAudio,
        codec: info?.codec,
        fileSizeBytes: fileStat?.size ?? info?.fileSizeBytes,
        issues: technicalIssues,
      },
      visualSpotcheck: {
        expectedResolution,
        resolutionMatches,
        issues: visualIssues,
      },
      audioSpotcheck: {
        audioExpected,
        audioPresent,
        issues: audioIssues,
      },
      subtitleCheck: {
        subtitlesExpected,
        subtitlesPlanned,
        issues: subtitleIssues,
      },
    },
    issuesFound,
    recommendedAction:
      status === "fail"
        ? "block"
        : status === "revise"
          ? "review_warning"
          : "present_to_user",
  };
}

// ---------------------------------------------------------------------------
// Sinh SRT cho phụ đề burn-in
// ---------------------------------------------------------------------------

export interface SubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface WordHighlightCue extends SubtitleCue {
  words?: Array<{ word: string; startSec: number; endSec: number }>;
}

function srtTimestamp(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

/** Chuyển danh sách cue thành nội dung file .srt. */
export function buildSrt(cues: SubtitleCue[]): string {
  return cues
    .map((c, i) =>
      [
        String(i + 1),
        `${srtTimestamp(c.startSec)} --> ${srtTimestamp(c.endSec)}`,
        c.text.trim(),
        "",
      ].join("\n"),
    )
    .join("\n");
}

export interface AssSubtitleStyle {
  font?: string;
  fontSize?: number;
  primaryColor?: string;
  outlineColor?: string;
  highlightColor?: string;
  bold?: boolean;
  italic?: boolean;
  outline?: number;
  borderStyle?: number;
  marginV?: number;
  alignment?: number;
  animation?: "word_highlight" | "reveal_words";
}

/** Build ASS subtitles with active-word highlight or progressive word reveal. */
export function buildAssSubtitles(
  cues: WordHighlightCue[],
  style: AssSubtitleStyle = {},
): string {
  const fontName = style.font?.trim() || "Montserrat";
  const fontSize = clamp(Math.round(style.fontSize ?? 32), 10, 96);
  const primary = assColor(style.primaryColor, "&H00FFFFFF");
  const outline = assColor(style.outlineColor, "&H00000000");
  const highlight = assColor(style.highlightColor, "&H0000F2FF");
  const bold = style.bold === false ? 0 : 1;
  const italic = style.italic ? 1 : 0;
  const outlineWidth = clamp(Math.round(style.outline ?? 3), 0, 8);
  const borderStyle = clamp(Math.round(style.borderStyle ?? 1), 0, 4);
  const alignment = style.alignment ?? 2;
  const marginV = clamp(Math.round(style.marginV ?? 80), 0, 400);
  const animation = style.animation ?? "word_highlight";
  const events: string[] = [];

  for (const cue of cues) {
    const words = normalizeCueWords(cue);
    if (!words.length) {
      events.push(assDialogue(cue.startSec, cue.endSec, escapeAssText(cue.text)));
      continue;
    }
    for (let i = 0; i < words.length; i += 1) {
      const active = words[i];
      const visibleWords = animation === "reveal_words" ? words.slice(0, i + 1) : words;
      const activeIndex = animation === "reveal_words" ? visibleWords.length - 1 : i;
      const rendered = visibleWords
        .map((item, idx) => {
          const text = escapeAssText(item.word);
          return idx === activeIndex
            ? `{\\c${highlight}\\b1}${text}{\\c${primary}\\b${bold}}`
            : text;
        })
        .join(" ");
      const next = words[i + 1];
      events.push(
        assDialogue(
          Math.max(cue.startSec, active.startSec),
          animation === "reveal_words"
            ? Math.min(cue.endSec, Math.max(active.startSec + 0.05, next?.startSec ?? cue.endSec))
            : Math.min(cue.endSec, Math.max(active.startSec + 0.05, active.endSec)),
          rendered,
        ),
      );
    }
  }

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${fontName},${fontSize},${primary},${highlight},${outline},&H80000000,${bold},${italic},0,0,100,100,0,0,${borderStyle},${outlineWidth},1,${alignment},60,60,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

function normalizeCueWords(cue: WordHighlightCue): Array<{ word: string; startSec: number; endSec: number }> {
  const valid = (cue.words ?? [])
    .map((word) => ({
      word: String(word.word ?? "").trim(),
      startSec: clamp(Number(word.startSec), cue.startSec, cue.endSec),
      endSec: clamp(Number(word.endSec), cue.startSec, cue.endSec),
    }))
    .filter((word) => word.word && word.endSec > word.startSec);
  if (valid.length) return valid;

  const parts = cue.text.split(/\s+/).map((word) => word.trim()).filter(Boolean);
  if (!parts.length || cue.endSec <= cue.startSec) return [];
  const slice = (cue.endSec - cue.startSec) / parts.length;
  return parts.map((word, idx) => ({
    word,
    startSec: cue.startSec + slice * idx,
    endSec: idx === parts.length - 1 ? cue.endSec : cue.startSec + slice * (idx + 1),
  }));
}

function assDialogue(startSec: number, endSec: number, text: string): string {
  return `Dialogue: 0,${assTimestamp(startSec)},${assTimestamp(endSec)},Default,,0,0,0,,${text}`;
}

function assTimestamp(sec: number): string {
  const centis = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(centis / 360000);
  const m = Math.floor((centis % 360000) / 6000);
  const s = Math.floor((centis % 6000) / 100);
  const c = centis % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function assColor(hex?: string, def = "&H00FFFFFF"): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return def;
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return `&H00${b}${g}${r}`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\N");
}

export function parseSrtCues(srt: string, totalSec?: number): SubtitleCue[] {
  const maxDuration = totalSec && totalSec > 0 ? totalSec : Number.POSITIVE_INFINITY;
  const normalized = srt.replace(/\r/g, "").trim();
  if (!normalized) return [];

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timeIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeIndex < 0) return null;
      const [startRaw, endRaw] = lines[timeIndex].split("-->").map((part) => part.trim());
      const startSec = parseSrtTimestamp(startRaw);
      const endSec = parseSrtTimestamp(endRaw);
      const text = lines.slice(timeIndex + 1).join(" ").trim();
      if (!text || startSec === null || endSec === null || endSec <= startSec) return null;
      return {
        startSec: clamp(startSec, 0, Math.max(0, maxDuration - 0.05)),
        endSec: clamp(endSec, 0.05, maxDuration),
        text,
      };
    })
    .filter((cue): cue is SubtitleCue => Boolean(cue))
    .filter((cue) => cue.endSec > cue.startSec)
    .sort((a, b) => a.startSec - b.startSec);
}

function parseSrtTimestamp(value: string): number | null {
  const match = value.match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4].padEnd(3, "0").slice(0, 3));
  if (![hours, minutes, seconds, millis].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}


/**
 * Chia một đoạn script thành các cue đều nhau theo tổng thời lượng.
 * Dùng khi ta có bản dịch tiếng Việt nhưng không có timestamp từ ASR —
 * đủ tốt cho phụ đề reel ngắn, và không giả vờ chính xác hơn thực tế.
 */
export function scriptToCues(
  script: string,
  totalSec: number,
  maxCharsPerCue = 42,
): SubtitleCue[] {
  const cleaned = sanitizeTranscriptText(script);
  if (!cleaned || totalSec <= 0) return [];

  // Step 1: split into sentences first, respecting terminal punctuation.
  // This prevents TTS from reading fragmented mid-sentence text.
  const rawSentences = cleaned
    .split(/(?<=[.!?。！？…]+)\s+|(?<=[.!?。！？…]+)$|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Step 2: if a sentence exceeds maxCharsPerCue, break it at the character limit
  // on a word boundary, but only as a last resort.
  const lines: string[] = [];
  for (const sentence of rawSentences) {
    if (sentence.length <= maxCharsPerCue) {
      lines.push(sentence);
    } else {
      const words = sentence.split(/\s+/).filter(Boolean);
      let cur = "";
      for (const w of words) {
        const candidate = cur ? `${cur} ${w}` : w;
        if (candidate.length > maxCharsPerCue) {
          if (cur) lines.push(cur.trim());
          cur = w;
        } else {
          cur = candidate;
        }
      }
      if (cur) lines.push(cur.trim());
    }
  }

  if (!lines.length) return [];

  // Step 3: distribute duration proportionally by character length.
  const totalChars = lines.reduce((a, l) => a + l.length, 0) || 1;
  const cues: SubtitleCue[] = [];
  let t = 0;
  for (const line of lines) {
    const dur = Math.max(1.2, (line.length / totalChars) * totalSec);
    cues.push({ startSec: t, endSec: Math.min(totalSec, t + dur), text: line });
    t += dur;
    if (t >= totalSec) break;
  }
  return cues;
}

/** Map ratio string to [width, height] at 1080p-equivalent */
export function ratioToDimensions(ratio: string): { width: number; height: number } {
  const map: Record<string, { width: number; height: number }> = {
    '9:16': { width: 1080, height: 1920 },
    '16:9': { width: 1920, height: 1080 },
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
  };
  return map[ratio] ?? { width: 1080, height: 1920 };
}

/**
 * Build a `reframe` VideoOp from ratio string.
 * Uses crop mode for portrait conversion, pad for everything else.
 */
export function buildReframeOp(
  ratio: string,
  sourceWidth: number,
  sourceHeight: number,
): Extract<VideoOp, { op: 'reframe' }> | null {
  if (ratio === 'original') return null;
  const target = ratioToDimensions(ratio);
  const isPortrait = target.height > target.width;
  const isTargetSquare = target.width === target.height;
  const sourceIsLandscape = sourceWidth > sourceHeight;
  
  let mode: 'crop' | 'pad' = 'pad';
  if (isTargetSquare && sourceWidth !== sourceHeight) {
    mode = 'crop'; // Crop to fill 1:1
  } else if (isPortrait && sourceIsLandscape) {
    mode = 'crop'; // Crop landscape to portrait
  }
  
  return { op: 'reframe', width: target.width, height: target.height, mode };
}

// ---------------------------------------------------------------------------
// Dịch op → ffmpeg filter/args
// ---------------------------------------------------------------------------

/** Escape đường dẫn cho filtergraph của ffmpeg (dấu : và \ là ký tự đặc biệt). */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

const LOGO_OVERLAY_XY: Record<NonNullable<RemixOptions["logoPosition"]>, string> = {
  "top-left": "10:10",
  "top-right": "W-w-10:10",
  "bottom-left": "10:H-h-10",
  "bottom-right": "W-w-10:H-h-10",
};

export interface ApplyOpsInput {
  inputPath: string;
  ops: VideoOp[];
  /** Thư mục tạm để ghi file phụ (srt, logo đã tải). */
  workDir: string;
  isImage?: boolean;
  blurRegion?: { x: number; y: number; w: number; h: number };
  blurRegions?: Array<{ x: number; y: number; w: number; h: number; startSec?: number; endSec?: number }>;
}

export function subtitlePlacementForBlurRegion(
  region: { y: number; h: number } | undefined,
  targetHeight: number,
): { alignment: number; marginV: number } {
  const blurY = clamp(region?.y ?? 0.82, 0, 1);
  const blurH = clamp(region?.h ?? 0.18, 0.01, 1);
  const blurBottom = clamp(blurY + blurH, 0, 1);
  const blurHeightPx = Math.max(1, Math.round(blurH * targetHeight));

  // ASS bottom alignment measures MarginV from the frame bottom to the
  // subtitle's bottom edge. Put that edge inside the blurred band, slightly
  // above the band's lower boundary.
  const marginFromFrameBottom = Math.round((1 - blurBottom) * targetHeight);
  const inset = clamp(Math.round(blurHeightPx * 0.18), 12, 72);
  return { alignment: 2, marginV: Math.max(12, marginFromFrameBottom + inset) };
}

/**
 * Ghép danh sách op thành MỘT lệnh ffmpeg và chạy. Trả về đường dẫn file ra.
 *
 * Thứ tự áp dụng cố định để kết quả nhất quán bất kể AI xếp thế nào:
 *   trim → reframe → blurSubtitleRegion → colorGrade → subtitles → overlayLogo → (audio) → encode
 */
export async function applyVideoOps(input: ApplyOpsInput): Promise<string> {
  const { inputPath, ops, workDir } = input;

  const byOp = <T extends VideoOp["op"]>(name: T) =>
    ops.find((o) => o.op === name) as Extract<VideoOp, { op: T }> | undefined;

  const trim = byOp("trim");
  const reframe = byOp("reframe");
  const color = byOp("colorGrade");
  const subs = byOp("subtitles");
  const textOverlays = ops.filter((o) => o.op === "overlayText") as Array<
    Extract<VideoOp, { op: "overlayText" }>
  >;
  const logo = byOp("overlayLogo");
  const replaceAudio = byOp("replaceAudio");
  const mute = ops.some((o) => o.op === "mute");
  const encode = byOp("encode");

  const args: string[] = ["-y"];
  const info = await probeVideo(inputPath).catch(() => ({
    width: 1080,
    height: 1920,
    durationSec: 0,
  }));
  const effectiveDurationSec =
    trim?.duration && trim.duration > 0
      ? trim.duration
      : info.durationSec && info.durationSec > 0
        ? info.durationSec
        : undefined;

  // Trim bằng -ss/-t trước -i để seek nhanh và chính xác khi re-encode.
  if (trim) {
    args.push("-ss", String(Math.max(0, trim.start)));
    args.push("-t", String(Math.max(0.1, trim.duration)));
  }
  args.push("-i", inputPath);

  // Input phụ: logo (index 1) và audio thay thế (index kế tiếp).
  let logoIdx = -1;
  let audioIdx = -1;
  if (logo) {
    args.push("-i", logo.logoPath);
    logoIdx = 1;
  }
  if (replaceAudio) {
    args.push("-i", replaceAudio.audioPath);
    audioIdx = logo ? 2 : 1;
  }

  // ----- Chuỗi filter video -----
  const chain: string[] = [];

  if (reframe) {
    const { width: w, height: h, mode } = reframe;
    if (mode === "crop") {
      // Phủ kín khung rồi cắt phần thừa — dùng cho chuyển ngang → dọc.
      chain.push(
        `scale=${w}:${h}:force_original_aspect_ratio=increase`,
        `crop=${w}:${h}`,
      );
    } else {
      chain.push(
        `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
        `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`,
      );
    }
  }

  const blurRegions: Array<{ x: number; y: number; w: number; h: number; startSec?: number; endSec?: number }> = [
    ...(input.blurRegion ? [input.blurRegion] : []),
    ...(input.blurRegions ?? []).map((region) =>
      transformRegionForReframe(region, info.width, info.height, reframe),
    ),
  ];
  for (const region of blurRegions) {
    const { x, y, w, h } = region;
    const fw = reframe ? reframe.width : info.width;
    const fh = reframe ? reframe.height : info.height;
    
    // FFmpeg's delogo requires a 1-pixel boundary on all 4 sides.
    // bx >= 1, by >= 1, bx + bw <= fw - 1, by + bh <= fh - 1
    let bx = Math.max(1, Math.floor(x * fw));
    let by = Math.max(1, Math.floor(y * fh));
    
    // Ensure there's room for at least w=1, h=1
    bx = Math.min(bx, fw - 2);
    by = Math.min(by, fh - 2);

    let bw = Math.max(1, Math.floor(w * fw));
    let bh = Math.max(1, Math.floor(h * fh));

    // Cap bw and bh so bx + bw <= fw - 1
    bw = Math.min(bw, fw - bx - 1);
    bh = Math.min(bh, fh - by - 1);

    chain.push(
      `delogo=x=${bx}:y=${by}:w=${bw}:h=${bh}:show=0${timelineEnable(region.startSec, region.endSec)}`,
    );
  }

  if (color) {
    const b = clamp(color.brightness ?? 0, -0.3, 0.3);
    const c = clamp(color.contrast ?? 1, 0.5, 1.8);
    const s = clamp(color.saturation ?? 1, 0.5, 2);
    chain.push(`eq=brightness=${b}:contrast=${c}:saturation=${s}`);
  }

  if (subs) {
    const fontSize = clamp(subs.fontSize ?? 24, 12, 72);
    if (subs.ass) {
      const assPath = path.join(workDir, "sub.ass");
      await writeFile(assPath, subs.ass, "utf8");
      chain.push(`ass='${escapeFilterPath(assPath)}'`);
    } else {
      const srtPath = path.join(workDir, "sub.srt");
      await writeFile(srtPath, subs.srt, "utf8");
    
      const style = [
        `FontSize=${fontSize}`,
        `PrimaryColour=${assColor(subs.primaryColor, '&H00FFFFFF')}`,
        `OutlineColour=${assColor(subs.outlineColor, '&H00000000')}`,
        `BorderStyle=${subs.borderStyle ?? 1}`,
        `Outline=${subs.outline ?? 2}`,
        'Shadow=0',
        `Alignment=${subs.alignment ?? 2}`,
        `MarginV=${subs.marginV ?? 60}`,
        subs.bold ? 'Bold=1' : null,
        subs.italic ? 'Italic=1' : null,
      ].filter(Boolean).join(',');
      chain.push(
        `subtitles='${escapeFilterPath(srtPath)}':force_style='${style}'`,
      );
    }
  }

  for (const textOverlay of textOverlays) {
    const region = textOverlay.region
      ? transformRegionForReframe(textOverlay.region, info.width, info.height, reframe)
      : undefined;
    const fw = reframe ? reframe.width : info.width;
    const fh = reframe ? reframe.height : info.height;
    const baseFontSize = region && textOverlay.fitToRegion && textOverlay.sizeMode === "auto_fit"
      ? clamp(Math.round(region.h * fh * 0.5), 12, 84)
      : clamp(textOverlay.fontSize ?? 32, 12, 84);
    const autoMaxFontSize = region && textOverlay.fitToRegion && textOverlay.sizeMode === "auto_fit"
      ? Math.max(baseFontSize, Math.round(region.h * fh * 0.72))
      : textOverlay.maxFontSize;
    const fitted = region && textOverlay.fitToRegion
      ? fitTextToRegion(textOverlay.text, {
          width: Math.max(1, Math.round(region.w * fw)),
          height: Math.max(1, Math.round(region.h * fh)),
          desiredFontSize: baseFontSize,
          minFontSize: textOverlay.minFontSize,
          maxFontSize: autoMaxFontSize,
        })
      : { text: textOverlay.text, fontSize: baseFontSize };
    const escapedText = fitted.text
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\u2019")
      .replace(/:/g, "\\:")
      .replace(/\n/g, "\\n");
    const color = /^#[0-9a-fA-F]{6}$/.test(textOverlay.color ?? "")
      ? `0x${textOverlay.color!.slice(1)}`
      : "white";
    const bgColor = ffmpegColor(textOverlay.bgColor, "black");
    const outlineColor = ffmpegColor(textOverlay.outlineColor, "black");
    const opacity = clamp(textOverlay.boxOpacity ?? 0.75, 0, 1);
    const fontOpt = getFontOptionForDrawtext(textOverlay.font);
    const boldScale = textOverlay.bold ? 1.08 : 1;
    const finalFontSize = Math.round(fitted.fontSize * boldScale);
    const xExpr = region
      ? `${Math.round(region.x * fw)}+(${Math.max(1, Math.round(region.w * fw))}-text_w)/2`
      : "(w-text_w)/2";
    const yExpr = region
      ? `${Math.round(region.y * fh)}+(${Math.max(1, Math.round(region.h * fh))}-text_h)/2`
      : textOverlay.position === "top"
        ? "h*0.12"
        : textOverlay.position === "bottom"
          ? "h*0.78"
          : "(h-text_h)/2";
    const enable = timelineEnable(textOverlay.startSec, textOverlay.endSec);
    if (region && textOverlay.coverRegion) {
      const coverX = Math.max(0, Math.round(region.x * fw));
      const coverY = Math.max(0, Math.round(region.y * fh));
      const coverW = Math.min(fw - coverX, Math.max(1, Math.round(region.w * fw)));
      const coverH = Math.min(fh - coverY, Math.max(1, Math.round(region.h * fh)));
      chain.push(
        `drawbox=x=${coverX}:y=${coverY}:w=${coverW}:h=${coverH}:color=${bgColor}@${Math.max(opacity, 0.72)}:t=fill${enable}`,
      );
    }
    const boxParams = textOverlay.coverRegion
      ? "box=0"
      : `box=1:boxcolor=${bgColor}@${opacity}:boxborderw=${region ? fitBoxBorder(region, fw, fh) : 14}`;
    chain.push(
      `drawtext=text='${escapedText}'${fontOpt}:fontcolor=${color}:fontsize=${finalFontSize}:x=${xExpr}:y=${yExpr}:${boxParams}:line_spacing=${Math.max(2, Math.round(finalFontSize * 0.14))}:borderw=${Math.max(1, Math.round(finalFontSize * 0.08))}:bordercolor=${outlineColor}${enable}`
    );
  }

  // Logo cần overlay (2 input) nên xử lý qua filter_complex.
  const useComplex = logoIdx >= 0;
  let filterComplex = "";

  if (useComplex) {
    const pre = chain.length ? `[0:v]${chain.join(",")}[base]` : `[0:v]null[base]`;
    const logoScale = clamp(logo!.scale ?? 0.15, 0.03, 0.5);
    const opacity = clamp(logo!.opacity ?? 1, 0, 1);
    const xy = logo!.position === "custom"
      ? `${clamp(logo!.x ?? 0.85, 0, 1)}*(W-w):${clamp(logo!.y ?? 0.85, 0, 1)}*(H-h)`
      : LOGO_OVERLAY_XY[logo!.position];
    filterComplex =
      `${pre};` +
      `[${logoIdx}:v]scale=iw*${logoScale}:-1,format=rgba,colorchannelmixer=aa=${opacity}[logo];` +
      `[base][logo]overlay=${xy}[vout]`;
  }

  // ----- Video + Audio mapping (một pass duy nhất) -----
  const hasReplaceAudio = Boolean(replaceAudio && audioIdx >= 0);

  if (useComplex) {
    // Có logo → filter_complex cho video; audio riêng
    args.push("-filter_complex", filterComplex, "-map", "[vout]");
    if (input.isImage || mute) {
      args.push("-an");
    } else if (hasReplaceAudio) {
      args.push("-map", `${audioIdx}:a`, "-c:a", "aac", "-b:a", "128k");
    } else {
      args.push("-map", "0:a?", "-c:a", "aac", "-b:a", "128k");
    }
  } else if (chain.length) {
    // Có -vf nhưng không có logo
    args.push("-vf", chain.join(","), "-map", "0:v");
    if (input.isImage || mute) {
      args.push("-an");
    } else if (hasReplaceAudio) {
      args.push("-map", `${audioIdx}:a`, "-c:a", "aac", "-b:a", "128k");
    } else {
      args.push("-map", "0:a?", "-c:a", "aac", "-b:a", "128k");
    }
  } else {
    // Không có filter gì
    args.push("-map", "0:v");
    if (input.isImage || mute) {
      args.push("-an");
    } else if (hasReplaceAudio) {
      args.push("-map", `${audioIdx}:a`, "-c:a", "aac", "-b:a", "128k");
    } else {
      args.push("-map", "0:a?", "-c:a", "aac", "-b:a", "128k");
    }
  }

  // ----- Encode -----
  const ext = input.isImage ? "png" : "mp4";
  const outPath = path.join(workDir, `out.${ext}`);

  if (input.isImage) {
    args.push("-frames:v", "1", "-update", "1", outPath);
  } else {
    const fps = clamp(encode?.fps ?? 30, 15, 60);
    const crf = clamp(encode?.crf ?? 18, 15, 32);
    if (hasReplaceAudio) {
      args.push("-filter:a", "apad");
      if (effectiveDurationSec) {
        args.push("-t", String(effectiveDurationSec));
      }
    }
    args.push(
      "-r", String(fps),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", String(crf),
      "-pix_fmt", "yuv420p",
      // faststart giúp video phát ngay khi tải trên web/mobile.
      "-movflags", "+faststart",
      outPath,
    );
  }

  await run(ffmpegBin(), args);

  // Xác nhận file ra tồn tại và không rỗng.
  const st = await stat(outPath).catch(() => null);
  if (!st || st.size === 0) {
    throw new Error("ffmpeg chạy xong nhưng không tạo được file video hợp lệ");
  }
  return outPath;
}

/**
 * Blur vùng subtitle gốc trên video bằng FFmpeg boxblur.
 * Default: bottom 18% frame — vùng phụ đề phổ biến nhất.
 */
export async function blurSubtitleRegion(
  inputPath: string,
  outputPath: string,
  options?: {
    region?: { x: number; y: number; w: number; h: number };
    blurStrength?: number;
  },
): Promise<void> {
  const info = await probeVideo(inputPath);
  const vw = info.width;
  const vh = info.height;
  const region = options?.region ?? { x: 0, y: 0.82, w: 1.0, h: 0.18 };
  const strength = Math.max(5, Math.min(50, options?.blurStrength ?? 20));

  let px = Math.round(region.x * vw);
  let py = Math.round(region.y * vh);
  let pw = Math.round(region.w * vw);
  let ph = Math.round(region.h * vh);
  // Ensure even dimensions
  if (pw % 2 !== 0) pw -= 1;
  if (ph % 2 !== 0) ph -= 1;
  if (pw <= 0) pw = 2;
  if (ph <= 0) ph = 2;

  await run(ffmpegBin(), [
    '-y', '-i', inputPath,
    '-filter_complex',
    `[0:v]crop=${pw}:${ph}:${px}:${py},boxblur=${strength}:${strength}[blurred];[0:v][blurred]overlay=${px}:${py}[out]`,
    '-map', '[out]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-c:a', 'copy', '-y', outputPath,
  ]);
}

/**
 * Concatenate intro + main video + outro using FFmpeg concat demuxer.
 */
export async function concatWithIntroOutro(
  mainVideoPath: string,
  outputPath: string,
  options: { introPath?: string; outroPath?: string },
): Promise<void> {
  const parts = [options.introPath, mainVideoPath, options.outroPath].filter(
    Boolean,
  ) as string[];

  if (parts.length === 1) {
    const { copyFile } = await import('node:fs/promises');
    await copyFile(mainVideoPath, outputPath);
    return;
  }

  const { writeFile: wf } = await import('node:fs/promises');
  const listFile = path.join(path.dirname(outputPath), 'concat_list.txt');
  const listContent = parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "''")}'`).join('\n');
  await wf(listFile, listContent, 'utf8');

  await run(ffmpegBin(), [
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

/**
 * Tách âm thanh gốc thành 2 track: voice (giọng người) và bgm (nhạc nền).
 * Dùng FFmpeg equalizer: giọng người tập trung ~200Hz–4kHz.
 * Kết quả: { voicePath, bgmPath } trong workDir.
 *
 * Lưu ý: Đây là phân tách đơn giản bằng frequency filtering, không phải AI/ML.
 * Hoạt động tốt với video podcast/talk nhưng kém hơn với nhạc phức tạp.
 */
export async function separateVoiceBgm(
  inputPath: string,
  workDir: string,
  trim?: { start: number; duration: number },
): Promise<{ bgmPath: string }> {
  if ((process.env.VOICE_SEPARATION_PROVIDER ?? "eq").toLowerCase() === "demucs") {
    const demucs = await separateVoiceBgmWithDemucs(inputPath, workDir, trim).catch(() => null);
    if (demucs) return demucs;
  }

  const bgmPath = path.join(workDir, 'bgm_extracted.aac');
  const args = ['-y'];
  if (trim) {
    args.push('-ss', String(Math.max(0, trim.start)));
    args.push('-t', String(Math.max(0.1, trim.duration)));
  }

  // Lọc lowpass + highpass: giữ lại phần tần số ngoài dải giọng người (voice band 300Hz-3kHz)
  // Dùng FFmpeg's equalizer để hạ âm giọng người và giữ nhạc nền
  await run(ffmpegBin(), [
    ...args,
    '-i', inputPath,
    '-af',
    // Hạ giọng người (tập trung 300-3000Hz) xuống ~-18dB, giữ nhạc nền
    'equalizer=f=1000:width_type=o:width=3:g=-18,equalizer=f=500:width_type=o:width=2:g=-12,equalizer=f=2000:width_type=o:width=2:g=-12,volume=2.0',
    '-vn',
    '-c:a', 'aac', '-b:a', '128k',
    bgmPath,
  ]);

  return { bgmPath };
}

async function separateVoiceBgmWithDemucs(
  inputPath: string,
  workDir: string,
  trim?: { start: number; duration: number },
): Promise<{ bgmPath: string }> {
  const demucsInput = path.join(workDir, "demucs_input.wav");
  const args = ["-y"];
  if (trim) {
    args.push("-ss", String(Math.max(0, trim.start)));
    args.push("-t", String(Math.max(0.1, trim.duration)));
  }
  await run(ffmpegBin(), [
    ...args,
    "-i", inputPath,
    "-vn",
    "-ac", "2",
    "-ar", "44100",
    demucsInput,
  ]);

  const outDir = path.join(workDir, "demucs_out");
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("python3", [
      "-m", "demucs",
      "--two-stems", "vocals",
      "-o", outDir,
      demucsInput,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(new Error(`demucs lỗi: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`demucs thoát mã ${code}: ${stderr.slice(-800)}`));
    });
  });

  const stemPath = await findFileByName(outDir, "no_vocals");
  if (!stemPath) throw new Error("Demucs không tạo no_vocals stem.");
  return { bgmPath: stemPath };
}

async function findFileByName(dir: string, nameWithoutExt: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFileByName(p, nameWithoutExt);
      if (found) return found;
    } else if (path.parse(entry.name).name === nameWithoutExt) {
      return p;
    }
  }
  return null;
}

/**
 * Adjust the tempo of an audio file to match a target duration.
 */
export async function adjustAudioTempo(
  inputPath: string,
  outputPath: string,
  targetDurationSec: number,
): Promise<void> {
  const info = await probeVideo(inputPath).catch(() => null);
  if (!info || info.durationSec <= 0 || targetDurationSec <= 0) {
    const { copyFile } = await import('node:fs/promises');
    await copyFile(inputPath, outputPath);
    return;
  }
  const ratio = info.durationSec / targetDurationSec;
  if (Math.abs(ratio - 1.0) <= 0.05) {
    const { copyFile } = await import('node:fs/promises');
    await copyFile(inputPath, outputPath);
    return;
  }
  const atempo = clamp(ratio, 0.5, 2.0);
  await run(ffmpegBin(), [
    '-y',
    '-i', inputPath,
    '-af', `atempo=${atempo}`,
    '-c:a', 'aac', '-b:a', '128k',
    outputPath,
  ]);
}

/**
 * Mix TTS voice audio với nhạc nền gốc, với bgm volume giảm để giọng TTS rõ hơn.
 * @param ttsPath   - File audio TTS (giọng lồng tiếng mới)
 * @param bgmPath   - File audio nhạc nền đã tách
 * @param outputPath - File audio output đã mix
 * @param bgmVolume - Volume nhạc nền (0-1, default 0.3 để giọng TTS vẫn rõ)
 */
export async function mixAudioTracks(
  ttsPath: string,
  bgmPath: string,
  outputPath: string,
  bgmVolume = 0.3,
  ttsVolume = 2.5,
): Promise<void> {
  const vol = Math.min(1, Math.max(0, bgmVolume));
  const ttsVol = Math.min(3.0, Math.max(0.5, ttsVolume));
  
  // Dùng apad để đệm khoảng lặng vô tận cho TTS, đảm bảo mix sẽ kết thúc chính xác
  // khi BGM (thời lượng video) kết thúc (duration=shortest). 
  // dropout_transition=0 để âm lượng BGM không bị bật ngược lên đột ngột khi TTS hết.
  const filterComplex = `[0:a]volume=${ttsVol.toFixed(2)},apad[tts];[1:a]volume=${vol}[bgm];[tts][bgm]amix=inputs=2:normalize=0:duration=shortest:dropout_transition=0[out]`;

  await run(ffmpegBin(), [
    '-y',
    '-i', ttsPath,
    '-i', bgmPath,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '128k',
    outputPath,
  ]);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

function ffmpegColor(hex: string | undefined, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex ?? "") ? `0x${hex!.slice(1)}` : fallback;
}

function escapeDrawtext(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:");
}

function timelineEnable(startSec: number | undefined, endSec: number | undefined): string {
  const start = typeof startSec === "number" && Number.isFinite(startSec)
    ? Math.max(0, startSec)
    : undefined;
  const end = typeof endSec === "number" && Number.isFinite(endSec)
    ? Math.max(0, endSec)
    : undefined;

  if (start === undefined && end === undefined) return "";
  if (start !== undefined && end !== undefined) {
    const safeEnd = end > start ? end : start + 0.1;
    return `:enable='between(t,${roundTime(start)},${roundTime(safeEnd)})'`;
  }
  if (start !== undefined) return `:enable='gte(t,${roundTime(start)})'`;
  return `:enable='lte(t,${roundTime(end!)})'`;
}

function roundTime(sec: number): string {
  return (Math.round(sec * 100) / 100).toFixed(2);
}

export function fitTextToRegion(
  text: string,
  input: {
    width: number;
    height: number;
    desiredFontSize: number;
    minFontSize?: number;
    maxFontSize?: number;
  },
): { text: string; fontSize: number; lines: string[] } {
  const maxFontSize = clamp(
    input.maxFontSize ?? input.desiredFontSize,
    12,
    Math.max(12, input.desiredFontSize),
  );
  const minFontSize = clamp(input.minFontSize ?? 14, 8, maxFontSize);
  const maxLines = input.height >= maxFontSize * 1.8 ? 2 : 1;
  const contentWidth = Math.max(1, input.width * 0.9);
  const contentHeight = Math.max(1, input.height * 0.78);

  for (let size = Math.round(maxFontSize); size >= minFontSize; size--) {
    const maxCharsPerLine = Math.max(4, Math.floor(contentWidth / (size * 0.58)));
    const lines = wrapText(text, maxCharsPerLine, maxLines);
    const renderedHeight = lines.length * size + Math.max(0, lines.length - 1) * Math.round(size * 0.14);
    const widestLine = Math.max(...lines.map((line) => estimatedTextWidth(line, size)), 0);
    if (renderedHeight <= contentHeight && widestLine <= contentWidth) {
      return { text: lines.join("\n"), fontSize: size, lines };
    }
  }

  const fallbackChars = Math.max(4, Math.floor(contentWidth / (minFontSize * 0.58)));
  const lines = wrapText(text, fallbackChars, maxLines);
  return { text: lines.join("\n"), fontSize: minFontSize, lines };
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) return lines.slice(0, maxLines);
  const usedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (usedWords < words.length && lines.length) {
    lines[lines.length - 1] = truncateToFit(lines[lines.length - 1], maxCharsPerLine);
  }
  return lines;
}

function truncateToFit(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trim()}…`;
}

function estimatedTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}

function fitBoxBorder(
  region: { w: number; h: number },
  frameWidth: number,
  frameHeight: number,
): number {
  const minSide = Math.min(region.w * frameWidth, region.h * frameHeight);
  return clamp(Math.round(minSide * 0.12), 4, 16);
}

const VIETNAMESE_FONT_FILE_MAP: Record<string, string> = {
  "Anton": "Anton-Regular.ttf",
  "Be Vietnam Pro": "BeVietnamPro-Bold.ttf",
  "Montserrat": "Montserrat-Bold.ttf",
  "Nunito": "Nunito-Bold.ttf",
  "Oswald": "Oswald-Bold.ttf",
  "Baloo 2": "Baloo2-Bold.ttf",
  "Inter": "Inter-Regular.ttf",
  "Impact": "Anton-Regular.ttf",
  "Arial": "BeVietnamPro-Bold.ttf",
  "Arial Black": "Montserrat-Bold.ttf",
  "Noto Sans": "BeVietnamPro-Bold.ttf",
};

function getFontOptionForDrawtext(fontName?: string): string {
  if (!fontName) return "";
  const cleaned = fontName.trim();
  const filename = VIETNAMESE_FONT_FILE_MAP[cleaned];
  if (filename) {
    const fullPath = path.join(process.cwd(), "public", "fonts", filename);
    if (existsSync(fullPath)) {
      const escapedPath = fullPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      return `:fontfile='${escapedPath}'`;
    }
  }
  return `:font='${escapeDrawtext(cleaned)}'`;
}

export function transformRegionForReframe(
  region: { x: number; y: number; w: number; h: number; startSec?: number; endSec?: number },
  sourceWidth: number,
  sourceHeight: number,
  reframe: Extract<VideoOp, { op: "reframe" }> | undefined,
): { x: number; y: number; w: number; h: number; startSec?: number; endSec?: number } {
  if (!reframe || sourceWidth <= 0 || sourceHeight <= 0) {
    return { ...clampRegion(region), startSec: region.startSec, endSec: region.endSec };
  }

  const targetWidth = reframe.width;
  const targetHeight = reframe.height;
  const scale =
    reframe.mode === "crop"
      ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
      : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;
  const offsetX = (targetWidth - scaledWidth) / 2;
  const offsetY = (targetHeight - scaledHeight) / 2;

  const left = region.x * scaledWidth + offsetX;
  const top = region.y * scaledHeight + offsetY;
  const right = (region.x + region.w) * scaledWidth + offsetX;
  const bottom = (region.y + region.h) * scaledHeight + offsetY;

  const clippedLeft = clamp(left, 0, targetWidth);
  const clippedTop = clamp(top, 0, targetHeight);
  const clippedRight = clamp(right, clippedLeft + 1, targetWidth);
  const clippedBottom = clamp(bottom, clippedTop + 1, targetHeight);

  return {
    ...clampRegion({
    x: clippedLeft / targetWidth,
    y: clippedTop / targetHeight,
    w: (clippedRight - clippedLeft) / targetWidth,
    h: (clippedBottom - clippedTop) / targetHeight,
    }),
    startSec: region.startSec,
    endSec: region.endSec,
  };
}

function clampRegion(region: { x: number; y: number; w: number; h: number }) {
  const x = clamp(region.x, 0, 0.98);
  const y = clamp(region.y, 0, 0.98);
  return {
    x,
    y,
    w: Math.max(0.01, Math.min(region.w, 1 - x)),
    h: Math.max(0.01, Math.min(region.h, 1 - y)),
  };
}

// ---------------------------------------------------------------------------
// Tiện ích thư mục tạm
// ---------------------------------------------------------------------------

/** Tạo thư mục tạm cho một lần chạy remix. */
export async function makeWorkDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "remix-"));
}

/** Dọn thư mục tạm — luôn gọi trong finally. */
export async function cleanupWorkDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** Ghi buffer thành file trong workDir và trả path. */
export async function writeTemp(
  workDir: string,
  name: string,
  data: Buffer,
): Promise<string> {
  const p = path.join(workDir, name);
  await writeFile(p, data);
  return p;
}

/** Đọc file kết quả thành Buffer để upload lên storage. */
export async function readResult(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

/** Trích 1 frame làm ảnh thumbnail/poster (dùng cho output kind = image). */
export async function extractFrame(
  inputPath: string,
  workDir: string,
  atSec = 1,
): Promise<string> {
  const out = path.join(workDir, "frame.png");
  await run(ffmpegBin(), [
    "-y",
    "-ss", String(Math.max(0, atSec)),
    "-i", inputPath,
    "-frames:v", "1",
    out,
  ]);
  return out;
}
