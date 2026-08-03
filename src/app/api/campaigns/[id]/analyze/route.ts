import { NextResponse, type NextRequest } from "next/server";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { QUEUE_NAMES, enqueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

/**
 * POST /api/campaigns/:id/analyze (SPEC §6 — AI Learning)
 *   Enqueues an async analyze-campaign job (reads metrics, writes ai_suggestions).
 *   Editor+ only. The heavy AI call runs in the content-gen worker, not inline.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireEditor();
    const { id } = await params;

    await enqueue(
      QUEUE_NAMES.contentGen,
      "analyze-campaign",
      { kind: "analyze-campaign", campaignId: id },
      { jobId: `analyze:${id}` },
    );

    return NextResponse.json({ enqueued: true, campaignId: id });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: (e as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}
