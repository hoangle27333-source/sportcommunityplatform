/**
 * Content Remix — kiểu dữ liệu & từ vựng op (SPEC §7, mở rộng cho flow remix).
 *
 * Ranh giới tuân thủ (SPEC §0): pipeline này chỉ chạy trên media NGƯỜI DÙNG SỞ HỮU
 * (upload, hoặc link của chính họ đã xác nhận quyền). Link bên thứ ba chỉ dùng ở
 * chế độ `inspiration` — phân tích ý tưởng, KHÔNG tải file gốc.
 *
 * Mọi op đều là biến đổi xác định (ffmpeg/sharp). AI chỉ dịch mô tả tự nhiên
 * thành danh sách op; không op nào nằm ngoài whitelist dưới đây được chạy.
 */

export type RemixSourceType = "upload" | "own_link" | "inspiration";
export type RemixOutputKind = "video" | "image" | "caption";
export type RemixStatus =
  | "queued"
  | "analyzing"
  | "processing"
  | "review"
  | "revising"
  | "approved"
  | "failed";

/**
 * Option "cứng" bật/tắt từ UI. Đây là các tác vụ hay dùng nhất nên được đưa
 * thành checkbox thay vì bắt người dùng diễn tả bằng lời.
 */
/**
 * Chế độ lồng tiếng:
 * - 'none'         : Giữ nguyên âm thanh gốc, không lồng tiếng.
 * - 'full'         : Lồng tiếng AI, thay toàn bộ audio bằng giọng đọc TTS.
 * - 'preserve_bgm' : Lồng tiếng AI nhưng GIỮ nhạc nền — tách voice khỏi bgm,
 *                    thay giọng voice bằng TTS, mix lại với bgm gốc.
 * - 'heygen'       : Dùng HeyGen Video Translate API để dịch giọng nói + lip-sync.
 *                    Flow 2 giai đoạn (gửi job → webhook callback) thay cho TTS nội bộ.
 *                    Text-on-Screen vẫn được xử lý theo flow OCR cũ (blur + overlayText).
 *                    Phụ đề lấy từ SRT do HeyGen trả về (fallback sang ASR nếu thiếu).
 */
export type DubMode = 'none' | 'full' | 'preserve_bgm' | 'heygen';
export type ScriptInputMode = "from_video_audio" | "manual_script";
export type SubtitleAnimation = "static" | "word_highlight" | "reveal_words";
export type SubtitlePosition = "top" | "bottom" | "auto" | "custom";
export type SubtitlePreset =
  | "tiktok_bold"
  | "meme"
  | "pop"
  | "bubble"
  | "neon"
  | "clean";

export interface NormalizedRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  startSec?: number;
  endSec?: number;
}

export interface WatermarkConfig {
  enabled?: boolean;
  type?: "image" | "text";
  imageMediaId?: string;
  text?: string;
  opacity?: number;
  scale?: number;
  removeBackground?: boolean;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom";
  customPosition?: { x: number; y: number };
  perRatioPosition?: Partial<
    Record<"9:16" | "16:9" | "1:1" | "4:5" | "original", { x: number; y: number }>
  >;
  perRatioScale?: Partial<Record<"9:16" | "16:9" | "1:1" | "4:5" | "original", number>>;
  coverOriginal?: boolean;
  oldWatermarkRegions?: NormalizedRegion[];
}

export interface CopyrightPreflightItem {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}

export interface CopyrightPreflightResult {
  riskLevel: "low" | "medium" | "high";
  items: CopyrightPreflightItem[];
  warnings: string[];
  acknowledgements?: Record<string, boolean>;
}

