import { NextResponse, type NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/engagement (SPEC §8 — engagement inbox)
 *   ?status=pending|approved|sent|skipped   filter (default pending)
 *   ?accountId=...                           scope to one account
 *
 * Read-only list of engagement items for the review queue. Any authenticated
 * user may read; sending is gated separately (community manager / editor+).
 */
export async function GET(req: NextRequest) {
  try {
    const { db } = await requireUser();
    const status = req.nextUrl.searchParams.get("status") ?? "pending";
    const accountId = req.nextUrl.searchParams.get("accountId");

    let query = db
      .from("engagement_items")
      .select(
        "id, social_account_id, type, external_id, message, suggested_reply, status, reviewed_by, sent_at, created_at",
      )
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(200);

    if (accountId) query = query.eq("social_account_id", accountId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data });
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
