import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReply } from "@/lib/engagement/engagement";

export const dynamic = "force-dynamic";

/**
 * POST /api/engagement/:id/send (SPEC §8 — human-in-the-loop)
 *   Body: { reply?: string }   (override the stored suggestion if provided)
 *   Sends a reviewer-approved reply via the Graph API and audits it. Editor+.
 *   Uses the service-role client to read the encrypted account token; the
 *   reviewer's id is recorded as reviewed_by + in the audit log.
 */
const schema = z.object({
  reply: z.string().min(1).max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireEditor();
    const { id } = await params;
    const body = schema.parse(await req.json().catch(() => ({})));

    const admin = createAdminClient();
    const result = await sendReply(admin, id, user.id, body.reply);

    if (!result.sent) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json({ sent: true });
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
