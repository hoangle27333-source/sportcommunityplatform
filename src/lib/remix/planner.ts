import { getAIProvider } from "@/lib/ai";
import type { SubtitleCue, VideoInfo } from "./video-ops";
import { buildAssSubtitles, scriptToCues, buildSrt, subtitlePlacementForBlurRegion } from "./video-ops";
import { sanitizeTranscriptText } from "./utils";
import type { OnScreenTextTranslation } from "./on-screen-text";
import {
  KNOWN_VIDEO_OPS,
  type AlignedVoiceCue,
  type RemixOptions,
  type RemixAnalysisBrief,
  type RemixEditDecisions,
  type RemixOutputKind,
  type RemixPlan,
  type RemixScenePlan,
  type RemixSourceType,
  type VideoOp,
} from "./types";

/**
 * Lập kế hoạch remix (SPEC §7 — AI chỉ điều phối, không sinh pixel).
 *
 * Vai trò của AI ở đây rất hẹp và có chủ đích:
 *   1. Dịch mô tả tự nhiên của người dùng thành các op đã whitelist.
 *   2. Viết script/phụ đề tiếng Việt + caption/hashtag.
 *
 * Mọi thứ AI trả về đều được validate và kẹp biên trước khi chạy. Op lạ bị bỏ.
 * Các option "cứng" (checkbox) được ÁP ĐẶT sau khi AI trả lời — người dùng bật
 * vertical thì chắc chắn có reframe, không phụ thuộc model có nhớ hay không.
 */

// ---------------------------------------------------------------------------
// Kích thước khung chuẩn
// ---------------------------------------------------------------------------

const VERTICAL = { width: 1080, height: 1920 } as const;
type ScenePlanScene = RemixScenePlan["scenes"][number];
type EditOverlay = RemixEditDecisions["overlays"][number];

interface RawPlan {
  summary?: string;
  videoOps?: unknown;
  scriptVi?: string;
  caption?: string;
  hashtags?: unknown;
  warnings?: unknown;
}

export interface PlanRemixInput {
  sourceType?: RemixSourceType;
  outputKind: RemixOutputKind;
  prompt?: string;
  options: RemixOptions;
  /** Thông tin video nguồn (null với output caption hoặc nguồn ảnh). */
  videoInfo?: VideoInfo | null;
  /** Ngữ cảnh từ bài tham khảo (chế độ inspiration). */
  inspiration?: string;
  /** Feedback của người dùng ở vòng sửa (null ở vòng đầu). */
  feedback?: string;
  /** Kế hoạch vòng trước — để AI sửa thay vì làm lại từ đầu. */
  previousPlan?: RemixPlan;
  /** Có logo thương hiệu để chèn hay không (quyết định op overlayLogo). */
  hasLogo?: boolean;
  /** Script tiếng Việt đã được ASR thật từ audio video — ưu tiên hơn AI tự sinh. */
  realScriptVi?: string;
  /** Cue voice đã được ASR trước plan, dùng làm timeline nguồn cho dubbing/subtitle. */
  voiceCues?: AlignedVoiceCue[];
  /** Text-on-screen đã OCR trước plan, dùng làm layout/timing nguồn cho overlay. */
  onScreenTextTracks?: OnScreenTextTranslation[];
}

/**
 * Gọi AI lập kế hoạch, validate, rồi áp các option cứng lên trên.
 * Không bao giờ throw vì model trả rác — rơi về kế hoạch tối thiểu từ options.
 */
export async function planRemix(input: PlanRemixInput): Promise<RemixPlan> {
  const ai = getAIProvider();
  const prompt = buildPlanPrompt(input);

  let raw: RawPlan | null = null;
  try {
    const res = await ai.completeJson<RawPlan>(prompt);
    raw = res.data;
  } catch (err) {
    raw = null;
    console.warn('planRemix: AI lỗi, dùng kế hoạch từ options', err);
  }

  const warnings: string[] = toStringArray(raw?.warnings);

  let videoOps = sanitizeVideoOps(raw?.videoOps, input.videoInfo ?? null);

  // Ưu tiên realScriptVi (từ ASR thật) nếu có — không dùng AI fabricate
  const scriptVi = sanitizeTranscriptText(
    input.options.scriptInputMode === "manual_script" && input.options.manualScript?.trim()
      ? input.options.manualScript.trim()
      : input.realScriptVi?.trim()
      || (typeof raw?.scriptVi === 'string' ? raw.scriptVi.trim() : ''),
  );

  // ---- Áp option cứng (nguồn chân lý là checkbox của người dùng) ----
  if ((input.outputKind === 'video' || input.outputKind === 'image') && input.videoInfo) {
    // Filter out colorGrade if user didn't request it
    if (!input.options.colorGrade) {
      videoOps = videoOps.filter(op => op.op !== 'colorGrade');
    }
    
    videoOps = applyHardOptions({
      ops: videoOps,
      options: input.options,
      info: input.videoInfo,
      scriptVi,
      hasLogo: input.hasLogo ?? false,
      voiceCues: input.voiceCues,
      warnings,
    });
  }

  const artifacts = buildProductionArtifacts(input, videoOps, scriptVi, warnings);

  return {
    summary:
      typeof raw?.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : describePlan(videoOps, input.options),
    ...artifacts,
    videoOps,
    scriptVi: scriptVi || undefined,
    caption: typeof raw?.caption === 'string' ? raw.caption.trim() : undefined,
    hashtags: normalizeHashtags(raw?.hashtags),
    warnings,
  };
}

