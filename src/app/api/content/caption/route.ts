import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { getAIProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordGeneration } from "@/lib/ai/cost";

export const dynamic = "force-dynamic";

/**
 * POST /api/content/caption (SPEC §7.1 — Contextual Captioning)
 *   Synchronous caption/hashtag/CTA generation. Small + fast, so it is served
 *   inline rather than queued. Editor+ only.
 *
 *   Body: { brief, toneId?, platform?, variants?, language?, learnings? }
 *   Returns: { variants: [{caption, hashtags, cta}], model }
 */

const bodySchema = z.object({
  brief: z.string().min(1).max(4000),
  toneId: z.string().uuid().optional(),
  platform: z.enum(["facebook", "instagram"]).optional(),
  variants: z.number().int().min(1).max(5).optional(),
  language: z.string().max(10).optional(),
  learnings: z.array(z.string()).max(20).optional(),
  /** Optional campaign to pull tone + prior learnings from. */
  campaignId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = bodySchema.parse(await req.json());

    // Resolve tone-of-voice: explicit toneId wins, else campaign's tone.
    let tone;
    if (body.toneId) {
      tone = await loadTone(db, body.toneId);
    } else if (body.campaignId) {
      const { data: c } = await db
        .from("campaigns")
        .select("tone_of_voice_id")
        .eq("id", body.campaignId)
        .single<{ tone_of_voice_id: string | null }>();
      if (c?.tone_of_voice_id) tone = await loadTone(db, c.tone_of_voice_id);
    }

    // Fold in prior AI learnings from the campaign (§6 → §7.1 loop).
    let learnings = body.learnings ?? [];
    if (body.campaignId) {
      const { data: sugg } = await db
        .from("ai_suggestions")
        .select("content")
        .eq("campaign_id", body.campaignId)
        .limit(10);
      learnings = [
        ...learnings,
        ...(sugg ?? []).map((s) => s.content as string),
      ];
    }

    const ai = getAIProvider();
    const started = Date.now();
    const result = await ai.generateText({
      brief: body.brief,
      tone,
      platform: body.platform,
      variants: body.variants ?? 3,
      language: body.language ?? "vi",
      learnings: learnings.length ? learnings : undefined,
    });

    // Record cost (R4.7) via service-role client — ai_generations has no
    // insert policy for regular users. Best-effort; never fails the request.
    void recordGeneration(createAdminClient(), {
      provider: ai.id,
      model: result.model,
      kind: "caption",
      usage: result.usage,
      durationMs: Date.now() - started,
      campaignId: body.campaignId,
      createdBy: user.id,
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}

async function loadTone(
  db: Awaited<ReturnType<typeof requireEditor>>["db"],
  toneId: string,
) {
  const { data } = await db
    .from("tone_of_voice")
    .select("name, persona, guidelines, examples")
    .eq("id", toneId)
    .single<{
      name: string | null;
      persona: string | null;
      guidelines: string | null;
      examples: string[] | null;
    }>();
  if (!data) return undefined;
  return {
    name: data.name ?? undefined,
    persona: data.persona ?? undefined,
    guidelines: data.guidelines ?? undefined,
    examples: data.examples ?? undefined,
  };
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
