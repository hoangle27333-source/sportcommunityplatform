import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto/token-encryption";
import { graph, GraphApiError } from "@/lib/meta/client";
import { getAIProvider } from "@/lib/ai";

/**
 * Compliant engagement service (SPEC §8).
 *
 * Operates ONLY on Pages/IG accounts we own, via the official Graph API, with a
 * human-in-the-loop. There is NO fake-account / seeding path (compliance
 * guardrail, SPEC §0):
 *   - ingestComments()  : pull recent comments on our own published posts.
 *   - suggestReply()    : AI proposes a reply in the account's tone; NOT sent.
 *   - sendReply()       : a reviewer-approved reply is sent, then audited.
 *
 * Auto-send is opt-in per FAQ only and always leaves an audit trail (§8).
 */

interface AccountRow {
  id: string;
  platform: "facebook" | "instagram";
  access_token_enc: string;
  status: string;
}

interface EngagementRow {
  id: string;
  social_account_id: string;
  type: "comment" | "dm";
  external_id: string;
  message: string | null;
  suggested_reply: string | null;
  status: string;
}

export interface IngestResult {
  accountId: string;
  fetched: number;
  inserted: number;
}

/** Decrypt an account's token, or null if unusable. */
async function accountToken(
  db: SupabaseClient,
  accountId: string,
): Promise<{ platform: "facebook" | "instagram"; token: string } | null> {
  const { data, error } = await db
    .from("social_accounts")
    .select("id, platform, access_token_enc, status")
    .eq("id", accountId)
    .single<AccountRow>();
  if (error || !data || data.status === "revoked") return null;
  try {
    return { platform: data.platform, token: decryptSecret(data.access_token_enc) };
  } catch {
    return null;
  }
}

interface FbComment {
  id: string;
  message?: string;
  from?: { name?: string };
}

/**
 * Ingest recent comments on our own published posts for one account. Upserts
 * engagement_items (unique on social_account_id + external_id) so re-runs do
 * not duplicate. New items start in `pending` for human review.
 */
export async function ingestComments(
  db: SupabaseClient,
  accountId: string,
  opts: { limit?: number } = {},
): Promise<IngestResult> {
  const result: IngestResult = { accountId, fetched: 0, inserted: 0 };
  const account = await accountToken(db, accountId);
  if (!account) return result;

  // Our published targets on this account carry the external post/media ids.
  const { data: targets } = await db
    .from("post_targets")
    .select("external_post_id")
    .eq("social_account_id", accountId)
    .eq("status", "published")
    .not("external_post_id", "is", null)
    .limit(opts.limit ?? 50);

  const externalIds = (targets ?? [])
    .map((t) => t.external_post_id as string)
    .filter(Boolean);

  for (const externalId of externalIds) {
    try {
      const { data } = await graph.get<{ data?: FbComment[] }>(
        `${externalId}/comments`,
        {
          fields: "id,message,from",
          limit: "50",
          access_token: account.token,
        },
      );
      const comments = data.data ?? [];
      result.fetched += comments.length;

      for (const c of comments) {
        const { error } = await db.from("engagement_items").upsert(
          {
            social_account_id: accountId,
            type: "comment",
            external_id: c.id,
            message: c.message ?? null,
            status: "pending",
          },
          { onConflict: "social_account_id,external_id", ignoreDuplicates: true },
        );
        if (!error) result.inserted++;
      }
    } catch (e) {
      if (e instanceof GraphApiError && e.isAuthError) {
        await db
          .from("social_accounts")
          .update({ status: "expired" })
          .eq("id", accountId);
        break;
      }
      // Non-auth errors: skip this post, continue with the rest.
    }
  }

  return result;
}

/**
 * Generate an AI-suggested reply for one engagement item in the account's tone.
 * Persists suggested_reply but does NOT send — a reviewer must approve (§8).
 */
export async function suggestReply(
  db: SupabaseClient,
  engagementItemId: string,
): Promise<string | null> {
  const { data: item, error } = await db
    .from("engagement_items")
    .select("id, social_account_id, type, external_id, message, suggested_reply, status")
    .eq("id", engagementItemId)
    .single<EngagementRow>();
  if (error || !item || !item.message) return null;

  const tone = await accountTone(db, item.social_account_id);
  const ai = getAIProvider();
  const res = await ai.generateText({
    brief:
      `A ${item.type} on our page says: "${item.message}". ` +
      `Write ONE short, helpful, on-brand reply. No hashtags unless natural.`,
    tone,
    variants: 1,
    language: "vi",
  });

  const reply = res.variants[0]?.caption?.trim() ?? null;
  if (reply) {
    await db
      .from("engagement_items")
      .update({ suggested_reply: reply })
      .eq("id", engagementItemId);
  }
  return reply;
}

/**
 * Send a reviewer-approved reply to a comment/DM, then mark it sent and audit.
 * The reply text sent is whatever is stored (a reviewer may have edited it).
 */
export async function sendReply(
  db: SupabaseClient,
  engagementItemId: string,
  reviewerId: string,
  replyOverride?: string,
): Promise<{ sent: boolean; error?: string }> {
  const { data: item, error } = await db
    .from("engagement_items")
    .select("id, social_account_id, type, external_id, message, suggested_reply, status")
    .eq("id", engagementItemId)
    .single<EngagementRow>();
  if (error || !item) return { sent: false, error: "engagement item not found" };

  const reply = (replyOverride ?? item.suggested_reply ?? "").trim();
  if (!reply) return { sent: false, error: "no reply text" };

  const account = await accountToken(db, item.social_account_id);
  if (!account) return { sent: false, error: "account unavailable" };

  try {
    if (item.type === "comment") {
      // Reply to a comment = create a nested comment on it.
      await graph.post(
        `${item.external_id}/comments`,
        {},
        { message: reply, access_token: account.token },
      );
    } else {
      // DM reply via the messaging edge (respects Meta's 24h window, §8).
      await graph.post(
        `me/messages`,
        {},
        {
          recipient: JSON.stringify({ id: item.external_id }),
          message: JSON.stringify({ text: reply }),
          messaging_type: "RESPONSE",
          access_token: account.token,
        },
      );
    }

    await db
      .from("engagement_items")
      .update({
        status: "sent",
        suggested_reply: reply,
        reviewed_by: reviewerId,
        sent_at: new Date().toISOString(),
      })
      .eq("id", engagementItemId);

    await db.from("audit_log").insert({
      actor_id: reviewerId,
      action: "engagement.reply_sent",
      entity: "engagement_item",
      entity_id: engagementItemId,
      detail: { type: item.type },
    });

    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send failed";
    if (e instanceof GraphApiError && e.isAuthError) {
      await db
        .from("social_accounts")
        .update({ status: "expired" })
        .eq("id", item.social_account_id);
    }
    return { sent: false, error: msg };
  }
}

/** Load the tone-of-voice profile most relevant to an account (first configured). */
async function accountTone(
  db: SupabaseClient,
  _accountId: string,
): Promise<{ persona?: string; guidelines?: string; examples?: string[] } | undefined> {
  const { data } = await db
    .from("tone_of_voice")
    .select("persona, guidelines, examples")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ persona: string | null; guidelines: string | null; examples: string[] | null }>();
  if (!data) return undefined;
  return {
    persona: data.persona ?? undefined,
    guidelines: data.guidelines ?? undefined,
    examples: data.examples ?? undefined,
  };
}
