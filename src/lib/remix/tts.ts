import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Text-to-Speech tiếng Việt cho lồng tiếng (option `dubVi`).
 *
 * Provider-agnostic giống AI adapter (SPEC §3): chọn bằng TTS_PROVIDER.
 *   - `google`  : Google Cloud Text-to-Speech (giọng vi-VN Neural2/Wavenet).
 *   - `say`     : `say` của macOS — chỉ để dev/thử luồng, giọng không tiếng Việt.
 *   - `none`    : mặc định. Không cấu hình → trả null, pipeline bỏ qua lồng tiếng
 *                 và ghi warning thay vì làm job thất bại.
 *
 * Trả về Buffer audio (mp3/aiff) để ffmpeg thay vào track audio.
 */

export interface TtsResult {
  buffer: Buffer;
  /** Đuôi file tương ứng để ffmpeg đọc đúng định dạng. */
  ext: "mp3" | "aiff";
}

export interface TtsProvider {
  readonly id: string;
  synthesize(text: string, workDir: string, voiceOverride?: string): Promise<TtsResult>;
}

// ---------------------------------------------------------------------------
// Google Cloud TTS — giọng tiếng Việt chất lượng cao
// ---------------------------------------------------------------------------

class GoogleTtsProvider implements TtsProvider {
  readonly id = "google";

  async synthesize(text: string, workDir: string, voiceOverride?: string): Promise<TtsResult> {
    // Hỗ trợ nhiều biến khác nhau để dễ cấu hình
    const apiKey =
      process.env.GOOGLE_CLOUD_TTS_API_KEY ||
      process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_CLOUD_TTS_API_KEY hoặc GOOGLE_TTS_API_KEY chưa được cấu hình");

    const voice = voiceOverride ?? process.env.TTS_VOICE_VI ?? "vi-VN-WaveNet-A";
    // Tự động lấy language code từ tên giọng: 'vi-VN-WaveNet-A' → 'vi-VN', 'en-US-WaveNet-B' → 'en-US'
    const langCodeMatch = voice.match(/^([a-z]{2}-[A-Z]{2})/);
    const langCode = langCodeMatch ? langCodeMatch[1] : 'vi-VN';
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: langCode, name: voice },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: Number(process.env.TTS_SPEAKING_RATE ?? "1.0"),
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google TTS lỗi ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as { audioContent?: string };
    if (!json.audioContent) throw new Error("Google TTS không trả audio");
    return { buffer: Buffer.from(json.audioContent, "base64"), ext: "mp3" };
  }
}

// ---------------------------------------------------------------------------
// macOS `say` — chỉ để dev, KHÔNG dùng cho nội dung thật
// ---------------------------------------------------------------------------

class MacSayProvider implements TtsProvider {
  readonly id = "say";

  async synthesize(text: string, workDir: string, voiceOverride?: string): Promise<TtsResult> {
    const out = path.join(workDir, "tts.aiff");
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("say", ["-o", out, text], { stdio: "ignore" });
      proc.on("error", (e) => reject(new Error(`say lỗi: ${e.message}`)));
      proc.on("close", (c) =>
        c === 0 ? resolve() : reject(new Error(`say thoát mã ${c}`)),
      );
    });
    const { readFile } = await import("node:fs/promises");
    return { buffer: await readFile(out), ext: "aiff" };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Lấy TTS provider đang cấu hình, hoặc null nếu chưa bật.
 * Null là trạng thái hợp lệ — caller ghi warning và bỏ qua lồng tiếng.
 */
export function getTtsProvider(): TtsProvider | null {
  const id = (process.env.TTS_PROVIDER ?? "auto").toLowerCase();
  switch (id) {
    case "google":
      return new GoogleTtsProvider();
    case "say":
      return new MacSayProvider();
    case "none":
      return null;
    default: {
      // Auto-detect: nếu có bất kỳ key Google TTS nào → dùng Google TTS
      const hasGoogleKey =
        !!(process.env.GOOGLE_CLOUD_TTS_API_KEY || process.env.GOOGLE_TTS_API_KEY);
      if (hasGoogleKey) return new GoogleTtsProvider();
      return null;
    }
  }
}

/**
 * Sinh file audio lồng tiếng trong workDir, trả về đường dẫn.
 * Trả null (kèm lý do qua warnings của caller) nếu TTS chưa cấu hình hoặc lỗi.
 */
export async function synthesizeToFile(
  text: string,
  workDir: string,
  voiceOverride?: string,
): Promise<{ path: string } | { error: string }> {
  return synthesizeTextToFile(text, workDir, voiceOverride, "tts");
}

export async function synthesizeTextToFile(
  text: string,
  workDir: string,
  voiceOverride?: string,
  basename = "tts",
): Promise<{ path: string } | { error: string }> {
  const provider = getTtsProvider();
  if (!provider) {
    return {
      error:
        "Lồng tiếng bị bỏ qua: chưa cấu hình TTS_PROVIDER (xem NOTES-FOR-REVIEW).",
    };
  }
  const clean = text.trim().slice(0, 5000);
  if (!clean) return { error: "Không có nội dung để lồng tiếng." };

  try {
    const { buffer, ext } = await provider.synthesize(clean, workDir, voiceOverride);
    const safeBase = basename.replace(/[^a-zA-Z0-9_-]+/g, "_") || "tts";
    const p = path.join(workDir, `${safeBase}.${ext}`);
    await writeFile(p, buffer);
    return { path: p };
  } catch (e) {
    return { error: `Lồng tiếng thất bại: ${(e as Error).message}` };
  }
}

