import { createClient } from "@supabase/supabase-js";
import type { Job } from "bullmq";
import { scrapeProfile } from "@/lib/scraper/scraper-adapter";

/**
 * BullMQ processor for the 'scrape-tracked-account' job.
 *
 * Job data: { trackedAccountId: string }
 *
 * Flow:
 * 1. Fetch account from DB
 * 2. Mark status = 'scraping'
 * 3. Run Playwright scraper
 * 4. Save scraped metrics back to tracked_accounts
 * 5. Insert a new snapshot row
 * 6. Mark status = 'active'
 * On error: set status = 'error' + error_message
 */

// Use service-role key so the worker can bypass RLS
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars for worker");
  return createClient(url, key, { auth: { persistSession: false } });
}

interface TrackedAccount {
  id: string;
  platform: "facebook" | "instagram";
  profile_url: string;
  followers_count: number | null;
}

export async function processScrapeTrackedAccount(job: Job): Promise<void> {
  const { trackedAccountId } = job.data as { trackedAccountId: string };
  const db = getAdminClient();

  // 1. Fetch account
  const { data: account, error: fetchError } = await db
    .from("tracked_accounts")
    .select("id, platform, profile_url, followers_count")
    .eq("id", trackedAccountId)
    .single();

  if (fetchError || !account) {
    throw new Error(`Tracked account ${trackedAccountId} not found`);
  }

  const row = account as TrackedAccount;

  // 2. Mark scraping
  await db
    .from("tracked_accounts")
    .update({ status: "scraping", updated_at: new Date().toISOString() })
    .eq("id", trackedAccountId);

  try {
    // 3. Scrape
    const profile = await scrapeProfile(row.platform, row.profile_url);

    // 4. Compute engagement rate from recent posts if possible
    let engagementRate: number | undefined;
    if (profile.recentPosts && profile.recentPosts.length > 0 && profile.followersCount) {
      const totalEng = profile.recentPosts.reduce(
        (s, p) => s + (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0),
        0,
      );
      engagementRate = parseFloat(
        ((totalEng / profile.recentPosts.length / profile.followersCount) * 100).toFixed(2),
      );
    } else if (profile.engagementRate) {
      engagementRate = profile.engagementRate;
    }

    const avgLikes = profile.avgLikes;
    const avgComments = profile.avgComments;
    const avgShares = profile.avgShares;
    const avgViews = profile.avgViews;

    // 5. Compute posts/week (rough: postsCount / 4 if unknown)
    const postsPerWeek: number | undefined = profile.postsPerWeek;

    // 6. Update tracked_accounts
    await db
      .from("tracked_accounts")
      .update({
        display_name: profile.displayName,
        avatar_url: profile.avatarUrl ?? null,
        followers_count: profile.followersCount ?? null,
        following_count: profile.followingCount ?? null,
        posts_count: profile.postsCount ?? null,
        bio: profile.bio ?? null,
        is_verified: profile.isVerified ?? false,
        engagement_rate: engagementRate ?? null,
        status: "active",
        last_scraped_at: new Date().toISOString(),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", trackedAccountId);

    // 7. Insert snapshot
    await db.from("tracked_account_snapshots").insert({
      tracked_account_id: trackedAccountId,
      followers_count: profile.followersCount ?? null,
      following_count: profile.followingCount ?? null,
      posts_count: profile.postsCount ?? null,
      avg_likes: avgLikes ?? null,
      avg_comments: avgComments ?? null,
      avg_shares: avgShares ?? null,
      avg_views: avgViews ?? null,
      engagement_rate: engagementRate ?? null,
      posts_per_week: postsPerWeek ?? null,
      top_hashtags: profile.topHashtags ?? null,
      recent_posts: profile.recentPosts ? JSON.stringify(profile.recentPosts) : null,
      captured_at: new Date().toISOString(),
    });
  } catch (err) {
    // On failure: mark error
    await db
      .from("tracked_accounts")
      .update({
        status: "error",
        error_message: (err as Error).message ?? "Unknown scrape error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", trackedAccountId);
    throw err; // rethrow so BullMQ retries
  }
}
