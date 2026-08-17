import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, requireUser, AuthError } from "@/lib/auth/require-user";
import { sanitizeImageEditorTemplate } from "@/lib/remix/image-editor-template";

export const dynamic = "force-dynamic";

const presetSchema = z.object({
  name: z.string().optional().transform((val) => (val && val.trim() !== "" ? val.trim() : "Default")),
  outputRatio: z.enum(["9:16", "16:9", "1:1", "4:5", "original"]).default("9:16"),
  colorGrade: z.boolean().default(false),
  imageTranslate: z.enum(["overlay", "regenerate"]).nullable().optional(),
  captionPrompt: z.string().max(2000).nullable().optional(),
  captionTone: z.string().max(100).nullable().optional(),
  watermarkDefaults: z.record(z.unknown()).default({}),
  editorTemplate: z.record(z.unknown()).default({}),
});

export async function GET(_req: NextRequest) {
  try {
    const { db } = await requireUser();
    const { data, error } = await db
      .from("remix_image_presets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ presets: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = presetSchema.parse(await req.json());
    const insertPayload = {
      org_id: user.id,
      name: body.name,
      output_ratio: body.outputRatio,
      color_grade: body.colorGrade,
      image_translate: body.imageTranslate ?? null,
      caption_prompt: body.captionPrompt ?? null,
      caption_tone: body.captionTone ?? null,
      watermark_defaults: body.watermarkDefaults,
      editor_template: sanitizeImageEditorTemplate(body.editorTemplate) ?? {},
    };

    const { data, error } = await db
      .from("remix_image_presets")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? "Lưu image preset thất bại." }, { status: 500 });
    return NextResponse.json({ preset: data }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: (e as any).status ?? 401 });
  if (e instanceof z.ZodError) {
    const msg = e.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
    return NextResponse.json({ error: `Dữ liệu không hợp lệ: ${msg}`, issues: e.issues }, { status: 422 });
  }
  return NextResponse.json({ error: (e as Error).message ?? "internal error" }, { status: 500 });
}
