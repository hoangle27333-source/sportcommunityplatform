import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { stat, readFile } from "node:fs/promises";
import { GoogleGenerativeAI } from "@google/generative-ai";

const _require = createRequire(import.meta.url);
const _ffmpegPath = _require("ffmpeg-static");

function ffmpegBin(): string {
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && envPath.trim()) return envPath.trim();
  if (_ffmpegPath && _ffmpegPath.trim()) return _ffmpegPath.trim();
  return "ffmpeg";
}

export interface ExtractAudioInput {
  inputPath: string;
  workDir: string;
  trim?: { start: number; duration: number };
}

/**
 * Trích xuất audio từ video để gửi lên ASR.
 * Nếu có cắt video (trim), cắt audio tương ứng để timing phụ đề khớp hoàn toàn.
 * Trả về null nếu video không có audio hoặc lỗi trích xuất.
 */
export async function extractAudio(input: ExtractAudioInput): Promise<string | null> {
  const { inputPath, workDir, trim } = input;
  const outPath = path.join(workDir, "audio_for_asr.mp3");

  const args: string[] = ["-y"];

  if (trim) {
    args.push("-ss", String(Math.max(0, trim.start)));
    args.push("-t", String(Math.max(0.1, trim.duration)));
  }

  args.push(
    "-i", inputPath,
    "-vn", // bỏ hình
    "-acodec", "libmp3lame",
    "-b:a", "128k", // chất lượng đủ để ASR nghe rõ
    "-ac", "1", // mono tốt cho nhận dạng giọng nói
    outPath
  );

  await new Promise<void>((resolve, reject) => {
    const bin = ffmpegBin();
    if (!bin || !bin.trim()) return reject(new Error("ffmpeg binary path is empty"));
    
    let proc;
    try {
      proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      return reject(new Error(`spawn failed for "${bin}": ${(err as Error).message}`));
    }
    
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(new Error(`ffmpeg lỗi: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg thoát mã ${code}: ${stderr.slice(-800)}`));
    });
  });

  const st = await stat(outPath).catch(() => null);
  if (!st || st.size === 0) return null;

  return outPath;
}

/**
 * Gọi Gemini API để chuyển giọng nói thành phụ đề (SRT) và dịch sang ngôn ngữ đích.
 * @param targetLanguage ISO code, mặc định 'vi' (tiếng Việt)
 */
export async function transcribeToSrt(
  audioPath: string,
  targetLanguage = 'vi',
): Promise<{ srt?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: "Không có GEMINI_API_KEY, tính năng nhận dạng giọng nói bị vô hiệu hoá." };
  }

  const langLabel = targetLanguage === 'en' ? 'ENGLISH' : 'VIETNAMESE (TIẾNG VIỆT)';
  const langInstruction =
    targetLanguage === 'en'
      ? 'TRANSLATE EVERYTHING TO ENGLISH. If audio is already in English, keep it as-is.'
      : 'DỊCH TOÀN BỘ SANG TIẾNG VIỆT (Vietnamese). Nếu audio đã là tiếng Việt thì giữ nguyên.';

  try {
    const audioBuffer = await readFile(audioPath);
    const base64Audio = audioBuffer.toString("base64");

    const genAI = new GoogleGenerativeAI(apiKey);
    // Dùng cùng model với planner để tránh version drift
    // gemini-2.5-flash hỗ trợ audio multimodal (tài liệu Gemini multimodal)
    const modelName = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
[MANDATORY] ALL OUTPUT MUST BE IN ${langLabel}. DO NOT output any other language.

You are a professional subtitle creator and translator.
Task:
1. Listen to this audio.
2. Transcribe all speech.
3. ${langInstruction}
4. Return the result in standard SRT format (SubRip Subtitle) with accurate timestamps.

Reminder: REGARDLESS OF WHAT LANGUAGE THE AUDIO IS IN, the output SRT MUST be 100% in ${langLabel}.
ONLY return the SRT file content, no explanations, no markdown code blocks.
`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "audio/mp3",
          data: base64Audio
        }
      }
    ]);

    let srt = result.response.text();
    if (!srt || srt.trim() === "") {
      return { error: "Gemini không nhận diện được giọng nói trong audio." };
    }

    // Loại bỏ markdown code block nếu Gemini lỡ thêm vào
    srt = srt.replace(/^```srt\n/i, "").replace(/^```\n/i, "").replace(/```$/i, "").trim();

    return { srt };
  } catch (err) {
    return { error: `Gọi ASR thất bại: ${(err as Error).message}` };
  }
}
