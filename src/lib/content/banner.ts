import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { uploadMediaAsset, type StoredAsset } from "@/lib/storage/media";

/**
 * Banner / social-card generation (SPEC §7.2).
 *
 * Satori turns a template (JSX-like element tree) into SVG, resvg rasterizes it
 * to PNG. Deterministic and template-driven — variable text/numbers/logo are
 * parameters, so the same template produces batches of on-brand cards.
 *
 * This is NOT free-form image generation (that is ComfyUI, §7.2). Templates are
 * a fixed registry keyed by name; callers pass data to fill the slots.
 *
 * Fonts: Satori requires at least one embedded font. We lazily load a font file
 * from FONT_PATH (defaults to a bundled sans font). Missing font is a clear
 * error rather than a silent blank render.
 */

export interface BannerRequest {
  template: string;
  data: Record<string, unknown>;
  width?: number;
  height?: number;
  createdBy?: string;
}

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1080;

// A Satori element tree node (structurally compatible with React.ReactNode for
// Satori's purposes) without pulling React in.
interface SatoriNode {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: SatoriNode | SatoriNode[] | string;
    [k: string]: unknown;
  };
}

type TemplateFn = (
  data: Record<string, unknown>,
  w: number,
  h: number,
) => SatoriNode;

/** Template registry (SPEC §7.2 — templated variable banners). */
const TEMPLATES: Record<string, TemplateFn> = {
  /** Headline + subtitle + accent bar — a generic announcement card. */
  announcement: (data, w, h) => ({
    type: "div",
    props: {
      style: {
        width: w,
        height: h,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        backgroundColor: String(data.background ?? "#0f172a"),
        color: String(data.color ?? "#ffffff"),
        fontFamily: "sans",
      },
      children: [
        {
          type: "div",
          props: {
            style: { width: 96, height: 10, backgroundColor: String(data.accent ?? "#38bdf8"), marginBottom: 32 },
          },
        },
        {
          type: "div",
          props: {
            style: { fontSize: 68, fontWeight: 700, lineHeight: 1.1 },
            children: String(data.title ?? "Tiêu đề"),
          },
        },
        {
          type: "div",
          props: {
            style: { fontSize: 32, marginTop: 24, opacity: 0.85 },
            children: String(data.subtitle ?? ""),
          },
        },
      ],
    },
  }),

  /** Big-number stat card (e.g. a result / metric highlight). */
  stat: (data, w, h) => ({
    type: "div",
    props: {
      style: {
        width: w,
        height: h,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: String(data.background ?? "#111827"),
        color: String(data.color ?? "#ffffff"),
        fontFamily: "sans",
      },
      children: [
        {
          type: "div",
          props: {
            style: { fontSize: 220, fontWeight: 800, color: String(data.accent ?? "#f59e0b") },
            children: String(data.value ?? "0"),
          },
        },
        {
          type: "div",
          props: {
            style: { fontSize: 40, marginTop: 8, opacity: 0.9 },
            children: String(data.label ?? ""),
          },
        },
      ],
    },
  }),
};

export function listBannerTemplates(): string[] {
  return Object.keys(TEMPLATES);
}

let cachedFont: Buffer | null = null;

async function loadFont(): Promise<Buffer> {
  if (cachedFont) return cachedFont;
  const fontPath =
    process.env.FONT_PATH ??
    path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf");
  try {
    cachedFont = await readFile(fontPath);
    return cachedFont;
  } catch {
    throw new Error(
      `Banner render needs a font. Set FONT_PATH or place a TTF at ${fontPath}.`,
    );
  }
}

/** Render a template to a PNG buffer. */
export async function renderBanner(req: BannerRequest): Promise<Buffer> {
  const template = TEMPLATES[req.template];
  if (!template) {
    throw new Error(
      `Unknown banner template "${req.template}". Available: ${listBannerTemplates().join(", ")}`,
    );
  }
  const width = req.width ?? DEFAULT_WIDTH;
  const height = req.height ?? DEFAULT_HEIGHT;
  const font = await loadFont();

  const tree = template(req.data, width, height);

  // Satori's types expect React nodes; our structural node is compatible.
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: [{ name: "sans", data: font, weight: 400, style: "normal" }],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
  });
  return Buffer.from(resvg.render().asPng());
}

/** Render a banner and store it as a media_asset (type=banner). */
export async function renderBannerToStorage(
  db: SupabaseClient,
  req: BannerRequest,
): Promise<StoredAsset> {
  const png = await renderBanner(req);
  return uploadMediaAsset(db, {
    buffer: png,
    contentType: "image/png",
    ext: "png",
    type: "banner",
    generatedBy: "satori",
    createdBy: req.createdBy,
    meta: { template: req.template, data: req.data },
  });
}
