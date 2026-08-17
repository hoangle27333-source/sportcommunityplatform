export type CaptionPresetRecord = Record<string, any>;

export interface CaptionPresetManualInput {
  platforms?: string[];
  toneAndVoice?: string;
  audience?: string;
  captionLength?: string;
  hookStyle?: string;
  cta?: string;
  requiredHashtags?: string[];
  optionalHashtags?: string[];
  bannedHashtags?: string[];
  requiredKeywords?: string[];
  bannedKeywords?: string[];
  emojiStyle?: string;
  formatStyle?: string;
  brandRules?: string;
  sampleCaptions?: string;
  extraInstructions?: string;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

export function captionPresetToManualInput(
  preset: CaptionPresetRecord | null | undefined,
): CaptionPresetManualInput {
  if (!preset) return {};
  return {
    platforms: normalizeStringArray(preset.platforms),
    toneAndVoice: stringOrEmpty(preset.tone_and_voice),
    audience: stringOrEmpty(preset.audience),
    captionLength: stringOrEmpty(preset.caption_length),
    hookStyle: stringOrEmpty(preset.hook_style),
    cta: stringOrEmpty(preset.cta),
    requiredHashtags: normalizeStringArray(preset.required_hashtags),
    optionalHashtags: normalizeStringArray(preset.optional_hashtags),
    bannedHashtags: normalizeStringArray(preset.banned_hashtags),
    requiredKeywords: normalizeStringArray(preset.required_keywords),
    bannedKeywords: normalizeStringArray(preset.banned_keywords),
    emojiStyle: stringOrEmpty(preset.emoji_style),
    formatStyle: stringOrEmpty(preset.format_style),
    brandRules: stringOrEmpty(preset.brand_rules),
    sampleCaptions: stringOrEmpty(preset.sample_captions),
    extraInstructions: stringOrEmpty(preset.extra_instructions),
  };
}

export function buildCaptionPromptFromPreset(input: CaptionPresetManualInput): string {
  const lines = [
    listLine("Platform ưu tiên", input.platforms),
    valueLine("Đối tượng mục tiêu", input.audience),
    valueLine("Độ dài caption", input.captionLength),
    valueLine("Kiểu mở đầu", input.hookStyle),
    valueLine("CTA", input.cta),
    listLine("Hashtag bắt buộc", input.requiredHashtags),
    listLine("Hashtag gợi ý", input.optionalHashtags),
    listLine("Hashtag không dùng", input.bannedHashtags),
    listLine("Keyword bắt buộc", input.requiredKeywords),
    listLine("Keyword tránh dùng", input.bannedKeywords),
    valueLine("Phong cách emoji", input.emojiStyle),
    valueLine("Cấu trúc caption", input.formatStyle),
    valueLine("Quy tắc brand voice", input.brandRules),
    valueLine("Ví dụ caption mẫu", input.sampleCaptions),
    valueLine("Ghi chú thêm", input.extraInstructions),
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildCaptionToneFromPreset(input: CaptionPresetManualInput): string {
  const parts = [
    input.toneAndVoice?.trim(),
    input.audience?.trim() ? `hướng tới ${input.audience.trim()}` : "",
    input.platforms?.length ? `ưu tiên ${input.platforms.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join(" | ");
}

function valueLine(label: string, value: string | undefined): string {
  const normalized = value?.trim();
  return normalized ? `- ${label}: ${normalized}` : "";
}

function listLine(label: string, value: string[] | undefined): string {
  const items = (value ?? []).map((item) => item.trim()).filter(Boolean);
  return items.length ? `- ${label}: ${items.join(", ")}` : "";
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}
