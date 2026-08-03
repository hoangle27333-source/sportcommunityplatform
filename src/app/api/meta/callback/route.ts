import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto/token-encryption";
import {
  exchangeCodeForToken,
  exchangeForLongLived,
  getInstagramForPage,
  listManagedPages,
  loadMetaOAuthConfig,
} from "@/lib/meta/oauth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "meta_oauth_state";

/**
 * GET /api/meta/callback — finish the Meta OAuth flow (admin only, R2.x).
 *
 * Verifies the CSRF state cookie, exchanges the code for a long-lived token,
 * enumerates managed Pages + linked IG Business accounts, and upserts each as
 * a social_account with its token ENCRYPTED at rest (SPEC §9). Writes go via
 * the service-role client (bypasses RLS) because social_accounts is admin-only.
 */
export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const errorRedirect = (reason: string) =>
    NextResponse.redirect(
      `${appUrl}/channels?error=${encodeURIComponent(reason)}`,
    );
  const okRedirect = (connected: number) =>
    NextResponse.redirect(
      `${appUrl}/channels?connected=${connected}`,
    );

  // 1. Auth + admin gate (defense in depth; RLS also guards the table).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorRedirect("unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return errorRedirect("forbidden");

  // 2. Handle explicit OAuth denial from Meta.
  const url = req.nextUrl;
  const oauthError = url.searchParams.get("error");
  if (oauthError) return errorRedirect(oauthError);

  // 3. Verify CSRF state.
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return errorRedirect("invalid_state");
  }

  try {
    const config = loadMetaOAuthConfig();

    // 4. code -> short-lived -> long-lived user token.
    const shortLived = await exchangeCodeForToken(config, code);
    const longLived = await exchangeForLongLived(
      config,
      shortLived.access_token,
    );
    const tokenExpiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : null;

    // 5. Enumerate managed Pages + linked IG accounts.
    const pages = await listManagedPages(longLived.access_token);
    if (pages.length === 0) return errorRedirect("no_pages");

    const admin = createAdminClient();
    let connected = 0;

    for (const page of pages) {
      // Facebook Page — page-scoped token, encrypted.
      const { error: fbErr } = await admin.from("social_accounts").upsert(
        {
          platform: "facebook",
          external_id: page.id,
          name: page.name,
          page_id: page.id,
          access_token_enc: encryptSecret(page.accessToken),
          token_expires_at: tokenExpiresAt,
          status: "active",
          connected_by: user.id,
        },
        { onConflict: "platform,external_id" },
      );
      if (fbErr) throw new Error(`persist FB page ${page.id}: ${fbErr.message}`);
      connected++;

      // Linked Instagram Business account, if any — reuses the page token.
      const ig = await getInstagramForPage(page.id, page.accessToken);
      if (ig) {
        const { error: igErr } = await admin.from("social_accounts").upsert(
          {
            platform: "instagram",
            external_id: ig.igUserId,
            name: ig.username ?? `IG @${ig.igUserId}`,
            page_id: page.id,
            access_token_enc: encryptSecret(page.accessToken),
            token_expires_at: tokenExpiresAt,
            status: "active",
            connected_by: user.id,
          },
          { onConflict: "platform,external_id" },
        );
        if (igErr) {
          throw new Error(`persist IG ${ig.igUserId}: ${igErr.message}`);
        }
        connected++;
      }
    }

    // 6. Audit the connection (no token values recorded).
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "meta.connect",
      entity: "social_account",
      detail: { pages: pages.length, accounts_connected: connected },
    });

    return okRedirect(connected);
  } catch (err) {
    return errorRedirect((err as Error).message.slice(0, 200));
  }
}