function buildProductionArtifacts(
  input: PlanRemixInput,
  ops: VideoOp[],
  scriptVi: string,
  warnings: string[],
): Pick<RemixPlan, "analysisBrief" | "scenePlan" | "editDecisions" | "costEstimate"> {
  const info = input.videoInfo ?? null;
  const options = input.options;
  const pipelineMode = choosePipelineMode(input);
  const trim = ops.find((op) => op.op === "trim") as Extract<VideoOp, { op: "trim" }> | undefined;
  const startSec = trim?.start ?? 0;
  const durationSec =
    trim?.duration ??
    (info?.durationSec && info.durationSec > 0 ? info.durationSec : options.clipDurationSec ?? 30);
  const endSec = startSec + durationSec;
  const visualType = inferVisualType(input);

  const analysisBrief: RemixPlan["analysisBrief"] = {
    version: "1.0",
    source: {
      type: input.sourceType ?? "upload",
      durationSec: info?.durationSec,
      resolution: info ? `${info.width}x${info.height}` : undefined,
      hasAudio: info?.hasAudio,
    },
    content: {
      summary: input.inspiration
        ? summarizeText(input.inspiration, 220)
        : input.prompt
          ? summarizeText(input.prompt, 220)
          : scriptVi
            ? summarizeText(scriptVi, 220)
            : "Nguồn sẽ được xử lý theo các tuỳ chọn remix đã chọn.",
      hook: inferHook(input.prompt, scriptVi, input.inspiration),
      tone: options.captionTone ?? (input.inspiration ? "reference-led" : "brand-safe"),
      topics: inferTopics(input.prompt, scriptVi, input.inspiration),
    },
    structure: {
      sceneCount: options.pipelineMode === "clip_factory" ? clampInt(options.clipCount ?? 3, 1, 10) : 1,
      pacingStyle: inferPacing(info?.durationSec, options),
      avgSceneDurationSec: durationSec,
    },
    style: {
      subtitleStyle: options.vietsub
        ? `${options.subtitleConfig?.position ?? options.subPosition ?? "bottom"} burn-in`
        : undefined,
      outputRatio: options.outputRatio ?? (options.vertical ? "9:16" : "original"),
      productionQuality: "presentable",
    },
    replicationGuidance: {
      suggestedPipeline: pipelineMode,
      keyElements: buildKeyElements(input, ops),
      risks: [...warnings, ...buildPlanRisks(input, ops)].slice(0, 8),
    },
  };

  const scenes = buildScenePlanScenes(input, startSec, durationSec, visualType);
  const scenePlan: RemixScenePlan = {
    version: "1.0",
    scenes,
  };

  const editDecisions: RemixPlan["editDecisions"] = {
    version: "1.0",
    renderRuntime: "ffmpeg",
    cuts: scenes
      .filter((scene) => scene.type === "source" || scene.type === "clip")
      .map((scene) => ({
        id: `cut-${scene.id}`,
        source: "source",
        inSec: scene.startSec,
        outSec: scene.endSec,
        reason: scene.reason,
      })),
    overlays: [
      ...(options.vietsub
        ? [{
            kind: "subtitles" as const,
            startSec,
            endSec,
            reason: "Burn-in phụ đề theo cấu hình người dùng.",
          }]
        : []),
      ...(options.brandLogo
        ? [{
            kind: "logo" as const,
            startSec,
            endSec,
            reason: "Watermark thương hiệu theo cấu hình người dùng.",
          }]
        : []),
      ...(options.translateOnScreenText || options.textOverlay?.trim()
        ? (input.onScreenTextTracks?.length
          ? input.onScreenTextTracks.map((track, idx) => ({
              id: `text-${idx + 1}`,
              kind: "text" as const,
              startSec: track.startSec,
              endSec: track.endSec,
              reason: "Preflight OCR: xác định trước text on-screen, bbox và timing để bước dịch/render bám theo.",
              sourceText: track.detectedText,
              translatedText: undefined,
              region: track.region,
              confidence: track.confidence,
            }))
          : [{
            kind: "text" as const,
            startSec,
            endSec,
            reason: "Chưa có OCR preflight; render sẽ cố phát hiện text on-screen trước khi chèn.",
          }])
        : []),
      ...(options.vietsub && options.blurOriginalSub !== false
        ? [{
            kind: "blur" as const,
            startSec,
            endSec,
            reason: "Làm mờ vùng phụ đề gốc trước khi chèn phụ đề mới.",
          }]
        : []),
    ] satisfies EditOverlay[],
    audio: {
      mode: options.muteOriginal
        ? "muted"
        : options.dubMode === "preserve_bgm"
          ? "tts_preserve_bgm"
          : options.dubMode === "full" || options.dubVi
            ? "tts_replace"
            : "original",
      voiceName: options.voiceName,
      cues: input.voiceCues?.map((cue, idx) => ({
        id: `voice-${idx + 1}`,
        startSec: cue.startSec,
        endSec: cue.endSec,
        sourceText: cue.sourceText,
        translatedText: cue.translatedText ?? cue.sourceText,
        confidence: cue.confidence ?? 1,
        words: cue.words,
      })),
    },
    subtitles: {
      enabled: Boolean(options.vietsub),
      position: options.subtitleConfig?.position ?? options.subPosition,
    },
  };

  const costEstimate: RemixPlan["costEstimate"] = {
    provider: "ffmpeg+configured-ai",
    estimatedVnd: estimateCostVnd(input),
    notes: buildCostNotes(input, pipelineMode),
  };

  return { analysisBrief, scenePlan, editDecisions, costEstimate };
}

