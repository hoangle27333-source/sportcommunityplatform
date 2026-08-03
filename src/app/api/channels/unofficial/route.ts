import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET  /api/channels/unofficial — list all unofficial accounts (with session fields)
 * POST /api/channels/unofficial — create a new unofficial account record
 */

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("social_accounts")
    .select(
      "id, name, platform, fb_target_type, session_status, last_action_at, session_expires_at",
    )
    .eq("channel_type", "unofficial")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: data ?? [] });
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { name, platform, fbTargetType } = body as {
    name?: string;
    platform?: string;
    fbTargetType?: "page" | "profile" | "group";
  };

  if (!name || !platform) {
    return NextResponse.json({ error: "name và platform là bắt buộc" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("social_accounts")
    .insert({
      name,
      platform: platform as "facebook" | "instagram",
      external_id: `unofficial-${Date.now()}`, // placeholder, not used by Playwright
      channel_type: "unofficial",
      fb_target_type: fbTargetType ?? "profile",
      session_status: "unknown",
      status: "active", // legacy field
      access_token_enc: "", // unused for unofficial accounts
    })
    .select("id, name, platform, session_status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data }, { status: 201 });
}
