import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueue, QUEUE_NAMES } from '@/lib/queue';
import { notify, getUserTelegramChatId } from '@/lib/notifications';
import { TelegramTemplates } from '@/lib/notifications/telegram';

/**
 * Khi reviewer reject job, tự động:
 * 1. Tạo auto-fix job mới link back to original
 * 2. Enqueue để worker xử lý với feedback làm context
 * 3. Notify creator rằng AI đang cố gắng tự sửa
 */
export async function triggerAutoFix(
  db: SupabaseClient,
  sourceJobId: string,
  feedback: string,
  reviewerId: string,
): Promise<{ fixJobId: string } | null> {
  // Load source job
  const { data: sourceJob } = await db
    .from('remix_jobs')
    .select('*')
    .eq('id', sourceJobId)
    .single();

  if (!sourceJob) return null;

  // Create auto-fix job clone with is_auto_fix=true
  const { data: fixJob, error } = await db
    .from('remix_jobs')
    .insert({
      source_type: sourceJob.source_type,
      source_url: sourceJob.source_url,
      source_media_id: sourceJob.source_media_id,
      ownership_confirmed: sourceJob.ownership_confirmed,
      output_kind: sourceJob.output_kind,
      prompt: sourceJob.prompt,
      options: sourceJob.options,
      preset_id: sourceJob.preset_id,
      campaign_id: sourceJob.campaign_id,
      status: 'queued',
      created_by: sourceJob.created_by,
      auto_fix_source_id: sourceJobId,
      is_auto_fix: true,
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !fixJob) return null;

  // Enqueue with feedback as context (worker uses it via runRemixJob feedback param)
  await enqueue(
    QUEUE_NAMES.remix,
    'run',
    { kind: 'run', remixJobId: fixJob.id, feedback },
    { jobId: `remix:${fixJob.id}:autofix` },
  );

  // Notify creator that auto-fix is in progress
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  if (sourceJob.created_by) {
    const chatId = await getUserTelegramChatId(db, sourceJob.created_by).catch(() => null);
    void notify({
      db,
      userId: sourceJob.created_by,
      type: 'auto_fix_ready',
      title: 'AI đang tự sửa video',
      body: `Reviewer đã gửi feedback. AI đang tự chỉnh và sẽ tạo phiên bản mới.`,
      link: `/remix?jobId=${fixJob.id}`,
      metadata: { fixJobId: fixJob.id, sourceJobId },
      telegramChatId: chatId ?? undefined,
      telegramMessage: TelegramTemplates.autoFixReady(sourceJobId, fixJob.id, appUrl),
    });
  }

  return { fixJobId: fixJob.id };
}
