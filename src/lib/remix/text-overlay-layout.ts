export interface OverlayRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  startSec?: number;
  endSec?: number;
}

export interface OverlayFrameSize {
  width: number;
  height: number;
}

export interface OverlayReframe {
  width: number;
  height: number;
  mode: "pad" | "crop";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function clampOverlayRegion(region: OverlayRegion): OverlayRegion {
  const x = clamp(region.x, 0, 0.98);
  const y = clamp(region.y, 0, 0.98);
  return {
    ...region,
    x,
    y,
    w: clamp(region.w, 0.001, 1 - x),
    h: clamp(region.h, 0.001, 1 - y),
  };
}

export function normalizeOverlayText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function estimatedTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce((width, character) => {
    if (/\s/.test(character)) return width + fontSize * 0.32;
    if (/[A-Z0-9]/.test(character)) return width + fontSize * 0.63;
    if (/[^\x00-\x7F]/.test(character)) return width + fontSize * 0.6;
    return width + fontSize * 0.54;
  }, 0);
}

function splitLongToken(token: string, maxChars: number): string[] {
  if (token.length <= maxChars) return [token];
  const chunks: string[] = [];
  for (let index = 0; index < token.length; index += maxChars) {
    chunks.push(token.slice(index, index + maxChars));
  }
  return chunks;
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const sourceLines = paragraphs.length ? paragraphs : [text.replace(/\s+/g, " ").trim()];
  const words = sourceLines.flatMap((line, lineIndex) => {
    const lineWords = line.split(" ").filter(Boolean).flatMap((word) => splitLongToken(word, maxCharsPerLine));
    return lineIndex === sourceLines.length - 1 ? lineWords : [...lineWords, "\n"];
  });
  if (!words.length) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word === "\n") {
      if (current) lines.push(current);
      current = "";
      if (lines.length >= maxLines) break;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (!current || candidate.length <= maxCharsPerLine) current = candidate;
    else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.length ? lines : [""];
}

function preservesAllText(source: string, lines: string[]): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  return normalize(source) === normalize(lines.join(" "));
}

export function fitOverlayTextToRegion(
  text: string,
  input: {
    width: number;
    height: number;
    desiredFontSize: number;
    minFontSize?: number;
    maxFontSize?: number;
  },
): { text: string; fontSize: number; lines: string[] } {
  const maxFontSize = clamp(input.maxFontSize ?? input.desiredFontSize, 1, Math.max(1, input.desiredFontSize));
  const minFontSize = clamp(input.minFontSize ?? 1, 1, maxFontSize);
  const maxLines = Math.max(1, Math.min(6, Math.floor(input.height / Math.max(1, minFontSize * 1.14))));
  const contentWidth = Math.max(1, input.width * 0.86);
  const contentHeight = Math.max(1, input.height * 0.74);

  for (let size = Math.round(maxFontSize); size >= minFontSize; size -= 1) {
    const maxCharsPerLine = Math.max(4, Math.floor(contentWidth / (size * 0.58)));
    const lines = wrapText(text, maxCharsPerLine, maxLines);
    const renderedHeight = lines.length * size + Math.max(0, lines.length - 1) * Math.round(size * 0.14);
    const widestLine = Math.max(...lines.map((line) => estimatedTextWidth(line, size)), 0);
    if (preservesAllText(text, lines) && renderedHeight <= contentHeight && widestLine <= contentWidth) {
      return { text: lines.join("\n"), fontSize: size, lines };
    }
  }

  const fallbackChars = Math.max(4, Math.floor(contentWidth / (minFontSize * 0.58)));
  const lines = wrapText(text, fallbackChars, Number.POSITIVE_INFINITY);
  return { text: lines.join("\n"), fontSize: minFontSize, lines };
}

export function expandOverlayRegionForText(
  region: OverlayRegion,
  text: string,
  frame: OverlayFrameSize,
  minFontSize: number,
): OverlayRegion {
  const contentWidth = Math.max(1, region.w * frame.width * 0.86);
  const charsPerLine = Math.max(4, Math.floor(contentWidth / (Math.max(1, minFontSize) * 0.58)));
  const lines = wrapText(text, charsPerLine, Number.POSITIVE_INFINITY);
  const widestLine = Math.max(...lines.map((line) => estimatedTextWidth(line, minFontSize)), 0);
  const renderedHeight = lines.length * minFontSize + Math.max(0, lines.length - 1) * Math.round(minFontSize * 0.14);
  const neededW = Math.min(0.96, Math.max(region.w, (widestLine / 0.86) / Math.max(1, frame.width)));
  const neededH = Math.min(0.9, Math.max(region.h, (renderedHeight / 0.74) / Math.max(1, frame.height)));
  const centerX = region.x + region.w / 2;
  const centerY = region.y + region.h / 2;
  return clampOverlayRegion({
    x: clamp(centerX - neededW / 2, 0, Math.max(0, 1 - neededW)),
    y: clamp(centerY - neededH / 2, 0, Math.max(0, 1 - neededH)),
    w: neededW,
    h: neededH,
  });
}

