import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type { VideoOp, RemixOptions } from "./types";

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

  return {
    durationSec: Number(json.format?.duration ?? 0),
    width,
    height,
    fps: Math.round(fps * 100) / 100,
    hasAudio,
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
  // -------- Làm sạch script: loại bỏ MỌI dạng timecode Gemini có thể sinh ra --------
  // Gemini đôi khi trả SRT với format không chuẩn (MM:SS:mmm hoặc MM:SS.mmm hoặc
  // HH:MM:SS,mmm) và bỏ xuống cùng dòng với chữ, hoặc để trên dòng riêng.
  const cleaned = script
    // Xoá cả dòng chỉ là số thứ tự SRT ("1", "2" ...)
    .replace(/^\s*\d{1,4}\s*$/gm, '')
    // Xoá toàn bộ chuỗi timecode dạng X --> Y (mọi biến thể dấu chấm/phẩy/hai chấm)
    .replace(/\d{1,2}(?::\d{2}){1,2}[,.]\d{1,3}\s*-->\s*\d{1,2}(?::\d{2}){1,2}[,.]\d{1,3}/g, '')
    // Xoá dạng MM:SS:mmm --> MM:SS:mmm (Gemini hay sinh ra)
    .replace(/\d{1,2}:\d{2}:\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{3}/g, '')
    // Xoá token đơn lẻ trông giống timestamp (VD: "00:01:230")
    .replace(/\b\d{1,2}:\d{2}:\d{3}\b/g, '')
    .replace(/\b\d{1,2}:\d{2},\d{3}\b/g, '')
    // Xoá mũi tên còn sót
    .replace(/-->+/g, '')
    // Chuẩn hoá khoảng trắng thừa
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0 || totalSec <= 0) return [];

  // Gom từ thành dòng ngắn để dễ đọc trên màn hình dọc.
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxCharsPerCue) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur.trim());

  // Phân bổ thời lượng theo độ dài ký tự (dòng dài hiện lâu hơn).
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

const LOGO_OVERLAY_XY: Record<
  NonNullable<RemixOptions["logoPosition"]>,
  string
> = {
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
  const textOverlay = byOp("overlayText");
  const logo = byOp("overlayLogo");
  const replaceAudio = byOp("replaceAudio");
  const mute = ops.some((o) => o.op === "mute");
  const encode = byOp("encode");

  const args: string[] = ["-y"];

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

  const info = await probeVideo(inputPath).catch(() => ({ width: 1080, height: 1920 }));

  if (input.blurRegion) {
    const { x, y, w, h } = input.blurRegion;
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

    // Dùng delogo thay vì boxblur complex để dễ dàng chèn vào chuỗi filter tuyến tính
    chain.push(`delogo=x=${bx}:y=${by}:w=${bw}:h=${bh}:show=0`);
  }

  if (color) {
    const b = clamp(color.brightness ?? 0, -0.3, 0.3);
    const c = clamp(color.contrast ?? 1, 0.5, 1.8);
    const s = clamp(color.saturation ?? 1, 0.5, 2);
    chain.push(`eq=brightness=${b}:contrast=${c}:saturation=${s}`);
  }

  if (subs) {
    const srtPath = path.join(workDir, "sub.srt");
    await writeFile(srtPath, subs.srt, "utf8");
    const fontSize = clamp(subs.fontSize ?? 24, 12, 72);
    const assFontSize = Math.round(fontSize * 0.66);
    
    // Convert #RRGGBB to &H00BBGGRR
    const toAssColor = (hex?: string, def = '&H00FFFFFF') => {
      if (!hex || !hex.startsWith('#')) return def;
      const r = hex.slice(1, 3) || 'FF';
      const g = hex.slice(3, 5) || 'FF';
      const b = hex.slice(5, 7) || 'FF';
      return `&H00${b}${g}${r}`;
    };

    const style = [
      `FontSize=${assFontSize}`,
      `PrimaryColour=${toAssColor(subs.primaryColor, '&H00FFFFFF')}`,
      `OutlineColour=${toAssColor(subs.outlineColor, '&H00000000')}`,
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

  if (textOverlay) {
    const escapedText = textOverlay.text.replace(/'/g, "\u2019").replace(/:/g, "\\:");
    chain.push(
      `drawtext=text='${escapedText}':fontcolor=white:fontsize=h/15:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10`
    );
  }

  // Logo cần overlay (2 input) nên xử lý qua filter_complex.
  const useComplex = logoIdx >= 0;
  let filterComplex = "";

  if (useComplex) {
    const pre = chain.length ? `[0:v]${chain.join(",")}[base]` : `[0:v]null[base]`;
    const logoScale = clamp(logo!.scale ?? 0.15, 0.03, 0.5);
    const xy = LOGO_OVERLAY_XY[logo!.position];
    filterComplex =
      `${pre};` +
      `[${logoIdx}:v]scale=iw*${logoScale}:-1[logo];` +
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
): Promise<{ bgmPath: string }> {
  const bgmPath = path.join(workDir, 'bgm_extracted.aac');

  // Lọc lowpass + highpass: giữ lại phần tần số ngoài dải giọng người (voice band 300Hz-3kHz)
  // Dùng FFmpeg's equalizer để hạ âm giọng người và giữ nhạc nền
  await run(ffmpegBin(), [
    '-y', '-i', inputPath,
    '-af',
    // Hạ giọng người (tập trung 300-3000Hz) xuống ~-18dB, giữ nhạc nền
    'equalizer=f=1000:width_type=o:width=3:g=-18,equalizer=f=500:width_type=o:width=2:g=-12,equalizer=f=2000:width_type=o:width=2:g=-12,volume=2.0',
    '-vn',
    '-c:a', 'aac', '-b:a', '128k',
    bgmPath,
  ]);

  return { bgmPath };
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
): Promise<void> {
  const vol = Math.min(1, Math.max(0, bgmVolume));
  
  // Dùng apad để đệm khoảng lặng vô tận cho TTS, đảm bảo mix sẽ kết thúc chính xác
  // khi BGM (thời lượng video) kết thúc (duration=shortest). 
  // dropout_transition=0 để âm lượng BGM không bị bật ngược lên đột ngột khi TTS hết.
  const filterComplex = `[0:a]volume=2.0,apad[tts];[1:a]volume=${vol}[bgm];[tts][bgm]amix=inputs=2:duration=shortest:dropout_transition=0[out]`;

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
