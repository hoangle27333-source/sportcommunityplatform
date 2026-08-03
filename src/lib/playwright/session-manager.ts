import { encryptSecret, decryptSecret } from "@/lib/crypto/token-encryption";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Cookie } from "playwright";

/**
 * Playwright session manager (unofficial channel connector).
 *
 * Handles storing, retrieving, and validating Facebook browser cookies
 * for unofficial account automation. Cookies are encrypted at rest using
 * the same AES-256-GCM scheme as Meta OAuth tokens.
 *
 * Session lifecycle:
 *   unknown → (connect flow) → active → (checkpoint detected) → needs_relogin
 *                                     → (expired/banned)      → banned
 */

export type SessionStatus =
  | "unknown"
  | "active"
  | "needs_relogin"
  | "checkpoint"
  | "banned";

export interface SessionInfo {
  accountId: string;
  status: SessionStatus;
  sessionExpiresAt: Date | null;
  lastActionAt: Date | null;
}

/** Save cookies for an account after successful login. */
export async function saveSession(
  accountId: string,
  cookies: Cookie[],
): Promise<void> {
  const db = createAdminClient();
  const cookieJson = JSON.stringify(cookies);
  const encrypted = encryptSecret(cookieJson);

  // Estimate session expiry from cookie max-age (Facebook session ~30–90 days).
  // Use the minimum expiry among fb cookies as conservative estimate.
  const fbCookies = cookies.filter(
    (c) => c.domain.includes("facebook.com") && c.expires > 0,
  );
  const minExpiry =
    fbCookies.length > 0
      ? Math.min(...fbCookies.map((c) => c.expires))
      : null;
  const sessionExpiresAt = minExpiry
    ? new Date(minExpiry * 1000).toISOString()
    : null;

  await db
    .from("social_accounts")
    .update({
      cookie_enc: encrypted,
      session_status: "active",
      session_expires_at: sessionExpiresAt,
    })
    .eq("id", accountId);
}

/** Load and decrypt cookies for an account. Returns null if no session. */
export async function loadSession(
  accountId: string,
): Promise<Cookie[] | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("social_accounts")
    .select("cookie_enc, session_status")
    .eq("id", accountId)
    .single();

  if (!data?.cookie_enc) return null;
  if (data.session_status === "banned") return null;

  try {
    const json = decryptSecret(data.cookie_enc);
    return JSON.parse(json) as Cookie[];
  } catch {
    return null;
  }
}

/** Mark account session as checkpoint/needs_relogin after detection. */
export async function markSessionStatus(
  accountId: string,
  status: Exclude<SessionStatus, "unknown">,
): Promise<void> {
  const db = createAdminClient();
  await db
    .from("social_accounts")
    .update({ session_status: status })
    .eq("id", accountId);
}

/** Update last_action_at timestamp after successful action. */
export async function touchLastAction(accountId: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("social_accounts")
    .update({ last_action_at: new Date().toISOString(), session_status: "active" })
    .eq("id", accountId);
}

/** Get session info for an account. */
export async function getSessionInfo(
  accountId: string,
): Promise<SessionInfo | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("social_accounts")
    .select("id, session_status, session_expires_at, last_action_at")
    .eq("id", accountId)
    .single();

  if (!data) return null;
  return {
    accountId: data.id,
    status: (data.session_status ?? "unknown") as SessionStatus,
    sessionExpiresAt: data.session_expires_at
      ? new Date(data.session_expires_at)
      : null,
    lastActionAt: data.last_action_at ? new Date(data.last_action_at) : null,
  };
}

/** Check if URL indicates a Facebook security checkpoint. */
export function isCheckpointUrl(url: string): boolean {
  return (
    url.includes("/checkpoint/") ||
    url.includes("/login/") ||
    url.includes("login?next=") ||
    url.includes("/recover/") ||
    url.includes("two_factor")
  );
}
