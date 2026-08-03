import { getAIProvider } from "@/lib/ai";
import type { VideoInfo } from "./video-ops";
import { scriptToCues, buildSrt } from "./video-ops";
import {
  KNOWN_VIDEO_OPS,
  type RemixOptions,
  type RemixOutputKind,
  type RemixPlan,
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

interface RawPlan {
  summary?: string;
  videoOps?: unknown;
  scriptVi?: string;
  caption?: string;
  hashtags?: unknown;
  warnings?: unknown;
}

export interface PlanRemixInput {
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
  const scriptVi = input.realScriptVi?.trim()
    || (typeof raw?.scriptVi === 'string' ? raw.scriptVi.trim() : '');

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
      warnings,
    });
  }

  return {
    summary:
      typeof raw?.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : describePlan(videoOps, input.options),
    videoOps,
    scriptVi: scriptVi || undefined,
    caption: typeof raw?.caption === 'string' ? raw.caption.trim() : undefined,
    hashtags: normalizeHashtags(raw?.hashtags),
    warnings,
  };
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
  warnings: string[];
}

/**
 * Đảm bảo mỗi checkbox người dùng bật đều có op tương ứng, và loại các op mâu
 * thuẫn. Đây là lớp "luật" đứng trên đề xuất của AI.
 */
function applyHardOptions(input: HardOptionsInput): VideoOp[] {
  const { options: o, info, scriptVi, hasLogo, warnings } = input;
  // Bỏ các op mà option cứng sẽ tự quyết định, tránh trùng lặp.
  // Kiểu phải là VideoOp[] (không để TS thu hẹp theo kết quả filter) vì bên
  // dưới ta còn push thêm trim/reframe/subtitles/overlayLogo/mute.
  const ops: VideoOp[] = input.ops.filter(
    (op) =>
      op.op !== "reframe" &&
      op.op !== "subtitles" &&
      op.op !== "mute" &&
      op.op !== "overlayLogo" &&
      op.op !== "overlayText" &&
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

  // --- Text Overlay ---
  if (o.textOverlay && o.textOverlay.trim()) {
    ops.push({ op: "overlayText", text: o.textOverlay.trim() });
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
        let isCropped = false;
        
        const reframeOp = ops.find((op) => op.op === "reframe") as Extract<VideoOp, { op: "reframe" }> | undefined;
        if (reframeOp) {
          targetHeight = reframeOp.height;
          if (reframeOp.mode === 'crop') isCropped = true;
        }

        let marginV = 60;
        let alignment = 2; // ASS bottom-center

        if (pos === 'top') {
          alignment = 8; // ASS top-center
          marginV = 40;
        } else if (pos === 'auto') {
          if (o.blurOriginalSub) {
            // Có phụ đề gốc (bật làm mờ): đặt sub mới đè chính xác lên vùng blur
            const blurY = o.blurRegion?.y ?? 0.82;
            const blurH = o.blurRegion?.h ?? 0.18;
            // Tâm của vùng blur tính từ dưới lên: 1.0 - (blurY + blurH / 2)
            const centerFromBottom = 1.0 - (blurY + blurH / 2);
            marginV = Math.round(targetHeight * centerFromBottom);
            alignment = 2;
          } else {
            // Không làm mờ phụ đề gốc: chèn ở vị trí dưới cùng tiêu chuẩn
            marginV = 60;
            alignment = 2;
          }
        }

        ops.push({
          op: "subtitles",
          srt: buildSrt(cues),
          fontSize: o.subtitleConfig?.size ?? o.subFontSize ?? 20,
          primaryColor: o.subtitleConfig?.color ?? o.subColor,
          outlineColor: o.subtitleConfig?.outline ? o.subBgColor : undefined,
          borderStyle: o.subtitleConfig?.borderStyle ?? o.subBorderStyle,
          bold: o.subtitleConfig?.bold ?? o.subBold,
          italic: o.subtitleConfig?.italic ?? o.subItalic,
          outline: o.subtitleConfig?.outline ?? o.subOutline,
          marginV,
          alignment,
        });
      }
    } else {
      warnings.push(
        "Bật Vietsub nhưng chưa có nội dung thoại để dịch. Hãy mô tả nội dung video trong prompt, hoặc tự nhập script.",
      );
    }
  }

  // --- Logo thương hiệu ---
  if (o.brandLogo) {
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
    o.blurOriginalSub && '- blurOriginalSub: làm mờ vùng phụ đề gốc',
    (o.subtitleConfig?.position === 'auto' || o.subPosition === 'auto') && '- subPosition=auto: đặt phụ đề ngay trên vùng phụ đề gốc',
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
