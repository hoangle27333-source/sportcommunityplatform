import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  buildLoginUrl,
  generateOAuthState,
  loadMetaOAuthConfig,
} from "@/lib/meta/oauth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "meta_oauth_state";

/**
 * GET /api/meta/connect — start the Meta OAuth flow (admin only, R2.1).
 * Sets a signed, http-only CSRF state cookie and redirects to Facebook Login.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Enforce admin at the app layer; RLS also guards social_accounts writes.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let config;
  try {
    config = loadMetaOAuthConfig();
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }

  const state = generateOAuthState();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return NextResponse.redirect(buildLoginUrl(config, state));
}
