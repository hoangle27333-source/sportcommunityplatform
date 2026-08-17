import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { sanitizeImageEditorTemplate } from "@/lib/remix/image-editor-template";

export const dynamic = "force-dynamic";

const presetSchema = z.object({
  name: z.string().optional().transform((val) => (val && val.trim() !== "" ? val.trim() : "Default")),
  outputRatio: z.enum(["9:16", "16:9", "1:1", "4:5", "original"]).optional(),
  colorGrade: z.boolean().optional(),
  imageTranslate: z.enum(["overlay", "regenerate"]).nullable().optional(),
  captionPrompt: z.string().max(2000).nullable().optional(),
  captionTone: z.string().max(100).nullable().optional(),
  watermarkDefaults: z.record(z.unknown()).optional(),
  editorTemplate: z.record(z.unknown()).optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireEditor();
    const { id } = await params;
    const body = presetSchema.parse(await req.json());

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.outputRatio !== undefined) updateData.output_ratio = body.outputRatio;
    if (body.colorGrade !== undefined) updateData.color_grade = body.colorGrade;
    if (body.imageTranslate !== undefined) updateData.image_translate = body.imageTranslate ?? null;
    if (body.captionPrompt !== undefined) updateData.caption_prompt = body.captionPrompt ?? null;
    if (body.captionTone !== undefined) updateData.caption_tone = body.captionTone ?? null;
    if (body.watermarkDefaults !== undefined) updateData.watermark_defaults = body.watermarkDefaults;
    if (body.editorTemplate !== undefined) {
      updateData.editor_template = sanitizeImageEditorTemplate(body.editorTemplate) ?? {};
    }

    const { data, error } = await db
      .from("remix_image_presets")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? "Cập nhật image preset thất bại." }, { status: 500 });
    return NextResponse.json({ preset: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireEditor();
    const { id } = await params;

    const { error } = await db
      .from("remix_image_presets")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
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
