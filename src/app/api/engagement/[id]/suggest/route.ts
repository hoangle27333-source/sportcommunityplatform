import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";
import type { EngagementJobData } from "@/worker/processors/engagement";

export const dynamic = "force-dynamic";

/**
 * POST /api/engagement/:id/suggest (SPEC §8)
 *   Enqueues an AI reply-suggestion job for one engagement item. Editor+.
 *   The suggestion is stored on the item; a human still reviews before sending.
 */
const schema = z.object({ sync: z.boolean().optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireEditor();
    const { id } = await params;
    schema.parse(await req.json().catch(() => ({})));

    const data: EngagementJobData = {
      kind: "suggest-reply",
      engagementItemId: id,
    };
    await enqueue(QUEUE_NAMES.engagement, "suggest-reply", data);

    return NextResponse.json({ enqueued: true });
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
