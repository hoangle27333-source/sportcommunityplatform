import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

const presetSchema = z.object({
  name: z.string().optional().transform((val) => (val && val.trim() !== "" ? val.trim() : "Default")),
  platforms: z.array(z.string().min(1).max(60)).max(12).optional(),
  toneAndVoice: z.string().max(200).nullable().optional(),
  audience: z.string().max(200).nullable().optional(),
  captionLength: z.string().max(80).nullable().optional(),
  hookStyle: z.string().max(120).nullable().optional(),
  cta: z.string().max(240).nullable().optional(),
  requiredHashtags: z.array(z.string().min(1).max(80)).max(40).optional(),
  optionalHashtags: z.array(z.string().min(1).max(80)).max(40).optional(),
  bannedHashtags: z.array(z.string().min(1).max(80)).max(40).optional(),
  requiredKeywords: z.array(z.string().min(1).max(120)).max(40).optional(),
  bannedKeywords: z.array(z.string().min(1).max(120)).max(40).optional(),
  emojiStyle: z.string().max(80).nullable().optional(),
  formatStyle: z.string().max(120).nullable().optional(),
  brandRules: z.string().max(2000).nullable().optional(),
  sampleCaptions: z.string().max(4000).nullable().optional(),
  extraInstructions: z.string().max(4000).nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireEditor();
    const { id } = await params;
    const body = presetSchema.parse(await req.json());

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.platforms !== undefined) updateData.platforms = body.platforms;
    if (body.toneAndVoice !== undefined) updateData.tone_and_voice = body.toneAndVoice ?? null;
    if (body.audience !== undefined) updateData.audience = body.audience ?? null;
    if (body.captionLength !== undefined) updateData.caption_length = body.captionLength ?? null;
    if (body.hookStyle !== undefined) updateData.hook_style = body.hookStyle ?? null;
    if (body.cta !== undefined) updateData.cta = body.cta ?? null;
    if (body.requiredHashtags !== undefined) updateData.required_hashtags = body.requiredHashtags;
    if (body.optionalHashtags !== undefined) updateData.optional_hashtags = body.optionalHashtags;
    if (body.bannedHashtags !== undefined) updateData.banned_hashtags = body.bannedHashtags;
    if (body.requiredKeywords !== undefined) updateData.required_keywords = body.requiredKeywords;
    if (body.bannedKeywords !== undefined) updateData.banned_keywords = body.bannedKeywords;
    if (body.emojiStyle !== undefined) updateData.emoji_style = body.emojiStyle ?? null;
    if (body.formatStyle !== undefined) updateData.format_style = body.formatStyle ?? null;
    if (body.brandRules !== undefined) updateData.brand_rules = body.brandRules ?? null;
    if (body.sampleCaptions !== undefined) updateData.sample_captions = body.sampleCaptions ?? null;
    if (body.extraInstructions !== undefined) updateData.extra_instructions = body.extraInstructions ?? null;

    const { data, error } = await db
      .from("remix_caption_presets")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? "Cập nhật caption preset thất bại." }, { status: 500 });
    return NextResponse.json({ preset: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await requireEditor();
    const { id } = await params;

    const { error } = await db
      .from("remix_caption_presets")
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
