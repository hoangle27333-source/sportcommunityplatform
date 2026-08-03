import { chromium, type BrowserContext, type Page } from "playwright";
import pino from "pino";
import {
  loadSession,
  saveSession,
  markSessionStatus,
  touchLastAction,
  isCheckpointUrl,
} from "./session-manager";

/**
 * Playwright browser actions for unofficial Facebook automation.
 *
 * Each action:
 *  1. Loads encrypted cookies for the account
 *  2. Launches a headless Chromium browser with those cookies
 *  3. Performs the action (post / comment / react / share)
 *  4. Detects checkpoint/session errors and updates status accordingly
 *  5. Closes the browser
 *
 * concurrency = 1 in the BullMQ worker, so only one browser instance
 * runs at a time (saves RAM on shared VPS).
 */

const logger = pino({ name: "playwright:actions" });

const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== "false";
const FB_BASE = "https://www.facebook.com";

// Randomized delay between actions to reduce detection risk.
const jitter = (min = 1500, max = 4000) =>
  new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

async function launchContext(accountId: string): Promise<{
  context: BrowserContext;
  page: Page;
} | null> {
  const cookies = await loadSession(accountId);
  if (!cookies) {
    logger.warn({ accountId }, "no session cookies found");
    return null;
  }

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "vi-VN",
  });

  await context.addCookies(cookies);
  const page = await context.newPage();
  return { context, page };
}

