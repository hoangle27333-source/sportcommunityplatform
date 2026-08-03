/**
 * Meta Graph API constants.
 *
 * Per SPEC §5 and requirements R2.9: the Graph API version is pinned to a
 * SINGLE constant. Never build a Graph URL without a version segment.
 */

/** Pinned Graph API version. Bump deliberately, in one place. */
export const GRAPH_API_VERSION = "v25.0" as const;

export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}` as const;

/**
 * OAuth scopes required to connect a Page + linked IG Business account
 * (requirements R2.1). Requested at Facebook Login time.
 */
export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_read_user_content",
  "pages_manage_engagement",
  "read_insights",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_insights",
  "business_management",
] as const;

/**
 * Deprecated metric names Meta retired on 2026-06-15 (requirements R7.2).
 * The analytics ingest MUST NOT request any of these — they return errors.
 * Kept here as a guard list so we can assert against accidental use.
 */
export const DEPRECATED_META_METRICS = [
  "post_impressions",
  "post_impressions_unique",
  "post_impressions_paid",
  "post_impressions_paid_unique",
  "post_impressions_organic",
  "post_impressions_organic_unique",
  "post_impressions_viral",
  "post_impressions_viral_unique",
  "post_impressions_by_story_type",
  "post_video_views",
  "post_video_views_3s",
  "page_impressions",
  "page_impressions_unique",
] as const;

/** The date Meta switched to the new Views-based metric family. */
export const META_METRIC_CUTOVER_DATE = "2026-06-15" as const;

/** Current (post-cutover) metric family we DO request (requirements R7.2). */
export const POST_METRICS = [
  "post_total_media_view",
  "post_total_media_view_unique",
] as const;

export const PAGE_METRICS = [
  "page_total_media_view",
  "page_total_media_view_unique",
] as const;

/** Self-imposed publishing rate limits (requirements R6.9). */
export const IG_DAILY_PUBLISH_LIMIT = 100;
