import { graph, GraphApiError } from "./client";

/**
 * Meta publishing primitives (SPEC §5 — Auto-posting Engine).
 *
 * Facebook Page: photo / video / text feed posts.
 * Instagram Business: two-step container flow (create → publish), including
 * carousel and reels, with processing-status polling for video/reels.
 *
 * All functions take an already-decrypted page/IG access token. Callers are
 * responsible for decryption (never pass encrypted tokens here) and for
 * idempotency checks (skip if PostTarget.externalPostId already set).
 */

// ---------------------------------------------------------------------------
// Facebook Page
// ---------------------------------------------------------------------------

export interface FbPublishResult {
  id: string; // post id (or {page}_{post} form)
}

/** Publish a plain text / link post to a Page feed. */
export async function publishFacebookFeed(
  pageId: string,
  pageToken: string,
  message: string,
  link?: string,
): Promise<FbPublishResult> {
  const form: Record<string, string> = {
    message,
    access_token: pageToken,
  };
  if (link) form.link = link;
  const { data } = await graph.post<{ id: string }>(
    `${pageId}/feed`,
    {},
    form,
  );
  return { id: data.id };
}

/** Publish a single photo to a Page (published=true posts to feed). */
export async function publishFacebookPhoto(
  pageId: string,
  pageToken: string,
  imageUrl: string,
  caption?: string,
): Promise<FbPublishResult> {
  const form: Record<string, string> = {
    url: imageUrl,
    published: "true",
    access_token: pageToken,
  };
  if (caption) form.caption = caption;
  const { data } = await graph.post<{ id: string; post_id?: string }>(
    `${pageId}/photos`,
    {},
    form,
  );
  return { id: data.post_id ?? data.id };
}

/**
 * Upload multiple photos as unpublished, then attach to a single feed post
 * (Facebook multi-photo post). Returns the feed post id.
 */
export async function publishFacebookMultiPhoto(
  pageId: string,
  pageToken: string,
  imageUrls: string[],
  message?: string,
): Promise<FbPublishResult> {
  const mediaFbids: string[] = [];
  for (const url of imageUrls) {
    const { data } = await graph.post<{ id: string }>(
      `${pageId}/photos`,
      {},
      { url, published: "false", access_token: pageToken },
    );
    mediaFbids.push(data.id);
  }

  const form: Record<string, string> = { access_token: pageToken };
  if (message) form.message = message;
  mediaFbids.forEach((id, i) => {
    form[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });

  const { data } = await graph.post<{ id: string }>(
    `${pageId}/feed`,
    {},
    form,
  );
  return { id: data.id };
}

/** Publish a video to a Page. Returns the video id. */
export async function publishFacebookVideo(
  pageId: string,
  pageToken: string,
  videoUrl: string,
  description?: string,
): Promise<FbPublishResult> {
  const form: Record<string, string> = {
    file_url: videoUrl,
    access_token: pageToken,
  };
  if (description) form.description = description;
  const { data } = await graph.post<{ id: string }>(
    `${pageId}/videos`,
    {},
    form,
  );
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// Instagram Business (container flow)
// ---------------------------------------------------------------------------

export type IgMediaType = "IMAGE" | "VIDEO" | "REELS" | "CAROUSEL";

interface IgContainer {
  id: string;
}

/** Create an IG media container for a single image. */
export async function createIgImageContainer(
  igUserId: string,
  igToken: string,
  imageUrl: string,
  caption?: string,
  isCarouselItem = false,
): Promise<string> {
  const form: Record<string, string> = {
    image_url: imageUrl,
    access_token: igToken,
  };
  if (caption) form.caption = caption;
  if (isCarouselItem) form.is_carousel_item = "true";
  const { data } = await graph.post<IgContainer>(`${igUserId}/media`, {}, form);
  return data.id;
}

/** Create an IG container for a reel/video. Requires processing poll before publish. */
export async function createIgVideoContainer(
  igUserId: string,
  igToken: string,
  videoUrl: string,
  caption?: string,
  mediaType: "REELS" | "VIDEO" = "REELS",
  isCarouselItem = false,
): Promise<string> {
  const form: Record<string, string> = {
    media_type: mediaType,
    video_url: videoUrl,
    access_token: igToken,
  };
  if (caption) form.caption = caption;
  if (isCarouselItem) form.is_carousel_item = "true";
  const { data } = await graph.post<IgContainer>(`${igUserId}/media`, {}, form);
  return data.id;
}

/** Create a carousel container wrapping already-created child container ids. */
export async function createIgCarouselContainer(
  igUserId: string,
  igToken: string,
  childContainerIds: string[],
  caption?: string,
): Promise<string> {
  const form: Record<string, string> = {
    media_type: "CAROUSEL",
    children: childContainerIds.join(","),
    access_token: igToken,
  };
  if (caption) form.caption = caption;
  const { data } = await graph.post<IgContainer>(`${igUserId}/media`, {}, form);
  return data.id;
}

export type IgContainerStatus =
  | "EXPIRED"
  | "ERROR"
  | "FINISHED"
  | "IN_PROGRESS"
  | "PUBLISHED";

/** Poll a container's processing status (needed for video/reels/carousel). */
export async function getIgContainerStatus(
  containerId: string,
  igToken: string,
): Promise<IgContainerStatus> {
  const { data } = await graph.get<{ status_code: IgContainerStatus }>(
    containerId,
    { fields: "status_code", access_token: igToken },
  );
  return data.status_code;
}

/**
 * Wait until a container finishes processing. Throws on ERROR/EXPIRED or if it
 * does not finish within the timeout. Polls with a fixed interval.
 */
export async function waitForIgContainer(
  containerId: string,
  igToken: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const status = await getIgContainerStatus(containerId, igToken);
    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new GraphApiError(400, {
        message: `IG container ${containerId} status=${status}`,
      });
    }
    if (Date.now() > deadline) {
      throw new GraphApiError(408, {
        message: `IG container ${containerId} processing timed out`,
      });
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Publish a finished container. Returns the published IG media id. */
export async function publishIgContainer(
  igUserId: string,
  igToken: string,
  containerId: string,
): Promise<string> {
  const { data } = await graph.post<{ id: string }>(
    `${igUserId}/media_publish`,
    {},
    { creation_id: containerId, access_token: igToken },
  );
  return data.id;
}
