import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/playwright/connect/status?accountId=xxx
 *
 * Polls the session_status of an unofficial account after a connect flow.
 * Used by the UI to know when the admin has completed login.
 *
 * Returns: { status: "unknown"|"active"|"needs_relogin"|"checkpoint"|"banned" }
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data } = await db
    .from("social_accounts")
    .select("id, session_status, last_action_at, name")
    .eq("id", accountId)
    .single();

  if (!data) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({
    accountId: data.id,
    name: data.name,
    status: data.session_status ?? "unknown",
    lastActionAt: data.last_action_at ?? null,
  });
}
