import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, requireUser, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

const presetSchema = z.object({
  name: z.string().optional().transform((val) => (val && val.trim() !== "" ? val.trim() : "Default")),
  platforms: z.array(z.string().min(1).max(60)).max(12).default([]),
  toneAndVoice: z.string().max(200).nullable().optional(),
  audience: z.string().max(200).nullable().optional(),
  captionLength: z.string().max(80).nullable().optional(),
  hookStyle: z.string().max(120).nullable().optional(),
  cta: z.string().max(240).nullable().optional(),
  requiredHashtags: z.array(z.string().min(1).max(80)).max(40).default([]),
  optionalHashtags: z.array(z.string().min(1).max(80)).max(40).default([]),
  bannedHashtags: z.array(z.string().min(1).max(80)).max(40).default([]),
  requiredKeywords: z.array(z.string().min(1).max(120)).max(40).default([]),
  bannedKeywords: z.array(z.string().min(1).max(120)).max(40).default([]),
  emojiStyle: z.string().max(80).nullable().optional(),
  formatStyle: z.string().max(120).nullable().optional(),
  brandRules: z.string().max(2000).nullable().optional(),
  sampleCaptions: z.string().max(4000).nullable().optional(),
  extraInstructions: z.string().max(4000).nullable().optional(),
});

export async function GET(_req: NextRequest) {
  try {
    const { db } = await requireUser();
    const { data, error } = await db
      .from("remix_caption_presets")
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
      platforms: body.platforms,
      tone_and_voice: body.toneAndVoice ?? null,
      audience: body.audience ?? null,
      caption_length: body.captionLength ?? null,
      hook_style: body.hookStyle ?? null,
      cta: body.cta ?? null,
      required_hashtags: body.requiredHashtags,
      optional_hashtags: body.optionalHashtags,
      banned_hashtags: body.bannedHashtags,
      required_keywords: body.requiredKeywords,
      banned_keywords: body.bannedKeywords,
      emoji_style: body.emojiStyle ?? null,
      format_style: body.formatStyle ?? null,
      brand_rules: body.brandRules ?? null,
      sample_captions: body.sampleCaptions ?? null,
      extra_instructions: body.extraInstructions ?? null,
    };

    const { data, error } = await db
      .from("remix_caption_presets")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? "Lưu caption preset thất bại." }, { status: 500 });
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
