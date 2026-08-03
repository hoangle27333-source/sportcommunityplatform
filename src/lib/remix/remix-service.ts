import type { SupabaseClient } from "@supabase/supabase-js";
import { notify, getUserTelegramChatId } from '@/lib/notifications';
import { TelegramTemplates } from '@/lib/notifications/telegram';
import { getAIProvider } from "@/lib/ai";
import { recordGeneration } from "@/lib/ai/cost";
import {
  uploadMediaAsset,
  downloadMediaObject,
  fetchToBuffer,
  type StoredAsset,
} from "@/lib/storage/media";
import {
  applyVideoOps,
  blurSubtitleRegion,
  buildReframeOp,
  cleanupWorkDir,
  concatWithIntroOutro,
  extractFrame,
  makeWorkDir,
  mixAudioTracks,
  adjustAudioTempo,
  probeVideo,
  readResult,
  separateVoiceBgm,
  scriptToCues,
  buildSrt,
  subtitlePlacementForBlurRegion,
  writeTemp,
  type VideoInfo,
} from "./video-ops";
import { extractAudio, transcribeToSrt } from "./asr";
import { planRemix } from "./planner";
import { analyzeInspiration } from "./inspiration";
import { getTtsProvider, synthesizeToFile } from "./tts";
import { detectSubtitleRegion } from "./subtitle-detector";

import youtubedlFactory from "youtube-dl-exec";
// Fix: Use relative path to avoid 'tinyspawn' space-splitting bug in absolute paths
const youtubedl = youtubedlFactory.create('./node_modules/youtube-dl-exec/bin/yt-dlp');
import ffmpegPath from "ffmpeg-static";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type {
  RemixOptions,
  RemixOutputKind,
  RemixPlan,
  RemixSourceType,
  VideoOp,
} from "./types";

/**
 * Content Remix — điều phối một vòng chạy (SPEC §7, ranh giới §0).
 *
 * Vòng đời: queued → analyzing → processing → review → (revising → …) → approved
 *
 * Nguyên tắc:
 *   - Chỉ xử lý media NGƯỜI DÙNG SỞ HỮU. Nguồn `inspiration` KHÔNG tải file gốc,
 *     chỉ đọc metadata công khai để rút công thức (§0).
 *   - Mỗi vòng ghi một bản vào remix_revisions để so sánh & quay lại.
 *   - Lỗi một bước phụ (TTS chưa cấu hình, không có logo) chỉ thêm warning,
 *     không làm chết job — người dùng vẫn nhận được kết quả dùng được.
 *
 * Chạy dưới service-role client trong worker (đọc storage, ghi media_assets).
 */

export class RemixError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RemixError";
    this.status = status;
  }
}

interface RemixJobRow {
  id: string;
  source_type: RemixSourceType;
  source_url: string | null;
  source_media_id: string | null;
  ownership_confirmed: boolean;
  output_kind: RemixOutputKind;
  prompt: string | null;
  options: RemixOptions;
  status: string;
  plan: RemixPlan | Record<string, never>;
  iteration: number;
  campaign_id: string | null;
  created_by: string | null;
  preset_id: string | null;
}


export interface RunRemixResult {
  jobId: string;
  status: "review" | "failed";
  iteration: number;
  resultMediaId?: string;
  resultUrl?: string;
  caption?: string;
  hashtags: string[];
  warnings: string[];
  planSummary?: string;
}

/**
 * Chạy một vòng remix cho job. Dùng cho cả vòng đầu và vòng sửa —
 * `feedback` khác null nghĩa là đang sửa theo phản hồi.
 */
