import { chromium } from "playwright";
import type { ScrapedProfile, RecentPost } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Scrape a public Instagram profile using Playwright headless browser.
 *
 * Instagram embeds profile data in:
 * 1. <meta> tags (og:description = "X Followers, Y Following, Z Posts — ...")
 * 2. <script type="application/ld+json"> (Person schema)
 * 3. DOM elements (fallback)
 *
 * We try each strategy in order, accumulating fields as they become available.
 */
export async function scrapeInstagramProfile(profileUrl: string): Promise<ScrapedProfile> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "vi-VN",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Dismiss cookie consent
    try {
      await page.click('button:has-text("Allow all cookies")', { timeout: 2000 });
    } catch {
      /* ignore */
    }
    try {
      await page.click('button:has-text("Accept all")', { timeout: 1000 });
    } catch {
      /* ignore */
    }

    await page.waitForTimeout(1500);

    const raw = await page.evaluate(() => {
      // ── Meta tags ─────────────────────────────────────────────────────────────
      const ogDescription =
        (document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null)
          ?.content ?? "";
      const ogTitle =
        (document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null)?.content ??
        "";
      const ogImage =
        (document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null)?.content ??
        "";

      // og:description format: "X Followers, Y Following, Z Posts - See photos..."
      // or: "X người theo dõi, Y đang theo dõi, Z bài đăng - Xem ảnh..."
      const descParts = ogDescription.split("-")[0] ?? "";

      // ── JSON-LD schema ────────────────────────────────────────────────────────
      let jsonLdData: Record<string, unknown> = {};
      for (const script of Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      )) {
        try {
          const parsed = JSON.parse(script.textContent ?? "{}") as Record<string, unknown>;
          if ((parsed["@type"] as string) === "ProfilePage" || (parsed["@type"] as string) === "Person") {
            jsonLdData = parsed;
            break;
          }
        } catch {
          /* ignore malformed JSON */
        }
      }

      // ── Page title ────────────────────────────────────────────────────────────
      const pageTitle = document.title ?? "";

      return { ogDescription, descParts, ogTitle, ogImage, jsonLdData, pageTitle };
    });

    const username = extractUsername(profileUrl);
    const displayName = raw.ogTitle
      ? raw.ogTitle.replace(/\(@[^)]+\)/, "").replace("• Instagram", "").trim()
      : username;

    // Parse stats from og:description: "12,5K Followers, 234 Following, 87 Posts"
    const { followers, following, posts } = parseInstagramDescription(raw.descParts);

    // Recent posts — look for thumbnails in the grid
    const recentPosts = await scrapeRecentPosts(page);

    // Compute avg engagement from recent posts if available
    let avgLikes: number | undefined;
    let avgComments: number | undefined;
    if (recentPosts.length > 0) {
      const withLikes = recentPosts.filter((p) => p.likes != null);
      if (withLikes.length > 0) {
        avgLikes = withLikes.reduce((s, p) => s + (p.likes ?? 0), 0) / withLikes.length;
      }
      const withComments = recentPosts.filter((p) => p.comments != null);
      if (withComments.length > 0) {
        avgComments = withComments.reduce((s, p) => s + (p.comments ?? 0), 0) / withComments.length;
      }
    }

    const engagementRate =
      followers && avgLikes
        ? parseFloat((((avgLikes + (avgComments ?? 0)) / followers) * 100).toFixed(2))
        : undefined;

    return {
      platform: "instagram",
      username,
      displayName,
      avatarUrl: raw.ogImage || undefined,
      followersCount: followers,
      followingCount: following,
      postsCount: posts,
      engagementRate,
      avgLikes,
      avgComments,
      recentPosts: recentPosts.length > 0 ? recentPosts : undefined,
    };
  } finally {
    await browser.close();
  }
}

function parseInstagramDescription(desc: string): {
  followers?: number;
  following?: number;
  posts?: number;
} {
  const result: { followers?: number; following?: number; posts?: number } = {};

  // Match patterns like "12.5K Followers", "234 Following", "87 Posts"
  const followerMatch = desc.match(/([\d,.KkMm]+)\s+(?:Followers?|người theo dõi)/i);
  const followingMatch = desc.match(/([\d,.KkMm]+)\s+(?:Following|đang theo dõi)/i);
  const postsMatch = desc.match(/([\d,.KkMm]+)\s+(?:Posts?|bài đăng)/i);

  if (followerMatch) result.followers = parseNumber(followerMatch[1]);
  if (followingMatch) result.following = parseNumber(followingMatch[1]);
  if (postsMatch) result.posts = parseNumber(postsMatch[1]);

  return result;
}

function parseNumber(raw: string): number | undefined {
  const lower = raw.toLowerCase().replace(/,/g, ".");
  const match = lower.match(/[\d.]+/);
  if (!match) return undefined;
  const n = parseFloat(match[0]);
  if (isNaN(n)) return undefined;
  if (lower.includes("k")) return Math.round(n * 1_000);
  if (lower.includes("m")) return Math.round(n * 1_000_000);
  return Math.round(n);
}

function extractUsername(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, "").replace(/\/$/, "").split("/")[0] || url;
  } catch {
    return url;
  }
}

async function scrapeRecentPosts(
  page: import("playwright").Page,
): Promise<RecentPost[]> {
  try {
    // Instagram post thumbnails are in <article> elements
    const posts = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll("article"));
      return articles.slice(0, 12).map((article) => {
        const img = article.querySelector("img");
        const link = article.querySelector("a");
        return {
          url: link?.href ?? undefined,
          caption: img?.alt ?? undefined,
        };
      });
    });
    return posts as RecentPost[];
  } catch {
    return [];
  }
}