function choosePipelineMode(input: PlanRemixInput): NonNullable<RemixOptions["pipelineMode"]> {
  if (input.options.pipelineMode) return input.options.pipelineMode;
  if (input.options.clipCount && input.options.clipCount > 1) return "clip_factory";
  if (input.options.vietsub || input.options.dubMode === "full" || input.options.dubMode === "preserve_bgm" || input.options.dubVi) {
    return "localization_dub";
  }
  if (input.options.translateOnScreenText || input.options.textOverlay || input.options.brandLogo || input.options.introEnabled || input.options.outroEnabled) {
    return "hybrid";
  }
  return "simple";
}

function buildScenePlanScenes(
  input: PlanRemixInput,
  startSec: number,
  durationSec: number,
  visualType: ScenePlanScene["visualType"],
): RemixScenePlan["scenes"] {
  if (choosePipelineMode(input) !== "clip_factory") {
    return [
      {
        id: "scene-1",
        type: "source",
        startSec,
        endSec: startSec + durationSec,
        role: "payload",
        visualType,
        reason: "Main source-led edit rendered by the whitelisted FFmpeg op chain.",
        score: 1,
      },
    ];
  }

  const count = clampInt(input.options.clipCount ?? 3, 1, 10);
  const clipDuration = clampInt(input.options.clipDurationSec ?? 30, 5, 180);
  const sourceDuration = Math.max(input.videoInfo?.durationSec ?? count * clipDuration, clipDuration);
  const step = Math.max(clipDuration, sourceDuration / count);

  return Array.from({ length: count }, (_, i) => {
    const s = Math.min(Math.max(0, i * step), Math.max(0, sourceDuration - clipDuration));
    const e = Math.min(sourceDuration, s + clipDuration);
    return {
      id: `clip-${i + 1}`,
      type: "clip",
      startSec: Math.round(s * 10) / 10,
      endSec: Math.round(e * 10) / 10,
      role: i === 0 ? "hook" : "payload",
      visualType,
      reason: "Clip Factory v1 candidate: evenly sampled segment pending transcript-based ranking.",
      score: Math.round((0.82 - i * 0.04) * 100) / 100,
    };
  });
}

function inferVisualType(input: PlanRemixInput): ScenePlanScene["visualType"] {
  const text = `${input.prompt ?? ""} ${input.inspiration ?? ""}`.toLowerCase();
  if (text.includes("screen") || text.includes("demo")) return "screen_recording";
  if (text.includes("talk") || text.includes("phỏng vấn") || text.includes("interview")) return "talking_head";
  if (text.includes("b-roll") || text.includes("broll")) return "b_roll";
  if (input.options.translateOnScreenText || input.options.textOverlay || input.options.vietsub) return "mixed";
  return "unknown";
}

function inferPacing(durationSec: number | undefined, options: RemixOptions): RemixAnalysisBrief["structure"]["pacingStyle"] {
  if (options.clipCount && options.clipCount > 1) return "short_social";
  if (!durationSec) return "unknown";
  if (durationSec <= 45) return "short_social";
  if (durationSec <= 180) return "steady";
  return "long_form";
}

