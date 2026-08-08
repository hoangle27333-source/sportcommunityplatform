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
  probeVideo,
  parseSrtCues,
  readResult,
  reviewRenderedVideo,
  separateVoiceBgm,
  scriptToCues,
  buildSrt,
  buildAssSubtitles,
  subtitlePlacementForBlurRegion,
  writeTemp,
  type SubtitleCue,
  type VideoInfo,
} from "./video-ops";
import { sanitizeTranscriptText } from "./utils";
import { extractAudio, transcribeToSrt } from "./asr";
import { planRemix } from "./planner";
import { analyzeInspiration } from "./inspiration";
import {
  detectOnScreenTextLayoutFromVideo,
  translateOnScreenTextFromVideo,
  translatePlannedOnScreenTextTracks,
  type OnScreenTextTranslation,
} from "./on-screen-text";
import { buildFacebookCopyrightPreflight } from "./copyright-preflight";
import { getTtsProvider, synthesizeTextToFile, synthesizeToFile } from "./tts";
import { analyzeVoiceTimeline, translateAlignedCues, detectSpeechSegments, realignCuesToSpeech, groupIntoCompleteSentences } from "./voice-pipeline";
import { detectSubtitleRegion } from "./subtitle-detector";
import { buildRemixOptionsFromPreset } from "./preset-options";
import {
  validateVideoForHeyGen,
  submitHeyGenTranslateJob,
  getHeyGenJobStatus,
  downloadHeyGenSubtitleSrt,
} from "./heygen";

import youtubedlFactory from "youtube-dl-exec";
// Allow overriding the yt-dlp binary via YTDLP_PATH env var.
// The npm-bundled binary (PyInstaller) cannot solve YouTube's JS challenges, causing
// "Only images are available" errors. Use a Python-installed yt-dlp for full support.
const YTDLP_BIN = process.env.YTDLP_PATH ?? './node_modules/youtube-dl-exec/bin/yt-dlp';
const youtubedl = youtubedlFactory.create(YTDLP_BIN);
const YTDLP_ENV = {
  ...process.env,
  PYTHONWARNINGS: process.env.PYTHONWARNINGS ?? "ignore",
};
type YtDlpCookieMode =
  | { type: "cookies"; value: string }
  | { type: "browser"; value: string };

