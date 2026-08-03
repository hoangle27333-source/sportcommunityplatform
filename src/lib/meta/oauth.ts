import crypto from "node:crypto";
import { GRAPH_API_BASE, META_OAUTH_SCOPES } from "./constants";

/**
 * Meta (Facebook) OAuth helper — official Graph API only (SPEC §5, R2.x).
 *
 * Flow:
 *   1. buildLoginUrl()          -> redirect user to Facebook Login (with CSRF state)
 *   2. exchangeCodeForToken()   -> short-lived user access token
 *   3. exchangeForLongLived()   -> ~60-day long-lived user token
 *   4. listManagedPages()       -> Pages the user administers + their tokens
 *   5. getInstagramForPage()    -> linked IG Business account, if any
 *
 * Page access tokens derived from a long-lived user token do not expire as
 * long as the user token is valid, which is what we persist (encrypted).
 */

const FB_LOGIN_BASE = "https://www.facebook.com";
const OAUTH_DIALOG_VERSION = "v25.0";

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export function loadMetaOAuthConfig(): MetaOAuthConfig {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID / META_APP_SECRET are not set.");
  }
  return {
    appId,
    appSecret,
    redirectUri: `${appUrl}/api/meta/callback`,
  };
}

/** Generate an opaque CSRF state token to round-trip through the OAuth dialog. */
export function generateOAuthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Build the Facebook Login dialog URL. */
export function buildLoginUrl(config: MetaOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
    response_type: "code",
    scope: META_OAUTH_SCOPES.join(","),
  });
  return `${FB_LOGIN_BASE}/${OAUTH_DIALOG_VERSION}/dialog/oauth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

/** Exchange an authorization code for a short-lived user access token. */
export async function exchangeCodeForToken(
  config: MetaOAuthConfig,
  code: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });
  const res = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`,
  );
  return handleTokenResponse(res);
}

/** Upgrade a short-lived token to a long-lived (~60 day) user token. */
export async function exchangeForLongLived(
  config: MetaOAuthConfig,
  shortLivedToken: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`,
  );
  return handleTokenResponse(res);
}

export interface ManagedPage {
  id: string;
  name: string;
  accessToken: string;
}

/** List Pages the authenticated user manages, with page-scoped tokens. */
export async function listManagedPages(
  userAccessToken: string,
): Promise<ManagedPage[]> {
  const params = new URLSearchParams({
    access_token: userAccessToken,
    fields: "id,name,access_token",
    limit: "200",
  });
  const res = await fetch(`${GRAPH_API_BASE}/me/accounts?${params.toString()}`);
  const json = (await res.json()) as {
    data?: Array<{ id: string; name: string; access_token: string }>;
    error?: { message: string };
  };
  if (json.error) throw new Error(`Graph API: ${json.error.message}`);
  return (json.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    accessToken: p.access_token,
  }));
}

export interface LinkedInstagram {
  igUserId: string;
  username?: string;
}

/** Return the IG Business account linked to a Page, if one exists. */
export async function getInstagramForPage(
  pageId: string,
  pageAccessToken: string,
): Promise<LinkedInstagram | null> {
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    fields: "instagram_business_account{id,username}",
  });
  const res = await fetch(`${GRAPH_API_BASE}/${pageId}?${params.toString()}`);
  const json = (await res.json()) as {
    instagram_business_account?: { id: string; username?: string };
    error?: { message: string };
  };
  if (json.error) throw new Error(`Graph API: ${json.error.message}`);
  const ig = json.instagram_business_account;
  if (!ig) return null;
  return { igUserId: ig.id, username: ig.username };
}

async function handleTokenResponse(res: Response): Promise<TokenResponse> {
  const json = (await res.json()) as TokenResponse & {
    error?: { message: string; type?: string; code?: number };
  };
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Meta OAuth token exchange failed: ${msg}`);
  }
  return json;
}
