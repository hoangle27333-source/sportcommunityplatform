import type { RemixOptions, WatermarkConfig } from "./types";
import { sanitizeImageEditorTemplate } from "./image-editor-template";

export type RemixImagePresetRecord = Record<string, any>;

export function buildRemixOptionsFromImagePreset(
  preset: RemixImagePresetRecord | null | undefined,
  overrides: RemixOptions = {},
): RemixOptions {
  if (!preset) return { ...overrides };

  const watermarkConfig =
    preset.watermark_defaults && typeof preset.watermark_defaults === "object"
      ? (preset.watermark_defaults as WatermarkConfig)
      : undefined;

  return {
    outputRatio: coerceOutputRatio(preset.output_ratio),
    vertical: preset.output_ratio === "9:16",
    imageTranslate: coerceImageTranslate(preset.image_translate),
    watermarkConfig,
    brandLogo: Boolean(watermarkConfig?.enabled && watermarkConfig?.type === "image"),
    logoMediaId: watermarkConfig?.imageMediaId,
    logoPosition: watermarkConfig?.position === "custom" ? undefined : watermarkConfig?.position,
    imageEditorTemplate: sanitizeImageEditorTemplate(preset.editor_template),
    ...overrides,
  };
}

function coerceOutputRatio(value: unknown): RemixOptions["outputRatio"] {
  return value === "16:9" || value === "1:1" || value === "4:5" || value === "original"
    ? value
    : "9:16";
}

function coerceImageTranslate(value: unknown): RemixOptions["imageTranslate"] | undefined {
  return value === "overlay" || value === "regenerate" ? value : undefined;
}
