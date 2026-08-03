import { NextResponse, type NextRequest } from "next/server";
import { requireUser, requireEditor, AuthError } from "@/lib/auth/require-user";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * /api/media (SPEC §7)
 *   GET  ?type=image|video|banner   list media assets (any authed user)
 *   POST                            register an uploaded asset (editor+)
 *
 * Generated assets (banner/image-edit/video) are created by their own routes /
 * workers. This POST is for direct uploads whose bytes already live in storage
 * (client uploaded to Supabase Storage, then registers the row here).
 */

const registerSchema = z.object({
  type: z.enum(["image", "video", "banner"]),
  url: z.string().url(),
  storagePath: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { db } = await requireUser();
    const type = req.nextUrl.searchParams.get("type");

    let query = db
      .from("media_assets")
      .select("id, type, url, storage_path, generated_by, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (type) query = query.eq("type", type);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ media: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = registerSchema.parse(await req.json());

    const { data, error } = await db
      .from("media_assets")
      .insert({
        type: body.type,
        url: body.url,
        storage_path: body.storagePath ?? null,
        generated_by: "upload",
        created_by: user.id,
        meta: body.meta ?? {},
      })
      .select("id, type, url")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ media: data }, { status: 201 });
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
