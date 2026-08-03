import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "@/lib/ai";
import { extractJson } from "@/lib/ai/json";
import {
  uploadMediaAsset,
  downloadMediaObject,
  fetchToBuffer,
  type StoredAsset,
} from "@/lib/storage/media";

/**
 * Image-Edit Agent (SPEC §7.2, §7.4 — "Không sinh ảnh tự do").
 *
 * An agent that EDITS an existing image by orchestrating a fixed set of
 * deterministic tools. It does NOT generate new imagery (that is ComfyUI).
 * The AI's only job is to translate a natural-language instruction into an
 * ordered plan of whitelisted operations; Sharp then executes them.
 *
 * Guardrails:
 *   - Only ops in the whitelist run. Anything else is dropped.
 *   - Every op's params are clamped to safe ranges.
 *   - Background removal / inpaint (rembg / ComfyUI) are declared here as ops
 *     but delegate to an external service; if unconfigured they no-op with a
 *     recorded warning rather than failing the whole edit.
 *
 * The plan is auditable (persisted in the asset meta) so a human can see exactly
 * what transformed the image.
 */

// ---------------------------------------------------------------------------
// Op vocabulary
// ---------------------------------------------------------------------------

export type EditOp =
  | { op: "resize"; width?: number; height?: number; fit?: "cover" | "contain" | "fill" | "inside" | "outside" }
  | { op: "crop"; left: number; top: number; width: number; height: number }
  | { op: "rotate"; degrees: number }
  | { op: "flip" }
  | { op: "flop" }
  | { op: "grayscale" }
  | { op: "blur"; sigma: number }
  | { op: "sharpen" }
  | { op: "brightness"; value: number }
  | { op: "saturation"; value: number }
  | { op: "tint"; color: string }
  | { op: "extend"; top?: number; bottom?: number; left?: number; right?: number; color?: string }
  | { op: "removeBackground" }
  | { op: "format"; to: "png" | "jpeg" | "webp" };

const KNOWN_OPS = new Set<EditOp["op"]>([
  "resize", "crop", "rotate", "flip", "flop", "grayscale", "blur",
  "sharpen", "brightness", "saturation", "tint", "extend",
  "removeBackground", "format",
]);

export interface ImageEditRequest {
  /** Source: either a storage path (preferred) or a remote URL. */
  storagePath?: string;
  sourceUrl?: string;
  /** Natural-language instruction, e.g. "crop to square and remove the logo". */
  instruction: string;
  createdBy?: string;
}

