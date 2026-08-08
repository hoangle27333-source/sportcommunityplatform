import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enqueue, QUEUE_NAMES } from '@/lib/queue';
import { notify, getUserTelegramChatId } from '@/lib/notifications';
import { TelegramTemplates } from '@/lib/notifications/telegram';
import {
  parseHeyGenWebhookPayload,
  getHeyGenJobStatus,
  downloadHeyGenSubtitleSrt,
} from '@/lib/remix/heygen';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/heygen
 *
 * Nhận callback từ HeyGen khi một Video Translate job hoàn tất.
 * HeyGen chỉ gửi signal (video_translation_id + event), KHÔNG có URL đầy đủ.
 * Chúng ta gọi GET /v3/video-translations/{id} để lấy video_url + subtitle_url.
 *
 * Flow:
 *   1. Parse + validate payload.
 *   2. Tìm remix_job theo heygen_job_id.
 *   3. Nếu failed → cập nhật status='failed', gửi notify.
 *   4. Nếu completed → tải SRT từ subtitle_url, enqueue 'heygen_continue' job.
 *   5. Trả 200 ngay cho HeyGen (không block).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Cannot read body' }, { status: 400 });
  }

  // Parse JSON body
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = parseHeyGenWebhookPayload(body);
  if (!parsed) {
    console.warn('[heygen-webhook] Payload không hợp lệ hoặc thiếu video_translation_id:', rawBody.slice(0, 300));
    // Trả 200 để HeyGen không retry vô tận với payload không hỗ trợ
    return NextResponse.json({ ok: true, warning: 'unrecognized payload' });
  }

  const { videoTranslationId, event } = parsed;
  console.log(`[heygen-webhook] Nhận event="${event}" cho videoTranslationId="${videoTranslationId}"`);

  const db = createAdminClient();

  // Tìm remix_job tương ứng
  const { data: job } = await db
    .from('remix_jobs')
    .select('id, status, created_by, plan, options')
    .eq('heygen_job_id', videoTranslationId)
    .maybeSingle<{
      id: string;
      status: string;
      created_by: string | null;
      plan: Record<string, unknown>;
      options: Record<string, unknown>;
    }>();

  if (!job) {
    console.warn(`[heygen-webhook] Không tìm thấy remix_job với heygen_job_id="${videoTranslationId}"`);
    return NextResponse.json({ ok: true, warning: 'job not found' });
  }

  const remixJobId = job.id;

  // Nếu job đã xử lý xong rồi (webhook đến 2 lần), bỏ qua
  if (job.status === 'review' || job.status === 'approved' || job.status === 'failed') {
    console.log(`[heygen-webhook] Job ${remixJobId} đã ở trạng thái "${job.status}", bỏ qua webhook.`);
    return NextResponse.json({ ok: true });
  }

  // Lấy trạng thái chính xác từ HeyGen API
  let heygenStatus: Awaited<ReturnType<typeof getHeyGenJobStatus>>;
  try {
    heygenStatus = await getHeyGenJobStatus(videoTranslationId);
  } catch (err) {
    console.error('[heygen-webhook] Không lấy được status từ HeyGen:', err);
    // Không block HeyGen bằng cách trả 5xx — trả 200 nhưng log lỗi
    return NextResponse.json({ ok: true, warning: 'failed to fetch heygen status' });
  }

  console.log(`[heygen-webhook] HeyGen job status="${heygenStatus.status}" videoUrl=${heygenStatus.videoUrl?.slice(0, 80)}`);

  // --- Trường hợp thất bại ---
  if (heygenStatus.status === 'failed') {
    const errMsg = heygenStatus.failureMessage ?? 'HeyGen Video Translate thất bại (không rõ lý do).';
    await db
      .from('remix_jobs')
      .update({
        status: 'failed',
        heygen_status: 'failed',
        error: errMsg,
      })
      .eq('id', remixJobId);

    // Notify user
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const chatId = job.created_by
      ? await getUserTelegramChatId(db, job.created_by).catch(() => null)
      : null;
    if (job.created_by) {
      void notify({
        db,
        userId: job.created_by,
        type: 'remix_failed',
        title: 'HeyGen Video Translate thất bại',
        body: errMsg,
        link: `/remix?jobId=${remixJobId}`,
        metadata: { jobId: remixJobId, error: errMsg },
        telegramChatId: chatId ?? undefined,
        telegramMessage: TelegramTemplates.remixFailed(remixJobId, errMsg, appUrl),
      });
    }

    return NextResponse.json({ ok: true });
  }

  // --- Trường hợp chưa completed (pending/running) ---
  if (heygenStatus.status !== 'completed') {
    // Cập nhật heygen_status để theo dõi, nhưng không làm gì thêm
    await db
      .from('remix_jobs')
      .update({ heygen_status: heygenStatus.status })
      .eq('id', remixJobId);
    return NextResponse.json({ ok: true });
  }

  // --- Trường hợp completed ---
  if (!heygenStatus.videoUrl) {
    console.error(`[heygen-webhook] HeyGen completed nhưng thiếu video_url cho job ${remixJobId}`);
    return NextResponse.json({ ok: true, warning: 'missing video_url' });
  }

  // Download SRT nếu có
  let captionSrt: string | undefined;
  if (heygenStatus.subtitleUrl) {
    captionSrt = await downloadHeyGenSubtitleSrt(heygenStatus.subtitleUrl);
    if (captionSrt) {
      console.log(`[heygen-webhook] Đã tải SRT (${captionSrt.length} chars) cho job ${remixJobId}`);
    }
  }

  // Cập nhật heygen_status và enqueue giai đoạn 2
  await db
    .from('remix_jobs')
    .update({ heygen_status: 'completed' })
    .eq('id', remixJobId);

  const bullJobId = `remix:${remixJobId}:heygen`;
  await enqueue(
    QUEUE_NAMES.remix,
    'heygen_continue',
    {
      kind: 'heygen_continue',
      remixJobId,
      heygenVideoUrl: heygenStatus.videoUrl,
      captionSrt,
    },
    { jobId: bullJobId },
  );

  console.log(`[heygen-webhook] Đã enqueue heygen_continue cho remix_job ${remixJobId}`);
  return NextResponse.json({ ok: true });
}
