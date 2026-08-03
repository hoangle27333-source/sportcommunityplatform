import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto/token-encryption";
import { GraphApiError } from "@/lib/meta/client";
import {
  publishFacebookFeed,
  publishFacebookPhoto,
  publishFacebookMultiPhoto,
  publishFacebookVideo,
  createIgImageContainer,
  createIgVideoContainer,
  createIgCarouselContainer,
  waitForIgContainer,
  publishIgContainer,
} from "@/lib/meta/publish";

/**
 * Core publish logic for one PostTarget (SPEC §5).
 *
 * Called by the publish worker. Given a target row (post + social account),
 * decrypts the token, publishes via the correct platform primitive, and writes
 * back externalPostId / status. Designed to be idempotent and per-target:
 *   - If externalPostId is already set, it is a no-op (dedupe).
 *   - A failure on one target never rolls back a sibling target.
 *   - Auth errors (expired token) mark the account needs_reauth and do NOT retry.
 *
 * Uses a service-role Supabase client (bypasses RLS) — this is system work.
 */

export interface PublishTargetInput {
  postTargetId: string;
}

interface PostTargetRow {
  id: string;
  post_id: string;
  social_account_id: string;
  external_post_id: string | null;
  status: string;
}

interface PostRow {
  id: string;
  caption: string | null;
  hashtags: string[] | null;
  cta: string | null;
  link: string | null;
}

interface SocialAccountRow {
  id: string;
  platform: "facebook" | "instagram";
  external_id: string;
  access_token_enc: string;
  status: string;
}

interface MediaRow {
  type: "image" | "video" | "banner";
  url: string;
  position: number | null;
}

/** Compose the final caption from caption + hashtags + cta. */
function composeCaption(post: PostRow): string {
  const parts: string[] = [];
  if (post.caption) parts.push(post.caption.trim());
  if (post.cta) parts.push(post.cta.trim());
  if (post.hashtags?.length) {
    parts.push(post.hashtags.map((h) => `#${h.replace(/^#+/, "")}`).join(" "));
  }
  return parts.filter(Boolean).join("\n\n");
}

export interface PublishOutcome {
  status: "published" | "failed" | "skipped";
  externalPostId?: string;
  error?: string;
  needsReauth?: boolean;
}

export async function publishTarget(
  db: SupabaseClient,
  input: PublishTargetInput,
): Promise<PublishOutcome> {
  // 1. Load the target
  const { data: target, error: targetErr } = await db
    .from("post_targets")
    .select("id, post_id, social_account_id, external_post_id, status")
    .eq("id", input.postTargetId)
    .single<PostTargetRow>();

  if (targetErr || !target) {
    return { status: "failed", error: `post_target not found: ${targetErr?.message}` };
  }

  // Idempotency: already published → skip (SPEC §9).
  if (target.external_post_id) {
    return { status: "skipped", externalPostId: target.external_post_id };
  }

  // 2. Load post + account + media in parallel
  const [{ data: post }, { data: account }, { data: media }] = await Promise.all([
    db
      .from("posts")
      .select("id, caption, hashtags, cta, link")
      .eq("id", target.post_id)
      .single<PostRow>(),
    db
      .from("social_accounts")
      .select("id, platform, external_id, access_token_enc, status")
      .eq("id", target.social_account_id)
      .single<SocialAccountRow>(),
    db
      .from("post_media")
      .select("position, media_assets!inner(type, url)")
      .eq("post_id", target.post_id),
  ]);

  if (!post) return await fail(db, target.id, "post not found");
  if (!account) return await fail(db, target.id, "social account not found");

  if (account.status === "revoked" || account.status === "expired") {
    return await fail(db, target.id, `account status=${account.status}`, true);
  }

  // Normalize joined media rows into a simple ordered list.
  const mediaRows: MediaRow[] = normalizeMedia(media);

  let token: string;
  try {
    token = decryptSecret(account.access_token_enc);
  } catch (e) {
    return await fail(db, target.id, `token decrypt failed: ${(e as Error).message}`);
  }

  const caption = composeCaption(post);

  // 3. Mark publishing
  await db.from("post_targets").update({ status: "publishing" }).eq("id", target.id);

  // 4. Publish per platform
  try {
    const externalId =
      account.platform === "facebook"
        ? await publishToFacebook(account.external_id, token, caption, post.link, mediaRows)
        : await publishToInstagram(account.external_id, token, caption, mediaRows);

    await db
      .from("post_targets")
      .update({ status: "published", external_post_id: externalId, error: null })
      .eq("id", target.id);

    return { status: "published", externalPostId: externalId };
  } catch (e) {
    const err = e as Error;
    const isAuth = err instanceof GraphApiError && err.isAuthError;
    if (isAuth) {
      await db
        .from("social_accounts")
        .update({ status: "expired" })
        .eq("id", account.id);
    }
    // Re-throw rate-limit errors so BullMQ retries with backoff.
    if (err instanceof GraphApiError && err.isRateLimit) {
      await db.from("post_targets").update({ status: "pending" }).eq("id", target.id);
      throw err;
    }
    return await fail(db, target.id, err.message, isAuth);
  }
}

