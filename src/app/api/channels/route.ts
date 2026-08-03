import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/channels (SPEC §5)
 *   Lists connected social accounts for use in the compose wizard's channel
 *   picker. social_accounts RLS is admin-only (it holds encrypted tokens), but
 *   editors need to see channel names to target a post at one. This route
 *   gates on requireUser() then reads via the service-role client, explicitly
 *   whitelisting non-secret columns only — access_token_enc is never selected.
 */
export async function GET() {
  try {
    await requireUser();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("social_accounts")
      .select("id, platform, name, external_id, status")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ accounts: data ?? [] });
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