function buildKeyElements(input: PlanRemixInput, ops: VideoOp[]): string[] {
  const out = ["FFmpeg render một pass với op whitelist"];
  if (input.inspiration) out.push("Giữ công thức hook/nhịp từ link tham khảo, không tải media bên thứ ba");
  if (ops.some((op) => op.op === "trim")) out.push("Cắt đoạn có chủ đích");
  if (ops.some((op) => op.op === "reframe")) out.push("Reframe theo platform ratio");
  if (input.options.vietsub) out.push("Transcript/subtitle-first localization");
  if (input.options.dubMode && input.options.dubMode !== "none") out.push("AI dubbing theo voice đã chọn");
  return out.slice(0, 6);
}

function buildPlanRisks(input: PlanRemixInput, ops: VideoOp[]): string[] {
  const risks: string[] = [];
  const reframe = ops.find((op) => op.op === "reframe") as Extract<VideoOp, { op: "reframe" }> | undefined;
  if (reframe?.mode === "crop") risks.push("Crop có thể cắt mất chủ thể; cần xem lại preview.");
  if (input.options.dubMode === "preserve_bgm") risks.push("Tách voice/bgm bằng FFmpeg chỉ là heuristic, nhạc nền có thể còn lẫn giọng gốc.");
  if (input.options.vietsub && !input.realScriptVi) risks.push("Phụ đề phụ thuộc ASR/AI; cần kiểm tra thuật ngữ và timing.");
  if (input.options.protectedTerms?.length) risks.push(`Giữ nguyên protected terms: ${input.options.protectedTerms.join(", ")}.`);
  return risks;
}

function buildCostNotes(
  input: PlanRemixInput,
  pipelineMode: NonNullable<RemixOptions["pipelineMode"]>,
): string[] {
  const notes = [`Pipeline mode: ${pipelineMode}. Runtime v1: ffmpeg.`];
  notes.push("FFmpeg local không phát sinh phí provider.");
  if (input.options.vietsub) notes.push("ASR/dịch phụ đề dùng provider AI đã cấu hình.");
  if (input.options.dubMode && input.options.dubMode !== "none") notes.push("TTS có thể phát sinh phí theo provider/voice.");
  if (pipelineMode === "clip_factory") notes.push("Clip Factory v1 lập candidate trong plan; multi-output render có thể mở rộng sau.");
  return notes;
}

function estimateCostVnd(input: PlanRemixInput): number {
  let total = 0;
  if (input.options.vietsub) total += 300;
  if (input.options.dubMode && input.options.dubMode !== "none") total += 700;
  if (input.options.clipCount && input.options.clipCount > 1) total += input.options.clipCount * 150;
  return total;
}

function summarizeText(text: string, maxLen: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > maxLen ? `${compact.slice(0, maxLen - 1)}…` : compact;
}

function inferHook(...texts: Array<string | undefined>): string | undefined {
  const first = texts.find((t) => t?.trim())?.trim();
  if (!first) return undefined;
  return summarizeText(first.split(/[.!?\n]/).find(Boolean) ?? first, 90);
}

function inferTopics(...texts: Array<string | undefined>): string[] {
  const text = texts.filter(Boolean).join(" ").toLowerCase();
  const candidates = ["sân bóng", "thể thao", "khuyến mãi", "đặt sân", "reels", "tutorial", "review", "fitness"];
  const found = candidates.filter((x) => text.includes(x));
  return found.length ? found.slice(0, 6) : ["remix", "social video"];
}

// ---------------------------------------------------------------------------
// Áp option cứng
// ---------------------------------------------------------------------------

interface HardOptionsInput {
  ops: VideoOp[];
  options: RemixOptions;
  info: VideoInfo;
  scriptVi: string;
  hasLogo: boolean;
  voiceCues?: AlignedVoiceCue[];
  warnings: string[];
}

/**
 * Đảm bảo mỗi checkbox người dùng bật đều có op tương ứng, và loại các op mâu
 * thuẫn. Đây là lớp "luật" đứng trên đề xuất của AI.
 */