async function fail(
  db: SupabaseClient,
  targetId: string,
  message: string,
  needsReauth = false,
): Promise<PublishOutcome> {
  await db
    .from("post_targets")
    .update({ status: "failed", error: message.slice(0, 1000) })
    .eq("id", targetId);
  return { status: "failed", error: message, needsReauth };
}

// ---------------------------------------------------------------------------
// Media normalization
// ---------------------------------------------------------------------------

interface JoinedMediaRow {
  position: number | null;
  media_assets: { type: "image" | "video" | "banner"; url: string } | null;
}

function normalizeMedia(rows: unknown): MediaRow[] {
  if (!Array.isArray(rows)) return [];
  return (rows as JoinedMediaRow[])
    .map((r) => {
      const asset = r.media_assets;
      if (!asset) return null;
      return { type: asset.type, url: asset.url, position: r.position };
    })
    .filter((m): m is MediaRow => m !== null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

// ---------------------------------------------------------------------------
// Platform dispatch
// ---------------------------------------------------------------------------

async function publishToFacebook(
  pageId: string,
  token: string,
  caption: string,
  link: string | null,
  media: MediaRow[],
): Promise<string> {
  const images = media.filter((m) => m.type === "image" || m.type === "banner");
  const videos = media.filter((m) => m.type === "video");

  if (videos.length > 0) {
    const res = await publishFacebookVideo(pageId, token, videos[0].url, caption);
    return res.id;
  }
  if (images.length > 1) {
    const res = await publishFacebookMultiPhoto(
      pageId,
      token,
      images.map((i) => i.url),
      caption,
    );
    return res.id;
  }
  if (images.length === 1) {
    const res = await publishFacebookPhoto(pageId, token, images[0].url, caption);
    return res.id;
  }
  const res = await publishFacebookFeed(pageId, token, caption, link ?? undefined);
  return res.id;
}

async function publishToInstagram(
  igUserId: string,
  token: string,
  caption: string,
  media: MediaRow[],
): Promise<string> {
  const images = media.filter((m) => m.type === "image" || m.type === "banner");
  const videos = media.filter((m) => m.type === "video");

  // IG requires at least one media item — no text-only posts.
  if (images.length === 0 && videos.length === 0) {
    throw new Error("Instagram requires at least one image or video");
  }

  const totalItems = images.length + videos.length;

  // Carousel: multiple media items.
  if (totalItems > 1) {
    const childIds: string[] = [];
    for (const img of images) {
      childIds.push(
        await createIgImageContainer(igUserId, token, img.url, undefined, true),
      );
    }
    for (const vid of videos) {
      const cid = await createIgVideoContainer(
        igUserId,
        token,
        vid.url,
        undefined,
        "VIDEO",
        true,
      );
      await waitForIgContainer(cid, token);
      childIds.push(cid);
    }
    const carousel = await createIgCarouselContainer(igUserId, token, childIds, caption);
    await waitForIgContainer(carousel, token);
    return await publishIgContainer(igUserId, token, carousel);
  }

  // Single video / reel.
  if (videos.length === 1) {
    const cid = await createIgVideoContainer(igUserId, token, videos[0].url, caption, "REELS");
    await waitForIgContainer(cid, token);
    return await publishIgContainer(igUserId, token, cid);
  }

  // Single image.
  const cid = await createIgImageContainer(igUserId, token, images[0].url, caption);
  await waitForIgContainer(cid, token);
  return await publishIgContainer(igUserId, token, cid);
}
