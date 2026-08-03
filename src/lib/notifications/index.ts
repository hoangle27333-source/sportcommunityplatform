import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTelegramMessage, TelegramTemplates } from './telegram';

export type NotificationType =
  | 'remix_completed'
  | 'remix_failed'
  | 'approval_needed'
  | 'auto_fix_ready'
  | 'feedback_received';

export interface NotifyInput {
  db: SupabaseClient;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  /** If user has telegram_chat_id configured, also send Telegram */
  telegramChatId?: string;
  telegramMessage?: { text: string; inlineButtonText?: string; inlineButtonUrl?: string };
}

/**
 * Create an in-app notification + optionally send Telegram.
 * Never throws — notification failure must not block the pipeline.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const { db, userId, type, title, body, link, metadata, telegramChatId, telegramMessage } = input;

  // 1. In-app notification (Supabase)
  try {
    await db.from('notifications').insert({
      user_id: userId,
      type,
      title,
      body: body ?? null,
      link: link ?? null,
      metadata: metadata ?? {},
    });
  } catch (err) {
    console.error('[notify] Failed to insert notification:', err);
  }

  // 2. Telegram (best effort)
  if (telegramChatId && telegramMessage) {
    void sendTelegramMessage({
      chatId: telegramChatId,
      text: telegramMessage.text,
      parseMode: 'HTML',
      inlineButtonText: telegramMessage.inlineButtonText,
      inlineButtonUrl: telegramMessage.inlineButtonUrl,
    });
  }
}

/**
 * Get telegram_chat_id for a user from their profile.
 * Returns null if not configured.
 */
export async function getUserTelegramChatId(
  db: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await db
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', userId)
    .maybeSingle<{ telegram_chat_id: string | null }>();
  return data?.telegram_chat_id ?? null;
}
