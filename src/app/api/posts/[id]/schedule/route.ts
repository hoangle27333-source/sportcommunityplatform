import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { schedulePost, ScheduleError } from "@/lib/posts/schedule-post";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/posts/:id/schedule (SPEC §5)
 *   Body: { runAt: ISO-8601 }
 *   Schedules the post for future publishing and fans out delayed publish jobs
 *   (one per target). Editor+ only; RLS scopes which posts are visible.
 */

const scheduleSchema = z.object({
  runAt: z.string().datetime({ offset: true }),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireEditor();
    const { id } = await params;
    const { runAt } = scheduleSchema.parse(await req.json());

    const admin = createAdminClient();
    const result = await schedulePost(db, admin, id, new Date(runAt));

    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AuthError || e instanceof ScheduleError) {
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
