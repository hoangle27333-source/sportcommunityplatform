import { NextResponse, type NextRequest } from "next/server";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishPostNow, ScheduleError } from "@/lib/posts/schedule-post";

export const dynamic = "force-dynamic";

/**
 * POST /api/posts/:id/publish-now (SPEC §5)
 *   Enqueues immediate publish jobs (one per target). Editor+ only.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireEditor();
    const { id } = await params;

    const admin = createAdminClient();
    const result = await publishPostNow(db, admin, id);

    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AuthError || e instanceof ScheduleError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json(
    { error: (e as Error).message ?? "internal error" },
    { status: 500 },
  );
}