export interface VoiceMeta {
  gender: 'male' | 'female';
  region: 'Bắc' | 'Nam' | 'US' | 'UK' | 'AU';
  style: string;
  tier: 'wavenet' | 'standard' | 'neural2';
  langCode?: string;  // e.g. 'vi-VN', 'en-US'. Default: 'vi-VN'
  note?: string;
}

export interface VoiceInfo extends VoiceMeta {
  name: string;
}

export interface VoiceFilter {
  gender?: string;
  region?: string;
  style?: string;
  tier?: string;
}

// Self-tagged voice metadata based on listening tests.
// WaveNet/Standard: FREE up to 4M chars/month.
// Neural2: charged from first character (~$16/1M chars).
const VOICE_METADATA: Record<string, VoiceMeta> = {
  // ==========================================================================
  // Tiếng Việt (vi-VN) — mặc định
  // ==========================================================================
  'vi-VN-WaveNet-A': { gender: 'female', region: 'Bắc', style: 'Trẻ trung',       tier: 'wavenet',  langCode: 'vi-VN' },
  'vi-VN-WaveNet-B': { gender: 'male',   region: 'Bắc', style: 'Tự nhiên',        tier: 'wavenet',  langCode: 'vi-VN' },
  'vi-VN-WaveNet-C': { gender: 'female', region: 'Nam',  style: 'Trầm ấm',         tier: 'wavenet',  langCode: 'vi-VN' },
  'vi-VN-WaveNet-D': { gender: 'male',   region: 'Nam',  style: 'Chuyên nghiệp',   tier: 'wavenet',  langCode: 'vi-VN' },
  'vi-VN-Standard-A': { gender: 'female', region: 'Bắc', style: 'Tiêu chuẩn',     tier: 'standard', langCode: 'vi-VN' },
  'vi-VN-Standard-B': { gender: 'male',   region: 'Bắc', style: 'Tiêu chuẩn',     tier: 'standard', langCode: 'vi-VN' },
  'vi-VN-Standard-C': { gender: 'female', region: 'Nam',  style: 'Tiêu chuẩn',     tier: 'standard', langCode: 'vi-VN' },
  'vi-VN-Standard-D': { gender: 'male',   region: 'Nam',  style: 'Tiêu chuẩn',     tier: 'standard', langCode: 'vi-VN' },
  'vi-VN-Neural2-A':  { gender: 'female', region: 'Bắc', style: 'Tự nhiên',        tier: 'neural2',  langCode: 'vi-VN', note: 'Premium - có phí' },
  'vi-VN-Neural2-D':  { gender: 'male',   region: 'Bắc', style: 'Tự nhiên',        tier: 'neural2',  langCode: 'vi-VN', note: 'Premium - có phí' },
  // ==========================================================================
  // Tiếng Anh (en-US) — FREE WaveNet up to 4M chars/month
  // ==========================================================================
  'en-US-WaveNet-A': { gender: 'male',   region: 'US', style: 'Natural',       tier: 'wavenet', langCode: 'en-US' },
  'en-US-WaveNet-B': { gender: 'male',   region: 'US', style: 'Professional',  tier: 'wavenet', langCode: 'en-US' },
  'en-US-WaveNet-C': { gender: 'female', region: 'US', style: 'Warm',          tier: 'wavenet', langCode: 'en-US' },
  'en-US-WaveNet-D': { gender: 'male',   region: 'US', style: 'Deep',          tier: 'wavenet', langCode: 'en-US' },
  'en-US-WaveNet-E': { gender: 'female', region: 'US', style: 'Clear',         tier: 'wavenet', langCode: 'en-US' },
  'en-US-WaveNet-F': { gender: 'female', region: 'US', style: 'Natural',       tier: 'wavenet', langCode: 'en-US' },
  'en-US-Standard-A': { gender: 'male',  region: 'US', style: 'Standard',      tier: 'standard', langCode: 'en-US' },
  'en-US-Standard-C': { gender: 'female', region: 'US', style: 'Standard',     tier: 'standard', langCode: 'en-US' },
};

export function listVoicesWithMeta(filter?: VoiceFilter): VoiceInfo[] {
  const tierOrder = { wavenet: 0, standard: 1, neural2: 2 };
  return Object.entries(VOICE_METADATA)
    .map(([name, meta]) => ({ name, ...meta }))
    .filter((v) => {
      if (filter?.gender && v.gender !== filter.gender) return false;
      if (filter?.region && v.region !== filter.region) return false;
      if (filter?.style && v.style !== filter.style) return false;
      if (filter?.tier && v.tier !== filter.tier) return false;
      return true;
    })
    .sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);
}

export async function previewVoiceSample(
  voiceName: string,
  apiKey: string,
  sampleText = 'Xin chào, đây là giọng đọc thử nghiệm.',
): Promise<Buffer> {
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { text: sampleText },
        voice: { languageCode: 'vi-VN', name: voiceName },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
      }),
    },
  );
  if (!res.ok) throw new Error(`TTS preview lỗi ${res.status}`);
  const json = (await res.json()) as { audioContent?: string };
  if (!json.audioContent) throw new Error('Không có audio preview');
  return Buffer.from(json.audioContent, 'base64');
}
