import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/engagement/:id (SPEC §8)
 *   Body: { status: "skipped" }
 *   Marks an engagement item skipped (dismissed without replying). Editor+.
 *   RLS scopes which items the caller can update.
 */
const schema = z.object({
  status: z.enum(["skipped"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireEditor();
    const { id } = await params;
    const { status } = schema.parse(await req.json());

    const { error } = await db
      .from("engagement_items")
      .update({ status })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ id, status });
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
