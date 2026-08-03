import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { renderVideoToStorage } from "@/lib/content/video";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/content/video (SPEC §7.3 — short video)
 *   Renders a slideshow-style MP4 from scenes (image + caption + duration) and
 *   stores it as a media_asset. Backend is pluggable (ffmpeg default / Remotion).
 *   Editor+ only. Rendering is synchronous here for simplicity; for long videos
 *   this should move behind the content-gen queue (see NOTES-FOR-REVIEW §video).
 */

const sceneSchema = z.object({
  imageUrl: z.string().url(),
  caption: z.string().max(500).optional(),
  durationSec: z.number().min(1).max(30).optional(),
});

const bodySchema = z.object({
  scenes: z.array(sceneSchema).min(1).max(20),
  width: z.number().int().min(240).max(2160).optional(),
  height: z.number().int().min(240).max(3840).optional(),
  fps: z.number().int().min(1).max(60).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireEditor();
    const body = bodySchema.parse(await req.json());

    const admin = createAdminClient();
    const asset = await renderVideoToStorage(admin, {
      scenes: body.scenes,
      width: body.width,
      height: body.height,
      fps: body.fps,
      createdBy: user.id,
    });

    return NextResponse.json({ asset });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof z.ZodError) {
    return NextResponse.json(
      { error: "validation", issues: e.issues },
      { status: 422 },
    );
  }
  return NextResponse.json(
    { error: (e as Error).message ?? "internal error" },
    { status: 500 },
  );
}