export interface RemixOptions {
  /** Production pipeline mode inspired by OpenMontage-style staged workflows. */
  pipelineMode?: "simple" | "localization_dub" | "clip_factory" | "hybrid";
  /** Clip Factory: số clip ngắn muốn đề xuất từ một video dài. */
  clipCount?: number;
  /** Clip Factory: thời lượng mục tiêu cho mỗi clip. */
  clipDurationSec?: number;
  /** Từ/cụm từ không được dịch hoặc sửa khi localization/dubbing. */
  protectedTerms?: string[];
  /** Burn-in phụ đề tiếng Việt (dịch từ audio gốc nếu có). */
  vietsub?: boolean;
  /**
   * Chế độ lồng tiếng. Ghi đè dubVi (deprecated).
   * - 'none'         : Giữ audio gốc.
   * - 'full'         : Thay toàn bộ audio bằng TTS.
   * - 'preserve_bgm' : Tách voice/bgm → lồng TTS voice + giữ nhạc nền gốc.
   * Default: 'none'
   */
  dubMode?: DubMode;
  /** @deprecated Dùng dubMode thay thế. Giữ lại để backward-compat với jobs cũ. */
  dubVi?: boolean;
  /** Tên giọng TTS để lồng tiếng (vd: vi-VN-WaveNet-A). Default: vi-VN-WaveNet-A */
  voiceName?: string;
  /** Nguồn script cho phụ đề/TTS: lấy từ audio video hoặc user nhập trực tiếp. */
  scriptInputMode?: ScriptInputMode;
  /** Script user nhập trực tiếp khi scriptInputMode='manual_script'. */
  manualScript?: string;
  /**
   * Ngôn ngữ đích cho HeyGen Video Translate (ISO-639-1 tên đầy đủ theo HeyGen API).
   * Ví dụ: 'Vietnamese', 'English'. Mặc định lấy từ targetLanguage nếu không truyền.
   * Chỉ dùng khi dubMode='heygen'.
   */
  heygenTargetLanguage?: string;
  /**
   * Volume nhạc nền khi dùng dubMode='preserve_bgm' (0–1).
   * Giảm bgm để giọng TTS vẫn nghe rõ. Default: 0.3
   */
  bgVolume?: number;
  /**
   * Âm lượng giọng lồng tiếng TTS (0.5–3.0).
   * 1.0 = bình thường, >1.0 = to hơn, <1.0 = nhỏ hơn. Default: 2.0
   */
  voiceVolume?: number;
  /** Blur vùng subtitle gốc (bottom 18% frame) trước khi burn sub mới. Default: true khi vietsub=true */
  blurOriginalSub?: boolean;
  /** Chèn intro clip trước video. */
  introEnabled?: boolean;
  introMediaId?: string;
  /** Chèn outro clip sau video. */
  outroEnabled?: boolean;
  outroMediaId?: string;
  /** Output aspect ratio. Default: '9:16' when vertical=true */
  outputRatio?: '9:16' | '16:9' | '1:1' | '4:5' | 'original';
  /** Chuyển sang khung dọc 9:16 (Reels/TikTok/Shorts). */
  vertical?: boolean;
  /** Cắt còn N giây đầu (hoặc theo start/end nếu có). */
  trimSeconds?: number;
  trimStart?: number;
  /** Chèn logo của mình (watermark) — góc + asset. */
  brandLogo?: boolean;
  logoMediaId?: string;
  logoPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Watermark mới đầy đủ: ảnh/text, opacity, scale, vị trí và vùng che watermark cũ. */
  watermarkConfig?: WatermarkConfig;
  /** Chỉnh màu nhẹ cho nhất quán thương hiệu. */
  colorGrade?: boolean;
  /** Bỏ audio gốc (làm nền nhạc riêng / video im lặng có sub). */
  muteOriginal?: boolean;
  /** Hướng dẫn nội dung cho caption (tách riêng khỏi prompt xử lý media). */
  captionPrompt?: string;
  /** Tone giọng của caption (vd: Chuyên nghiệp, Gần gũi...). */
  captionTone?: string;
  /** Xử lý dịch văn bản trên ảnh (đè chữ hoặc tạo ảnh mới). */
  imageTranslate?: "overlay" | "regenerate";
  /** Dịch chữ đang burn-in/on-screen trong video gốc sang targetLanguage. */
  translateOnScreenText?: boolean;
  /** Style riêng cho bản dịch text on-screen gốc. */
  onScreenTextStyle?: {
    preset?: "meme" | "pop" | "bubble" | "neon" | "clean";
    font?: string;
    size?: number;
    sizeMode?: "auto_fit" | "fixed";
    color?: string;
    bgColor?: string;
    outlineColor?: string;
    bold?: boolean;
  };
  /**
   * @deprecated Trước đây là text chèn trực tiếp. Nay chỉ dùng như hint/ngữ cảnh
   * cho bước dịch chữ on-screen; hệ thống không render literal field này nữa.
   */
  textOverlay?: string;
  // --- Subtitle style settings (từ SubtitleConfig UI) ---
  /** Font phụ đề. Default: Arial */
  subFont?: string;
  /** Cỡ chữ phụ đề (px). Default: 20 */
  subFontSize?: number;
  /** Màu chữ (hex). Default: #FFFFFF */
  subColor?: string;
  /** Màu nền/viền (hex). Default: #000000 */
  subBgColor?: string;
  /** In đậm. */
  subBold?: boolean;
  /** In nghiêng. */
  subItalic?: boolean;
  /** Độ dày outline (0-5). Default: 2 */
  subOutline?: number;
  /** Border style (0=none, 1=outline, 3=opaque box). Default: 1 */
  subBorderStyle?: number;
  /** Vị trí phụ đề. 
   * - 'top' | 'bottom': vị trí cố định
   * - 'auto': AI tự phát hiện vùng phụ đề gốc và chèn trong vùng blur. Default: bottom
   */
  subPosition?: SubtitlePosition;
  /** Top edge của subtitle block, normalized theo chiều cao output. Dùng khi subPosition='custom'. */
  subCustomY?: number;
  // --- Regenerate-only mode (dùng editedScript, bỏ qua ASR) ---
  regenerateOnly?: boolean;
  editedScript?: string;
  /**
   * Script AI tạo ra sau lần generate đầu (từ ASR hoặc manualScript).
   * Được lưu lại để video editor có thể hiển thị và cho user chỉnh sửa.
   */
  generatedScript?: string;
  /** Các text overlay đã được AI thêm vào video (translateOnScreenText + overlayText ops). */
  textOnScreenOverlays?: Array<{
    id: string;
    start: number;
    end: number;
    text: string;
    position: { x: number; y: number };
    fontFamily: string;
    fontSize: number;
    fontColor: string;
    bgColor: string;
    animation: 'none' | 'fade_in' | 'fade_out' | 'slide_up' | 'slide_down' | 'scale_in';
  }>;
  /** Ngôn ngữ đầu ra cho dịch phụ đề và lồng tiếng.
   * - 'vi': Tiếng Việt (mặc định)
   * - 'en': Tiếng Anh
   */
  targetLanguage?: 'vi' | 'en';
  /** Vùng blur phụ đề gốc (normalized 0–1). Dùng để tính toán vị trí subPosition='auto'. */
  blurRegion?: { x: number; y: number; w: number; h: number };
  /**
   * Dùng Gemini Vision để tự động phát hiện vùng phụ đề gốc trong video.
   * - Nếu phát hiện thành công: làm mờ đúng vùng đó và đặt phụ đề mới trong vùng blur.
   * - Nếu không phát hiện (video sạch, confidence thấp): bỏ qua bước làm mờ.
   * - Ưu tiên thấp hơn blurRegion thủ công: nếu user đã set blurRegion thì dùng luôn.
   */
  autoDetectSubtitleRegion?: boolean;
  /** Cấu hình phụ đề dạng object (từ SubtitleConfig UI). Ghi đè các sub* fields riêng lẻ. */
  subtitleConfig?: {
    preset?: SubtitlePreset;
    font?: string;
    size?: number;
    color?: string;
    bgColor?: string;
    highlightColor?: string;
    bold?: boolean;
    italic?: boolean;
    outline?: number;
    borderStyle?: number;
    position?: SubtitlePosition;
    customY?: number;
    animation?: SubtitleAnimation;
  };
  subtitleAnimation?: SubtitleAnimation;
  subtitlePreset?: SubtitlePreset;
  subHighlightColor?: string;
  /** Advisory checklist result/acknowledgements before approve/export/publish. */
  copyrightPreflight?: CopyrightPreflightResult;
  /** CRF encode đầu ra (15–32). Default: 18 */
  outputCrf?: number;
}

