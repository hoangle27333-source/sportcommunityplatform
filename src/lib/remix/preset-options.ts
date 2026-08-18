import type { RemixOptions, WatermarkConfig } from "./types";

export type RemixPresetRecord = Record<string, any>;

export function buildRemixOptionsFromPreset(
  preset: RemixPresetRecord | null | undefined,
  overrides: RemixOptions = {},
): RemixOptions {
  if (!preset) return { ...overrides };

  const watermarkConfig = isNonEmptyObject(preset.watermark_defaults)
    ? (preset.watermark_defaults as WatermarkConfig)
    : undefined;
  const outputRatio = coerceOutputRatio(preset.output_ratio);
  const subCustomY = clampNumber(preset.sub_custom_y, 0.05, 0.9, 0.78);

  // Preset là GIÁ TRỊ MẶC ĐỊNH, overrides là ý chí của người dùng.
  // Dùng helper: nếu override đã set tường minh (kể cả false/null/'none') thì giữ override.
  // Chỉ dùng giá trị preset khi override là undefined.
  const def = <T>(overrideVal: T | undefined, presetVal: T): T =>
    overrideVal !== undefined ? overrideVal : presetVal;

  const presetDefaults: RemixOptions = {
    outputRatio,
    vertical: outputRatio === "9:16",
    targetLanguage: preset.target_language || "vi",
    voiceName: preset.voice_name,
    bgVolume: preset.bg_volume,
    outputCrf: preset.output_crf,
    vietsub: Boolean(preset.auto_vietsub),
    dubVi: Boolean(preset.auto_dub),
    dubMode: preset.dub_mode ?? (preset.auto_dub ? "full" : "none"),
    blurOriginalSub: preset.blur_original_sub,
    blurRegion: preset.blur_region ?? undefined,
    autoDetectSubtitleRegion:
      Boolean(preset.auto_detect_subtitle_region) ||
      Boolean(preset.blur_original_sub && !preset.blur_region),
    subFont: preset.sub_font,
    subFontSize: preset.sub_font_size,
    subColor: preset.sub_color,
    subBgColor: preset.sub_bg_color,
    subBold: preset.sub_bold,
    subItalic: preset.sub_italic,
    subOutline: preset.sub_outline,
    subBorderStyle: preset.sub_border_style,
    subPosition: preset.sub_position,
    subCustomY,
    subtitleConfig: {
      preset: preset.subtitle_preset ?? "tiktok_bold",
      font: preset.sub_font,
      size: preset.sub_font_size,
      color: preset.sub_color,
      bgColor: preset.sub_bg_color,
      highlightColor: preset.sub_highlight_color,
      bold: preset.sub_bold,
      italic: preset.sub_italic,
      outline: preset.sub_outline,
      borderStyle: preset.sub_border_style,
      position: preset.sub_position,
      customY: subCustomY,
      animation: preset.subtitle_animation ?? "word_highlight",
    },
    subtitlePreset: preset.subtitle_preset,
    subtitleAnimation: preset.subtitle_animation,
    subHighlightColor: preset.sub_highlight_color,
    translateOnScreenText: Boolean(preset.translate_on_screen_text),
    onScreenTextStyle: {
      preset: preset.on_screen_text_preset ?? "meme",
      font: preset.on_screen_text_font ?? "Anton",
      size: preset.on_screen_text_size ?? 34,
      sizeMode: preset.on_screen_text_size_mode ?? "auto_fit",
      color: preset.on_screen_text_color ?? "#FFFFFF",
      bgColor: preset.on_screen_text_bg_color ?? "#000000",
      backgroundStyle: preset.on_screen_text_background_style ?? "solid",
      backgroundOpacity: preset.on_screen_text_background_opacity ?? 0.72,
      outlineColor: preset.on_screen_text_outline_color ?? "#000000",
      outlineWidth: preset.on_screen_text_outline_width ?? 2,
      bold: preset.on_screen_text_bold ?? true,
      italic: preset.on_screen_text_italic ?? false,
    },
    introEnabled: preset.intro_enabled,
    introMediaId: preset.intro_media_id ?? undefined,
    outroEnabled: preset.outro_enabled,
    outroMediaId: preset.outro_media_id ?? undefined,
    watermarkConfig,
    brandLogo: Boolean(watermarkConfig?.enabled && watermarkConfig?.type === "image"),
    logoMediaId: watermarkConfig?.imageMediaId,
    logoPosition: watermarkConfig?.position === "custom" ? undefined : watermarkConfig?.position,
  };

  // Merge: overrides tường minh luôn thắng preset (kể cả false/'none').
  // Những trường boolean quan trọng: nếu override đã set (kể cả = false) thì dùng override.
  return {
    ...presetDefaults,
    ...overrides,
    // Đảm bảo các trường boolean không bị undefined → dùng def() để lấy preset khi chưa set
    vietsub: def(overrides.vietsub, presetDefaults.vietsub),
    dubVi: def(overrides.dubVi, presetDefaults.dubVi),
    dubMode: def(overrides.dubMode, presetDefaults.dubMode),
    translateOnScreenText: def(overrides.translateOnScreenText, presetDefaults.translateOnScreenText),
    muteOriginal: def(overrides.muteOriginal, presetDefaults.muteOriginal),
    blurOriginalSub: def(overrides.blurOriginalSub, presetDefaults.blurOriginalSub),
    autoDetectSubtitleRegion: def(overrides.autoDetectSubtitleRegion, presetDefaults.autoDetectSubtitleRegion),
  };
}

function isNonEmptyObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function coerceOutputRatio(value: unknown): RemixOptions["outputRatio"] {
  return value === "16:9" || value === "1:1" || value === "4:5" || value === "original"
    ? value
    : "9:16";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}
