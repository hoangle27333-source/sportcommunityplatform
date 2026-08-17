import { NextResponse, type NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/require-user";
import { QUEUE_NAMES, enqueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

/**
 * POST /api/tracked-accounts/[id]/scrape
 *
 * Trigger a manual re-scrape for a tracked account.
 * Updates status to 'scraping' and enqueues a BullMQ job.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireUser();
    const { id } = await params;

    // Mark as scraping
    const { error: updateError } = await db
      .from("tracked_accounts")
      .update({ status: "scraping", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Enqueue job
    const job = await enqueue(QUEUE_NAMES.playwright, "scrape-tracked-account", {
      trackedAccountId: id,
    });

    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
