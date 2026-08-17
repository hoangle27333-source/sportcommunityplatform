import { scrapeFacebookPage } from "./facebook-scraper";
import { scrapeInstagramProfile } from "./instagram-scraper";
import type { ScrapedProfile } from "./types";

/**
 * Route scraping to the correct platform adapter.
 */
export async function scrapeProfile(
  platform: "facebook" | "instagram",
  url: string,
): Promise<ScrapedProfile> {
  if (platform === "facebook") return scrapeFacebookPage(url);
  return scrapeInstagramProfile(url);
}
