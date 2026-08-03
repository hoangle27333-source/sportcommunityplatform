import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadMediaAsset, type StoredAsset } from "@/lib/storage/media";

/**
 * Short-video generation (SPEC §7.3 — "video ngắn").
 *
 * === DECISION NEEDED (see NOTES-FOR-REVIEW) ===
 * The spec names Remotion (React → MP4 via headless Chromium). Remotion is a
 * heavy dependency (bundles Chromium, needs a render server / lambda, licensing
 * considerations for teams >3). Rather than commit the whole toolchain blind,
 * this module defines a provider-agnostic VideoRenderer interface with TWO
 * candidate backends:
 *
 *   1. "remotion"  — full templated React video (NOT wired yet; needs your OK
 *                    on the dependency + a render host).
 *   2. "ffmpeg"    — a dependency-light slideshow: caption + images → MP4 via a
 *                    local ffmpeg binary (Ken Burns optional). Good enough for
 *                    image+caption reels, ~0₫ compute on the VPS.
 *
 * Select via VIDEO_RENDERER env (default "ffmpeg"). Both funnel output through
 * uploadMediaAsset so the rest of the pipeline (publish reels) is unchanged.
 */

export interface VideoScene {
  imageUrl: string;
  caption?: string;
  durationSec?: number;
}

export interface VideoRenderRequest {
  scenes: VideoScene[];
  width?: number;
  height?: number;
  fps?: number;
  createdBy?: string;
}

export interface VideoRenderer {
  readonly id: string;
  render(req: VideoRenderRequest): Promise<Buffer>;
}

// ---------------------------------------------------------------------------
// ffmpeg slideshow backend (dependency-light default)
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fetchToBuffer } from "@/lib/storage/media";

class FfmpegSlideshowRenderer implements VideoRenderer {
  readonly id = "ffmpeg";

  async render(req: VideoRenderRequest): Promise<Buffer> {
    if (req.scenes.length === 0) throw new Error("video needs at least one scene");
    const fps = req.fps ?? 30;
    const dir = await mkdtemp(path.join(tmpdir(), "vid-"));
    try {
      // Download scene images to the temp dir.
      const listLines: string[] = [];
      for (let i = 0; i < req.scenes.length; i++) {
        const scene = req.scenes[i];
        const buf = await fetchToBuffer(scene.imageUrl);
        const file = path.join(dir, `scene-${i}.png`);
        await writeFile(file, buf);
        const dur = Math.max(1, scene.durationSec ?? 3);
        // ffmpeg concat demuxer format.
        listLines.push(`file '${file}'`);
        listLines.push(`duration ${dur}`);
      }
      // Concat demuxer needs the last file repeated (no trailing duration).
      listLines.push(`file '${path.join(dir, `scene-${req.scenes.length - 1}.png`)}'`);
      const listFile = path.join(dir, "list.txt");
      await writeFile(listFile, listLines.join("\n"));

      const out = path.join(dir, "out.mp4");
      const w = req.width ?? 1080;
      const h = req.height ?? 1920; // vertical reel default
      await runFfmpeg([
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listFile,
        "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
        "-r", String(fps),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        out,
      ]);

      return await readFile(out);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let bin = process.env.FFMPEG_PATH;
    if (!bin || !bin.trim()) bin = "ffmpeg"; // fallback if empty string

    let proc;
    try {
      proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    } catch(err) {
      return reject(new Error(`ffmpeg spawn failed (${bin}): ${(err as Error).message}`));
    }
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) =>
      reject(new Error(`ffmpeg spawn failed (${bin}): ${err.message}`)),
    );
    proc.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`)),
    );
  });
}

// ---------------------------------------------------------------------------
// Remotion backend (placeholder — NOT wired; see NOTES-FOR-REVIEW)
// ---------------------------------------------------------------------------

class RemotionRenderer implements VideoRenderer {
  readonly id = "remotion";
  async render(_req: VideoRenderRequest): Promise<Buffer> {
    throw new Error(
      "Remotion backend not enabled. Set VIDEO_RENDERER=ffmpeg, or approve the " +
        "Remotion dependency + render host (see NOTES-FOR-REVIEW §video).",
    );
  }
}

// ---------------------------------------------------------------------------
// Factory + storage orchestration
// ---------------------------------------------------------------------------

export function getVideoRenderer(): VideoRenderer {
  const id = (process.env.VIDEO_RENDERER ?? "ffmpeg").toLowerCase();
  switch (id) {
    case "remotion":
      return new RemotionRenderer();
    case "ffmpeg":
    default:
      return new FfmpegSlideshowRenderer();
  }
}

/** Render a video and store it as a media_asset (type=video). */
export async function renderVideoToStorage(
  db: SupabaseClient,
  req: VideoRenderRequest,
): Promise<StoredAsset> {
  const renderer = getVideoRenderer();
  const mp4 = await renderer.render(req);
  return uploadMediaAsset(db, {
    buffer: mp4,
    contentType: "video/mp4",
    ext: "mp4",
    type: "video",
    generatedBy: "remotion", // provenance bucket; actual backend in meta
    createdBy: req.createdBy,
    meta: { renderer: renderer.id, scenes: req.scenes.length },
  });
}