export async function runRemixJob(
  db: SupabaseClient,
  jobId: string,
  feedback?: string,
): Promise<RunRemixResult> {
  const job = await loadJob(db, jobId);
  const warnings: string[] = [];

  // Vòng sửa tăng iteration; vòng đầu giữ nguyên 0.
  const iteration = feedback ? job.iteration + 1 : job.iteration;

  try {
    await setStatus(db, jobId, "analyzing");

    // ---- 0. Merge preset settings into options (preset là default; options là override) ----
    let effectiveOptions: RemixOptions = { ...(job.options ?? {}) };
    if (job.preset_id) {
      const { data: preset } = await db
        .from('remix_presets')
        .select('*')
        .eq('id', job.preset_id)
        .maybeSingle();
      if (preset) {
        // Options từ job override preset defaults
        effectiveOptions = {
          // Preset defaults
          voiceName: preset.voice_name,
          blurOriginalSub: preset.blur_original_sub,
          blurRegion: preset.blur_region,
          targetLanguage: preset.target_language,
          subFont: preset.sub_font,
          subFontSize: preset.sub_font_size,
          subColor: preset.sub_color,
          subBgColor: preset.sub_bg_color,
          subBold: preset.sub_bold,
          subItalic: preset.sub_italic,
          subOutline: preset.sub_outline,
          subBorderStyle: preset.sub_border_style,
          subPosition: preset.sub_position,
          outputRatio: preset.output_ratio,
          introEnabled: preset.intro_enabled,
          introMediaId: preset.intro_media_id,
          outroEnabled: preset.outro_enabled,
          outroMediaId: preset.outro_media_id,
          vietsub: preset.auto_vietsub,
          dubVi: preset.auto_dub,
          dubMode: preset.dub_mode ?? (preset.auto_dub ? 'full' : 'none'),
          // Override with per-job options (user can still override preset per job)
          ...effectiveOptions,
        };
      }
    }

    // ---- 1. Ngữ cảnh tham khảo (không tải media bên thứ ba) ----
    let inspiration: string | undefined;
    if (job.source_type === "inspiration" && job.source_url) {
      const res = await analyzeInspiration({
        url: job.source_url,
        // Mô tả của người dùng là ngữ cảnh quan trọng nhất — họ đã xem bài gốc.
        userDescription: job.prompt ?? undefined,
        brandContext: process.env.BRAND_CONTEXT,
      });
      inspiration = res.formula;
      warnings.push(...res.warnings);
    }

    // ---- 2. Chuẩn bị nguồn media (chỉ với nội dung của mình) ----
    const workDir = await makeWorkDir();
    try {
      let sourcePath: string | null = null;
      let videoInfo: VideoInfo | null = null;

      if (job.source_type === "upload" || job.source_type === "own_link") {
        const buf = await loadOwnSource(db, job);
        sourcePath = await writeTemp(workDir, "source", buf);
        // Chỉ probe khi đầu ra cần xử lý video.
        if (job.output_kind !== "caption") {
          videoInfo = await probeVideo(sourcePath).catch(() => null);
          if (!videoInfo) {
            warnings.push(
              "Không đọc được thông tin video nguồn — có thể file là ảnh hoặc định dạng không hỗ trợ.",
            );
          }

          // ---- 2b. AI Auto-detect vùng phụ đề gốc (nếu bật) ----
          // Chỉ chạy khi: autoDetectSubtitleRegion=true VÀ user chưa set blurRegion thủ công.
          if (
            videoInfo &&
            effectiveOptions.autoDetectSubtitleRegion &&
            !effectiveOptions.blurRegion
          ) {
            console.log(`[remix] Auto-detecting subtitle region for job ${jobId}...`);
            const detected = await detectSubtitleRegion(sourcePath, videoInfo.durationSec);
            if (detected) {
              // Ghi nhận vào effectiveOptions để planner tính marginV đúng
              effectiveOptions.blurOriginalSub = true;
              effectiveOptions.blurRegion = {
                x: detected.x,
                y: detected.y,
                w: detected.w,
                h: detected.h,
              };
              warnings.push(
                `AI phát hiện phụ đề gốc tại y=${(detected.y * 100).toFixed(0)}% ` +
                `(h=${(detected.h * 100).toFixed(0)}%), confidence=${(detected.confidence * 100).toFixed(0)}%. ` +
                `Sẽ làm mờ vùng này và đặt phụ đề mới trong vùng blur.`,
              );
            } else {
              // Không tìm thấy phụ đề gốc → không blur, không ép blurOriginalSub
              effectiveOptions.blurOriginalSub = false;
              warnings.push("AI không phát hiện phụ đề gốc — bỏ qua bước làm mờ.");
            }
          }
        }
      }

      // ---- 2c. ASR: Trích xuất audio → phiên âm + dịch → scriptVi thật ----
      // Chạy khi bật vietsub HOẶC dubbing, và video có audio.
      let asrScriptVi: string | undefined;
      const needsTranscription =
        videoInfo?.hasAudio &&
        sourcePath &&
        (effectiveOptions.vietsub || effectiveOptions.dubMode === 'full' || effectiveOptions.dubMode === 'preserve_bgm' || effectiveOptions.dubVi);

      if (needsTranscription && sourcePath) {
        try {
          await setStatus(db, jobId, 'analyzing');
          console.log(`[remix] ASR: trích xuất audio từ video...`);
          const audioPath = await extractAudio({ inputPath: sourcePath, workDir });
          if (audioPath) {
            console.log(`[remix] ASR: gọi Gemini để phiên âm + dịch...`);
            const asrResult = await transcribeToSrt(audioPath);
            if (asrResult.srt) {
              // Chuyển SRT thành plain text để dùng làm scriptVi cho TTS/subtitle
              // Gemini đôi khi sinh timecode không chuẩn, hoặc dán chung vào cùng 1 dòng
              asrScriptVi = asrResult.srt
                .replace(/^\s*\d{1,4}\s*$/gm, '') // bỏ số thứ tự đứng một mình
                .replace(/\d{1,2}(?::\d{2}){1,2}[,.]\d{1,3}\s*-->\s*\d{1,2}(?::\d{2}){1,2}[,.]\d{1,3}/g, '') // bỏ timecode chuẩn
                .replace(/\d{1,2}:\d{2}:\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{3}/g, '') // bỏ timecode sai (::)
                .replace(/\b\d{1,2}:\d{2}:\d{3}\b/g, '') // bỏ mốc thời gian lẻ loi
                .replace(/\b\d{1,2}:\d{2},\d{3}\b/g, '')
                .replace(/-->+/g, '')
                .replace(/[ \t]+/g, ' ')
                .replace(/\n{2,}/g, '\n')
                .trim();
              console.log(`[remix] ASR xong: ${asrScriptVi.slice(0, 100)}...`);
              warnings.push(`Đã phiên âm và dịch audio sang tiếng Việt thành công (${asrScriptVi.split('\n').length} dòng).`);
            } else {
              warnings.push(`ASR không nhận ra giọng nói: ${asrResult.error ?? 'lỗi không rõ'} — AI sẽ tự sinh nội dung phụ đề.`);
            }
          } else {
            warnings.push('Không trích xuất được audio từ video (có thể video không có tiếng) — AI sẽ tự sinh nội dung phụ đề.');
          }
        } catch (asrErr) {
          warnings.push(`ASR thất bại: ${(asrErr as Error).message} — AI sẽ tự sinh nội dung phụ đề.`);
        }
      }

      // ---- 3. Lập kế hoạch ----
      const hasLogo = Boolean(process.env.BRAND_LOGO_URL);
      const previousPlan = isPlan(job.plan) ? job.plan : undefined;

      const startedAt = Date.now();
      const plan = await planRemix({
        outputKind: job.output_kind,
        prompt: job.prompt ?? undefined,
        options: effectiveOptions,
        videoInfo,
        inspiration,
        feedback,
        previousPlan,
        hasLogo,
        // Truyền scriptVi từ ASR thật — nếu có sẽ được ưu tiên, không để AI bịa
        realScriptVi: asrScriptVi,
      });

      // Override reframe op from outputRatio if specified
      if (effectiveOptions.outputRatio && effectiveOptions.outputRatio !== 'original' && videoInfo) {
        const targetReframe = buildReframeOp(
          effectiveOptions.outputRatio,
          videoInfo.width,
          videoInfo.height,
        );
        if (targetReframe) {
          // Remove any existing reframe op, replace with computed one
          plan.videoOps = plan.videoOps.filter(o => o.op !== 'reframe');
          plan.videoOps.unshift(targetReframe); // reframe should be first
        }
      }

      plan.warnings = [...warnings, ...plan.warnings];

      // Ghi nhận chi phí AI (R4.7).
      void recordGeneration(db, {
        provider: getAIProvider().id,
        model: "plan",
        kind: "video",
        durationMs: Date.now() - startedAt,
        campaignId: job.campaign_id ?? undefined,
        createdBy: job.created_by ?? undefined,
      });

      await db
        .from("remix_jobs")
        .update({ plan, status: "processing" })
        .eq("id", jobId);

      // ---- 4. Thực thi ----
      let asset: StoredAsset | undefined;

      if (job.output_kind === "caption") {
        // Chỉ sinh chữ — không cần media.
      } else if (!sourcePath) {
        plan.warnings.push(
          "Chưa có media nguồn nên chỉ sinh được caption. Hãy tải video/ảnh của bạn lên để remix.",
        );
      } else if (job.output_kind === "video") {
        asset = await produceVideo({
          db,
          workDir,
          sourcePath,
          plan,
          options: effectiveOptions,
          videoInfo,
          createdBy: job.created_by ?? undefined,
        });
      } else {
        asset = await produceImage({
          db,
          workDir,
          sourcePath,
          plan,
          options: effectiveOptions,
          videoInfo,
          createdBy: job.created_by ?? undefined,
        });
      }

      // ---- 5. Lưu kết quả + chờ review ----
      const hashtags = plan.hashtags ?? [];
      await db
        .from("remix_jobs")
        .update({
          status: "review",
          plan,
          result_media_id: asset?.id ?? null,
          result_caption: plan.caption ?? null,
          result_hashtags: hashtags,
          iteration,
          error: null,
        })
        .eq("id", jobId);

      await db.from("remix_revisions").insert({
        remix_job_id: jobId,
        iteration,
        feedback: feedback ?? null,
        plan,
        result_media_id: asset?.id ?? null,
        result_caption: plan.caption ?? null,
        created_by: job.created_by ?? null,
      });

      // --- Notify user ---
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const chatId = job.created_by ? await getUserTelegramChatId(db, job.created_by) : null;
      if (job.created_by) {
        await notify({
          db,
          userId: job.created_by,
          type: 'remix_completed',
          title: 'Video đã xử lý xong',
          body: plan.summary ?? undefined,
          link: `/remix?jobId=${jobId}`,
          metadata: { jobId },
          telegramChatId: chatId ?? undefined,
          telegramMessage: TelegramTemplates.remixCompleted(jobId, appUrl),
        });
      }

      return {
        jobId,
        status: "review",
        iteration,
        resultMediaId: asset?.id,
        resultUrl: asset?.url,
        caption: plan.caption,
        hashtags,
        warnings: plan.warnings,
        planSummary: plan.summary,
      };
    } finally {
      await cleanupWorkDir(workDir);
    }
  } catch (err) {
    const message = (err as Error).message ?? "lỗi không xác định";
    await db
      .from("remix_jobs")
      .update({ status: "failed", error: message })
      .eq("id", jobId);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const chatId = job.created_by ? await getUserTelegramChatId(db, job.created_by).catch(() => null) : null;
    if (job.created_by) {
      void notify({
        db,
        userId: job.created_by,
        type: 'remix_failed',
        title: 'Xử lý video thất bại',
        body: message,
        link: `/remix?jobId=${jobId}`,
        metadata: { jobId, error: message },
        telegramChatId: chatId ?? undefined,
        telegramMessage: TelegramTemplates.remixFailed(jobId, message, appUrl),
      });
    }
    return {
      jobId,
      status: "failed",
      iteration,
      hashtags: [],
      warnings: [...warnings, message],
    };
  }
}