interface YtDlpAttemptProfile {
  format: string;
  cookieMode?: YtDlpCookieMode;
  extractorArgs?: string;
}
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import sharp from "sharp";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import type {
  RemixOptions,
  RemixOutputKind,
  RemixPlan,
  RemixSourceType,
  VideoOp,
  AlignedVoiceCue,
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

function requireVoicePipelineV2ForLocalization(): boolean {
  return (process.env.VOICE_REQUIRE_V2_FOR_LOCALIZATION ?? "true").toLowerCase() !== "false";
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
        effectiveOptions = buildRemixOptionsFromPreset(preset, effectiveOptions);
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
      let sourceBuffer: Buffer | null = null;
      let videoInfo: VideoInfo | null = null;

      if (job.source_type === "upload" || job.source_type === "own_link") {
        sourceBuffer = await loadOwnSource(db, job);
        sourcePath = await writeTemp(workDir, "source", sourceBuffer);
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
              const normalized = normalizeDetectedSubtitleRegion(detected);
              // Ghi nhận vào effectiveOptions để planner tính marginV đúng
              effectiveOptions.blurOriginalSub = true;
              effectiveOptions.blurRegion = normalized.region;
              warnings.push(normalized.fallback
                ? `AI phát hiện vùng phụ đề quá lớn tại y=${(detected.y * 100).toFixed(0)}% ` +
                  `(h=${(detected.h * 100).toFixed(0)}%), đã fallback về vùng blur mặc định để tránh xoá mảng lớn.`
                : `AI phát hiện phụ đề gốc tại y=${(detected.y * 100).toFixed(0)}% ` +
                  `(h=${(detected.h * 100).toFixed(0)}%), confidence=${(detected.confidence * 100).toFixed(0)}%. ` +
                  `Sẽ làm mờ vùng này và đặt phụ đề mới trong vùng blur.`);
            } else {
              // Không tìm thấy vùng chính xác: vẫn giữ blur mặc định nếu user/preset đã bật blur.
              effectiveOptions.blurOriginalSub = true;
              warnings.push("AI không phát hiện vùng phụ đề gốc rõ ràng — dùng vùng blur mặc định.");
            }
          }
        }
      }

      // ---- 2c. ASR: Trích xuất audio → phiên âm + dịch → scriptVi thật ----
      // Chạy khi bật vietsub HOẶC dubbing (trừ heygen — sub lấy từ HeyGen sau), và video có audio.
      let asrScriptVi: string | undefined;
      let asrTranslatedSrt: string | undefined;
      let voiceCues: AlignedVoiceCue[] = [];
      let usedVoicePipelineV2 = false;
      const isHeyGenMode = effectiveOptions.dubMode === 'heygen';
      const manualScript = sanitizeTranscriptText(effectiveOptions.manualScript ?? effectiveOptions.editedScript ?? "");
      const usesManualScript = effectiveOptions.scriptInputMode === "manual_script" && Boolean(manualScript);
      if (usesManualScript && videoInfo) {
        const duration = effectiveOptions.trimSeconds && effectiveOptions.trimSeconds > 0
          ? effectiveOptions.trimSeconds
          : videoInfo.durationSec;
        voiceCues = manualScriptToAlignedCues(manualScript, duration);
        if (!cuesLookTranslated(voiceCues, effectiveOptions.targetLanguage ?? 'vi')) {
          voiceCues = await translateAlignedCues(
            voiceCues.map((cue) => ({
              ...cue,
              translatedText: undefined,
            })),
            effectiveOptions.targetLanguage ?? 'vi',
            effectiveOptions.protectedTerms ?? [],
          );
        }
        asrScriptVi = voiceCues
          .map((cue) => cue.translatedText ?? cue.sourceText)
          .join("\n")
          .trim();
        asrTranslatedSrt = buildSrt(alignedCuesToSubtitleCues(voiceCues));
        effectiveOptions.manualScript = manualScript;
        effectiveOptions.editedScript = manualScript;
        // Lưu generatedScript để video editor hiển thị cho user chỉnh sửa lần sau.
        effectiveOptions.generatedScript = manualScript;
        warnings.push(`Dùng script nhập tay: ${voiceCues.length} cue được phân bổ theo thời lượng video, bỏ qua ASR audio gốc.`);
      }
      const needsTranscription =
        videoInfo?.hasAudio &&
        sourcePath &&
        !usesManualScript &&
        !isHeyGenMode && // HeyGen tự lo sub — không cần ASR trước
        (effectiveOptions.vietsub || effectiveOptions.dubMode === 'full' || effectiveOptions.dubMode === 'preserve_bgm' || effectiveOptions.dubVi);

      if (needsTranscription && sourcePath) {
        try {
          await setStatus(db, jobId, 'analyzing');
          console.log(`[remix] ASR: trích xuất audio từ video...`);
          const audioPath = await extractAudio({ inputPath: sourcePath, workDir });
          if (audioPath) {
            try {
              console.log(`[remix] Voice V2: gọi sidecar alignment + word timestamps...`);
              const timeline = await analyzeVoiceTimeline({
                audioPath,
                targetLanguage: effectiveOptions.targetLanguage ?? 'vi',
                durationSec: videoInfo?.durationSec,
              });
              voiceCues = await translateAlignedCues(
                timeline.sentenceCues,
                effectiveOptions.targetLanguage ?? 'vi',
                effectiveOptions.protectedTerms ?? [],
              );
              if (!cuesLookTranslated(voiceCues, effectiveOptions.targetLanguage ?? 'vi')) {
                throw new Error("Voice V2 trả transcript nhưng chưa dịch sang ngôn ngữ đích.");
              }
              asrTranslatedSrt = buildSrt(alignedCuesToSubtitleCues(voiceCues));
              asrScriptVi = voiceCues
                .map((cue) => cue.translatedText ?? cue.sourceText)
                .join("\n")
                .trim();
              usedVoicePipelineV2 = true;
              const d = timeline.diagnostics;
              warnings.push(
                `Voice V2: ${voiceCues.length} câu, ${d.wordCount ?? timeline.wordTimestamps.length} từ, ` +
                `${d.speechSegmentCount ?? timeline.speechSegments.length} đoạn speech bằng ${d.provider}.`,
              );
              if (typeof d.averageConfidence === "number") {
                warnings.push(`Voice V2 confidence trung bình: ${(d.averageConfidence * 100).toFixed(0)}%.`);
              }
              for (const warning of d.warnings ?? []) warnings.push(`Voice V2: ${warning}`);
              console.log(`[remix:asr-debug] Voice V2 xong: ${asrScriptVi.slice(0, 120)}...`);
              console.log(`[remix:asr-debug] voiceCues[0] sourceText: ${voiceCues[0]?.sourceText?.slice(0, 60)}`);
              console.log(`[remix:asr-debug] voiceCues[0] translatedText: ${voiceCues[0]?.translatedText?.slice(0, 60)}`);
              console.log(`[remix:asr-debug] asrTranslatedSrt[0] (50): ${asrTranslatedSrt?.slice(0, 80)}`);
            } catch (voiceErr) {
              warnings.push(`Voice V2 fallback: ${(voiceErr as Error).message}. Dùng Gemini SRT legacy nên timing có thể kém chính xác.`);
              const asrResult = await transcribeToSrt(audioPath, effectiveOptions.targetLanguage ?? 'vi');
              if (asrResult.srt) {
                asrTranslatedSrt = asrResult.srt;
                const rawAsrCues = parseSrtCues(asrResult.srt, videoInfo?.durationSec);
                // Step 1: Group incomplete sentence fragments into full sentences
                let groupedCues = groupIntoCompleteSentences(
                  rawAsrCues.map((cue) => ({
                    startSec: cue.startSec,
                    endSec: cue.endSec,
                    sourceText: cue.text,
                    translatedText: cue.text,
                    confidence: 0.35 as number | undefined,
                  }))
                );
                if (!cuesLookTranslated(groupedCues, effectiveOptions.targetLanguage ?? 'vi')) {
                  groupedCues = await translateAlignedCues(
                    groupedCues.map((cue) => ({
                      ...cue,
                      translatedText: undefined,
                    })),
                    effectiveOptions.targetLanguage ?? 'vi',
                    effectiveOptions.protectedTerms ?? [],
                  );
                }
                // Step 2: Realign grouped cue timings to actual speech from silencedetect
                const speechSegsForFallback = await detectSpeechSegments(
                  audioPath,
                  videoInfo?.durationSec,
                ).catch(() => []);
                const alignedFallbackCues = speechSegsForFallback.length
                  ? realignCuesToSpeech(groupedCues, speechSegsForFallback, videoInfo?.durationSec ?? 0)
                  : groupedCues;
                voiceCues = alignedFallbackCues;
                asrTranslatedSrt = buildSrt(alignedCuesToSubtitleCues(voiceCues));
                asrScriptVi = voiceCues.map((cue) => cue.translatedText ?? cue.sourceText).join("\n").trim();
                warnings.push(`Gemini SRT fallback: ${rawAsrCues.length} cues thô → ${voiceCues.length} câu hoàn chỉnh (realign ${speechSegsForFallback.length} đoạn speech).`);
                console.log(`[remix:asr-debug] Gemini fallback voiceCues[0] translatedText: ${voiceCues[0]?.translatedText?.slice(0, 60)}`);
                console.log(`[remix:asr-debug] Gemini fallback asrTranslatedSrt (80): ${asrTranslatedSrt?.slice(0, 80)}`);
              } else {
                warnings.push(`ASR không nhận ra giọng nói: ${asrResult.error ?? 'lỗi không rõ'} — AI sẽ tự sinh nội dung phụ đề.`);
              }
            }
          } else {
            warnings.push('Không trích xuất được audio từ video (có thể video không có tiếng) — AI sẽ tự sinh nội dung phụ đề.');
          }
        } catch (asrErr) {
          warnings.push(`ASR thất bại: ${(asrErr as Error).message} — AI sẽ tự sinh nội dung phụ đề.`);
        }
      }

      if (needsTranscription && requireVoicePipelineV2ForLocalization() && !usedVoicePipelineV2) {
        throw new RemixError(
          422,
          "Voice Pipeline V2 không khả dụng nên job đã dừng để tránh tạo phụ đề/lồng tiếng sai nội dung. " +
          "Hãy cấu hình/chạy VOICE_PIPELINE_URL hoặc đặt VOICE_REQUIRE_V2_FOR_LOCALIZATION=false nếu muốn cho phép Gemini legacy fallback.",
        );
      }

      if (needsTranscription && !voiceCues.length && !asrTranslatedSrt) {
        throw new RemixError(
          422,
          "Không tạo được transcript thực tế từ audio nguồn nên job đã dừng để tránh dùng script AI tự bịa cho subtitle hoặc TTS.",
        );
      }

      let onScreenTextTracks: OnScreenTextTranslation[] = [];
      if (
        sourcePath &&
        videoInfo &&
        job.output_kind === "video" &&
        effectiveOptions.translateOnScreenText === true
      ) {
        try {
          await setStatus(db, jobId, "analyzing");
          console.log(`[remix] OCR preflight: detecting on-screen text layout...`);
          onScreenTextTracks = await detectOnScreenTextLayoutFromVideo({
            videoPath: sourcePath,
            durationSec: videoInfo.durationSec,
            fps: videoInfo.fps,
            options: effectiveOptions,
          });
          onScreenTextTracks = filterSubtitleLikeOnScreenTextTracks(
            onScreenTextTracks,
            effectiveOptions,
            voiceCues,
          );
          if (onScreenTextTracks.length) {
            warnings.push(
              `OCR preflight đã xác định ${onScreenTextTracks.length} text slot trước plan.`,
            );
          } else {
            warnings.push("OCR preflight chưa xác định được text slot đủ tin cậy trước plan.");
          }
        } catch (ocrErr) {
          warnings.push(`OCR preflight thất bại: ${(ocrErr as Error).message} — render sẽ fallback detect sau.`);
        }
      }

      // ---- 3. Lập kế hoạch ----
      const hasLogo = Boolean(process.env.BRAND_LOGO_URL);
      const previousPlan = isPlan(job.plan) ? job.plan : undefined;

      const startedAt = Date.now();
      const plan = await planRemix({
        sourceType: job.source_type,
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
        voiceCues,
        onScreenTextTracks,
      });

      console.log(`[remix:plan-debug] asrScriptVi (100): ${(asrScriptVi ?? "(undefined)").slice(0, 100)}`);
      console.log(`[remix:plan-debug] plan.scriptVi (100): ${(plan.scriptVi ?? "(undefined)").slice(0, 100)}`);
      console.log(`[remix:plan-debug] voiceCues.length: ${voiceCues.length}`);
      // Lưu script ASR vào options để video editor hiển thị cho lần chỉnh sửa tiếp theo
      if (asrScriptVi && !effectiveOptions.generatedScript) {
        effectiveOptions.generatedScript = asrScriptVi;
      }
      console.log(`[remix:plan-debug] plan.editDecisions.audio.cues?.length: ${plan.editDecisions?.audio.cues?.length ?? 0}`);
      if (plan.editDecisions?.audio.cues?.length) {
        const c0 = plan.editDecisions.audio.cues[0];
        console.log(`[remix:plan-debug] plan.editDecisions.audio.cues[0]: sourceText="${c0.sourceText?.slice(0, 50)}" translatedText="${c0.translatedText?.slice(0, 50)}"`);
      }

      plan.copyrightPreflight = buildFacebookCopyrightPreflight({
        sourceType: job.source_type,
        ownershipConfirmed: job.ownership_confirmed,
        options: effectiveOptions,
        hasAudio: videoInfo?.hasAudio,
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

      // --- Nhánh HeyGen Video Translate (giai đoạn 1) ---
      // Gửi video lên HeyGen và kết thúc Worker job tại đây.
      // Giai đoạn 2 (burn sub + text overlay) sẽ được kích hoạt khi webhook callback đến.
      if (
        job.output_kind === "video" &&
        sourcePath &&
        isHeyGenMode
      ) {
        // Validate trước khi gửi để không tốn quota HeyGen
        try {
          validateVideoForHeyGen(videoInfo?.durationSec ?? 0, videoInfo?.hasAudio ?? false);
        } catch (validationErr) {
          throw new RemixError(422, (validationErr as Error).message);
        }

        // Lấy public URL của video nguồn để gửi HeyGen (luôn phải là URL direct file MP4)
        let sourcePublicUrl: string | null = null;
        if (job.source_type === 'upload' && job.source_media_id) {
          const { data: mediaRow } = await db
            .from('media_assets')
            .select('url')
            .eq('id', job.source_media_id)
            .maybeSingle<{ url: string }>();
          sourcePublicUrl = mediaRow?.url ?? null;
        }

        // Nếu video là link YouTube/TikTok hoặc chưa có public url, upload buffer MP4 đã tải lên Supabase Storage
        if (!sourcePublicUrl && sourceBuffer) {
          console.log(`[remix] Uploading downloaded MP4 buffer to Supabase Storage for HeyGen...`);
          const stored = await uploadMediaAsset(db, {
            buffer: sourceBuffer,
            contentType: 'video/mp4',
            ext: 'mp4',
            type: 'video',
            generatedBy: 'upload',
            meta: { reason: 'heygen_source', jobId },
          });
          sourcePublicUrl = stored.url;
        }

        if (!sourcePublicUrl) {
          throw new RemixError(422, 'Không lấy được URL công khai của video nguồn để gửi HeyGen.');
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? '';
        const callbackUrl = appUrl ? `${appUrl}/api/webhooks/heygen` : undefined;
        const targetLang = effectiveOptions.heygenTargetLanguage ?? effectiveOptions.targetLanguage ?? 'vi';

        console.log(`[remix] Gửi video lên HeyGen translate: lang=${targetLang}, callbackUrl=${callbackUrl}`);
        const { videoTranslationId } = await submitHeyGenTranslateJob({
          videoUrl: sourcePublicUrl,
          targetLanguage: targetLang,
          callbackUrl,
          title: `Remix job ${jobId}`,
          mode: 'speed',
        });

        // Lưu heygen_job_id + plan vào DB, set status processing
        await db
          .from('remix_jobs')
          .update({
            heygen_job_id: videoTranslationId,
            heygen_status: 'pending',
            plan,
            status: 'processing',
            iteration,
          })
          .eq('id', jobId);

        plan.warnings.push(
          `HeyGen Video Translate job đã được gửi (id: ${videoTranslationId}). ` +
          'Pipeline sẽ tiếp tục khi HeyGen dịch xong và webhook callback về.',
        );

        console.log(`[remix] HeyGen job ${videoTranslationId} đã được submit, Worker dừng chờ webhook.`);

        // Trả về processing — không chờ HeyGen (bất đồng bộ)
        return {
          jobId,
          status: 'review', // Thực ra đang processing nhưng dùng review để không block UI
          iteration,
          hashtags: plan.hashtags ?? [],
          warnings: plan.warnings,
          planSummary: plan.summary,
        };
      }

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
          asrTranslatedSrt,
          asrVoiceCues: voiceCues,
          // Chỉ true khi đã có transcript thật từ ASR (voiceCues hoặc Gemini SRT fallback thành công).
          // Khi false, TTS sẽ bị block để tránh đọc nội dung AI tự bịa.
          hasRealAsrScript: usesManualScript || voiceCues.length > 0 || Boolean(asrTranslatedSrt),
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
          options: effectiveOptions, // Lưu lại options với generatedScript + textOnScreenOverlays đã set
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

function ffmpegBinForRemix(): string {
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && envPath.trim()) return envPath.trim();
  return ffmpegPath || "ffmpeg";
}

function runFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegBinForRemix();
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(new Error(`ffmpeg lỗi: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg thoát mã ${code}: ${stderr.slice(-800)}`));
    });
  });
}