// ---------------------------------------------------------------------------
// Op vocabulary — video (ffmpeg) và image (sharp)
// ---------------------------------------------------------------------------

export type VideoOp =
  /** Cắt đoạn: start (giây) + duration (giây). */
  | { op: "trim"; start: number; duration: number }
  /** Đổi khung: scale + pad về đúng w×h, giữ tỉ lệ gốc. */
  | { op: "reframe"; width: number; height: number; mode: "pad" | "crop" }
  /** Burn-in phụ đề từ file .srt đã sinh. */
  | { op: "subtitles"; srt: string; ass?: string; fontSize?: number; primaryColor?: string; outlineColor?: string; highlightColor?: string; borderStyle?: number; bold?: boolean; italic?: boolean; outline?: number; marginV?: number; alignment?: number; font?: string }
  /** Thay toàn bộ audio bằng track đã sinh (TTS/nhạc). */
  | { op: "replaceAudio"; audioPath: string }
  /** Bỏ audio. */
  | { op: "mute" }
  /** Chèn ảnh logo (của mình) làm watermark. */
  | { op: "overlayLogo"; logoPath: string; position: NonNullable<RemixOptions["logoPosition"]> | "custom"; scale?: number; opacity?: number; x?: number; y?: number }
  /** Chèn text đơn giản lên video. */
  | {
      op: "overlayText";
      text: string;
      startSec?: number;
      endSec?: number;
      position?: "top" | "center" | "bottom";
      region?: { x: number; y: number; w: number; h: number };
      fitToRegion?: boolean;
      sizeMode?: "auto_fit" | "fixed";
      coverRegion?: boolean;
      minFontSize?: number;
      maxFontSize?: number;
      font?: string;
      fontSize?: number;
      color?: string;
      bgColor?: string;
      outlineColor?: string;
      boxOpacity?: number;
      bold?: boolean;
    }
  /** Chỉnh màu: brightness/contrast/saturation nhẹ. */
  | { op: "colorGrade"; brightness?: number; contrast?: number; saturation?: number }
  /** Chuẩn hoá fps + codec đầu ra. */
  | { op: "encode"; fps?: number; crf?: number };

