export type ImageEditorTemplate = Record<string, unknown>;

const STRIP_KEYS = new Set([
  "imgSrc",
  "shownImageDimensions",
  "presentOriginalSources",
  "loadingData",
  "haveNotSavedChanges",
  "pastDesignStates",
  "futureDesignStates",
  "isSaving",
  "isResetted",
  "feedback",
  "selectedTextPart",
  "extra",
]);

export function sanitizeImageEditorTemplate(
  value: unknown,
): ImageEditorTemplate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(raw)) {
    if (STRIP_KEYS.has(key)) continue;
    next[key] = deepCloneSansSource(entry);
  }

  if (!Object.keys(next).length) return undefined;
  return next;
}

function deepCloneSansSource(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepCloneSansSource);
  if (!value || typeof value !== "object") return value;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(input)) {
    if (
      key === "src" ||
      key === "imageBase64" ||
      key === "originalSource" ||
      key === "imageCanvas" ||
      key === "fullName" ||
      key === "mimeType" ||
      key === "width" ||
      key === "height"
    ) {
      continue;
    }
    output[key] = deepCloneSansSource(entry);
  }
  return output;
}
