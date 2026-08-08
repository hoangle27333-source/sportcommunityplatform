/**
 * HeyGen Video Translate API client.
 *
 * Endpoint: POST /v3/video-translations
 * Docs: https://docs.heygen.com/reference/create-video-translation
 *
 * Flow:
 *   1. submitHeyGenTranslateJob() → gửi video URL lên HeyGen, nhận video_translation_id.
 *   2. Khi HeyGen xử lý xong, POST webhook về callback_url với event 'video_translate.completed'.
 *   3. Webhook handler gọi getHeyGenJobStatus() để lấy video_url + subtitle_url chính xác.
 *
 * Giới hạn tích hợp:
 *   - Chỉ nhận video có tiếng nói (detect trước khi gửi để không tốn quota).
 *   - Giới hạn 5 phút (300s) theo plan cơ bản HeyGen.
 *   - Target language phải là tên đầy đủ theo HeyGen API, ví dụ: 'Vietnamese', 'English'.
 */

const HEYGEN_API_BASE = process.env.HEYGEN_API_BASE_URL ?? 'https://api.heygen.com';
const HEYGEN_MAX_DURATION_SEC = 300; // 5 phút — giới hạn plan cơ bản HeyGen

/** Map ISO-639-1 / targetLanguage nội bộ sang tên đầy đủ HeyGen API yêu cầu. */
const LANGUAGE_MAP: Record<string, string> = {
  vi: 'Vietnamese',
  en: 'English',
  vietnamese: 'Vietnamese',
  english: 'English',
};

function getApiKey(): string {
  const key = process.env.HEYGEN_API_KEY;
  if (!key || !key.trim()) {
    throw new Error('HEYGEN_API_KEY chưa được cấu hình trong environment.');
  }
  return key.trim();
}