// ---------------------------------------------------------------------------
// Thực thi từng loại đầu ra
// ---------------------------------------------------------------------------

interface ProduceVideoInput {
  db: SupabaseClient;
  workDir: string;
  sourcePath: string;
  plan: RemixPlan;
  options: RemixOptions;
  videoInfo?: VideoInfo | null;
  createdBy?: string;
}

/** Chạy pipeline video: TTS (nếu có) → logo → ffmpeg → upload. */
async function produceVideo(input: ProduceVideoInput): Promise<StoredAsset> {
  const { db, workDir, sourcePath, plan, options, videoInfo, createdBy } = input;
  const ops: VideoOp[] = [...plan.videoOps];

  // --- Lồng tiếng: xử lý theo dubMode (backward-compat với dubVi cũ) ---
  // Chuẩn hóa dubMode: nếu job cũ dùng dubVi=true mà chưa có dubMode → coi là 'full'
  const effectiveDubMode =
    options.dubMode ?? (options.dubVi ? 'full' : 'none');

  if (effectiveDubMode !== 'none') {
    if (!plan.scriptVi) {
      plan.warnings.push(
        "Bật lồng tiếng nhưng chưa có script tiếng Việt — giữ audio gốc.",
      );
    } else if (!getTtsProvider()) {
      plan.warnings.push(
        "Chưa cấu hình TTS (TTS_PROVIDER/API key) nên chưa lồng được tiếng Việt — giữ audio gốc. Phụ đề vẫn hoạt động.",
      );
    } else {
      const voiceOverride = options.voiceName ?? process.env.TTS_VOICE_VI ?? 'vi-VN-WaveNet-A';
      
      // Phòng hờ AI Planner vẫn lén chèn timecode vào scriptVi
      const cleanScriptForTts = plan.scriptVi
        .replace(/^\s*\d{1,4}\s*$/gm, '')
        .replace(/\d{1,2}(?::\d{2}){1,2}[,.]\d{1,3}\s*-->\s*\d{1,2}(?::\d{2}){1,2}[,.]\d{1,3}/g, '')
        .replace(/\d{1,2}:\d{2}:\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{3}/g, '')
        .replace(/\b\d{1,2}:\d{2}:\d{3}\b/g, '')
        .replace(/\b\d{1,2}:\d{2},\d{3}\b/g, '')
        .replace(/-->+/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim();

      const tts = await synthesizeToFile(cleanScriptForTts, workDir, voiceOverride);

      if ('path' in tts) {
        if (effectiveDubMode === 'full') {
          // Thay toàn bộ audio bằng giọng TTS (không gò ép tốc độ làm méo tiếng)
          ops.push({ op: 'replaceAudio', audioPath: tts.path });
          plan.warnings.push('Lồng tiếng: thay toàn bộ audio bằng giọng TTS (giữ tốc độ tự nhiên).');
        } else if (effectiveDubMode === 'preserve_bgm') {
          // Tách nhạc nền → mix TTS voice + bgm gốc
          try {
            const { bgmPath } = await separateVoiceBgm(sourcePath, workDir);
            const mixedAudioPath = path.join(workDir, 'mixed_audio.aac');
            const bgmVol = typeof options.bgVolume === 'number' ? options.bgVolume : 0.3;
            await mixAudioTracks(tts.path, bgmPath, mixedAudioPath, bgmVol);
            ops.push({ op: 'replaceAudio', audioPath: mixedAudioPath });
            plan.warnings.push('Lồng tiếng: giọng TTS + nhạc nền gốc được giữ lại (giữ tốc độ tự nhiên).');
          } catch (e) {
            plan.warnings.push(`Tách nền thất bại (${(e as Error).message}), dùng TTS ghi đè hoàn toàn.`);
            ops.push({ op: 'replaceAudio', audioPath: tts.path });
          }
        }
      } else {
        plan.warnings.push(`${tts.error} — giữ audio gốc.`);
      }
    }
  }

  // --- Phụ đề Vietsub (ASR) ---
    if (options.vietsub) {
      const trimOp = ops.find((o) => o.op === "trim") as Extract<VideoOp, { op: "trim" }> | undefined;
      const trimParam = trimOp ? { start: trimOp.start, duration: trimOp.duration } : undefined;
      const duration = trimOp ? trimOp.duration : (videoInfo?.durationSec ?? 30);
      
      const audioPath = await extractAudio({ inputPath: sourcePath, workDir, trim: trimParam });
      if (audioPath) {
        let srt: string | undefined;
        let asrError: string | undefined;

        if (options.editedScript) {
          // Build valid SRT format from the raw text
          const cues = scriptToCues(options.editedScript, duration);
          srt = buildSrt(cues);
        } else {
          // If no edited script, check if plan already has subtitles
          const existingSub = ops.find(o => o.op === "subtitles") as Extract<VideoOp, { op: "subtitles" }> | undefined;
          if (existingSub?.srt) {
            srt = existingSub.srt;
          } else {
            // Fallback to ASR if somehow completely missing
            const result = await transcribeToSrt(audioPath);
            srt = result.srt;
            asrError = result.error;
          }
        }

        if (srt) {
          // Apply subtitle style settings: subtitleConfig object takes priority over flat fields
          const sc = options.subtitleConfig;
          const pos = sc?.position ?? options.subPosition ?? 'bottom';
          let marginV = 60;
          let alignment = 2; // ASS bottom-center
          if (pos === 'top') {
            alignment = 8;
            marginV = 40;
          } else if (pos === 'auto' && options.blurOriginalSub !== false) {
            const reframeOp = ops.find((o) => o.op === "reframe") as
              | Extract<VideoOp, { op: "reframe" }>
              | undefined;
            const targetHeight = reframeOp?.height ?? videoInfo?.height ?? 1920;
            const placement = subtitlePlacementForBlurRegion(options.blurRegion, targetHeight);
            alignment = placement.alignment;
            marginV = placement.marginV;
          }

          const subStyle = {
            fontSize: sc?.size ?? options.subFontSize ?? 24,
            primaryColor: sc?.color ?? options.subColor,
            outlineColor: sc?.bgColor ?? options.subBgColor,
            borderStyle: sc?.borderStyle ?? options.subBorderStyle,
            bold: sc?.bold ?? options.subBold,
            italic: sc?.italic ?? options.subItalic,
            outline: sc?.outline ?? options.subOutline,
            marginV,
            alignment,
          };
          const subIdx = ops.findIndex((o) => o.op === "subtitles");
          if (subIdx >= 0) {
            const op = ops[subIdx] as Extract<VideoOp, { op: "subtitles" }>;
            ops[subIdx] = { ...op, srt, ...subStyle };
          } else {
            ops.push({ op: "subtitles", srt, ...subStyle });
          }
          plan.warnings = plan.warnings.filter(w => !w.includes("Bật Vietsub nhưng chưa có nội dung thoại"));
        } else if (asrError) {
          plan.warnings.push(`Nhận dạng giọng nói (ASR) thất bại: ${asrError}. Dùng phụ đề tự tạo.`);
        }
      }
    }

  // --- Logo: tải asset thật, thay placeholder __LOGO__ ---
  const logoIdx = ops.findIndex((o) => o.op === "overlayLogo");
  if (logoIdx >= 0) {
    let logoUrl = process.env.BRAND_LOGO_URL;
    if (options.logoMediaId) {
      const { data: media } = await db
        .from("media_assets")
        .select("url")
        .eq("id", options.logoMediaId)
        .maybeSingle<{ url: string }>();
      if (media?.url) logoUrl = media.url;
    }

    if (logoUrl) {
      try {
        const logoBuf = await fetchToBuffer(logoUrl);
        const logoPath = await writeTemp(workDir, "logo.png", logoBuf);
        const op = ops[logoIdx] as Extract<VideoOp, { op: "overlayLogo" }>;
        ops[logoIdx] = { ...op, logoPath };
      } catch (err) {
        plan.warnings.push(
          `Không tải được logo (${(err as Error).message}) — bỏ qua chèn logo.`,
        );
        ops.splice(logoIdx, 1);
      }
    } else {
      ops.splice(logoIdx, 1);
    }
  }

  // Pass blur options into applyVideoOps directly
  const shouldBlur = options.vietsub && options.blurOriginalSub !== false;
  const applyBlurRegion = shouldBlur ? (options.blurRegion ?? { x: 0, y: 0.82, w: 1, h: 0.18 }) : undefined;

  const outPath = await applyVideoOps({ 
    inputPath: sourcePath, 
    ops, 
    workDir,
    blurRegion: applyBlurRegion
  });
  
  // --- Intro/Outro: concat nếu preset đã cấu hình ---
  let finalPath = outPath;
  if (options.introEnabled || options.outroEnabled) {
    const concatParts: { introPath?: string; outroPath?: string } = {};
    
    if (options.introEnabled && options.introMediaId) {
      try {
        const { data: introMedia } = await db
          .from('media_assets')
          .select('url')
          .eq('id', options.introMediaId)
          .maybeSingle<{ url: string }>();
        if (introMedia?.url) {
          const buf = await fetchToBuffer(introMedia.url);
          concatParts.introPath = await writeTemp(workDir, 'intro.mp4', buf);
        }
      } catch (err) {
        plan.warnings.push(`Không tải được intro: ${(err as Error).message}`);
      }
    }
    
    if (options.outroEnabled && options.outroMediaId) {
      try {
        const { data: outroMedia } = await db
          .from('media_assets')
          .select('url')
          .eq('id', options.outroMediaId)
          .maybeSingle<{ url: string }>();
        if (outroMedia?.url) {
          const buf = await fetchToBuffer(outroMedia.url);
          concatParts.outroPath = await writeTemp(workDir, 'outro.mp4', buf);
        }
      } catch (err) {
        plan.warnings.push(`Không tải được outro: ${(err as Error).message}`);
      }
    }
    
    if (concatParts.introPath || concatParts.outroPath) {
      const concatOut = path.join(workDir, 'final.mp4');
      await concatWithIntroOutro(outPath, concatOut, concatParts);
      finalPath = concatOut;
    }
  }

  const buffer = await readResult(finalPath);

  return uploadMediaAsset(db, {
    buffer,
    contentType: "video/mp4",
    ext: "mp4",
    type: "video",
    generatedBy: "image-edit", // provenance: biến đổi từ asset có sẵn
    createdBy,
    meta: {
      pipeline: "remix",
      ops: ops.map((o) => o.op),
      summary: plan.summary,
    },
  });
}

interface ProduceImageInput {
  db: SupabaseClient;
  workDir: string;
  sourcePath: string;
  plan: RemixPlan;
  options: RemixOptions;
  videoInfo?: VideoInfo | null;
  createdBy?: string;
}

/** Đầu ra ảnh: trích một frame đại diện từ video nguồn (hoặc copy nếu là ảnh), sau đó áp dụng ops. */
async function produceImage(input: ProduceImageInput): Promise<StoredAsset> {
  const { db, workDir, sourcePath, plan, options, videoInfo, createdBy } = input;
  const atSec = videoInfo && videoInfo.durationSec > 0 ? 1 : 0;
  let currentPath = await extractFrame(sourcePath, workDir, atSec);
  
  const ops = [...plan.videoOps];
  
  // --- Logo: tải asset thật, thay placeholder __LOGO__ ---
  const logoIdx = ops.findIndex((o) => o.op === "overlayLogo");
  if (logoIdx >= 0) {
    let logoUrl = process.env.BRAND_LOGO_URL;
    if (options.logoMediaId) {
      const { data: media } = await db
        .from("media_assets")
        .select("url")
        .eq("id", options.logoMediaId)
        .maybeSingle();
      if (media?.url) logoUrl = media.url;
    }

    if (logoUrl) {
      try {
        const logoBuf = await fetchToBuffer(logoUrl);
        const logoPath = await writeTemp(workDir, "logo.png", logoBuf);
        const op = ops[logoIdx];
        ops[logoIdx] = { ...op, logoPath } as any;
      } catch (err) {
        plan.warnings.push(`Không tải được logo (${(err as Error).message}) — bỏ qua chèn logo.`);
        ops.splice(logoIdx, 1);
      }
    } else {
      ops.splice(logoIdx, 1);
    }
  }

  // --- Translation (mocking overlay/regenerate) ---
  if (options.imageTranslate) {
    plan.warnings.push(`Chức năng dịch chữ trên ảnh (${options.imageTranslate}) đang thử nghiệm (Beta), chưa trừ credit.`);
  }

  if (ops.length > 0) {
    currentPath = await applyVideoOps({
      inputPath: currentPath,
      ops,
      workDir,
      isImage: true,
    });
  }

  const buffer = await readResult(currentPath);

  return uploadMediaAsset(db, {
    buffer,
    contentType: "image/png",
    ext: "png",
    type: "image",
    generatedBy: "image-edit",
    createdBy,
    meta: { 
      pipeline: "remix", 
      source: "frame-extract",
      ops: ops.map(o => o.op),
      summary: plan.summary
    },
  });
}

// ---------------------------------------------------------------------------
// Nguồn media của mình
// ---------------------------------------------------------------------------

/**
 * Tải media nguồn. Chỉ chấp nhận:
 *   - upload   : asset đã nằm trong storage của mình
 *   - own_link : link người dùng đã xác nhận sở hữu (ownership_confirmed)
 *
 * KHÔNG bao giờ tải từ nguồn `inspiration` (§0).
 */
async function loadOwnSource(
  db: SupabaseClient,
  job: RemixJobRow,
): Promise<Buffer> {
  if (job.source_type === "inspiration") {
    throw new RemixError(
      400,
      "Nguồn tham khảo không được tải file gốc — chỉ dùng để phân tích ý tưởng.",
    );
  }

  if (job.source_type === "upload") {
    if (!job.source_media_id) {
      throw new RemixError(422, "Thiếu media đã tải lên cho job này.");
    }
    const { data: media, error } = await db
      .from("media_assets")
      .select("storage_path, url")
      .eq("id", job.source_media_id)
      .single<{ storage_path: string | null; url: string }>();
    if (error || !media) {
      throw new RemixError(404, "Không tìm thấy media nguồn.");
    }
    if (media.storage_path) return downloadMediaObject(db, media.storage_path);
    return fetchToBuffer(media.url);
  }

  // own_link — DB constraint đã bắt buộc ownership_confirmed = true.
  if (!job.ownership_confirmed) {
    throw new RemixError(
      403,
      "Cần xác nhận bạn sở hữu nội dung này trước khi xử lý.",
    );
  }
  if (!job.source_url) {
    throw new RemixError(422, "Thiếu link nguồn.");
  }
  
  const url = job.source_url;
  const isSocialMedia = /facebook\.com|fb\.watch|youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com/.test(url);
  
  if (isSocialMedia) {
    // Use a unique prefix so we can glob for the actual file after download.
    // We avoid requiring ffmpeg by preferring formats that come as a single stream.
    const tempId = `ytdl-${crypto.randomUUID()}`;
    const tempDir = tmpdir();
    // Output template: yt-dlp will append the correct extension automatically
    const tempTemplate = path.join(tempDir, `${tempId}.%(ext)s`);
    let lastErr: Error | null = null;

    // Facebook & social media platforms randomly serve login walls/captchas.
    // yt-dlp will throw "Cannot parse data". We retry up to 3 times to bypass intermittent blocks.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await youtubedl(url, {
          output: tempTemplate,
          // Prefer a single-file mp4 that doesn't need ffmpeg merging.
          // Falls back to any mp4, then any format that is a single stream.
          format: "best[ext=mp4]/bestvideo[ext=mp4]/best",
          noWarnings: true,
        });

        // Find the file yt-dlp actually created (extension may vary)
        const { readdir } = await import("node:fs/promises");
        const files = await readdir(tempDir);
        const downloaded = files
          .filter((f) => f.startsWith(tempId))
          .map((f) => path.join(tempDir, f));

        if (downloaded.length === 0) {
          throw new Error(`yt-dlp finished but no output file found (prefix: ${tempId})`);
        }

        const buf = await readFile(downloaded[0]);
        // Clean up all temp files created for this download
        await Promise.all(downloaded.map((f) => rm(f, { force: true }).catch(() => {})));
        return buf;
      } catch (err) {
        lastErr = err as Error;
        // If it's not the last attempt, wait a bit and retry
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }

    throw new RemixError(500, `Không thể tải video từ link bài đăng sau 3 lần thử: ${lastErr?.message}`);
  }

  return fetchToBuffer(job.source_url);
}

