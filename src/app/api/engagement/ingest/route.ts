import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import type { EngagementJobData } from "@/worker/processors/engagement";

export const dynamic = "force-dynamic";

/**
 * POST /api/engagement/ingest (SPEC §8)
 *   Body: { accountId: string, limit?: number }
 *   Enqueues a comment-ingest job for one account. Editor+.
 *   Ingest is polling; the webhook (/api/meta/webhook) covers real-time.
 *
 * One job = one account (the worker's ingestComments is per-account). To sweep
 * all accounts, the UI enqueues one request per connected account.
 */
const schema = z.object({
  accountId: z.string().uuid(),
  limit: z.number().int().min(1).max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireEditor();
    const body = schema.parse(await req.json());

    const data: EngagementJobData = {
      kind: "ingest-comments",
      socialAccountId: body.accountId,
      limit: body.limit,
    };
    await enqueue(QUEUE_NAMES.engagement, "ingest-comments", data);

    return NextResponse.json({ enqueued: true });
  } catch (e) {
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
}
