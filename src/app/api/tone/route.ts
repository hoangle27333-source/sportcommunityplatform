import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, requireEditor, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * /api/tone (SPEC §7.1 — tone-of-voice profiles)
 *   GET   list profiles (any authed user)
 *   POST  create a profile (editor+)
 */

const createSchema = z.object({
  name: z.string().min(1).max(200),
  persona: z.string().max(2000).optional(),
  guidelines: z.string().max(4000).optional(),
  examples: z.array(z.string().max(2000)).max(20).optional(),
});

export async function GET() {
  try {
    const { db } = await requireUser();
    const { data, error } = await db
      .from("tone_of_voice")
      .select("id, name, persona, guidelines, examples, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tones: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = createSchema.parse(await req.json());
    const { data, error } = await db
      .from("tone_of_voice")
      .insert({
        name: body.name,
        persona: body.persona ?? null,
        guidelines: body.guidelines ?? null,
        examples: body.examples ?? [],
        created_by: user.id,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "insert failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ id: data.id }, { status: 201 });
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