// ---------------------------------------------------------------------------
// Approve → tạo post cho calendar
// ---------------------------------------------------------------------------

export interface ApproveResult {
  jobId: string;
  postId: string;
}

/**
 * Duyệt kết quả: tạo Post draft (kèm media + caption) rồi trỏ job tới post đó.
 * Post ở trạng thái `draft` — người dùng lên lịch ở bước sau (calendar).
 *
 * Idempotent: job đã approve thì trả lại post cũ, không tạo trùng.
 */
export async function approveRemixJob(
  db: SupabaseClient,
  jobId: string,
  approverId: string,
): Promise<ApproveResult> {
  const { data: job, error } = await db
    .from("remix_jobs")
    .select(
      "id, status, result_media_id, result_caption, result_hashtags, campaign_id, post_id, created_by",
    )
    .eq("id", jobId)
    .single<{
      id: string;
      status: string;
      result_media_id: string | null;
      result_caption: string | null;
      result_hashtags: string[] | null;
      campaign_id: string | null;
      post_id: string | null;
      created_by: string | null;
    }>();

  if (error || !job) throw new RemixError(404, "Không tìm thấy job.");

  // Đã duyệt trước đó → trả lại post cũ.
  if (job.post_id) return { jobId, postId: job.post_id };

  if (job.status !== "review") {
    throw new RemixError(
      409,
      `Chỉ duyệt được job đang ở trạng thái review (hiện: ${job.status}).`,
    );
  }

  const { data: post, error: postErr } = await db
    .from("posts")
    .insert({
      campaign_id: job.campaign_id,
      caption: job.result_caption,
      hashtags: job.result_hashtags ?? [],
      status: "draft",
      created_by: job.created_by,
      approved_by: approverId,
    })
    .select("id")
    .single<{ id: string }>();

  if (postErr || !post) {
    throw new RemixError(500, `Tạo post thất bại: ${postErr?.message}`);
  }

  // Gắn media kết quả vào post.
  if (job.result_media_id) {
    await db
      .from("post_media")
      .insert({ post_id: post.id, media_id: job.result_media_id, position: 0 });
  }

  await db
    .from("remix_jobs")
    .update({
      status: "approved",
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      post_id: post.id,
    })
    .eq("id", jobId);

  return { jobId, postId: post.id };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadJob(
  db: SupabaseClient,
  jobId: string,
): Promise<RemixJobRow> {
  const { data, error } = await db
    .from("remix_jobs")
    .select(
      "id, source_type, source_url, source_media_id, ownership_confirmed, output_kind, prompt, options, status, plan, iteration, campaign_id, created_by, preset_id",
    )
    .eq("id", jobId)
    .single<RemixJobRow>();
  if (error || !data) throw new RemixError(404, "Không tìm thấy remix job.");
  return data;
}

async function setStatus(
  db: SupabaseClient,
  jobId: string,
  status: string,
): Promise<void> {
  await db.from("remix_jobs").update({ status }).eq("id", jobId);
}

function isPlan(v: unknown): v is RemixPlan {
  return Boolean(v && typeof v === "object" && "videoOps" in (v as object));
}