function applyHardOptions(input: HardOptionsInput): VideoOp[] {
  const { options: o, info, scriptVi, hasLogo, voiceCues, warnings } = input;
  // Bỏ các op mà option cứng sẽ tự quyết định, tránh trùng lặp.
  // Kiểu phải là VideoOp[] (không để TS thu hẹp theo kết quả filter) vì bên
  // dưới ta còn push thêm trim/reframe/subtitles/overlayLogo/mute.
  const ops: VideoOp[] = input.ops.filter(
    (op) =>
      op.op !== "reframe" &&
      op.op !== "subtitles" &&
      op.op !== "mute" &&
      op.op !== "overlayLogo" &&
      op.op !== "trim",
  );

  // --- Trim ---
  if (o.trimSeconds && o.trimSeconds > 0) {
    const start = Math.max(0, Math.min(o.trimStart ?? 0, Math.max(0, info.durationSec - 1)));
    const maxDur = Math.max(0.5, info.durationSec - start);
    ops.unshift({
      op: "trim",
      start,
      duration: Math.min(o.trimSeconds, maxDur),
    });
  }

  // --- Khung dọc ---
  if (o.vertical) {
    // crop cho video ngang (phủ kín, không viền đen); pad nếu đã dọc/vuông.
    const isLandscape = info.width > info.height;
    ops.push({
      op: "reframe",
      width: VERTICAL.width,
      height: VERTICAL.height,
      mode: isLandscape ? "crop" : "pad",
    });
    if (isLandscape) {
      warnings.push(
        "Video gốc nằm ngang: đã cắt hai bên để lên khung dọc 9:16 — kiểm tra chủ thể có bị cắt không.",
      );
    }
  }

  // --- Chỉnh màu ---
  if (o.colorGrade && !ops.some((op) => op.op === "colorGrade")) {
    ops.push({ op: "colorGrade", brightness: 0.03, contrast: 1.08, saturation: 1.12 });
  }

  // --- Phụ đề tiếng Việt (burn-in) ---
  if (o.vietsub) {
    if (scriptVi) {
      // Thời lượng hiệu dụng sau trim để phụ đề không tràn khỏi video.
      const trimOp = ops.find((op) => op.op === "trim") as
        | Extract<VideoOp, { op: "trim" }>
        | undefined;
      const effective = trimOp ? trimOp.duration : info.durationSec;
      const cues = scriptToCues(scriptVi, effective);
      if (cues.length) {
        // Compute vị trí và margin
        const pos = o.subtitleConfig?.position ?? o.subPosition ?? 'bottom';
        let targetHeight = info.height;
        
        const reframeOp = ops.find((op) => op.op === "reframe") as Extract<VideoOp, { op: "reframe" }> | undefined;
        if (reframeOp) {
          targetHeight = reframeOp.height;
        }

        let marginV = 60;
        let alignment = 2; // ASS bottom-center

        if (pos === 'top') {
          alignment = 8; // ASS top-center
          marginV = 40;
        } else if (pos === 'custom') {
          alignment = 8;
          marginV = Math.round(clampNumber(o.subtitleConfig?.customY ?? o.subCustomY, 0.05, 0.9, 0.78) * targetHeight);
        } else if (pos === 'auto') {
          if (o.blurOriginalSub) {
            // Có phụ đề gốc (bật làm mờ): đặt sub mới bên trong vùng blur.
            const placement = subtitlePlacementForBlurRegion(o.blurRegion, targetHeight);
            marginV = placement.marginV;
            alignment = placement.alignment;
          } else {
            // Không làm mờ phụ đề gốc: chèn ở vị trí dưới cùng tiêu chuẩn
            marginV = 60;
            alignment = 2;
          }
        }

        ops.push({
          op: "subtitles",
          srt: buildSrt(cues),
          ...buildSubtitleVideoOpStyle(o, cues, voiceCues, { marginV, alignment }),
        });
      }
    } else {
      warnings.push(
        "Bật Vietsub nhưng chưa có nội dung thoại để dịch. Hãy mô tả nội dung video trong prompt, hoặc tự nhập script.",
      );
    }
  }

  // --- Watermark mới (ảnh hoặc text) ---
  const wm = o.watermarkConfig;
  if (wm?.enabled) {
    const position = wm.position ?? o.logoPosition ?? "bottom-right";
    const ratio = o.outputRatio ?? (o.vertical ? "9:16" : "original");
    const custom = wm.perRatioPosition?.[ratio] ?? wm.customPosition;
    const ratioScale = wm.perRatioScale?.[ratio] ?? wm.scale ?? 0.15;
    if (wm.type === "text" && wm.text?.trim()) {
      ops.push({
        op: "overlayText",
        text: wm.text.trim(),
        startSec: 0,
        endSec: info.durationSec,
        region: watermarkTextRegion(position, custom),
        fitToRegion: true,
        coverRegion: false,
        minFontSize: 12,
        maxFontSize: Math.round(52 * (ratioScale / 0.15)),
        font: o.subtitleConfig?.font ?? o.subFont ?? "Be Vietnam Pro",
        fontSize: Math.round(34 * (ratioScale / 0.15)),
        color: o.subtitleConfig?.color ?? o.subColor ?? "#FFFFFF",
        bgColor: "#000000",
        outlineColor: "#000000",
        boxOpacity: Math.max(0, Math.min(1, wm.opacity ?? 0.82)) * 0.45,
        bold: true,
      });
    } else if (wm.type === "image" && (wm.imageMediaId || o.logoMediaId || hasLogo)) {
      ops.push({
        op: "overlayLogo",
        logoPath: "__WATERMARK__",
        position: custom ? "custom" : (position === "custom" ? "bottom-right" : position),
        x: custom?.x,
        y: custom?.y,
        scale: ratioScale,
        opacity: wm.opacity ?? 0.9,
      });
    } else {
      warnings.push("Bật watermark nhưng chưa có text hoặc ảnh watermark để chèn.");
    }
  }

  // --- Logo thương hiệu cũ (fallback khi chưa có watermarkConfig từ editor) ---
  // Chỉ chạy khi user CHƯA cấu hình watermark trong editor.
  // Nếu user đã gửi watermarkConfig (dù enabled=false) → tôn trọng quyết định đó.
  if (o.brandLogo && !o.watermarkConfig) {
    if (hasLogo) {
      ops.push({
        op: "overlayLogo",
        // logoPath được worker thay bằng đường dẫn thật sau khi tải asset.
        logoPath: "__LOGO__",
        position: o.logoPosition ?? "bottom-right",
        scale: 0.14,
      });
    } else {
      warnings.push(
        "Bật chèn logo nhưng chưa cấu hình logo thương hiệu (BRAND_LOGO_URL) — đã bỏ qua bước này.",
      );
    }
  }

  // --- Audio ---
  // Chuẩn hóa: dubMode 'full' hoặc 'preserve_bgm' → có lồng tiếng, bỏ muớeOriginal
  const hasDub = o.dubMode === 'full' || o.dubMode === 'preserve_bgm' || o.dubVi === true;
  // muteOriginal chỉ chạy khi không có lồng tiếng
  if (o.muteOriginal && !hasDub) {
    ops.push({ op: "mute" });
  }
  if (!info.hasAudio && hasDub) {
    warnings.push("Video gốc không có audio — sẽ dùng giọng đọc tiếng Việt sinh mới.");
  }

  // Luôn có bước encode cuối để chuẩn hoá đầu ra.
  if (!ops.some((op) => op.op === "encode")) {
    const crf = o.outputCrf ?? 18;
    ops.push({ op: "encode", fps: Math.min(30, Math.max(24, Math.round(info.fps || 30))), crf });
  }

  return ops;
}