async function checkAndClose(
  accountId: string,
  page: Page,
  context: BrowserContext,
): Promise<boolean> {
  const url = page.url();
  if (isCheckpointUrl(url)) {
    logger.warn({ accountId, url }, "checkpoint detected");
    await markSessionStatus(accountId, "checkpoint");
    await context.browser()?.close();
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Action: Post (text + optional images)
// ---------------------------------------------------------------------------

export interface PostActionInput {
  accountId: string;
  caption: string;
  mediaUrls?: string[];
  groupId?: string; // đăng vào group thay vì profile/page
}

export async function actionPost(input: PostActionInput): Promise<string | null> {
  const { accountId, caption, groupId } = input;
  const session = await launchContext(accountId);
  if (!session) return null;
  const { context, page } = session;

  try {
    const targetUrl = groupId
      ? `${FB_BASE}/groups/${groupId}`
      : FB_BASE;

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await jitter();

    if (!(await checkAndClose(accountId, page, context))) return null;

    // Click vào ô "Bạn đang nghĩ gì?" / "What's on your mind?"
    const createPostBtn = page.locator(
      '[aria-label*="Bạn đang nghĩ gì"], [aria-label*="What\'s on your mind"], [placeholder*="Bạn đang nghĩ gì"]',
    );
    await createPostBtn.first().click({ timeout: 15_000 });
    await jitter(500, 1500);

    // Gõ nội dung
    const textArea = page.locator('[contenteditable="true"]').first();
    await textArea.fill(caption);
    await jitter(800, 2000);

    // Bấm nút Đăng / Post
    const postBtn = page.locator(
      '[aria-label="Đăng"], [aria-label="Post"], button:has-text("Đăng"), button:has-text("Post")',
    );
    await postBtn.first().click({ timeout: 10_000 });
    await jitter(3000, 6000);

    if (!(await checkAndClose(accountId, page, context))) return null;

    // Lấy URL bài vừa đăng (thường navigate đến bài sau khi post)
    const postUrl = page.url().includes("/posts/") ? page.url() : null;

    await touchLastAction(accountId);
    logger.info({ accountId, postUrl }, "post action completed");
    return postUrl;
  } catch (err) {
    logger.error({ accountId, err }, "post action failed");
    return null;
  } finally {
    await context.browser()?.close();
  }
}

// ---------------------------------------------------------------------------
// Action: Comment
// ---------------------------------------------------------------------------

export interface CommentActionInput {
  accountId: string;
  targetPostUrl: string;
  commentText: string;
}

export async function actionComment(input: CommentActionInput): Promise<boolean> {
  const { accountId, targetPostUrl, commentText } = input;
  const session = await launchContext(accountId);
  if (!session) return false;
  const { context, page } = session;

  try {
    await page.goto(targetPostUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await jitter();

    if (!(await checkAndClose(accountId, page, context))) return false;

    // Click vào ô comment
    const commentBox = page.locator(
      '[placeholder*="Viết bình luận"], [placeholder*="Write a comment"], [aria-label*="comment"]',
    );
    await commentBox.first().click({ timeout: 15_000 });
    await jitter(500, 1200);

    await page.keyboard.type(commentText, { delay: 30 });
    await jitter(500, 1000);

    await page.keyboard.press("Enter");
    await jitter(2000, 4000);

    if (!(await checkAndClose(accountId, page, context))) return false;

    await touchLastAction(accountId);
    logger.info({ accountId, targetPostUrl }, "comment action completed");
    return true;
  } catch (err) {
    logger.error({ accountId, targetPostUrl, err }, "comment action failed");
    return false;
  } finally {
    await context.browser()?.close();
  }
}

// ---------------------------------------------------------------------------
// Action: React (like / love / etc.)
// ---------------------------------------------------------------------------

export interface ReactActionInput {
  accountId: string;
  targetPostUrl: string;
  reaction: "like" | "love" | "haha" | "wow" | "sad" | "angry";
}

export async function actionReact(input: ReactActionInput): Promise<boolean> {
  const { accountId, targetPostUrl, reaction } = input;
  const session = await launchContext(accountId);
  if (!session) return false;
  const { context, page } = session;

  try {
    await page.goto(targetPostUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await jitter();

    if (!(await checkAndClose(accountId, page, context))) return false;

    const likeBtn = page.locator(
      '[aria-label="Thích"], [aria-label="Like"], [data-testid="like_action_link"]',
    );

    if (reaction === "like") {
      await likeBtn.first().click({ timeout: 10_000 });
    } else {
      // Hover để mở reaction bar
      await likeBtn.first().hover({ timeout: 10_000 });
      await jitter(1000, 2000);
      const reactionLabel = {
        love: "Yêu thích",
        haha: "Haha",
        wow: "Wow",
        sad: "Buồn",
        angry: "Phẫn nộ",
      }[reaction] ?? reaction;
      await page
        .locator(`[aria-label="${reactionLabel}"]`)
        .first()
        .click({ timeout: 8_000 });
    }

    await jitter(1500, 3000);
    if (!(await checkAndClose(accountId, page, context))) return false;

    await touchLastAction(accountId);
    logger.info({ accountId, targetPostUrl, reaction }, "react action completed");
    return true;
  } catch (err) {
    logger.error({ accountId, targetPostUrl, err }, "react action failed");
    return false;
  } finally {
    await context.browser()?.close();
  }
}

// ---------------------------------------------------------------------------
// Action: Share
// ---------------------------------------------------------------------------

export interface ShareActionInput {
  accountId: string;
  targetPostUrl: string;
  shareCaption?: string;
}

export async function actionShare(input: ShareActionInput): Promise<boolean> {
  const { accountId, targetPostUrl, shareCaption } = input;
  const session = await launchContext(accountId);
  if (!session) return false;
  const { context, page } = session;

  try {
    await page.goto(targetPostUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await jitter();

    if (!(await checkAndClose(accountId, page, context))) return false;

    // Click nút Chia sẻ / Share
    const shareBtn = page.locator(
      '[aria-label="Chia sẻ"], [aria-label="Share"]',
    );
    await shareBtn.first().click({ timeout: 10_000 });
    await jitter(1000, 2000);

    // Chọn "Chia sẻ ngay" hoặc nhập caption rồi chia sẻ
    if (shareCaption) {
      const captionBox = page.locator('[contenteditable="true"]').first();
      await captionBox.fill(shareCaption);
      await jitter(500, 1000);
    }

    const confirmBtn = page.locator(
      'button:has-text("Đăng"), button:has-text("Post"), [aria-label="Chia sẻ ngay"], [aria-label="Share now"]',
    );
    await confirmBtn.first().click({ timeout: 10_000 });
    await jitter(2000, 4000);

    if (!(await checkAndClose(accountId, page, context))) return false;

    await touchLastAction(accountId);
    logger.info({ accountId, targetPostUrl }, "share action completed");
    return true;
  } catch (err) {
    logger.error({ accountId, targetPostUrl, err }, "share action failed");
    return false;
  } finally {
    await context.browser()?.close();
  }
}