export interface ImageEditResult {
  asset: StoredAsset;
  plan: EditOp[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Planning (AI → validated op list)
// ---------------------------------------------------------------------------

/**
 * Ask the AI provider to translate the instruction into an ordered op plan.
 * We reuse generateText's JSON mode via a strict prompt, then validate.
 */
export async function planEdit(
  instruction: string,
  meta: { width: number; height: number },
): Promise<EditOp[]> {
  const ai = getAIProvider();
  const res = await ai.generateText({
    brief: buildPlanPrompt(instruction, meta),
    variants: 1,
    language: "en",
  });
  // The provider returns caption text; we asked it to emit JSON there.
  const raw = res.variants[0]?.caption ?? "";
  const parsed = extractJson<{ ops?: unknown[] }>(raw);
  return sanitizePlan(parsed?.ops ?? []);
}

function buildPlanPrompt(
  instruction: string,
  meta: { width: number; height: number },
): string {
  return [
    "You are an image-editing planner. Translate the user instruction into an",
    "ordered JSON plan of deterministic operations. Output ONLY JSON of the form",
    '{"ops":[{"op":"resize","width":1080},...]}.',
    "",
    "Allowed ops and params:",
    '- resize {width?,height?,fit?}  fit in cover|contain|fill|inside|outside',
    "- crop {left,top,width,height}",
    "- rotate {degrees}",
    "- flip   (vertical) / flop (horizontal)",
    "- grayscale",
    "- blur {sigma}   /  sharpen",
    "- brightness {value}  (1=none, >1 brighter)",
    "- saturation {value}  (1=none)",
    "- tint {color}   hex like #ff0000",
    "- extend {top?,bottom?,left?,right?,color?}   add borders/padding",
    "- removeBackground   (isolate subject; transparent bg)",
    "- format {to}   png|jpeg|webp",
    "",
    "Do NOT invent ops. Do NOT generate new imagery. If the instruction asks to",
    '"remove logo" or "remove object", approximate with crop/extend or',
    "removeBackground — never fabricate pixels beyond these tools.",
    "",
    `Source image is ${meta.width}x${meta.height}px.`,
    `Instruction: "${instruction}"`,
  ].join("\n");
}

/** Drop unknown ops and clamp params to safe ranges. */
export function sanitizePlan(ops: unknown[]): EditOp[] {
  const out: EditOp[] = [];
  for (const raw of ops) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const op = o.op as EditOp["op"];
    if (!KNOWN_OPS.has(op)) continue;

    const num = (v: unknown, min: number, max: number, dflt?: number) => {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return dflt;
      return Math.min(max, Math.max(min, n));
    };

    switch (op) {
      case "resize":
        out.push({
          op,
          width: num(o.width, 1, 8000),
          height: num(o.height, 1, 8000),
          fit: ["cover", "contain", "fill", "inside", "outside"].includes(String(o.fit))
            ? (o.fit as "cover")
            : "cover",
        });
        break;
      case "crop":
        out.push({
          op,
          left: num(o.left, 0, 8000, 0)!,
          top: num(o.top, 0, 8000, 0)!,
          width: num(o.width, 1, 8000, 1)!,
          height: num(o.height, 1, 8000, 1)!,
        });
        break;
      case "rotate":
        out.push({ op, degrees: num(o.degrees, -360, 360, 0)! });
        break;
      case "blur":
        out.push({ op, sigma: num(o.sigma, 0.3, 100, 3)! });
        break;
      case "brightness":
        out.push({ op, value: num(o.value, 0.1, 3, 1)! });
        break;
      case "saturation":
        out.push({ op, value: num(o.value, 0, 3, 1)! });
        break;
      case "tint":
        out.push({ op, color: hexOr(o.color, "#ffffff") });
        break;
      case "extend":
        out.push({
          op,
          top: num(o.top, 0, 2000, 0),
          bottom: num(o.bottom, 0, 2000, 0),
          left: num(o.left, 0, 2000, 0),
          right: num(o.right, 0, 2000, 0),
          color: hexOr(o.color, "#00000000"),
        });
        break;
      case "format":
        out.push({
          op,
          to: ["png", "jpeg", "webp"].includes(String(o.to)) ? (o.to as "png") : "png",
        });
        break;
      default:
        // Param-less ops.
        out.push({ op } as EditOp);
    }
  }
  return out;
}

function hexOr(v: unknown, dflt: string): string {
  const s = String(v ?? "");
  return /^#([0-9a-fA-F]{3,8})$/.test(s) ? s : dflt;
}

// ---------------------------------------------------------------------------
// Execution (Sharp)
// ---------------------------------------------------------------------------

/** Apply a validated plan to an image buffer. Returns the edited buffer + format. */
export async function applyPlan(
  input: Buffer,
  plan: EditOp[],
): Promise<{ buffer: Buffer; ext: string; contentType: string; warnings: string[] }> {
  const warnings: string[] = [];
  let img = sharp(input, { failOn: "none" });
  let outFormat: "png" | "jpeg" | "webp" = "png";

  for (const step of plan) {
    switch (step.op) {
      case "resize":
        img = img.resize({ width: step.width, height: step.height, fit: step.fit });
        break;
      case "crop":
        img = img.extract({
          left: step.left,
          top: step.top,
          width: step.width,
          height: step.height,
        });
        break;
      case "rotate":
        img = img.rotate(step.degrees);
        break;
      case "flip":
        img = img.flip();
        break;
      case "flop":
        img = img.flop();
        break;
      case "grayscale":
        img = img.grayscale();
        break;
      case "blur":
        img = img.blur(step.sigma);
        break;
      case "sharpen":
        img = img.sharpen();
        break;
      case "brightness":
        img = img.modulate({ brightness: step.value });
        break;
      case "saturation":
        img = img.modulate({ saturation: step.value });
        break;
      case "tint":
        img = img.tint(step.color);
        break;
      case "extend":
        img = img.extend({
          top: step.top ?? 0,
          bottom: step.bottom ?? 0,
          left: step.left ?? 0,
          right: step.right ?? 0,
          background: step.color ?? "#00000000",
        });
        break;
      case "removeBackground": {
        const removed = await removeBackground(await img.png().toBuffer());
        if (removed) {
          img = sharp(removed, { failOn: "none" });
          outFormat = "png"; // transparency requires png
        } else {
          warnings.push(
            "removeBackground skipped: no background-removal service configured (REMBG_URL).",
          );
        }
        break;
      }
      case "format":
        outFormat = step.to;
        break;
    }
  }

  let buffer: Buffer;
  let contentType: string;
  let ext: string;
  if (outFormat === "jpeg") {
    buffer = await img.jpeg({ quality: 90 }).toBuffer();
    contentType = "image/jpeg";
    ext = "jpg";
  } else if (outFormat === "webp") {
    buffer = await img.webp({ quality: 90 }).toBuffer();
    contentType = "image/webp";
    ext = "webp";
  } else {
    buffer = await img.png().toBuffer();
    contentType = "image/png";
    ext = "png";
  }

  return { buffer, ext, contentType, warnings };
}

/**
 * Background removal via an external rembg service (SPEC §7.2: rembg/ComfyUI
 * inpaint). Returns null if unconfigured so the caller can degrade gracefully.
 * The endpoint is expected to accept a PNG and return a PNG with alpha.
 */
async function removeBackground(png: Buffer): Promise<Buffer | null> {
  const url = process.env.REMBG_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: png as unknown as BodyInit,
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Full agent flow: load source → plan → execute → store new asset. */
export async function editImage(
  db: SupabaseClient,
  req: ImageEditRequest,
): Promise<ImageEditResult> {
  if (!req.storagePath && !req.sourceUrl) {
    throw new Error("image-edit requires storagePath or sourceUrl");
  }

  const source = req.storagePath
    ? await downloadMediaObject(db, req.storagePath)
    : await fetchToBuffer(req.sourceUrl!);

  const meta = await sharp(source, { failOn: "none" }).metadata();
  const plan = await planEdit(req.instruction, {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  });

  const { buffer, ext, contentType, warnings } = await applyPlan(source, plan);

  const asset = await uploadMediaAsset(db, {
    buffer,
    contentType,
    ext,
    type: "image",
    generatedBy: "image-edit",
    createdBy: req.createdBy,
    meta: {
      instruction: req.instruction,
      plan,
      source: req.storagePath ?? req.sourceUrl,
      warnings,
    },
  });

  return { asset, plan, warnings };
}
