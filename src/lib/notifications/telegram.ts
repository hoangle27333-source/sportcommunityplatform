/**
 * Telegram Bot notification service.
 * Config: TELEGRAM_BOT_TOKEN env var.
 * User must set their telegram_chat_id in profile or via /start command.
 *
 * Cost: FREE (Telegram Bot API has no charge).
 */

export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  /** URL button below message */
  inlineButtonUrl?: string;
  inlineButtonText?: string;
}

/**
 * Send a message via Telegram Bot API.
 * Returns true on success, false if token not configured or send failed.
 * Never throws — notification failure must not crash the main pipeline.
 */
export async function sendTelegramMessage(msg: TelegramMessage): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  const replyMarkup = msg.inlineButtonUrl
    ? {
        inline_keyboard: [[
          { text: msg.inlineButtonText ?? 'Xem chi tiết', url: msg.inlineButtonUrl }
        ]]
      }
    : undefined;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: msg.chatId,
        text: msg.text,
        parse_mode: msg.parseMode ?? 'HTML',
        reply_markup: replyMarkup,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Pre-built notification templates.
 */
export const TelegramTemplates = {
  remixCompleted: (jobId: string, appUrl: string) => ({
    text: `✅ <b>Video đã xử lý xong!</b>\n\nJob ID: <code>${jobId}</code>\nVideo của bạn đã sẵn sàng để xem và duyệt.`,
    inlineButtonText: '🎥 Xem video',
    inlineButtonUrl: `${appUrl}/remix?jobId=${jobId}`,
  }),
  remixFailed: (jobId: string, error: string, appUrl: string) => ({
    text: `❌ <b>Xử lý video thất bại</b>\n\nJob ID: <code>${jobId}</code>\nLỗi: ${error.slice(0, 200)}`,
    inlineButtonText: '🔄 Thử lại',
    inlineButtonUrl: `${appUrl}/remix?jobId=${jobId}`,
  }),
  approvalNeeded: (jobId: string, appUrl: string) => ({
    text: `👀 <b>Có video cần duyệt!</b>\n\nMột video mới đã được xử lý và đang chờ duyệt.`,
    inlineButtonText: '✅ Duyệt ngay',
    inlineButtonUrl: `${appUrl}/remix?jobId=${jobId}`,
  }),
  autoFixReady: (originalJobId: string, fixJobId: string, appUrl: string) => ({
    text: `🤖 <b>AI đã tự sửa xong!</b>\n\nPhiên bản tự sửa dựa trên feedback của bạn đã sẵn sàng.`,
    inlineButtonText: '👁️ So sánh 2 phiên bản',
    inlineButtonUrl: `${appUrl}/remix?jobId=${fixJobId}`,
  }),
};
