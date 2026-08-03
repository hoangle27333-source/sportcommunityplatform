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
 */
export type DubMode = 'none' | 'full' | 'preserve_bgm';

export interface RemixOptions {
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
  /**
   * Volume nhạc nền khi dùng dubMode='preserve_bgm' (0–1).
   * Giảm bgm để giọng TTS vẫn nghe rõ. Default: 0.3
   */
  bgVolume?: number;
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
  /** Đoạn text sẽ chèn lên video */
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
   * - 'auto': AI tự phát hiện vùng phụ đề gốc và chèn ngay bên trên. Default: bottom
   */
  subPosition?: "top" | "bottom" | "auto";
  // --- Regenerate-only mode (dùng editedScript, bỏ qua ASR) ---
  regenerateOnly?: boolean;
  editedScript?: string;
  /** Ngôn ngữ đầu ra cho dịch phụ đề và lồng tiếng.
   * - 'vi': Tiếng Việt (mặc định)
   * - 'en': Tiếng Anh
   */
  targetLanguage?: 'vi' | 'en';
  /** Vùng blur phụ đề gốc (normalized 0–1). Dùng để tính toán vị trí subPosition='auto'. */
  blurRegion?: { x: number; y: number; w: number; h: number };
  /**
   * Dùng Gemini Vision để tự động phát hiện vùng phụ đề gốc trong video.
   * - Nếu phát hiện thành công: làm mờ đúng vùng đó và đặt phụ đề mới lên trên.
   * - Nếu không phát hiện (video sạch, confidence thấp): bỏ qua bước làm mờ.
   * - Ưu tiên thấp hơn blurRegion thủ công: nếu user đã set blurRegion thì dùng luôn.
   */
  autoDetectSubtitleRegion?: boolean;
  /** Cấu hình phụ đề dạng object (từ SubtitleConfig UI). Ghi đè các sub* fields riêng lẻ. */
  subtitleConfig?: {
    font?: string;
    size?: number;
    color?: string;
    bgColor?: string;
    bold?: boolean;
    italic?: boolean;
    outline?: number;
    borderStyle?: number;
    position?: 'top' | 'bottom' | 'auto';
  };
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
  | { op: "subtitles"; srt: string; fontSize?: number; primaryColor?: string; outlineColor?: string; borderStyle?: number; bold?: boolean; italic?: boolean; outline?: number; marginV?: number; alignment?: number }
  /** Thay toàn bộ audio bằng track đã sinh (TTS/nhạc). */
  | { op: "replaceAudio"; audioPath: string }
  /** Bỏ audio. */
  | { op: "mute" }
  /** Chèn ảnh logo (của mình) làm watermark. */
  | { op: "overlayLogo"; logoPath: string; position: NonNullable<RemixOptions["logoPosition"]>; scale?: number }
  /** Chèn text đơn giản lên video. */
  | { op: "overlayText"; text: string }
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

/** Kết quả một vòng chạy. */
export interface RemixRunResult {
  plan: RemixPlan;
  resultMediaId?: string;
  resultUrl?: string;
  caption?: string;
  hashtags: string[];
  warnings: string[];
}
