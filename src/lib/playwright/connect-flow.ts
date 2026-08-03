import { chromium } from "playwright";
import pino from "pino";
import { saveSession, isCheckpointUrl } from "./session-manager";

/**
 * Playwright visible-browser connect flow.
 *
 * Opens a non-headless Chrome window so the admin can log in to Facebook
 * manually. Once login is detected (URL changes away from login page),
 * cookies are captured, encrypted, and saved to the database.
 *
 * Workflow:
 *  1. API route POST /api/playwright/connect enqueues a 'connect' job
 *  2. The playwright worker calls runConnectFlow()
 *  3. Browser opens on admin's screen (PLAYWRIGHT_HEADLESS=false required)
 *  4. Admin logs in; flow detects success and saves cookies
 *  5. Status polling via GET /api/playwright/connect/status returns 'done'
 */

const logger = pino({ name: "playwright:connect" });

const FACEBOOK_HOME = "https://www.facebook.com";
const LOGIN_URL = "https://www.facebook.com/login";
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes timeout for admin to log in

export interface ConnectFlowResult {
  success: boolean;
  error?: string;
}

export async function runConnectFlow(
  accountId: string,
  accountName: string,
): Promise<ConnectFlowResult> {
  logger.info({ accountId, accountName }, "starting connect flow (visible browser)");

  const browser = await chromium.launch({
    headless: false, // MUST be visible so admin can log in
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: null, // use window size
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "vi-VN",
  });

  const page = await context.newPage();

  try {
    // Navigate to Facebook login
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

    logger.info({ accountId }, "waiting for admin to log in...");

    // Poll until navigated away from login page (max 5 min)
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const url = page.url();

      // Check for security checkpoint
      if (url.includes("/checkpoint/") || url.includes("two_factor")) {
        logger.warn({ accountId, url }, "security checkpoint encountered during connect");
        // Keep browser open so admin can resolve it
        continue;
      }

      // Successful login: redirected away from login page to home/feed
      if (
        !url.includes("/login") &&
        !url.includes("/recover") &&
        (url.startsWith(FACEBOOK_HOME) || url.includes("facebook.com"))
      ) {
        logger.info({ accountId, url }, "login detected, capturing cookies");
        break;
      }
    }

    if (Date.now() >= deadline) {
      await browser.close();
      return { success: false, error: "Login timeout (5 minutes)" };
    }

    // Wait a moment for all cookies to settle
    await new Promise((r) => setTimeout(r, 2000));

    // Capture all cookies
    const cookies = await context.cookies();
    const fbCookies = cookies.filter((c) => c.domain.includes("facebook.com"));

    if (fbCookies.length === 0) {
      await browser.close();
      return { success: false, error: "No Facebook cookies captured" };
    }

    // Save encrypted cookies to DB
    await saveSession(accountId, fbCookies);

    logger.info(
      { accountId, cookieCount: fbCookies.length },
      "cookies saved — connect flow complete",
    );

    await browser.close();
    return { success: true };
  } catch (err) {
    logger.error({ accountId, err }, "connect flow error");
    await browser.close().catch(() => {});
    return { success: false, error: (err as Error).message };
  }
}
