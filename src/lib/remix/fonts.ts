export interface FontOption {
  value: string;
  label: string;
  filename: string;
}

/**
 * Danh sách font hỗ trợ 100% tiếng Việt (đã nhúng file TTF trong public/fonts/):
 * - Anton: Font chữ dày, in hoa, phong cách Meme / Impact nổi bật.
 * - Be Vietnam Pro: Font tiêu chuẩn quốc gia cho tiếng Việt, thanh thoát, rõ ràng.
 * - Montserrat: Font hình học hiện đại, dễ đọc trên Reels / Shorts / TikTok.
 * - Oswald: Font condensed cao thon gọn, tiết kiệm diện tích bề ngang.
 * - Nunito: Font bo tròn mềm mại, thân thiện.
 * - Baloo 2: Font phong cách hoạt hình, sticker, năng động.
 * - Inter: Font sans-serif trung tính, tối giản.
 */
export const VIETNAMESE_FONTS: FontOption[] = [
  { value: "Anton", label: "Anton (Meme / Impact - Việt hoá)", filename: "Anton-Regular.ttf" },
  { value: "Be Vietnam Pro", label: "Be Vietnam Pro (Tiêu chuẩn - Việt hoá)", filename: "BeVietnamPro-Bold.ttf" },
  { value: "Montserrat", label: "Montserrat (Hiện đại - Việt hoá)", filename: "Montserrat-Bold.ttf" },
  { value: "Oswald", label: "Oswald (Condensed - Việt hoá)", filename: "Oswald-Bold.ttf" },
  { value: "Nunito", label: "Nunito (Bo tròn - Việt hoá)", filename: "Nunito-Bold.ttf" },
  { value: "Baloo 2", label: "Baloo 2 (Sticker / Vui nhộn - Việt hoá)", filename: "Baloo2-Bold.ttf" },
  { value: "Inter", label: "Inter (Tối giản - Việt hoá)", filename: "Inter-Regular.ttf" },
];

export const VIETNAMESE_FONT_NAMES = VIETNAMESE_FONTS.map((f) => f.value);

export const DEFAULT_VIETNAMESE_SUBTITLE_FONT = "Montserrat";
export const DEFAULT_VIETNAMESE_ONSCREEN_FONT = "Anton";