function runFfprobe(args: string[]): Promise<string> {
  const bin = process.env.FFPROBE_PATH?.trim() || ffprobeStatic.path || "ffprobe";
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(new Error(`ffprobe lỗi: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ffprobe thoát mã ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function probeMediaDurationSec(inputPath: string): Promise<number | null> {
  const out = await runFfprobe([
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]).catch(() => "");
  const duration = Number(out.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function probeAudioMeanVolumeDb(inputPath: string): Promise<number | null> {
  const bin = ffmpegBinForRemix();
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, [
      "-i",
      inputPath,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(new Error(`ffmpeg volumedetect lỗi: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg volumedetect thoát mã ${code}: ${stderr.slice(-800)}`));
        return;
      }
      const match = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
      resolve(match ? Number(match[1]) : null);
    });
  });
}

function detectSpeechSegmentsFromAudio(
  inputPath: string,
  durationSec?: number,
): Promise<SubtitleCue[]> {
  const bin = ffmpegBinForRemix();
  const silenceDb = process.env.VOICE_SILENCE_THRESHOLD_DB ?? "-35dB";
  const silenceDuration = process.env.VOICE_SILENCE_MIN_DURATION_SEC ?? "0.18";
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, [
      "-i",
      inputPath,
      "-af",
      `silencedetect=noise=${silenceDb}:d=${silenceDuration}`,
      "-f",
      "null",
      "-",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => reject(new Error(`ffmpeg silencedetect lỗi: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg silencedetect thoát mã ${code}: ${stderr.slice(-800)}`));
        return;
      }
      const duration = durationSec && durationSec > 0 ? durationSec : undefined;
      resolve(speechSegmentsFromSilenceLog(stderr, duration));
    });
  });
}

function speechSegmentsFromSilenceLog(log: string, durationSec?: number): SubtitleCue[] {
  const events: Array<{ type: "start" | "end"; sec: number }> = [];
  for (const match of log.matchAll(/silence_start:\s*([0-9.]+)/g)) {
    events.push({ type: "start", sec: Number(match[1]) });
  }
  for (const match of log.matchAll(/silence_end:\s*([0-9.]+)/g)) {
    events.push({ type: "end", sec: Number(match[1]) });
  }
  events.sort((a, b) => a.sec - b.sec || (a.type === "end" ? -1 : 1));

  const maxDuration = durationSec && durationSec > 0
    ? durationSec
    : Math.max(0, ...events.map((event) => event.sec));
  if (maxDuration <= 0) return [];

  const segments: SubtitleCue[] = [];
  let cursor = 0;
  let inSilence = false;
  for (const event of events) {
    const sec = clampTime(event.sec, 0, maxDuration);
    if (event.type === "start" && !inSilence) {
      if (sec - cursor >= 0.18) segments.push({ startSec: cursor, endSec: sec, text: "" });
      inSilence = true;
    } else if (event.type === "end") {
      cursor = sec;
      inSilence = false;
    }
  }
  if (!inSilence && maxDuration - cursor >= 0.18) {
    segments.push({ startSec: cursor, endSec: maxDuration, text: "" });
  }

  const merged: SubtitleCue[] = [];
  for (const segment of segments) {
    const padded = {
      startSec: clampTime(segment.startSec - 0.03, 0, maxDuration),
      endSec: clampTime(segment.endSec + 0.05, 0, maxDuration),
      text: "",
    };
    const last = merged[merged.length - 1];
    if (last && padded.startSec - last.endSec <= 0.14) {
      last.endSec = Math.max(last.endSec, padded.endSec);
    } else {
      merged.push(padded);
    }
  }
  return merged.filter((segment) => segment.endSec - segment.startSec >= 0.18);
}

function alignTranslatedCuesToSpeechSegments(
  translatedCues: SubtitleCue[],
  speechSegments: SubtitleCue[],
): SubtitleCue[] {
  const cues = translatedCues.filter((cue) => cue.text.trim());
  const segments = speechSegments.filter((segment) => segment.endSec > segment.startSec);
  if (!cues.length || !segments.length) return cues;

  if (cues.length <= segments.length) {
    return cues.map((cue, idx) => {
      const startIdx = Math.floor((idx * segments.length) / cues.length);
      const endIdx = Math.max(startIdx, Math.ceil(((idx + 1) * segments.length) / cues.length) - 1);
      return {
        text: cue.text,
        startSec: roundCueTime(segments[startIdx].startSec),
        endSec: roundCueTime(Math.max(segments[startIdx].startSec + 0.2, segments[endIdx].endSec)),
      };
    });
  }

  return cues.map((cue, idx) => {
    const segmentIdx = Math.min(segments.length - 1, Math.floor((idx * segments.length) / cues.length));
    const segment = segments[segmentIdx];
    const firstCueInSegment = Math.ceil((segmentIdx * cues.length) / segments.length);
    const nextSegmentCue = Math.ceil(((segmentIdx + 1) * cues.length) / segments.length);
    const cuesInSegment = Math.max(1, nextSegmentCue - firstCueInSegment);
    const localIdx = Math.max(0, idx - firstCueInSegment);
    const slice = (segment.endSec - segment.startSec) / cuesInSegment;
    const startSec = segment.startSec + localIdx * slice;
    const endSec = localIdx === cuesInSegment - 1 ? segment.endSec : startSec + slice;
    return {
      text: cue.text,
      startSec: roundCueTime(startSec),
      endSec: roundCueTime(Math.max(startSec + 0.2, endSec)),
    };
  });
}

function clampTime(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundCueTime(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampNumeric(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundFilterNumber(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3).replace(/\.?0+$/, "");
}

function alignedCuesToSubtitleCues(cues: AlignedVoiceCue[]): SubtitleCue[] {
  return cues
    .map((cue) => ({
      startSec: cue.startSec,
      endSec: cue.endSec,
      text: cue.translatedText ?? cue.sourceText,
    }))
    .filter((cue) => cue.text.trim() && cue.endSec > cue.startSec);
}

function manualScriptToAlignedCues(script: string, durationSec: number): AlignedVoiceCue[] {
  return scriptToCues(script, durationSec).map((cue) => {
    const words = cue.text.split(/\s+/).filter(Boolean);
    const slice = words.length ? (cue.endSec - cue.startSec) / words.length : 0;
    return {
      startSec: cue.startSec,
      endSec: cue.endSec,
      sourceText: cue.text,
      translatedText: cue.text,
      confidence: 1,
      words: words.map((word, idx) => ({
        word,
        startSec: roundCueTime(cue.startSec + slice * idx),
        endSec: roundCueTime(idx === words.length - 1 ? cue.endSec : cue.startSec + slice * (idx + 1)),
        confidence: 1,
      })),
    };
  });
}

function stripSrtToPlainText(srt: string): string {
  return sanitizeTranscriptText(srt);
}

function shiftCuesForTrim(
  cues: SubtitleCue[],
  trimStart: number,
  durationSec: number,
): SubtitleCue[] {
  const trimEnd = trimStart + durationSec;
  return cues
    .map((cue) => ({
      ...cue,
      startSec: Math.max(0, cue.startSec - trimStart),
      endSec: Math.min(durationSec, cue.endSec - trimStart),
    }))
    .filter((cue, idx) => {
      const original = cues[idx];
      return original.endSec > trimStart && original.startSec < trimEnd && cue.endSec > cue.startSec;
    })
    .sort((a, b) => a.startSec - b.startSec);
}

function shiftAlignedCuesForTrim(
  cues: AlignedVoiceCue[],
  trimStart: number,
  durationSec: number,
): Array<SubtitleCue & { words?: Array<{ word: string; startSec: number; endSec: number }> }> {
  const trimEnd = trimStart + durationSec;
  return cues
    .filter((cue) => cue.endSec > trimStart && cue.startSec < trimEnd)
    .map((cue) => {
      const startSec = Math.max(0, cue.startSec - trimStart);
      const endSec = Math.min(durationSec, cue.endSec - trimStart);
      return {
        startSec,
        endSec,
        text: cue.translatedText ?? cue.sourceText,
        words: cue.words
          ?.map((word) => ({
            word: word.word,
            startSec: clampTime(word.startSec - trimStart, startSec, endSec),
            endSec: clampTime(word.endSec - trimStart, startSec, endSec),
          }))
          .filter((word) => word.word.trim() && word.endSec > word.startSec),
      };
    })
    .filter((cue) => cue.text.trim() && cue.endSec > cue.startSec)
    .sort((a, b) => a.startSec - b.startSec);
}

/**
 * Tổng hợp TTS theo timing của từng cue.
 * Mỗi câu được render thành file riêng, fit vào cửa sổ cue, rồi đặt bằng
 * timestamp tuyệt đối (`adelay + amix`) để clip sau không bị trôi theo clip trước.
 */
async function synthesizeTimedCuesToFile(
  cues: SubtitleCue[],
  totalSec: number,
  workDir: string,
  voiceOverride?: string,
  voiceVol = 2.0,
): Promise<{ path: string; stretchCount: number; clippedCount: number; maxTempo: number } | { error: string }> {
  try {
    const cueFiles: Array<{ path: string; startSec: number }> = [];
    const totalDuration = Math.max(0.2, totalSec);
    let stretchCount = 0;
    let clippedCount = 0;
    let maxTempo = 1;
    const sorted = cues
      .map((cue) => ({
        ...cue,
        startSec: Math.max(0, Math.min(totalDuration, cue.startSec)),
        endSec: Math.max(0, Math.min(totalDuration, cue.endSec)),
      }))
      .filter((cue) => cue.text.trim() && cue.endSec - cue.startSec >= 0.1)
      .sort((a, b) => a.startSec - b.startSec);
    const cueGapSec = clampNumeric(Number(process.env.VOICE_TTS_CUE_GAP_MS ?? 220) / 1000, 0, 0.5);
    const separated = sorted.map((cue, idx) => {
      const next = sorted[idx + 1];
      const latestEnd = next ? Math.max(cue.startSec + 0.1, next.startSec - cueGapSec) : cue.endSec;
      return {
        ...cue,
        endSec: Math.min(cue.endSec, latestEnd, totalDuration),
      };
    }).filter((cue) => cue.endSec - cue.startSec >= 0.1);

    for (let idx = 0; idx < separated.length; idx++) {
      const cue = separated[idx];
      const targetDuration = Math.max(0.1, cue.endSec - cue.startSec);
      const raw = await synthesizeTextToFile(cue.text, workDir, voiceOverride, `tts_cue_${idx}`);
      if ("error" in raw) return raw;

      const rawDuration = await probeMediaDurationSec(raw.path);
      let cuePath = raw.path;
      if (rawDuration && Math.abs(rawDuration - targetDuration) > 0.04) {
        const tempo = rawDuration / targetDuration;
        const fittedPath = path.join(workDir, `tts_cue_${idx}_fit.aac`);
        if (rawDuration > targetDuration) {
          await fitAudioToDuration(raw.path, fittedPath, targetDuration, "tempo");
          cuePath = fittedPath;
          stretchCount += 1;
          maxTempo = Math.max(maxTempo, tempo);
        } else {
          await fitAudioToDuration(raw.path, fittedPath, targetDuration, "pad");
          cuePath = fittedPath;
        }
      }
      cueFiles.push({ path: cuePath, startSec: cue.startSec });
    }

    if (!cueFiles.length) return { error: "Không có cue hợp lệ để lồng tiếng." };

    const outPath = path.join(workDir, "tts_timed.aac");
    const filterParts: string[] = [];
    const labels: string[] = [];
    cueFiles.forEach((cue, idx) => {
      const label = `[a${idx}]`;
      labels.push(label);
      filterParts.push(
        `[${idx}:a]adelay=${Math.max(0, Math.round(cue.startSec * 1000))}:all=1,apad,atrim=0:${totalDuration}${label}`,
      );
    });
    filterParts.push(
      `${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest:dropout_transition=0,volume=${voiceVol.toFixed(2)},atrim=0:${totalDuration},asetpts=N/SR/TB[out]`,
    );
    const args = ["-y"];
    cueFiles.forEach((cue) => args.push("-i", cue.path));
    await runFfmpeg([
      ...args,
      "-filter_complex", filterParts.join(";"),
      "-map", "[out]",
      "-vn",
      "-c:a", "aac",
      "-b:a", "128k",
      outPath,
    ]);
    return { path: outPath, stretchCount, clippedCount, maxTempo };
  } catch (err) {
    return { error: `Lồng tiếng theo timing thất bại: ${(err as Error).message}` };
  }
}

async function fitAudioToDuration(
  inputPath: string,
  outputPath: string,
  durationSec: number,
  mode: "tempo" | "trim" | "pad",
): Promise<void> {
  const filters =
    mode === "tempo"
      ? await buildTempoFilter(inputPath, durationSec)
      : mode === "trim"
        ? `atrim=0:${durationSec},afade=t=out:st=${Math.max(0, durationSec - 0.08)}:d=0.08,asetpts=N/SR/TB`
        : `apad,atrim=0:${durationSec},asetpts=N/SR/TB`;
  await runFfmpeg([
    "-y",
    "-i", inputPath,
    "-af", filters,
    "-c:a", "aac",
    "-b:a", "128k",
    outputPath,
  ]);
}

async function buildTempoFilter(inputPath: string, targetDurationSec: number): Promise<string> {
  const duration = await probeMediaDurationSec(inputPath);
  if (!duration || targetDurationSec <= 0) return `atrim=0:${targetDurationSec},asetpts=N/SR/TB`;
  const tempo = duration / targetDurationSec;
  const parts: string[] = [];
  let remaining = tempo;
  while (remaining > 2.0) {
    parts.push("atempo=2.0");
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    parts.push("atempo=0.5");
    remaining /= 0.5;
  }
  parts.push(`atempo=${roundFilterNumber(remaining)}`);
  parts.push(`apad,atrim=0:${roundFilterNumber(targetDurationSec)},asetpts=N/SR/TB`);
  return parts.join(",");
}


async function createSilenceAudio(outputPath: string, durationSec: number): Promise<void> {
  await runFfmpeg([
    "-y",
    "-f", "lavfi",
    "-i", "anullsrc=r=44100:cl=mono",
    "-t", String(Math.max(0.05, durationSec)),
    "-c:a", "aac",
    "-b:a", "128k",
    outputPath,
  ]);
}

interface ProduceVideoInput {
  db: SupabaseClient;
  workDir: string;
  sourcePath: string;
  plan: RemixPlan;
  options: RemixOptions;
  videoInfo?: VideoInfo | null;
  createdBy?: string;
  asrTranslatedSrt?: string;
  asrVoiceCues?: AlignedVoiceCue[];
  /** true khi ASR thực tế đã chạy thành công và scriptVi có nguồn gốc từ transcript thật.
   * false = AI tự bọa nội dung — không được dùng cho TTS. */
  hasRealAsrScript: boolean;
}

/** Chạy pipeline video: TTS (nếu có) → logo → ffmpeg → upload. */
async function produceVideo(input: ProduceVideoInput): Promise<StoredAsset> {
  const { db, workDir, sourcePath, plan, options, videoInfo, createdBy, asrTranslatedSrt, asrVoiceCues, hasRealAsrScript } = input;
  const ops: VideoOp[] = [...plan.videoOps];

  // --- Lồng tiếng: xử lý theo dubMode (backward-compat với dubVi cũ) ---
  // Chuẩn hóa dubMode: nếu job cũ dùng dubVi=true mà chưa có dubMode → coi là 'full'
  const effectiveDubMode =
    options.dubMode ?? (options.dubVi ? 'full' : 'none');

  if (effectiveDubMode !== 'none' && effectiveDubMode !== 'heygen') {
    // Không có script thật từ ASR và không có cue từ plan — block TTS hoàn toàn
    const hasCueFallback = Boolean(
      plan.editDecisions?.audio.cues?.length || asrTranslatedSrt
    );
    if (!hasRealAsrScript && !hasCueFallback) {
      plan.warnings.push(
        "Bật lồng tiếng nhưng không có transcript thực tế từ ASR " +
        "(đã block TTS để tránh giọng đọc nội dung AI tự bịa không liên quan đến video). " +
        "Kiểm tra cấu hình VOICE_PIPELINE_URL hoặc GEMINI_API_KEY."
      );
    } else if (!plan.scriptVi && !hasCueFallback) {
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
      const cleanScriptForTts = sanitizeTranscriptText(plan.scriptVi ?? "");

      const trimOp = ops.find((o) => o.op === "trim") as Extract<VideoOp, { op: "trim" }> | undefined;
      const duration = trimOp ? trimOp.duration : (videoInfo?.durationSec ?? 30);
      const finalCueSource = resolveFinalSubtitleCueSource({
        options,
        ops,
        plan,
        asrTranslatedSrt,
        asrVoiceCues,
        trimStart: trimOp?.start ?? 0,
        durationSec: duration,
        videoDurationSec: videoInfo?.durationSec,
      });

      // ── DEBUG: trace which cue source is selected ──
      console.log(`[remix:tts-debug] plan.scriptVi (50 chars): ${(plan.scriptVi ?? "").slice(0, 50)}`);
      console.log(`[remix:tts-debug] cleanScriptForTts (50): ${cleanScriptForTts.slice(0, 50)}`);
      console.log(`[remix:tts-debug] plan.editDecisions.audio.cues count: ${plan.editDecisions?.audio.cues?.length ?? 0}`);
      console.log(`[remix:tts-debug] finalSubtitleCues count: ${finalCueSource.cues.length}, source: ${finalCueSource.source}`);
      console.log(`[remix:tts-debug] asrTranslatedSrt present: ${Boolean(asrTranslatedSrt)}, length: ${asrTranslatedSrt?.length ?? 0}`);
      if (asrTranslatedSrt) {
        const firstLine = asrTranslatedSrt.split("\n").find((l) => l.trim() && !/^\d+$/.test(l.trim()) && !l.includes("-->"));
        console.log(`[remix:tts-debug] asrTranslatedSrt first content line: ${firstLine?.slice(0, 80) ?? "(empty)"}`);
      }

      if (finalCueSource.cues.length) {
        console.log(`[remix:tts-debug] finalSubtitleCues[0]: [${finalCueSource.cues[0].startSec}→${finalCueSource.cues[0].endSec}] "${finalCueSource.cues[0].text?.slice(0, 60)}"`);
      }

      const timedCues = finalCueSource.cues.length
        ? finalCueSource.cues
        : scriptToCues(cleanScriptForTts, duration);

      console.log(`[remix:tts-debug] timedCues count: ${timedCues.length}, using: ${finalCueSource.cues.length ? finalCueSource.source : "scriptToCues"}`);
      if (timedCues.length) {
        console.log(`[remix:tts-debug] timedCues[0]: [${timedCues[0].startSec}→${timedCues[0].endSec}] "${timedCues[0].text?.slice(0, 60)}"`);
        console.log(`[remix:tts-debug] timedCues[-1]: "${timedCues[timedCues.length - 1].text?.slice(0, 60)}"`);
      }
      // ── END DEBUG ──

      const voiceVol = Math.min(3.0, Math.max(0.5, options.voiceVolume ?? 2.0));

      const tts = timedCues.length
        ? await synthesizeTimedCuesToFile(timedCues, duration, workDir, voiceOverride, voiceVol)
        : await synthesizeToFile(cleanScriptForTts, workDir, voiceOverride);

      if ('path' in tts) {
        const meanVolumeDb = await probeAudioMeanVolumeDb(tts.path).catch(() => null);
        let finalTtsPath = tts.path;
        const isTimedTts = "stretchCount" in tts;
        if ("stretchCount" in tts) {
          const timedTts = tts as { path: string; stretchCount: number; clippedCount: number; maxTempo?: number };
          if (timedTts.stretchCount > 0 || timedTts.clippedCount > 0) {
            plan.warnings.push(
              `TTS timing: ${timedTts.stretchCount} cue được tăng tốc để khớp subtitle` +
              `${timedTts.maxTempo && timedTts.maxTempo > 1 ? ` (max ${timedTts.maxTempo.toFixed(2)}x)` : ""}, ` +
              `${timedTts.clippedCount} cue bị cắt.`,
            );
          }
        }
        if (!isTimedTts && meanVolumeDb !== null && meanVolumeDb < -45 && cleanScriptForTts) {
          plan.warnings.push(
            `TTS theo timing gần như im lặng (${meanVolumeDb.toFixed(1)} dB), fallback sang TTS liên tục để tránh mất tiếng.`,
          );
          const fallbackTts = await synthesizeToFile(cleanScriptForTts, workDir, voiceOverride);
          if ("path" in fallbackTts) {
            const fallbackVolumeDb = await probeAudioMeanVolumeDb(fallbackTts.path).catch(() => null);
            if (fallbackVolumeDb === null || fallbackVolumeDb >= -45) {
              finalTtsPath = fallbackTts.path;
            }
          }
        }
        if (effectiveDubMode === 'full') {
          ops.push({ op: 'replaceAudio', audioPath: finalTtsPath });
          plan.warnings.push(finalCueSource.cues.length
            ? 'Lồng tiếng: thay audio bằng giọng TTS đã căn theo timing phụ đề cuối.'
            : 'Lồng tiếng: thay audio bằng giọng TTS theo cue phân bổ từ script.');
        } else if (effectiveDubMode === 'preserve_bgm') {
          // Tách nhạc nền → mix TTS voice + bgm gốc
          try {
            const { bgmPath } = await separateVoiceBgm(sourcePath, workDir, trimOp);
            const mixedAudioPath = path.join(workDir, 'mixed_audio.aac');
            const bgmVol = typeof options.bgVolume === 'number' ? options.bgVolume : 0.3;
            await mixAudioTracks(finalTtsPath, bgmPath, mixedAudioPath, bgmVol, voiceVol);
            ops.push({ op: 'replaceAudio', audioPath: mixedAudioPath });
            plan.warnings.push(finalCueSource.cues.length
              ? 'Lồng tiếng: giọng TTS đã căn timing phụ đề cuối + nhạc nền gốc được giữ lại.'
              : 'Lồng tiếng: giọng TTS theo cue phân bổ + nhạc nền gốc được giữ lại.');
          } catch (e) {
            plan.warnings.push(`Tách nền thất bại (${(e as Error).message}), dùng TTS ghi đè hoàn toàn.`);
            ops.push({ op: 'replaceAudio', audioPath: finalTtsPath });
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
      
      let srt: string | undefined;
      let asrError: string | undefined;
      const knownCueSource = resolveFinalSubtitleCueSource({
        options,
        ops,
        plan,
        asrTranslatedSrt,
        asrVoiceCues,
        trimStart: trimParam?.start ?? 0,
        durationSec: duration,
        videoDurationSec: videoInfo?.durationSec,
      });

      if (knownCueSource.cues.length) {
        srt = buildSrt(knownCueSource.cues);
      } else {
        const audioPath = await extractAudio({ inputPath: sourcePath, workDir, trim: trimParam });
        if (audioPath) {
          // If no edited script, check if plan already has subtitles
          const existingSub = ops.find(o => o.op === "subtitles") as Extract<VideoOp, { op: "subtitles" }> | undefined;
          if (existingSub?.srt) {
            srt = existingSub.srt;
          } else {
            // Fallback to ASR if somehow completely missing
            const result = await transcribeToSrt(audioPath, options.targetLanguage ?? 'vi');
            srt = result.srt;
            asrError = result.error;
          }
        } else {
          asrError = "Không trích xuất được audio để tạo phụ đề.";
        }
      }

      if (srt) {
          // Apply subtitle style settings: subtitleConfig object takes priority over flat fields
          const sc = options.subtitleConfig;
          const { alignment, marginV } = resolveSubtitlePlacement(options, ops, videoInfo);

          const subStyle = {
            font: sc?.font ?? options.subFont,
            fontSize: sc?.size ?? options.subFontSize ?? 24,
            primaryColor: sc?.color ?? options.subColor,
            outlineColor: sc?.bgColor ?? options.subBgColor,
            highlightColor: sc?.highlightColor ?? options.subHighlightColor,
            borderStyle: sc?.borderStyle ?? options.subBorderStyle,
            bold: sc?.bold ?? options.subBold,
            italic: sc?.italic ?? options.subItalic,
            outline: sc?.outline ?? options.subOutline,
            marginV,
            alignment,
          };
          const animation = sc?.animation ?? options.subtitleAnimation;
          const hasAnimatedSubtitles = animation === "word_highlight" || animation === "reveal_words";
          const subtitleVoiceCues = asrVoiceCues?.length
            ? shiftAlignedCuesForTrim(asrVoiceCues, trimParam?.start ?? 0, duration)
            : planVoiceCues(plan);
          const subtitleCues = parseSrtCues(srt, duration);
          const reframeOp = ops.find((o) => o.op === "reframe") as Extract<VideoOp, { op: "reframe" }> | undefined;
          const videoW = reframeOp?.width ?? videoInfo?.width ?? 360;
          const videoH = reframeOp?.height ?? videoInfo?.height ?? 640;
          const ass = hasAnimatedSubtitles
            ? buildAssSubtitles(
                cuesWithWordsForSubtitle(
                  subtitleCues,
                  subtitleVoiceCues,
                ),
                { ...subStyle, animation, videoWidth: videoW, videoHeight: videoH },
              )
            : undefined;
          const subIdx = ops.findIndex((o) => o.op === "subtitles");
          if (subIdx >= 0) {
            const op = ops[subIdx] as Extract<VideoOp, { op: "subtitles" }>;
            ops[subIdx] = { ...op, srt, ass, ...subStyle };
          } else {
            ops.push({ op: "subtitles", srt, ass, ...subStyle });
          }
          plan.warnings = plan.warnings.filter(w => !w.includes("Bật Vietsub nhưng chưa có nội dung thoại"));
      } else if (asrError) {
        plan.warnings.push(`Nhận dạng giọng nói (ASR) thất bại: ${asrError}. Dùng phụ đề tự tạo.`);
      }
    }

  // --- Logo: tải asset thật, thay placeholder __LOGO__ ---
  const logoIdx = ops.findIndex((o) => o.op === "overlayLogo");
  if (logoIdx >= 0) {
    const logoOp = ops[logoIdx] as Extract<VideoOp, { op: "overlayLogo" }>;
    const wantsWatermark = logoOp.logoPath === "__WATERMARK__";
    let logoUrl = wantsWatermark ? undefined : process.env.BRAND_LOGO_URL;
    const mediaId = wantsWatermark
      ? (options.watermarkConfig?.imageMediaId ?? options.logoMediaId)
      : options.logoMediaId;
    if (mediaId) {
      const { data: media } = await db
        .from("media_assets")
        .select("url")
        .eq("id", mediaId)
        .maybeSingle<{ url: string }>();
      if (media?.url) logoUrl = media.url;
    }

    if (logoUrl) {
      try {
        let logoBuf = await fetchToBuffer(logoUrl);
        if (wantsWatermark && options.watermarkConfig?.removeBackground) {
          logoBuf = await removeLightBackground(logoBuf).catch((err) => {
            plan.warnings.push(`Remove background watermark thất bại (${(err as Error).message}) — dùng ảnh gốc.`);
            return logoBuf;
          });
        }
        const logoPath = await writeTemp(workDir, wantsWatermark ? "watermark.png" : "logo.png", logoBuf);
        const op = ops[logoIdx] as Extract<VideoOp, { op: "overlayLogo" }>;
        ops[logoIdx] = { ...op, logoPath };
      } catch (err) {
        plan.warnings.push(
          `Không tải được ${wantsWatermark ? "watermark" : "logo"} (${(err as Error).message}) — bỏ qua chèn.`,
        );
        ops.splice(logoIdx, 1);
      }
    } else {
      ops.splice(logoIdx, 1);
    }
  }

  const onScreenTextBlurRegions: Array<{ x: number; y: number; w: number; h: number; startSec?: number; endSec?: number }> = [];
  if (options.translateOnScreenText === true) {
    const plannedTextTracks = plannedOnScreenTextTracksFromPlan(plan);
    const translations = plannedTextTracks.length
      ? await translatePlannedOnScreenTextTracks({
          tracks: plannedTextTracks,
          durationSec: videoInfo?.durationSec ?? 30,
          options,
          prompt: plan.summary,
        })
      : await translateOnScreenTextFromVideo({
          videoPath: sourcePath,
          durationSec: videoInfo?.durationSec ?? 30,
          fps: videoInfo?.fps,
          options,
          prompt: plan.summary,
        });
    const filteredTranslations = filterSubtitleLikeOnScreenTextTracks(
      translations,
      options,
      planVoiceCues(plan),
    );

    if (filteredTranslations.length) {
      const textStyle = resolveOnScreenTextStyle(options.onScreenTextStyle);
      const trimOp = ops.find((o) => o.op === "trim") as Extract<VideoOp, { op: "trim" }> | undefined;
      const trimStart = trimOp?.start ?? 0;
      const trimEnd = trimOp ? trimOp.start + trimOp.duration : undefined;

      for (const translation of filteredTranslations) {
        const startSec = Math.max(0, translation.startSec - trimStart);
        const endSec = Math.max(startSec + 0.2, translation.endSec - trimStart);
        if (trimEnd !== undefined && translation.startSec > trimEnd) continue;
        if (translation.endSec < trimStart) continue;
        const replacementRegions = textReplacementRegions(translation.region);
        onScreenTextBlurRegions.push({ ...replacementRegions.blur, startSec, endSec });
        ops.push({
          op: "overlayText",
          text: translation.translatedText,
          startSec,
          endSec,
          region: replacementRegions.overlay,
          fitToRegion: true,
          sizeMode: textStyle.sizeMode,
          coverRegion: true,
          minFontSize: 12,
          maxFontSize: textStyle.size,
          font: textStyle.font,
          fontSize: textStyle.size,
          color: textStyle.color,
          bgColor: textStyle.bgColor,
          outlineColor: textStyle.outlineColor,
          boxOpacity: textStyle.boxOpacity,
          bold: textStyle.bold,
        });
        upsertTextOverlayDecision(plan, {
          startSec,
          endSec,
          sourceText: translation.detectedText,
          translatedText: translation.translatedText,
          region: replacementRegions.base,
          confidence: translation.confidence,
        });
      }
      // Lưu kết quả overlays vào options để video editor hiển thị cho user chỉnh sửa lần sau
      if (filteredTranslations.length) {
        const textStyle = resolveOnScreenTextStyle(options.onScreenTextStyle);
        options.textOnScreenOverlays = filteredTranslations.map((translation, idx) => ({
          id: `ai_${idx}_${Date.now()}`,
          start: Math.max(0, translation.startSec),
          end: translation.endSec,
          text: translation.translatedText,
          position: {
            x: translation.region?.x ?? 0.5,
            y: translation.region?.y ?? 0.1,
          },
          fontFamily: textStyle.font ?? 'Be Vietnam Pro',
          fontSize: textStyle.size ?? 32,
          fontColor: textStyle.color ?? '#FFFFFF',
          bgColor: textStyle.bgColor ?? '#000000CC',
          animation: 'fade_in' as const,
        }));
      }
      plan.warnings.push(
        `Đã dịch ${filteredTranslations.length} text on-screen theo tone/mood: ${filteredTranslations[0]?.toneMood || "không rõ"}. ` +
          `Detected: ${filteredTranslations.map((item) => item.detectedText).join(" | ") || "n/a"}.`,
      );
      const dropped = translations.length - filteredTranslations.length;
      if (dropped > 0) {
        plan.warnings.push(`Đã bỏ ${dropped} OCR text slot nhiễu/không đủ bbox; OCR subtitle-like hợp lệ vẫn được giữ và subtitle voice sẽ tự né vùng này.`);
      }
      const lowConfidence = filteredTranslations.filter((item) => item.confidence < 0.55);
      if (lowConfidence.length) {
        plan.warnings.push(
          `Một số text on-screen confidence thấp, đã dùng cover-box để che chữ gốc: ${lowConfidence.map((item) => item.detectedText).join(" | ")}.`,
        );
      }
      const notes = filteredTranslations.flatMap((item) => item.notes).filter(Boolean);
      if (notes.length) {
        plan.warnings.push(`Ghi chú dịch on-screen: ${notes.slice(0, 8).join("; ")}`);
      }
    } else {
      plan.warnings.push(
        "Không phát hiện được text on-screen đủ tin cậy hoặc thiếu bbox hợp lệ, nên không chèn text overlay để tránh sai vị trí.",
      );
    }
  }

  const subtitleMove = moveSubtitleAwayFromOcrRegions({
    ops,
    options,
    ocrRegions: onScreenTextBlurRegions,
    videoHeight: videoInfo?.height ?? 1920,
    plan,
    durationSec: videoInfo?.durationSec ?? 30,
  });
  if (subtitleMove) plan.warnings.push(subtitleMove);

  // Pass blur options into applyVideoOps directly
  const shouldBlur = options.vietsub && options.blurOriginalSub !== false;
  const applyBlurRegion = shouldBlur ? (options.blurRegion ?? { x: 0, y: 0.82, w: 1, h: 0.18 }) : undefined;
  const watermarkCoverRegions =
    options.watermarkConfig?.coverOriginal
      ? (options.watermarkConfig.oldWatermarkRegions ?? [])
      : [];

  const outPath = await applyVideoOps({ 
    inputPath: sourcePath, 
    ops, 
    workDir,
    blurRegion: applyBlurRegion,
    blurRegions: [...onScreenTextBlurRegions, ...watermarkCoverRegions],
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

  const reframeOp = ops.find((o) => o.op === "reframe") as
    | Extract<VideoOp, { op: "reframe" }>
    | undefined;
  const trimOp = ops.find((o) => o.op === "trim") as
    | Extract<VideoOp, { op: "trim" }>
    | undefined;
  const review = await reviewRenderedVideo({
    outputPath: finalPath,
    expected: {
      durationSec:
        options.introEnabled || options.outroEnabled
          ? undefined
          : trimOp?.duration ?? videoInfo?.durationSec,
      width: reframeOp?.width,
      height: reframeOp?.height,
      hasAudio:
        !options.muteOriginal &&
        (Boolean(videoInfo?.hasAudio) ||
          options.dubMode === "full" ||
          options.dubMode === "preserve_bgm" ||
          Boolean(options.dubVi)),
      subtitlesExpected: Boolean(options.vietsub),
      subtitlesPlanned: ops.some((o) => o.op === "subtitles"),
    },
  });
  plan.finalReview = { ...review, outputPath: undefined };
  if (review.status === "fail") {
    throw new Error(`Post-render QA thất bại: ${review.issuesFound.join("; ")}`);
  }
  if (review.status === "revise") {
    plan.warnings.push(`QA cần kiểm tra: ${review.issuesFound.join("; ")}`);
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
      finalReview: plan.finalReview,
    },
  });
}

function plannedOnScreenTextTracksFromPlan(plan: RemixPlan): OnScreenTextTranslation[] {
  return (plan.editDecisions?.overlays ?? [])
    .filter((overlay) =>
      overlay.kind === "text" &&
      Boolean(overlay.sourceText?.trim()) &&
      Boolean(overlay.region) &&
      overlay.endSec > overlay.startSec,
    )
    .map((overlay) => ({
      detectedText: overlay.sourceText!.trim(),
      translatedText: overlay.sourceText!.trim(),
      region: overlay.region!,
      startSec: overlay.startSec,
      endSec: overlay.endSec,
      toneMood: "planned OCR layout",
      confidence: overlay.confidence ?? 0.5,
      notes: ["source=plan_preflight"],
    }));
}

function upsertTextOverlayDecision(
  plan: RemixPlan,
  input: {
    startSec: number;
    endSec: number;
    sourceText: string;
    translatedText: string;
    region: { x: number; y: number; w: number; h: number };
    confidence: number;
  },
): void {
  if (!plan.editDecisions) return;
  const existing = plan.editDecisions.overlays.find((overlay) =>
    overlay.kind === "text" &&
    overlay.sourceText === input.sourceText &&
    overlay.region &&
    Math.abs(overlay.region.x - input.region.x) <= 0.03 &&
    Math.abs(overlay.region.y - input.region.y) <= 0.03,
  );
  const decision = {
    kind: "text" as const,
    startSec: input.startSec,
    endSec: input.endSec,
    reason: "Dịch và thay text on-screen theo slot/timing đã xác định trong plan.",
    sourceText: input.sourceText,
    translatedText: input.translatedText,
    region: input.region,
    confidence: input.confidence,
  };
  if (existing) {
    Object.assign(existing, decision);
  } else {
    plan.editDecisions.overlays.push({
      id: `render-text-${plan.editDecisions.overlays.length + 1}`,
      ...decision,
    });
  }
}

function planVoiceCues(plan: RemixPlan): SubtitleCue[] {
  return (plan.editDecisions?.audio.cues ?? [])
    .map((cue) => ({
      startSec: cue.startSec,
      endSec: cue.endSec,
      text: cue.translatedText ?? cue.sourceText ?? "",
      words: cue.words?.map((word) => ({
        word: word.word,
        startSec: word.startSec,
        endSec: word.endSec,
      })),
    }))
    .filter((cue) => cue.text.trim() && cue.endSec > cue.startSec);
}

function resolveFinalSubtitleCueSource(input: {
  options: RemixOptions;
  ops: VideoOp[];
  plan: RemixPlan;
  asrTranslatedSrt?: string;
  asrVoiceCues?: AlignedVoiceCue[];
  trimStart: number;
  durationSec: number;
  videoDurationSec?: number;
}): { cues: SubtitleCue[]; source: string } {
  const manualScript = sanitizeTranscriptText(input.options.editedScript ?? input.options.manualScript ?? "");
  if (manualScript) {
    return { cues: scriptToCues(manualScript, input.durationSec), source: "manual_script" };
  }

  if (input.asrTranslatedSrt) {
    const cues = shiftCuesForTrim(
      parseSrtCues(input.asrTranslatedSrt, input.videoDurationSec),
      input.trimStart,
      input.durationSec,
    );
    if (cues.length) return { cues, source: "asr_translated_srt" };
  }

  const existingSub = input.ops.find((op) => op.op === "subtitles") as
    | Extract<VideoOp, { op: "subtitles" }>
    | undefined;
  if (existingSub?.srt) {
    const cues = parseSrtCues(existingSub.srt, input.durationSec)
      .filter((cue) => cue.text.trim() && cue.endSec > cue.startSec);
    if (cues.length) return { cues, source: "existing_subtitle_op" };
  }

  if (input.asrVoiceCues?.length) {
    const cues = shiftCuesForTrim(
      alignedCuesToSubtitleCues(input.asrVoiceCues),
      input.trimStart,
      input.durationSec,
    );
    if (cues.length) return { cues, source: "asr_voice_cues" };
  }

  const plannedCues = shiftCuesForTrim(
    planVoiceCues(input.plan),
    input.trimStart,
    input.durationSec,
  );
  if (plannedCues.length) return { cues: plannedCues, source: "plan_audio_cues" };

  return { cues: [], source: "empty" };
}

function cuesLookTranslated(
  cues: Array<{ sourceText?: string; translatedText?: string }>,
  targetLanguage: RemixOptions["targetLanguage"] = "vi",
): boolean {
  const texts = cues
    .map((cue) => (cue.translatedText ?? cue.sourceText ?? "").trim())
    .filter(Boolean);
  if (!texts.length) return true;

  const joined = texts.join(" ");
  if (targetLanguage === "en") {
    return /(?:\bthe\b|\band\b|\byou\b|\bthat\b|\bwith\b|\bfor\b|\bthis\b|\bis\b)/i.test(joined);
  }

  if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(joined)) {
    return true;
  }

  return /(?:\bkhông\b|\bđược\b|\bchúng ta\b|\bcủa\b|\bnhững\b|\bđang\b|\bmuốn\b|\bxin\b|\bbạn\b|\btôi\b)/i.test(joined);
}

function cuesWithWordsForSubtitle(
  cues: SubtitleCue[],
  voiceCues: SubtitleCue[],
): Array<SubtitleCue & { words?: Array<{ word: string; startSec: number; endSec: number }> }> {
  const planWords = (voiceCues as Array<SubtitleCue & { words?: Array<{ word: string; startSec: number; endSec: number }> }>);
  return cues.map((cue) => {
    const matching = planWords.find(
      (item) => Math.abs(item.startSec - cue.startSec) < 0.4 && Math.abs(item.endSec - cue.endSec) < 0.9,
    );
    return {
      ...cue,
      words: matching?.words,
    };
  });
}

function filterSubtitleLikeOnScreenTextTracks<T extends OnScreenTextTranslation>(
  tracks: T[],
  _options: RemixOptions,
  _voiceCues: Array<{ startSec: number; endSec: number }>,
): T[] {
  return tracks.filter((track) => {
    const area = track.region.w * track.region.h;
    const normalized = normalizeOverlayTextForFilter(track.detectedText);
    const detections = onScreenTextDetectionCount(track);
    if (normalized.length <= 2) return false;
    if (area < 0.0012 || track.region.h < 0.018) return false;
    if (normalized.length < 6 && detections < 2 && (track.confidence < 0.72 || area < 0.008)) return false;
    if (detections < 2 && track.confidence < 0.58) return false;
    if (looksLikeFragmentOrOcrNoise(track.detectedText, track.translatedText)) return false;
    return true;
  });
}

function onScreenTextDetectionCount(track: OnScreenTextTranslation): number {
  const note = track.notes.find((item) => item.startsWith("detections="));
  const count = Number(note?.split("=")[1]);
  return Number.isFinite(count) ? Math.max(1, count) : 1;
}

function normalizeOverlayTextForFilter(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

function looksLikeFragmentOrOcrNoise(sourceText: string, translatedText: string): boolean {
  const source = sourceText.trim();
  const translated = translatedText.trim();
  if (!/[a-zA-ZÀ-ỹ]/.test(source)) return true;
  if (/^[\d\s.:-]+$/.test(source)) return true;
  if (source.split(/\s+/).length === 1 && source.length <= 4 && translated.length <= 6) return true;
  if (/^[A-ZÀ-Ỹ][a-zà-ỹ]{2,5}$/.test(source) && translated.length <= 8) return true;
  return false;
}

function regionIouForRemix(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const areaA = Math.max(0, a.w) * Math.max(0, a.h);
  const areaB = Math.max(0, b.w) * Math.max(0, b.h);
  return inter / Math.max(0.0001, areaA + areaB - inter);
}

function resolveOnScreenTextStyle(style: RemixOptions["onScreenTextStyle"]): {
  font?: string;
  size: number;
  color: string;
  bgColor: string;
  outlineColor: string;
  boxOpacity: number;
  bold: boolean;
  sizeMode: "auto_fit" | "fixed";
} {
  type OnScreenTextPreset = NonNullable<
    NonNullable<RemixOptions["onScreenTextStyle"]>["preset"]
  >;
  const preset: OnScreenTextPreset = style?.preset ?? "meme";
  const defaults: Record<OnScreenTextPreset, {
    font?: string;
    size: number;
    color: string;
    bgColor: string;
    outlineColor: string;
    boxOpacity: number;
    bold: boolean;
  }> = {
    meme: { font: "Impact", size: 34, color: "#FFFFFF", bgColor: "#000000", outlineColor: "#000000", boxOpacity: 0.05, bold: true },
    pop: { font: "Arial", size: 34, color: "#FFF200", bgColor: "#FF2A6D", outlineColor: "#101010", boxOpacity: 0.78, bold: true },
    bubble: { font: "Arial", size: 32, color: "#111111", bgColor: "#FFFFFF", outlineColor: "#FFB703", boxOpacity: 0.9, bold: true },
    neon: { font: "Arial", size: 32, color: "#00F5FF", bgColor: "#090A18", outlineColor: "#FF00E5", boxOpacity: 0.72, bold: true },
    clean: { font: "Arial", size: 28, color: "#FFFFFF", bgColor: "#111827", outlineColor: "#111827", boxOpacity: 0.68, bold: false },
  };
  const base = defaults[preset] ?? defaults.meme;
  return {
    ...base,
    font: style?.font || base.font,
    size: clampNumber(style?.size, 16, 72, base.size),
    color: validHex(style?.color) ? style!.color! : base.color,
    bgColor: validHex(style?.bgColor) ? style!.bgColor! : base.bgColor,
    outlineColor: validHex(style?.outlineColor) ? style!.outlineColor! : base.outlineColor,
    bold: style?.bold ?? base.bold,
    sizeMode: style?.sizeMode ?? "auto_fit",
  };
}

function resolveSubtitlePlacement(
  options: RemixOptions,
  ops: VideoOp[],
  videoInfo?: VideoInfo | null,
): { alignment: number; marginV: number } {
  const sc = options.subtitleConfig;
  const pos = sc?.position ?? options.subPosition ?? "bottom";
  const reframeOp = ops.find((o) => o.op === "reframe") as
    | Extract<VideoOp, { op: "reframe" }>
    | undefined;
  const targetHeight = reframeOp?.height ?? videoInfo?.height ?? 1920;

  if (pos === "top") return { alignment: 8, marginV: 40 };
  if (pos === "custom") {
    const y = clampNumber(sc?.customY ?? options.subCustomY, 0.05, 0.9, 0.78);
    return { alignment: 8, marginV: Math.round(y * targetHeight) };
  }
  if (pos === "auto" && options.blurOriginalSub !== false) {
    return subtitlePlacementForBlurRegion(options.blurRegion, targetHeight);
  }
  return { alignment: 2, marginV: 60 };
}

function moveSubtitleAwayFromOcrRegions(input: {
  ops: VideoOp[];
  options: RemixOptions;
  ocrRegions: Array<{ x: number; y: number; w: number; h: number; startSec?: number; endSec?: number }>;
  videoHeight: number;
  plan: RemixPlan;
  durationSec: number;
}): string | null {
  if (!input.options.vietsub || input.ocrRegions.length === 0) return null;
  const pos = input.options.subtitleConfig?.position ?? input.options.subPosition;
  if (pos === "custom") return null;
  const subtitleIdx = input.ops.findIndex((o) => o.op === "subtitles");
  if (subtitleIdx < 0) return null;
  const subOp = input.ops[subtitleIdx] as Extract<VideoOp, { op: "subtitles" }>;
  const currentAlignment = subOp.alignment ?? 2;
  const currentMarginV = subOp.marginV ?? 60;
  const lowerBand = { x: 0, y: 0.64, w: 1, h: 0.34 };
  const upperBand = { x: 0, y: 0.03, w: 1, h: 0.28 };
  const lowerBlocked = input.ocrRegions.some((region) =>
    regionIouForRemix(region, lowerBand) >= 0.02 || region.y + region.h / 2 >= 0.64,
  );
  if (!lowerBlocked || currentAlignment === 8) return null;

  const upperBlocked = input.ocrRegions.some((region) => regionIouForRemix(region, upperBand) >= 0.06);
  const nextAlignment = 8;
  const nextMarginV = upperBlocked ? Math.max(120, Math.round(input.videoHeight * 0.09)) : 40;
  const updated: Extract<VideoOp, { op: "subtitles" }> = {
    ...subOp,
    alignment: nextAlignment,
    marginV: nextMarginV,
  };
  const animation = input.options.subtitleConfig?.animation ?? input.options.subtitleAnimation;
  if ((animation === "word_highlight" || animation === "reveal_words") && subOp.srt) {
    updated.ass = buildAssSubtitles(
      cuesWithWordsForSubtitle(
        parseSrtCues(subOp.srt, input.durationSec),
        planVoiceCues(input.plan),
      ),
      {
        font: updated.font,
        fontSize: updated.fontSize,
        primaryColor: updated.primaryColor,
        outlineColor: updated.outlineColor,
        highlightColor: updated.highlightColor,
        bold: updated.bold,
        italic: updated.italic,
        outline: updated.outline,
        borderStyle: updated.borderStyle,
        marginV: nextMarginV,
        alignment: nextAlignment,
        animation,
      },
    );
  }
  input.ops[subtitleIdx] = updated;
  return upperBlocked
    ? "Subtitle voice vẫn được giữ; OCR ở đáy frame nên phụ đề đã chuyển lên trên với margin lớn để giảm chồng lớp."
    : "Subtitle voice vẫn được giữ; OCR ở đáy frame nên phụ đề đã chuyển lên trên để tránh text on-screen.";
}

function padRegion(
  region: { x: number; y: number; w: number; h: number },
  pad: number,
): { x: number; y: number; w: number; h: number } {
  const x = Math.max(0, region.x - pad);
  const y = Math.max(0, region.y - pad);
  return {
    x,
    y,
    w: Math.min(1 - x, region.w + pad * 2),
    h: Math.min(1 - y, region.h + pad * 2),
  };
}

function textReplacementRegions(
  region: { x: number; y: number; w: number; h: number },
): {
  base: { x: number; y: number; w: number; h: number };
  blur: { x: number; y: number; w: number; h: number };
  overlay: { x: number; y: number; w: number; h: number };
} {
  const base = clampRegionSize(region, 1, 1);
  return {
    base,
    blur: padRegion(base, 0.006),
    overlay: padRegion(base, 0.002),
  };
}

function clampRegionSize(
  region: { x: number; y: number; w: number; h: number },
  maxW: number,
  maxH: number,
): { x: number; y: number; w: number; h: number } {
  const centerX = region.x + region.w / 2;
  const centerY = region.y + region.h / 2;
  const w = Math.min(region.w, maxW);
  const h = Math.min(region.h, maxH);
  const x = Math.max(0, Math.min(1 - w, centerX - w / 2));
  const y = Math.max(0, Math.min(1 - h, centerY - h / 2));
  return { x, y, w, h };
}

function normalizeDetectedSubtitleRegion(
  detected: { x: number; y: number; w: number; h: number },
): { region: { x: number; y: number; w: number; h: number }; fallback: boolean } {
  const tooTall = detected.h > 0.26;
  const tooWideAndTall = detected.w > 0.92 && detected.h > 0.2;
  const tooHigh = detected.y < 0.45 && detected.h > 0.16;
  if (tooTall || tooWideAndTall || tooHigh) {
    return { region: { x: 0, y: 0.82, w: 1, h: 0.18 }, fallback: true };
  }
  return {
    region: clampRegionSize(padRegion(detected, 0.01), 1, 0.24),
    fallback: false,
  };
}

async function removeLightBackground(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max > 235 && max - min < 18) {
          data[i + 3] = Math.max(0, Math.round(((255 - max) / 20) * 255));
        }
      }
      return sharp(data, {
        raw: {
          width: info.width,
          height: info.height,
          channels: info.channels,
        },
      }).png().toBuffer();
    });
}

function validHex(value: string | undefined): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "");
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
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
  const isYouTube = /youtube\.com|youtu\.be/.test(url);
  
  if (isSocialMedia) {
    // Use a unique prefix so we can glob for the actual file after download.
    // We avoid requiring ffmpeg by preferring formats that come as a single stream.
    const tempId = `ytdl-${crypto.randomUUID()}`;
    const tempDir = tmpdir();
    // Output template: yt-dlp will append the correct extension automatically
    const tempTemplate = path.join(tempDir, `${tempId}.%(ext)s`);
    let lastErr: Error | null = null;

    const formatAttempts = [
      "best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]/best",
      "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best",
      "bv*+ba/b",
    ];

    const attemptProfiles = buildYtDlpAttemptProfiles({
      isYouTube,
      formats: formatAttempts,
      envCookies: process.env.YTDL_COOKIES,
      envCookiesFromBrowser: process.env.YTDL_COOKIES_FROM_BROWSER,
    });

    for (let attempt = 1; attempt <= attemptProfiles.length; attempt++) {
      const profile = attemptProfiles[attempt - 1];
      try {
        const ytOptions: Record<string, any> = {
          output: tempTemplate,
          format: profile.format,
          mergeOutputFormat: "mp4",
          noWarnings: true,
          noCheckCertificates: true,
          forceOverwrites: true,
          retries: 3,
          fragmentRetries: 3,
          extractorRetries: 3,
          fileAccessRetries: 3,
        };

        if (profile.cookieMode?.type === "cookies") {
          ytOptions.cookies = profile.cookieMode.value;
        } else if (profile.cookieMode?.type === "browser") {
          ytOptions["cookies-from-browser"] = profile.cookieMode.value;
        }

        if (profile.extractorArgs) {
          ytOptions.extractorArgs = profile.extractorArgs;
        }

        const ytResult = await youtubedl(url, ytOptions, { env: YTDLP_ENV });
        const downloaded = await resolveDownloadedFiles(tempDir, tempId, ytResult);
        const downloadedPath = await pickNonEmptyDownloadedFile(downloaded);
        if (!downloadedPath) {
          throw new Error("yt-dlp did not produce a non-empty media file");
        }

        const buf = await readFile(downloadedPath);
        // Clean up all temp files created for this download
        await Promise.all(downloaded.map((f) => rm(f, { force: true }).catch(() => {})));
        return buf;
      } catch (err) {
        lastErr = err as Error;
        const { readdir } = await import("node:fs/promises");
        const files = await readdir(tempDir).catch(() => []);
        const leftovers = files
          .filter((f) => f.startsWith(tempId))
          .map((f) => path.join(tempDir, f));
        await Promise.all(leftovers.map((f) => rm(f, { force: true }).catch(() => {})));
        // If it's not the last attempt, wait a bit and retry
        if (attempt < attemptProfiles.length) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }

    throw new RemixError(500, `Không thể tải video từ link bài đăng sau nhiều lần thử: ${cleanYtDlpError(lastErr)}`);
  }

  return fetchToBuffer(job.source_url);
}

function cleanYtDlpError(err: Error | null): string {
  const message = err?.message ?? "yt-dlp không trả về lỗi chi tiết";
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes("NotOpenSSLWarning"))
    .filter((line) => !line.includes("urllib3 v2 only supports OpenSSL"))
    .filter((line) => !line.includes("Support for Python version 3.9 has been deprecated"))
    .filter((line) => !line.startsWith("warnings.warn("))
    .filter((line) => !line.startsWith("/Users/Apple/Library/Python/3.9/"));
  const cleaned = lines.at(-1);
  if (cleaned?.includes("Sign in to confirm you’re not a bot")) {
    return "YouTube đang yêu cầu xác thực. Hệ thống đã thử cookies tự động từ browser nhưng chưa thành công. Hãy cấu hình YTDL_COOKIES hoặc YTDL_COOKIES_FROM_BROWSER bằng phiên đăng nhập YouTube hợp lệ.";
  }
  return cleaned ?? "yt-dlp không tải được video. Nếu link cần đăng nhập, hãy cấu hình YTDL_COOKIES hoặc YTDL_COOKIES_FROM_BROWSER.";
}

function buildYtDlpAttemptProfiles(input: {
  isYouTube: boolean;
  formats: string[];
  envCookies?: string;
  envCookiesFromBrowser?: string;
}): YtDlpAttemptProfile[] {
  const explicitCookieMode = resolveExplicitCookieMode(input.envCookies, input.envCookiesFromBrowser);
  const attempts: YtDlpAttemptProfile[] = [];

  if (!input.isYouTube) {
    return input.formats.map((format) => ({ format, cookieMode: explicitCookieMode }));
  }

  // 1. Try with cookies (if any)
  if (explicitCookieMode) {
    attempts.push(...input.formats.map((format) => ({ format, cookieMode: explicitCookieMode })));
  } else {
    // 2. Try auto browsers if no explicit cookies
    const autoBrowsers = (process.env.YTDL_AUTO_BROWSER_CANDIDATES ?? "chrome,safari,firefox")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
      
    if (autoBrowsers.length > 0) {
      attempts.push({ format: input.formats[0] }); // No cookies
      attempts.push(
        ...autoBrowsers.map((browser) => ({
          format: input.formats[0],
          cookieMode: { type: "browser" as const, value: browser },
        })),
      );
      for (const format of input.formats.slice(1)) {
        attempts.push({
          format,
          cookieMode: { type: "browser", value: autoBrowsers[0] },
        });
      }
    } else {
      attempts.push(...input.formats.map((format) => ({ format })));
    }
  }

  // 3. FALLBACK: YouTube is heavily blocking downloads right now.
  // The android client WITHOUT cookies often bypasses 403 Forbidden.
  // We append this as a last-resort fallback for YouTube.
  attempts.push(...input.formats.map((format) => ({ 
    format, 
    extractorArgs: "youtube:player_client=android" 
  })));

  return attempts;
}

function resolveExplicitCookieMode(
  envCookies?: string,
  envCookiesFromBrowser?: string,
): YtDlpCookieMode | undefined {
  if (envCookies?.trim()) {
    return { type: "cookies", value: envCookies.trim() };
  }
  if (envCookiesFromBrowser?.trim()) {
    return { type: "browser", value: envCookiesFromBrowser.trim() };
  }
  return undefined;
}

async function resolveDownloadedFiles(tempDir: string, tempId: string, ytResult: unknown): Promise<string[]> {
  const fromMetadata = extractDownloadedPaths(ytResult);
  if (fromMetadata.length > 0) {
    return Array.from(new Set(fromMetadata));
  }

  const { readdir } = await import("node:fs/promises");
  const files = await readdir(tempDir);
  return files
    .filter((f) => f.startsWith(tempId))
    .map((f) => path.join(tempDir, f));
}

function extractDownloadedPaths(ytResult: unknown): string[] {
  if (!ytResult || typeof ytResult !== "object") return [];
  const payload = ytResult as {
    _filename?: string;
    filename?: string;
    requested_downloads?: Array<{ _filename?: string; filename?: string }>;
  };

  const paths = [
    payload._filename,
    payload.filename,
    ...(payload.requested_downloads ?? []).flatMap((item) => [item._filename, item.filename]),
  ];

  return paths.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

async function pickNonEmptyDownloadedFile(paths: string[]): Promise<string | null> {
  for (const filePath of paths) {
    try {
      const info = await stat(filePath);
      if (info.isFile() && info.size > 0) return filePath;
    } catch {
      // Keep scanning candidates from yt-dlp metadata and temp dir fallback.
    }
  }
  return null;
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
    const { error: mediaErr } = await db
      .from("post_media")
      .insert({ post_id: post.id, media_id: job.result_media_id, position: 0 });
    if (mediaErr) {
      throw new RemixError(500, `Gắn media vào post thất bại: ${mediaErr.message}`);
    }
  }

  const { error: updateErr } = await db
    .from("remix_jobs")
    .update({
      status: "approved",
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      post_id: post.id,
    })
    .eq("id", jobId);
  if (updateErr) {
    throw new RemixError(500, `Cập nhật job sau khi duyệt thất bại: ${updateErr.message}`);
  }

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

// ---------------------------------------------------------------------------
// resumeAfterHeyGen — Giai đoạn 2: tiếp tục pipeline sau khi HeyGen webhook về
// ---------------------------------------------------------------------------

/**
 * Được gọi bởi worker khi nhận job kind='heygen_continue' (sau webhook HeyGen).
 *
 * Flow:
 *   1. Load lại job + plan đã lưu ở giai đoạn 1 (bao gồm OCR tracks + options).
 *   2. Download video đã dịch từ HeyGen → lưu vào workDir.
 *   3. Dùng captionSrt từ HeyGen làm asrTranslatedSrt (fallback: chạy ASR trên video HeyGen).
 *   4. Gọi produceVideo() với sourcePath = heygenVideoPath — TTS bị skip tự động
 *      (effectiveDubMode='heygen'), subtitle + text-on-screen chạy bình thường.
 *   5. Upload kết quả, cập nhật DB, gửi notify.
 */
export async function resumeAfterHeyGen(
  db: SupabaseClient,
  remixJobId: string,
  heygenVideoUrl: string,
  captionSrt?: string,
): Promise<RunRemixResult> {
  const job = await loadJob(db, remixJobId);
  const warnings: string[] = [];

  const workDir = await makeWorkDir();
  try {
    await setStatus(db, remixJobId, "processing");

    // Download video đã dịch từ HeyGen vào workDir
    console.log(`[remix:heygen] Downloading HeyGen video: ${heygenVideoUrl.slice(0, 80)}`);
    const heygenVideoBuf = await fetchToBuffer(heygenVideoUrl);
    const heygenVideoPath = await writeTemp(workDir, "heygen_video.mp4", heygenVideoBuf);

    // Probe video HeyGen để lấy thông tin (duration, hasAudio, v.v.)
    const videoInfo = await probeVideo(heygenVideoPath).catch(() => null);
    if (!videoInfo) {
      warnings.push("Không probe được video từ HeyGen — tiếp tục với thông tin mặc định.");
    }

    // Load plan đã được lưu ở giai đoạn 1
    const plan = isPlan(job.plan) ? job.plan : { videoOps: [], warnings: [], summary: "" } as RemixPlan;

    // SRT: ưu tiên captionSrt từ HeyGen. Fallback: chạy ASR trên video HeyGen nếu vietsub bật.
    let asrTranslatedSrt: string | undefined;
    if (captionSrt && captionSrt.trim()) {
      asrTranslatedSrt = captionSrt;
      warnings.push(`Dùng phụ đề SRT từ HeyGen captions (${parseSrtCues(captionSrt, videoInfo?.durationSec).length} cues).`);
    } else if (job.options?.vietsub && videoInfo?.hasAudio) {
      // Fallback: ASR trên video HeyGen (giọng tiếng Việt đã được dịch)
      warnings.push("HeyGen không trả về SRT — chạy ASR fallback trên video đã dịch.");
      const audioPath = await extractAudio({ inputPath: heygenVideoPath, workDir });
      if (audioPath) {
        const asrResult = await transcribeToSrt(audioPath);
        if (asrResult.srt) {
          asrTranslatedSrt = asrResult.srt;
          warnings.push(`ASR fallback thành công: ${parseSrtCues(asrResult.srt, videoInfo?.durationSec).length} cues.`);
        }
      }
    }

    if (asrTranslatedSrt) {
      const srtCues = parseSrtCues(asrTranslatedSrt, videoInfo?.durationSec);
      if (srtCues.length > 0) {
        plan.scriptVi = srtCues.map((c) => c.text).join(" ").trim();
      }
    }

    plan.warnings = [...warnings, ...(plan.warnings ?? [])];

    // Merge preset options
    let effectiveOptions: typeof job.options = { ...(job.options ?? {}) };
    if (job.preset_id) {
      const { data: preset } = await db
        .from('remix_presets')
        .select('*')
        .eq('id', job.preset_id)
        .maybeSingle();
      if (preset) {
        effectiveOptions = {
          voiceName: preset.voice_name,
          blurOriginalSub: preset.blur_original_sub,
          blurRegion: preset.blur_region,
          autoDetectSubtitleRegion: preset.auto_detect_subtitle_region || (preset.blur_original_sub && !preset.blur_region),
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
          outputCrf: preset.output_crf,
          translateOnScreenText: preset.translate_on_screen_text,
          dubMode: 'heygen' as const, // Bảo toàn heygen mode
          vietsub: preset.auto_vietsub,
          ...effectiveOptions,
        };
      }
    }

    // Chạy produceVideo trên video HeyGen (TTS tự động bị skip vì dubMode='heygen')
    const asset = await produceVideo({
      db,
      workDir,
      sourcePath: heygenVideoPath,
      plan,
      options: effectiveOptions,
      videoInfo,
      createdBy: job.created_by ?? undefined,
      asrTranslatedSrt,
      // HeyGen path: TTS bị skip hoàn toàn vì dubMode='heygen'
      hasRealAsrScript: false,
    });

    const iteration = job.iteration;
    const hashtags = plan.hashtags ?? [];

    // Lưu kết quả
    await db
      .from("remix_jobs")
      .update({
        status: "review",
        plan,
        result_media_id: asset.id,
        result_caption: plan.caption ?? null,
        result_hashtags: hashtags,
        heygen_status: "completed",
        error: null,
      })
      .eq("id", remixJobId);

    await db.from("remix_revisions").insert({
      remix_job_id: remixJobId,
      iteration,
      feedback: null,
      plan,
      result_media_id: asset.id,
      result_caption: plan.caption ?? null,
      created_by: job.created_by ?? null,
    });

    // Notify user
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const chatId = job.created_by ? await getUserTelegramChatId(db, job.created_by) : null;
    if (job.created_by) {
      await notify({
        db,
        userId: job.created_by,
        type: 'remix_completed',
        title: 'Video đã dịch giọng và tạo phụ đề xong',
        body: plan.summary ?? 'HeyGen Video Translate hoàn tất.',
        link: `/remix?jobId=${remixJobId}`,
        metadata: { jobId: remixJobId },
        telegramChatId: chatId ?? undefined,
        telegramMessage: TelegramTemplates.remixCompleted(remixJobId, appUrl),
      });
    }

    return {
      jobId: remixJobId,
      status: "review",
      iteration,
      resultMediaId: asset.id,
      resultUrl: asset.url,
      caption: plan.caption,
      hashtags,
      warnings: plan.warnings,
      planSummary: plan.summary,
    };
  } catch (err) {
    const message = (err as Error).message ?? "Lỗi không xác định khi tiếp tục sau HeyGen.";
    await db
      .from("remix_jobs")
      .update({ status: "failed", heygen_status: "failed", error: message })
      .eq("id", remixJobId);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const chatId = job.created_by ? await getUserTelegramChatId(db, job.created_by).catch(() => null) : null;
    if (job.created_by) {
      void notify({
        db,
        userId: job.created_by,
        type: 'remix_failed',
        title: 'Xử lý video sau HeyGen thất bại',
        body: message,
        link: `/remix?jobId=${remixJobId}`,
        metadata: { jobId: remixJobId, error: message },
        telegramChatId: chatId ?? undefined,
        telegramMessage: TelegramTemplates.remixFailed(remixJobId, message, appUrl),
      });
    }
    return {
      jobId: remixJobId,
      status: "failed",
      iteration: job.iteration,
      hashtags: [],
      warnings: [...warnings, message],
    };
  } finally {
    await cleanupWorkDir(workDir);
  }
}