function resolveTargetLanguage(lang?: string): string {
  if (!lang) return 'Vietnamese'; // default
  const normalized = lang.toLowerCase().trim();
  return LANGUAGE_MAP[normalized] ?? lang; // fallback về giá trị gốc nếu không map được
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HeyGenSubmitInput {
  /** URL công khai của video nguồn (Supabase Storage public URL). */
  videoUrl: string;
  /** Ngôn ngữ đích: 'vi' | 'en' | tên đầy đủ theo HeyGen API. */
  targetLanguage?: string;
  /** URL webhook để HeyGen callback khi xong. */
  callbackUrl?: string;
  /** Tiêu đề job, dùng để debug trên HeyGen dashboard. */
  title?: string;
  /**
   * Mode: 'speed' (nhanh, default) | 'precision' (chất lượng lip-sync cao hơn).
   * Dùng 'speed' mặc định để không tốn thêm thời gian xử lý.
   */
  mode?: 'speed' | 'precision';
}

export interface HeyGenSubmitResult {
  /** ID job trên HeyGen để poll status hoặc đối chiếu với webhook. */
  videoTranslationId: string;
}

export interface HeyGenJobStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** URL video đã dịch (chỉ có khi status='completed'). */
  videoUrl?: string;
  /** URL file SRT phụ đề (chỉ có khi enable_caption=true và status='completed'). */
  subtitleUrl?: string;
  /** Lý do thất bại (khi status='failed'). */
  failureMessage?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Kiểm tra trước khi gửi HeyGen để không tốn quota với video không hợp lệ.
 * Ném Error nếu video vi phạm giới hạn.
 */
export function validateVideoForHeyGen(durationSec: number, hasAudio: boolean): void {
  if (!hasAudio) {
    throw new Error(
      'Video không có âm thanh — HeyGen Video Translate yêu cầu video có giọng nói. ' +
      'Đổi sang dubMode khác hoặc chọn video có tiếng nói.',
    );
  }
  if (durationSec > HEYGEN_MAX_DURATION_SEC) {
    throw new Error(
      `Video quá dài (${Math.round(durationSec)}s). HeyGen giới hạn ${HEYGEN_MAX_DURATION_SEC}s (5 phút). ` +
      'Cắt bớt video hoặc dùng tính năng trim trước.',
    );
  }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Gửi video lên HeyGen để dịch giọng nói + lip-sync.
 * Trả về { videoTranslationId } để lưu vào remix_jobs.heygen_job_id.
 */
export async function submitHeyGenTranslateJob(
  input: HeyGenSubmitInput,
): Promise<HeyGenSubmitResult> {
  const apiKey = getApiKey();
  const targetLanguage = resolveTargetLanguage(input.targetLanguage);

  const body: Record<string, unknown> = {
    video: {
      type: 'url',
      url: input.videoUrl,
    },
    output_languages: [targetLanguage],
    mode: input.mode ?? 'speed',
    enable_caption: true, // Luôn bật để lấy SRT làm phụ đề
  };

  if (input.title) body.title = input.title;
  if (input.callbackUrl) body.callback_url = input.callbackUrl;

  const res = await fetch(`${HEYGEN_API_BASE}/v3/video-translations`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '(không đọc được response)');
    throw new Error(`HeyGen API trả lỗi ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json = await res.json() as Record<string, unknown>;
  const data = json.data as Record<string, unknown> | Array<Record<string, unknown>> | undefined;

  let videoTranslationId: string | undefined;

  if (data && !Array.isArray(data)) {
    // Trường hợp 1: { data: { video_translation_ids: ["abc-vi"] } } (chuẩn API HeyGen v3)
    const ids = data.video_translation_ids as string[] | undefined;
    if (Array.isArray(ids) && ids.length > 0 && typeof ids[0] === 'string') {
      videoTranslationId = ids[0];
    } else if (typeof data.video_translation_id === 'string') {
      videoTranslationId = data.video_translation_id;
    } else if (typeof data.id === 'string') {
      videoTranslationId = data.id;
    }
  } else if (Array.isArray(data) && data.length > 0) {
    // Trường hợp 2: { data: [{ video_translation_id: "..." }] }
    videoTranslationId = data[0]?.video_translation_id as string | undefined;
  }

  if (!videoTranslationId && typeof json.video_translation_id === 'string') {
    videoTranslationId = json.video_translation_id;
  }

  if (!videoTranslationId) {
    throw new Error(`HeyGen API không trả về video_translation_id. Response: ${JSON.stringify(json).slice(0, 300)}`);
  }

  return { videoTranslationId };
}

/**
 * Lấy trạng thái + kết quả của một HeyGen translation job.
 * Dùng sau khi nhận webhook để lấy video_url + subtitle_url chính xác.
 */
export async function getHeyGenJobStatus(videoTranslationId: string): Promise<HeyGenJobStatus> {
  const apiKey = getApiKey();

  const res = await fetch(
    `${HEYGEN_API_BASE}/v3/video-translations/${encodeURIComponent(videoTranslationId)}`,
    {
      headers: { 'x-api-key': apiKey },
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HeyGen GET status lỗi ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = await res.json() as Record<string, unknown>;
  const data = (json.data ?? json) as Record<string, unknown>;

  // Lấy kết quả của language đầu tiên (chúng ta chỉ gửi 1 language)
  const outputs = data.outputs as Array<Record<string, unknown>> | undefined;
  const firstOutput = Array.isArray(outputs) && outputs.length > 0 ? outputs[0] : undefined;

  const status = (data.status ?? firstOutput?.status) as string;
  const videoUrl = (firstOutput?.video_url ?? data.video_url) as string | undefined;
  const subtitleUrl = (firstOutput?.subtitle_url ?? data.srt_caption_url ?? data.subtitle_url) as string | undefined;
  const failureMessage = (data.failure_message ?? data.error_message) as string | undefined;

  return {
    status: status as HeyGenJobStatus['status'],
    videoUrl: videoUrl || undefined,
    subtitleUrl: subtitleUrl || undefined,
    failureMessage: failureMessage || undefined,
  };
}

/**
 * Tải phụ đề SRT trực tiếp bằng videoTranslationId từ HeyGen API.
 */
export async function downloadHeyGenSrtById(videoTranslationId: string): Promise<string | undefined> {
  const job = await getHeyGenJobStatus(videoTranslationId);
  if (!job.subtitleUrl) return undefined;
  return downloadHeyGenSubtitleSrt(job.subtitleUrl);
}

// ---------------------------------------------------------------------------
// Subtitle SRT download
// ---------------------------------------------------------------------------

/**
 * Download nội dung file SRT từ URL do HeyGen cung cấp.
 * Trả về chuỗi SRT hoặc undefined nếu download thất bại.
 */
export async function downloadHeyGenSubtitleSrt(subtitleUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(subtitleUrl);
    if (!res.ok) return undefined;
    const text = await res.text();
    return text.trim() || undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Webhook payload parser
// ---------------------------------------------------------------------------

export interface HeyGenWebhookPayload {
  /** ID job trên HeyGen, khớp với remix_jobs.heygen_job_id. */
  videoTranslationId: string;
  event: string;
}

/**
 * Parse payload webhook từ HeyGen.
 * HeyGen chỉ gửi signal (video_translation_id + event), không có URL đầy đủ.
 * Cần gọi getHeyGenJobStatus() sau để lấy video_url + subtitle_url.
 */
export function parseHeyGenWebhookPayload(body: unknown): HeyGenWebhookPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  // HeyGen có thể trả về dạng flat hoặc nested trong 'data'
  const data = (b.data ?? b) as Record<string, unknown>;
  const id = (
    data.video_translation_id ??
    b.video_translation_id ??
    data.id ??
    b.id
  ) as string | undefined;

  const event = (b.event ?? b.event_type ?? 'video_translate.completed') as string;

  if (!id) return null;
  return { videoTranslationId: id, event };
}