function buildSubtitleVideoOpStyle(
  o: RemixOptions,
  cues: SubtitleCue[],
  voiceCues: AlignedVoiceCue[] | undefined,
  placement: { marginV: number; alignment: number },
): Omit<Extract<VideoOp, { op: "subtitles" }>, "op" | "srt"> {
  const preset = o.subtitleConfig?.preset ?? o.subtitlePreset;
  const font =
    o.subtitleConfig?.font ??
    o.subFont ??
    (preset === "tiktok_bold" ? "Montserrat" : undefined);
  const fontSize =
    o.subtitleConfig?.size ??
    o.subFontSize ??
    (preset === "tiktok_bold" ? 36 : 20);
  const primaryColor =
    o.subtitleConfig?.color ??
    o.subColor ??
    (preset === "tiktok_bold" ? "#FFFFFF" : undefined);
  const outlineColor =
    o.subtitleConfig?.bgColor ??
    o.subBgColor ??
    (preset === "tiktok_bold" ? "#000000" : undefined);
  const animation = o.subtitleConfig?.animation ?? o.subtitleAnimation ?? "static";
  const highlightColor =
    o.subtitleConfig?.highlightColor ??
    o.subHighlightColor ??
    (preset === "tiktok_bold" ? "#FFF200" : "#FFF200");
  const base = {
    font,
    fontSize,
    primaryColor,
    outlineColor,
    highlightColor,
    borderStyle: o.subtitleConfig?.borderStyle ?? o.subBorderStyle ?? (preset === "tiktok_bold" ? 1 : undefined),
    bold: o.subtitleConfig?.bold ?? o.subBold ?? preset === "tiktok_bold",
    italic: o.subtitleConfig?.italic ?? o.subItalic,
    outline: o.subtitleConfig?.outline ?? o.subOutline ?? (preset === "tiktok_bold" ? 3 : undefined),
    marginV: placement.marginV,
    alignment: placement.alignment,
  };
  if (animation !== "word_highlight" && animation !== "reveal_words") return base;

  const wordCues = cues.map((cue) => {
    const matching = voiceCues?.find(
      (item) => Math.abs(item.startSec - cue.startSec) < 0.35 && Math.abs(item.endSec - cue.endSec) < 0.75,
    );
    return {
      ...cue,
      words: matching?.words?.length
        ? matching.words.map((word) => ({
            word: word.word,
            startSec: Math.max(cue.startSec, word.startSec),
            endSec: Math.min(cue.endSec, Math.max(word.startSec + 0.05, word.endSec)),
          }))
        : undefined,
    };
  });
  return {
    ...base,
    ass: buildAssSubtitles(wordCues, { ...base, animation }),
  };
}

function watermarkTextRegion(
  position: NonNullable<RemixOptions["watermarkConfig"]>["position"],
  custom?: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  if (custom) return { x: custom.x, y: custom.y, w: 0.26, h: 0.06 };
  switch (position) {
    case "top-left":
      return { x: 0.04, y: 0.04, w: 0.28, h: 0.07 };
    case "top-right":
      return { x: 0.68, y: 0.04, w: 0.28, h: 0.07 };
    case "bottom-left":
      return { x: 0.04, y: 0.89, w: 0.28, h: 0.07 };
    case "custom":
    case "bottom-right":
    default:
      return { x: 0.68, y: 0.89, w: 0.28, h: 0.07 };
  }
}