export const KNOWN_VIDEO_OPS = new Set<VideoOp["op"]>([
  "trim",
  "reframe",
  "subtitles",
  "replaceAudio",
  "mute",
  "overlayLogo",
  "overlayText",
  "colorGrade",
  "encode",
]);

/**
 * Kế hoạch remix do AI lập, sau khi đã validate. Lưu vào remix_jobs.plan để
 * người dùng (và audit) thấy chính xác điều gì đã biến đổi nội dung.
 */
export interface RemixPlan {
  /** Diễn giải ngắn bằng tiếng Việt để hiện cho người dùng. */
  summary: string;
  /** Phân tích nguồn/tham khảo có cấu trúc để UI hiển thị "công thức video". */
  analysisBrief?: RemixAnalysisBrief;
  /** Kế hoạch cảnh/đoạn trước khi dịch thành ffmpeg ops. */
  scenePlan?: RemixScenePlan;
  /** Quyết định edit có thể audit trước/sau render. */
  editDecisions?: RemixEditDecisions;
  /** QA sau render dựa trên file thật. */
  finalReview?: RemixFinalReview;
  /** Ước tính chi phí/đổi chác trước khi chạy bước nặng. */
  costEstimate?: RemixCostEstimate;
  /** Advisory checklist trước khi approve/export/publish lên Facebook. */
  copyrightPreflight?: CopyrightPreflightResult;
  /** Op cho video (rỗng nếu output là image/caption). */
  videoOps: VideoOp[];
  /** Bản dịch/phụ đề tiếng Việt nếu cần (dùng cho vietsub + dubVi). */
  scriptVi?: string;
  /** Caption + hashtag đề xuất kèm theo. */
  caption?: string;
  hashtags?: string[];
  /** Điều AI không làm được / cần người xử lý tay. */
  warnings: string[];
}

