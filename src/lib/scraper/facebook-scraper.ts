import { chromium } from "playwright";
import type { ScrapedProfile, RecentPost } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Scrape a public Facebook Page using Playwright headless browser.
 *
 * Facebook heavily protects its data and changes its DOM structure often.
 * Every field extraction is wrapped in a try-catch fallback so a missing
 * element never throws — we return whatever we managed to extract.
 *
 * Limitations: metrics visible without login (followers count, page info).
 * Likes/comments/shares per post are NOT visible without a logged-in session
 * and are therefore omitted here.
 */
export async function scrapeFacebookPage(profileUrl: string): Promise<ScrapedProfile> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "vi-VN",
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: { "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8" },
    });
    const page = await context.newPage();

    // Remove the webdriver flag
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Dismiss cookie consent / login prompts
    const dismissSelectors = [
      '[data-testid="cookie-policy-manage-dialog-accept-button"]',
      'button[title="Allow all cookies"]',
      'button[title="Accept all"]',
      '[aria-label="Close"]',
    ];
    for (const sel of dismissSelectors) {
      try {
        await page.click(sel, { timeout: 1500 });
      } catch {
        // ignore — not every page shows these
      }
    }

    await page.waitForTimeout(1500); // let JS settle

    const raw = await page.evaluate(() => {
      // ── Display name ─────────────────────────────────────────────────────────
      const displayName =
        document.querySelector("h1")?.textContent?.trim() ??
        (document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null)?.content ??
        "";

      // ── Description / bio ────────────────────────────────────────────────────
      const bio =
        (document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null)
          ?.content ?? "";

      // ── Avatar ───────────────────────────────────────────────────────────────
      const avatarUrl =
        (document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null)?.content ??
        undefined;

      // ── Followers count ───────────────────────────────────────────────────────
      // FB pages show "X người theo dõi" or "X followers" in various elements.
      let followersText = "";
      const candidates = [
        ...Array.from(document.querySelectorAll("a[href*='followers'] span")),
        ...Array.from(document.querySelectorAll("span, a, div")),
      ];
      for (const el of candidates) {
        const t = el.textContent?.trim() ?? "";
        if (
          (t.toLowerCase().includes("follower") || t.includes("người theo dõi")) &&
          t.length < 60 &&
          /\d/.test(t)
        ) {
          followersText = t;
          break;
        }
      }

      // ── Likes count ──────────────────────────────────────────────────────────
      let likesText = "";
      for (const el of Array.from(document.querySelectorAll("span, a, div"))) {
        const t = el.textContent?.trim() ?? "";
        if (
          (t.toLowerCase().includes("like") || t.includes("thích")) &&
          t.length < 60 &&
          /\d/.test(t)
        ) {
          likesText = t;
          break;
        }
      }

      return { displayName, bio, avatarUrl, followersText, likesText };
    });

    const followersCount = parseVietnameseNumber(raw.followersText);
    const username = extractUsername(profileUrl);

    const profile: ScrapedProfile = {
      platform: "facebook",
      username,
      displayName: raw.displayName || username,
      avatarUrl: raw.avatarUrl,
      followersCount,
      bio: raw.bio || undefined,
    };

    return profile;
  } finally {
    await browser.close();
  }
}

/** Parse Vietnamese-formatted numbers like "12.543" or "1,2 N" or "1.2K". */
function parseVietnameseNumber(text: string): number | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();

  // Extract the number portion (digits, dots, commas)
  const match = text.match(/[\d.,]+/);
  if (!match) return undefined;

  // Vietnamese: periods are thousands separators, commas are decimals
  // e.g. "12.543" = 12543, "1,2 N" or "1.2K" = 1200
  let numStr = match[0];
  // If we see a pattern like "12.543" (period as thousands sep), remove the period
  if (/\d{1,3}\.\d{3}/.test(numStr)) {
    numStr = numStr.replace(/\./g, "");
  } else {
    // Otherwise treat period as decimal separator
    numStr = numStr.replace(/,/g, ".");
  }

  const n = parseFloat(numStr);
  if (isNaN(n)) return undefined;

  if (lower.includes("k") || lower.includes("ng")) return Math.round(n * 1_000);
  if (lower.includes("m") || lower.includes("tr")) return Math.round(n * 1_000_000);
  return Math.round(n);
}

function extractUsername(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
    return parts[0] || url;
  } catch {
    return url;
  }
}

/** Dummy — Facebook public pages don't expose per-post metrics without login. */
function _makeRecentPosts(): RecentPost[] {
  return [];
}
void _makeRecentPosts; // suppress unused warning
