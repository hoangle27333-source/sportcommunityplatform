import type { ScrapedProfile } from "./types";

/**
 * Route scraping to the correct platform adapter.
 */
export async function scrapeProfile(
  platform: "facebook" | "instagram",
  url: string,
): Promise<ScrapedProfile> {
  if (platform === "facebook") {
    const { scrapeFacebookPage } = await import("./facebook-scraper");
    return scrapeFacebookPage(url);
  }
  const { scrapeInstagramProfile } = await import("./instagram-scraper");
  return scrapeInstagramProfile(url);
}