export interface RemixAnalysisBrief {
  version: "1.0";
  source: {
    type: RemixSourceType;
    durationSec?: number;
    resolution?: string;
    hasAudio?: boolean;
  };
  content: {
    summary: string;
    hook?: string;
    tone?: string;
    topics: string[];
  };
  structure: {
    sceneCount: number;
    pacingStyle: "short_social" | "steady" | "long_form" | "unknown";
    avgSceneDurationSec?: number;
  };
  style: {
    subtitleStyle?: string;
    outputRatio?: RemixOptions["outputRatio"];
    productionQuality: "draft" | "presentable";
  };
  replicationGuidance: {
    suggestedPipeline: NonNullable<RemixOptions["pipelineMode"]>;
    keyElements: string[];
    risks: string[];
  };
}

export interface RemixScenePlan {
  version: "1.0";
  scenes: Array<{
    id: string;
    type: "source" | "clip" | "overlay" | "text_card" | "intro" | "outro";
    startSec: number;
    endSec: number;
    role: "hook" | "context" | "payload" | "cta" | "support" | "transition";
    visualType: "talking_head" | "b_roll" | "screen_recording" | "text_overlay" | "mixed" | "unknown";
    reason: string;
    score?: number;
  }>;
}

export interface RemixEditDecisions {
  version: "1.0";
  renderRuntime: "ffmpeg";
  cuts: Array<{
    id: string;
    source: "source";
    inSec: number;
    outSec: number;
    reason: string;
  }>;
  overlays: Array<{
    id?: string;
    kind: "subtitles" | "logo" | "text" | "blur";
    startSec: number;
    endSec: number;
    reason: string;
    sourceText?: string;
    translatedText?: string;
    region?: { x: number; y: number; w: number; h: number };
    confidence?: number;
  }>;
  audio: {
    mode: "original" | "muted" | "tts_replace" | "tts_preserve_bgm" | "heygen_translate";
    voiceName?: string;
    cues?: Array<{
      id?: string;
      startSec: number;
      endSec: number;
      sourceText?: string;
      translatedText?: string;
      confidence?: number;
      words?: AlignedVoiceWord[];
    }>;
  };
  subtitles: {
    enabled: boolean;
    position?: SubtitlePosition;
  };
}

export interface AlignedVoiceWord {
  word: string;
  startSec: number;
  endSec: number;
  confidence?: number;
}

export interface AlignedVoiceCue {
  startSec: number;
  endSec: number;
  sourceText: string;
  translatedText?: string;
  confidence?: number;
  words?: AlignedVoiceWord[];
}

export interface RemixFinalReview {
  version: "1.0";
  outputPath?: string;
  status: "pass" | "revise" | "fail";
  checks: {
    technicalProbe: {
      validContainer: boolean;
      durationSec?: number;
      resolution?: string;
      fps?: number;
      hasAudio?: boolean;
      codec?: string;
      fileSizeBytes?: number;
      issues: string[];
    };
    visualSpotcheck: {
      expectedResolution?: string;
      resolutionMatches: boolean;
      issues: string[];
    };
    audioSpotcheck: {
      audioExpected: boolean;
      audioPresent: boolean;
      issues: string[];
    };
    subtitleCheck: {
      subtitlesExpected: boolean;
      subtitlesPlanned: boolean;
      issues: string[];
    };
  };
  issuesFound: string[];
  recommendedAction: "present_to_user" | "review_warning" | "block";
}

export interface RemixCostEstimate {
  provider: string;
  estimatedVnd?: number;
  estimatedUsd?: number;
  notes: string[];
}

/** Kết quả một vòng chạy. */
export interface RemixRunResult {
  plan: RemixPlan;
  resultMediaId?: string;
  resultUrl?: string;
  caption?: string;
  hashtags: string[];
  warnings: string[];
}
