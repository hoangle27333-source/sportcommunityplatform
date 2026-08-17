export interface ParsedProfileUrl {
  platform: "facebook" | "instagram";
  username: string;
  normalizedUrl: string;
}

/**
 * Parse a social media profile URL into a canonical form.
 *
 * Supported patterns:
 *   Facebook:
 *     https://facebook.com/pagename
 *     https://www.facebook.com/pagename
 *     https://fb.com/pagename
 *     https://facebook.com/profile.php?id=123456
 *   Instagram:
 *     https://instagram.com/username
 *     https://www.instagram.com/username/
 *     https://instagram.com/username?igsh=...
 *
 * Returns null for unrecognized or un-parseable URLs.
 */
export function parseProfileUrl(rawUrl: string): ParsedProfileUrl | null {
  const trimmed = rawUrl.trim();

  // Attempt to parse — prepend https:// if there's no scheme
  let urlToParse = trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    urlToParse = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlToParse);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  // ── Facebook ────────────────────────────────────────────────────────────────
  if (hostname === "facebook.com" || hostname === "fb.com" || hostname === "m.facebook.com") {
    // profile.php?id=<numeric_id>
    const profileId = parsed.searchParams.get("id");
    if (profileId) {
      return {
        platform: "facebook",
        username: profileId,
        normalizedUrl: `https://www.facebook.com/profile.php?id=${profileId}`,
      };
    }

    // /pagename (strip leading slash + trailing slash + query)
    const parts = parsed.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
    const username = parts[0];
    if (username && username !== "profile.php" && username.length > 0) {
      return {
        platform: "facebook",
        username,
        normalizedUrl: `https://www.facebook.com/${username}`,
      };
    }

    return null;
  }

  // ── Instagram ───────────────────────────────────────────────────────────────
  if (hostname === "instagram.com" || hostname === "instagr.am") {
    const parts = parsed.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
    const username = parts[0];
    if (username && username.length > 0 && !username.startsWith("p/") && !username.startsWith("reel/")) {
      return {
        platform: "instagram",
        username,
        normalizedUrl: `https://www.instagram.com/${username}/`,
      };
    }
    return null;
  }

  return null;
}
