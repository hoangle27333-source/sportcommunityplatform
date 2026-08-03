import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, requireEditor, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * /api/campaigns (SPEC §5, §7)
 *   GET   list campaigns (any authed user; RLS scopes rows)
 *   POST  create a campaign (editor+)
 */

const createSchema = z.object({
  name: z.string().min(1).max(200),
  goal: z.string().max(2000).optional(),
  toneOfVoiceId: z.string().uuid().optional(),
});

export async function GET() {
  try {
    const { db } = await requireUser();
    const { data, error } = await db
      .from("campaigns")
      .select(
        "id, name, goal, status, tone_of_voice_id, created_by, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ campaigns: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = createSchema.parse(await req.json());
    const { data, error } = await db
      .from("campaigns")
      .insert({
        name: body.name,
        goal: body.goal ?? null,
        tone_of_voice_id: body.toneOfVoiceId ?? null,
        status: "draft",
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