export function resolveOverlayTextLayout(input: {
  text: string;
  region: OverlayRegion;
  frame: OverlayFrameSize;
  fontSize: number;
  minFontSize?: number;
  maxFontSize?: number;
  fontSizeBoostPx?: number;
  bold?: boolean;
  outlineWidth?: number;
  sizeMode?: "auto_fit" | "fixed";
  wrapMode?: "manual" | "auto";
}): {
  region: OverlayRegion;
  text: string;
  lines: string[];
  fontSize: number;
  lineSpacing: number;
  outlineWidth: number;
  horizontalPadding: number;
} {
  const normalizedText = normalizeOverlayText(input.text);
  const autoSize = input.sizeMode === "auto_fit";
  const autoWrap = input.wrapMode === "auto";
  const minFontSize = clamp(input.minFontSize ?? 1, 1, input.maxFontSize ?? 120);
  const region = autoSize && autoWrap
    ? expandOverlayRegionForText(input.region, normalizedText, input.frame, minFontSize)
    : clampOverlayRegion(input.region);
  const width = Math.max(1, Math.round(region.w * input.frame.width));
  const height = Math.max(1, Math.round(region.h * input.frame.height));
  const boost = Math.max(0, Math.round(input.fontSizeBoostPx ?? 0));
  const configuredFontSize = clamp(Math.round(input.fontSize), 1, 120);
  const configuredMaxFontSize = clamp(
    Math.round(input.maxFontSize ?? configuredFontSize),
    1,
    configuredFontSize,
  );
  const desiredFontSize = autoSize
    ? clamp(Math.round(height * 0.5) + boost, 1, configuredMaxFontSize)
    : configuredFontSize;
  const maxFontSize = autoSize ? configuredMaxFontSize : desiredFontSize;
  const fitted = autoWrap
    ? fitOverlayTextToRegion(normalizedText, {
        width,
        height,
        desiredFontSize,
        minFontSize,
        maxFontSize,
      })
    : { text: normalizedText, fontSize: desiredFontSize, lines: normalizedText.split("\n").filter(Boolean) };
  const fontSize = Math.max(1, Math.round(fitted.fontSize));
  return {
    region,
    text: fitted.text,
    lines: fitted.lines,
    fontSize,
    lineSpacing: Math.max(0, Math.round(fontSize * 0.14)),
    outlineWidth: Math.max(0, Math.round(input.outlineWidth ?? fontSize * 0.08)),
    horizontalPadding: Math.max(2, Math.min(24, Math.round(width * 0.07))),
  };
}

export function transformOverlayRegion(
  region: OverlayRegion,
  sourceWidth: number,
  sourceHeight: number,
  reframe?: OverlayReframe,
): OverlayRegion {
  if (!reframe || sourceWidth <= 0 || sourceHeight <= 0) return clampOverlayRegion(region);
  const scale = reframe.mode === "crop"
    ? Math.max(reframe.width / sourceWidth, reframe.height / sourceHeight)
    : Math.min(reframe.width / sourceWidth, reframe.height / sourceHeight);
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;
  const offsetX = (reframe.width - scaledWidth) / 2;
  const offsetY = (reframe.height - scaledHeight) / 2;
  const left = region.x * scaledWidth + offsetX;
  const top = region.y * scaledHeight + offsetY;
  const right = (region.x + region.w) * scaledWidth + offsetX;
  const bottom = (region.y + region.h) * scaledHeight + offsetY;
  const clippedLeft = clamp(left, 0, reframe.width);
  const clippedTop = clamp(top, 0, reframe.height);
  const clippedRight = clamp(right, clippedLeft + 1, reframe.width);
  const clippedBottom = clamp(bottom, clippedTop + 1, reframe.height);
  return clampOverlayRegion({
    ...region,
    x: clippedLeft / reframe.width,
    y: clippedTop / reframe.height,
    w: (clippedRight - clippedLeft) / reframe.width,
    h: (clippedBottom - clippedTop) / reframe.height,
  });
}