// ---------------------------------------------------------------------------
// Validate op do AI trả về
// ---------------------------------------------------------------------------

/** Giữ lại op hợp lệ, kẹp tham số vào biên an toàn. */
export function sanitizeVideoOps(
  raw: unknown,
  info: VideoInfo | null,
): VideoOp[] {
  if (!Array.isArray(raw)) return [];
  const out: VideoOp[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = rec.op;
    if (typeof name !== "string" || !KNOWN_VIDEO_OPS.has(name as VideoOp["op"])) {
      continue;
    }

    switch (name) {
      case "trim": {
        const start = num(rec.start, 0);
        const duration = num(rec.duration, 0);
        if (duration <= 0) break;
        const maxDur = info ? Math.max(0.5, info.durationSec - start) : duration;
        out.push({
          op: "trim",
          start: Math.max(0, start),
          duration: Math.min(duration, maxDur),
        });
        break;
      }
      case "reframe": {
        const width = clampInt(num(rec.width, VERTICAL.width), 64, 4096);
        const height = clampInt(num(rec.height, VERTICAL.height), 64, 4096);
        const mode = rec.mode === "crop" ? "crop" : "pad";
        out.push({ op: "reframe", width, height, mode });
        break;
      }
      case "colorGrade": {
        out.push({
          op: "colorGrade",
          brightness: num(rec.brightness, 0),
          contrast: num(rec.contrast, 1),
          saturation: num(rec.saturation, 1),
        });
        break;
      }
      case "encode": {
        out.push({
          op: "encode",
          fps: clampInt(num(rec.fps, 30), 15, 60),
          crf: clampInt(num(rec.crf, 23), 18, 32),
        });
        break;
      }
      // subtitles/overlayLogo/replaceAudio/mute do option cứng + worker quyết
      // định (cần file thật), nên bỏ qua nếu AI tự đề xuất.
      default:
        break;
    }
  }

  return out;
}

function num(v: unknown, dflt: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.round(Math.min(hi, Math.max(lo, n)));
}

