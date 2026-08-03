/**
 * AI-powered subtitle region detector (SPEC §7.4 — auto-detect original subs).
 *
 * Cơ chế:
 *  1. Trích 3 frame từ video tại 10%, 50%, 90% độ dài → JPEG.
 *  2. Gửi 3 frame lên Gemini Vision (inline_data / base64).
 *  3. AI trả về { hasSubtitle, region: {x,y,w,h}, confidence } (normalized 0–1).
 *  4. Nếu confidence < 0.5 hoặc hasSubtitle=false → trả về null (không làm mờ).
 *
 * Chi phí:
 *  - Gemini Flash: ~3 frame × ~50KB JPEG × giá ảnh ≈ $0.0001/lần (rất rẻ).
 *  - Không gọi API nếu user đã set blurRegion thủ công.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractJson } from "@/lib/ai/json";

const _require = createRequire(import.meta.url);
const _ffmpegPath: string | null = _require("ffmpeg-static");

function ffmpegBin(): string {
  const e = process.env.FFMPEG_PATH;
  if (e && e.trim()) return e.trim();
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
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`));
    });
    p.on("error", reject);
  });
}

export interface DetectedSubtitleRegion {
  /** Toạ độ vùng phụ đề (normalized 0–1 theo width/height). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Mức độ tin cậy AI (0–1). */
  confidence: number;
}

interface RawDetection {
  hasSubtitle?: boolean;
  region?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  };
  confidence?: number;
  notes?: string;
}

/**
 * Phát hiện vùng phụ đề gốc bằng Gemini Vision.
 * Trả về null nếu:
 * - Không phát hiện phụ đề
 * - AI confidence < ngưỡng MIN_CONFIDENCE
 * - API lỗi (không làm chết pipeline)
 *
 * @param videoPath Đường dẫn tuyệt đối đến file video nguồn
 * @param durationSec Độ dài video (giây)
 * @param minConfidence Ngưỡng tin cậy tối thiểu (mặc định 0.5)
 */
export async function detectSubtitleRegion(
  videoPath: string,
  durationSec: number,
  minConfidence = 0.5,
): Promise<DetectedSubtitleRegion | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("detectSubtitleRegion: GEMINI_API_KEY không có — bỏ qua auto-detect");
    return null;
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "subdetect-"));
  try {
    // 1. Trích 3 frame tại 10%, 50%, 90% thời lượng video
    const timestamps = [0.1, 0.5, 0.9].map((pct) =>
      Math.max(0.5, Math.round(durationSec * pct * 10) / 10),
    );

    const framePaths: string[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const framePath = path.join(workDir, `frame${i}.jpg`);
      await run(ffmpegBin(), [
        "-ss", String(timestamps[i]),
        "-i", videoPath,
        "-frames:v", "1",
        "-q:v", "5",      // chất lượng JPEG 1–31 (5 ≈ 80%, nhỏ nhưng đủ rõ text)
        "-vf", "scale=640:-1",  // resize 640px wide để tiết kiệm token
        "-y", framePath,
      ]);
      framePaths.push(framePath);
    }

    // 2. Đọc frame thành base64
    const imageParts = await Promise.all(
      framePaths.map(async (fp) => {
        const data = await readFile(fp);
        return {
          inlineData: {
            data: data.toString("base64"),
            mimeType: "image/jpeg" as const,
          },
        };
      }),
    );

    // 3. Gọi Gemini Vision
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      // Dùng flash-lite nếu có để tiết kiệm hơn; fallback sang flash
      model: process.env.GEMINI_VISION_MODEL ?? "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const prompt = `You are a subtitle detection expert. Analyze these ${imageParts.length} video frames and detect if there are HARDCODED (burned-in) subtitles or captions visible.

IMPORTANT: Only detect subtitles that are PERMANENTLY rendered into the video (not YouTube-style overlay captions). These are typically:
- Lines of text at the bottom or top of the frame
- Text that appears consistently across multiple frames
- Styled captions with backgrounds, shadows, or outlined text

Return a JSON object with this exact structure:
{
  "hasSubtitle": true/false,
  "region": {
    "x": 0.0,
    "y": 0.75,
    "w": 1.0,
    "h": 0.2
  },
  "confidence": 0.85,
  "notes": "brief explanation"
}

Region coordinates are NORMALIZED (0.0 to 1.0) relative to frame width/height:
- x, y: top-left corner of the subtitle region
- w, h: width and height of the region
- Typical bottom subtitles: y=0.80-0.87, h=0.12-0.18

If no hardcoded subtitles are found, return hasSubtitle=false with confidence.
Return ONLY the JSON object, no other text.`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const raw = extractJson<RawDetection>(result.response.text());

    if (!raw) {
      console.warn("detectSubtitleRegion: AI trả về JSON không hợp lệ");
      return null;
    }

    const confidence = typeof raw.confidence === "number" ? raw.confidence : 0;
    if (!raw.hasSubtitle || confidence < minConfidence) {
      // Không phát hiện phụ đề hoặc không đủ tin cậy
      return null;
    }

    // 4. Validate & clamp toạ độ
    const r = raw.region ?? {};
    const x = clamp(typeof r.x === "number" ? r.x : 0, 0, 0.9);
    const y = clamp(typeof r.y === "number" ? r.y : 0.8, 0, 0.95);
    const w = clamp(typeof r.w === "number" ? r.w : 1.0, 0.1, 1.0);
    const h = clamp(typeof r.h === "number" ? r.h : 0.18, 0.05, 0.5);

    return { x, y, w, h, confidence };
  } catch (err) {
    // Không làm chết job — fallback sẽ dùng vùng cố định
    console.warn("detectSubtitleRegion: lỗi —", (err as Error).message);
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
