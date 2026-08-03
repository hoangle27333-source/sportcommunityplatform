import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";

export const dynamic = "force-dynamic";

/**
 * Meta Webhook endpoint (SPEC §8 — real-time engagement ingest).
 *
 *   GET  — verification handshake. Meta sends hub.mode/hub.verify_token/
 *          hub.challenge; we echo the challenge iff the token matches
 *          META_WEBHOOK_VERIFY_TOKEN.
 *   POST — change notifications (feed comments, IG comments, messages). We
 *          verify the X-Hub-Signature-256 HMAC against META_WEBHOOK_APP_SECRET,
 *          upsert lightweight engagement_items, and enqueue AI suggest jobs.
 *
 * Compliance: this only receives events for Pages/IG accounts WE own and have
 * subscribed. No third-party data (SPEC §0). Payloads are treated as untrusted.
 */

// --- GET: verification handshake -------------------------------------------
export function GET(req: NextRequest) {
  const url = req.nextUrl;
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// --- POST: change notifications --------------------------------------------
interface WebhookChangeValue {
  item?: string; // "comment" | "reaction" | ...
  verb?: string; // "add" | "edit" | "remove"
  comment_id?: string;
  message?: string;
  post_id?: string;
  from?: { id?: string; name?: string };
}

interface WebhookEntry {
  id: string; // page id
  time?: number;
  changes?: Array<{ field: string; value: WebhookChangeValue }>;
  messaging?: Array<{
    sender?: { id?: string };
    message?: { mid?: string; text?: string };
  }>;
}

interface WebhookBody {
  object?: string;
  entry?: WebhookEntry[];
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  // 1. Verify HMAC signature (skip only if no secret configured, e.g. local dev).
  const appSecret = process.env.META_WEBHOOK_APP_SECRET;
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    if (!verifySignature(raw, sig, appSecret)) {
      return new NextResponse("invalid signature", { status: 401 });
    }
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return new NextResponse("bad payload", { status: 400 });
  }

  // 2. Ack fast — Meta retries on non-200. Do the work best-effort inline; for
  //    heavy volume this could enqueue and return immediately.
  try {
    await handleEntries(body);
  } catch {
    // Never fail the ack over a processing hiccup; the poll ingest is a backstop.
  }
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}

function verifySignature(raw: string, header: string, secret: string): boolean {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleEntries(body: WebhookBody): Promise<void> {
  if (!body.entry?.length) return;
  const db = createAdminClient();

  for (const entry of body.entry) {
    // Resolve which social_account this page/IG id maps to.
    const { data: account } = await db
      .from("social_accounts")
      .select("id")
      .eq("external_id", entry.id)
      .maybeSingle<{ id: string }>();

    // FB may key IG accounts by the backing page id; fall back to page_id.
    let accountId = account?.id;
    if (!accountId) {
      const { data: byPage } = await db
        .from("social_accounts")
        .select("id")
        .eq("page_id", entry.id)
        .maybeSingle<{ id: string }>();
      accountId = byPage?.id;
    }
    if (!accountId) continue; // not one of our accounts; ignore

    // Feed / IG comment changes.
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (v.item === "comment" && v.verb !== "remove" && v.comment_id) {
        await upsertAndSuggest(db, accountId, {
          externalId: v.comment_id,
          message: v.message ?? null,
        });
      }
    }

    // Messenger DMs.
    for (const m of entry.messaging ?? []) {
      const mid = m.message?.mid;
      const sender = m.sender?.id;
      if (mid && sender) {
        await upsertAndSuggest(db, accountId, {
          externalId: sender, // reply target is the sender (PSID)
          message: m.message?.text ?? null,
          type: "dm",
        });
      }
    }
  }
}

async function upsertAndSuggest(
  db: ReturnType<typeof createAdminClient>,
  accountId: string,
  item: { externalId: string; message: string | null; type?: "comment" | "dm" },
): Promise<void> {
  const { data: row } = await db
    .from("engagement_items")
    .upsert(
      {
        social_account_id: accountId,
        type: item.type ?? "comment",
        external_id: item.externalId,
        message: item.message,
        status: "pending",
      },
      { onConflict: "social_account_id,external_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle<{ id: string }>();

  // Enqueue an AI suggestion for newly-inserted items with a message body.
  if (row?.id && item.message) {
    await enqueue(QUEUE_NAMES.engagement, "suggest-reply", {
      kind: "suggest-reply",
      engagementItemId: row.id,
    });
  }
}