function clampNumber(n: number | undefined, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n as number));
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function normalizeHashtags(v: unknown): string[] {
  return toStringArray(v)
    .map((h) => h.replace(/^#+/, "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

/** Diễn giải kế hoạch bằng tiếng Việt khi AI không trả summary. */
function describePlan(ops: VideoOp[], o: RemixOptions): string {
  const parts: string[] = [];
  if (ops.some((x) => x.op === "trim")) parts.push("cắt ngắn");
  if (o.vertical) parts.push("chuyển khung dọc 9:16");
  if (o.vietsub) parts.push("burn-in phụ đề tiếng Việt");
  if (o.dubMode === 'full' || o.dubMode === 'preserve_bgm' || o.dubVi) {
    const dubLabel = o.dubMode === 'preserve_bgm'
      ? `lồng tiếng ${o.targetLanguage === 'en' ? 'tiếng Anh' : 'tiếng Việt'} (giữ nhạc nền)`
      : `lồng tiếng ${o.targetLanguage === 'en' ? 'tiếng Anh' : 'tiếng Việt'}`;
    parts.push(dubLabel);
  }
  if (o.brandLogo) parts.push("chèn logo");
  if (o.colorGrade) parts.push("chỉnh màu");
  if (o.muteOriginal) parts.push("bỏ audio gốc");
  return parts.length ? `Kế hoạch: ${parts.join(", ")}.` : "Chuẩn hoá lại video.";
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPlanPrompt(input: PlanRemixInput): string {
  const o = input.options;
  const info = input.videoInfo;

  const optionLines = [
    o.vertical && '- vertical: chuyển sang khung dọc 9:16',
    o.outputRatio && o.outputRatio !== '9:16' && o.outputRatio !== 'original' && `- outputRatio: chuyển sang tỉ lệ ${o.outputRatio}`,
    o.vietsub && `- vietsub: burn-in phụ đề ${o.targetLanguage === 'en' ? 'tiếng Anh' : 'tiếng Việt'}`,
    (o.dubMode === 'full' || o.dubMode === 'preserve_bgm' || o.dubVi) && `- dubbing: lồng giọng ${o.targetLanguage === 'en' ? 'tiếng Anh' : 'tiếng Việt'}${o.dubMode === 'preserve_bgm' ? ' (giữ nhạc nền)' : ''}`,
    o.trimSeconds && `- trim: cắt còn ~${o.trimSeconds}s`,
    o.brandLogo && '- brandLogo: chèn logo thương hiệu',
    o.colorGrade && '- colorGrade: chỉnh màu nhẹ',
    o.muteOriginal && '- muteOriginal: bỏ audio gốc',
    (o.translateOnScreenText || o.textOverlay) && `- translateOnScreenText: phát hiện chữ trong frame gốc, review tone/mood, rồi dịch tự nhiên sang ${o.targetLanguage === 'en' ? 'tiếng Anh' : 'tiếng Việt'}`,
    o.blurOriginalSub && '- blurOriginalSub: làm mờ vùng phụ đề gốc',
    (o.subtitleConfig?.position === 'auto' || o.subPosition === 'auto') && '- subPosition=auto: đặt phụ đề trong vùng blur phụ đề gốc',
  ]
    .filter(Boolean)
    .join('\n');

  const isImage = info && info.durationSec === 0;
  const infoBlock = info
    ? isImage
      ? `Ảnh nguồn: ${info.width}x${info.height}.`
      : `Video nguồn: ${info.width}x${info.height}, ${info.durationSec.toFixed(1)}s, ${info.fps}fps, ${info.hasAudio ? 'có' : 'không có'} audio.`
    : 'Không có video nguồn (đầu ra là ảnh hoặc chỉ caption).';

  // Nếu đã có scriptVi thật từ ASR, thông báo cho AI biết
  const scriptNote = input.realScriptVi
    ? `\n## Nội dung thoại ĐÃ ĐƯỢC phiên âm + dịch sang tiếng Việt\n${input.realScriptVi}\n(Dùng nội dung này làm scriptVi — KHÔNG bịa thêm)`
    : '';


  const revisionBlock = input.feedback
    ? [
        "\n## Đây là vòng SỬA LẠI",
        `Kế hoạch trước: ${input.previousPlan?.summary ?? "(không rõ)"}`,
        `Phản hồi của người dùng cần đáp ứng: "${input.feedback}"`,
        "Chỉ thay đổi những gì phản hồi yêu cầu; giữ nguyên phần còn lại.",
      ].join("\n")
    : "";

  const inspirationBlock = input.inspiration
    ? [
        "\n## Công thức tham khảo (từ một bài hiệu quả)",
        input.inspiration,
        "Hãy áp dụng CÔNG THỨC (hook, cấu trúc, nhịp) vào nội dung của chúng tôi.",
        "TUYỆT ĐỐI không sao chép nguyên văn câu chữ của bài gốc.",
      ].join("\n")
    : "";

  return [
    'Bạn là chuyên gia biên tập video social media cho thương hiệu thể thao Việt Nam.',
    'Nhiệm vụ: lập kế hoạch biên tập cho một video/ảnh mà KHÁCH HÀNG SỞ HỮU.',
    '',
    `## Đầu ra mong muốn: ${input.outputKind}`,
    infoBlock,
    input.prompt ? `\n## Mô tả chỉnh sửa (Video/Ảnh)\n${input.prompt}` : '',
    scriptNote,
    (o.captionPrompt || o.captionTone) ? '\n## Hướng dẫn viết Caption' : '',
    o.captionPrompt ? `- Nội dung cần viết: ${o.captionPrompt}` : '',
    o.captionTone ? `- Tone & Voice: ${o.captionTone}` : '',
    optionLines ? `\n## Option đã bật\n${optionLines}` : '',
    inspirationBlock,
    revisionBlock,
    '\n## Định dạng trả về',
    'Chỉ trả về JSON hợp lệ, không giải thích thêm:',
    '{',
    '  "summary": "một câu tiếng Việt mô tả kế hoạch",',
    '  "videoOps": [{"op":"trim","start":0,"duration":30}],',
    input.realScriptVi
      ? '  "scriptVi": "(copy y chang nội dung thoại đã được phiên âm ở trên — KHÔNG thay đổi)",'
      : '  "scriptVi": "nội dung thoại/phụ đề tiếng Việt nếu bật vietsub hoặc dubVi",',
    '  "caption": "caption đề xuất cho bài đăng",',
    '  "hashtags": ["thethao","sanbong"],',
    '  "warnings": ["điều cần người kiểm tra lại"]',
    '}',
    '',
    'Quy tắc:',
    '- videoOps chỉ dùng các op: trim, reframe, colorGrade, encode.',
    '  (subtitles/overlayLogo/replaceAudio do hệ thống tự thêm — đừng đưa vào.)',
    input.realScriptVi
      ? '- scriptVi: PHẢI copy y chang nội dung thoại đã phiên âm — không được sáng tác thêm.'
      : `- scriptVi: viết nội dung thoại/phụ đề bằng ${o.targetLanguage === 'en' ? 'TIẾNG ANH' : 'TIẾNG VIỆT'} tự nhiên, ngắn gọn, phù hợp thời lượng.`,
    '- hashtags: không kèm dấu #.',
    '- Nếu thiếu thông tin để làm đúng, ghi vào warnings thay vì đoán bừa.',
  ]
    .filter(Boolean)
    .join('\n');
}