export function regionalBlurRadius(region: OverlayRegion, frame: OverlayFrameSize): number {
  const width = Math.max(2, Math.ceil(region.w * frame.width));
  const height = Math.max(2, Math.ceil(region.h * frame.height));
  return clamp(Math.round(Math.min(width, height) * 0.28), 10, 42);
}

export function buildTightOverlayBlurRegions(input: {
  region: OverlayRegion;
  textRegions?: OverlayRegion[];
  lines: string[];
  fontSize: number;
  frameWidth: number;
  frameHeight: number;
  outlineWidth?: number;
  coverOriginalText?: boolean;
  minimumWidthRatio?: number;
}): OverlayRegion[] {
  const region = clampOverlayRegion(input.region);
  const frameWidth = Math.max(1, input.frameWidth);
  const frameHeight = Math.max(1, input.frameHeight);
  const fontSize = clamp(Math.round(input.fontSize), 1, 240);
  const outlineWidth = clamp(Math.round(input.outlineWidth ?? fontSize * 0.08), 0, 24);
  const coverOriginalText = input.coverOriginalText === true;
  if (input.textRegions?.length) {
    const padX = clamp(
      Math.round(fontSize * (coverOriginalText ? 0.22 : 0.14)) + outlineWidth * 2,
      coverOriginalText ? 6 : 4,
      Math.round(frameWidth * (coverOriginalText ? 0.035 : 0.02)),
    );
    const padY = clamp(
      Math.round(fontSize * (coverOriginalText ? 0.2 : 0.12)) + outlineWidth * 2,
      coverOriginalText ? 5 : 3,
      Math.round(frameHeight * (coverOriginalText ? 0.025 : 0.015)),
    );
    return input.textRegions.map(clampOverlayRegion).map((item) => clampOverlayRegion({
      x: (item.x * frameWidth - padX) / frameWidth,
      y: (item.y * frameHeight - padY) / frameHeight,
      w: (item.w * frameWidth + padX * 2) / frameWidth,
      h: (item.h * frameHeight + padY * 2) / frameHeight,
    }));
  }

  const lines = input.lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!lines.length) return [region];
  const contentWidth = Math.max(1, Math.round(region.w * frameWidth * (coverOriginalText ? 0.96 : 0.9)));
  const lineSpacing = Math.max(0, Math.round(fontSize * 0.14));
  const lineHeight = Math.max(fontSize, Math.round(fontSize * (coverOriginalText ? 1.22 : 1.12)));
  const renderedHeight = lines.length * lineHeight + Math.max(0, lines.length - 1) * lineSpacing;
  const startX = region.x * frameWidth + Math.max(0, (region.w * frameWidth - contentWidth) / 2);
  const startY = region.y * frameHeight + Math.max(0, (region.h * frameHeight - renderedHeight) / 2);
  const padX = clamp(
    Math.round(fontSize * (coverOriginalText ? 0.46 : 0.3)) + outlineWidth * 2,
    coverOriginalText ? 8 : 5,
    Math.max(8, Math.round(contentWidth * (coverOriginalText ? 0.18 : 0.12))),
  );
  const padY = clamp(
    Math.round(fontSize * (coverOriginalText ? 0.34 : 0.22)) + outlineWidth * 2,
    coverOriginalText ? 6 : 4,
    Math.max(6, Math.round(lineHeight * (coverOriginalText ? 0.55 : 0.38))),
  );
  const minWidth = Math.min(
    contentWidth,
    Math.max(
      Math.round(fontSize * (coverOriginalText ? 4 : 2.8)),
      Math.round(contentWidth * clamp(input.minimumWidthRatio ?? (coverOriginalText ? 0.5 : 0.28), 0.1, 0.9)),
    ),
  );
  return lines.map((line, index) => {
    const lineWidth = clamp(Math.round(estimatedTextWidth(line, fontSize)), minWidth, contentWidth);
    return clampOverlayRegion({
      x: (startX + (contentWidth - lineWidth) / 2 - padX) / frameWidth,
      y: (startY + index * (lineHeight + lineSpacing) - padY) / frameHeight,
      w: (lineWidth + padX * 2) / frameWidth,
      h: (lineHeight + padY * 2) / frameHeight,
    });
  });
}
