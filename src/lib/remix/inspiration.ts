/**
 * Phân tích bài tham khảo (chế độ `inspiration`).
 *
 * Ranh giới tuân thủ (SPEC §0): KHÔNG tải video/ảnh của bên thứ ba, KHÔNG scrape
 * HTML. Chỉ dùng:
 *   1. oEmbed công khai chính thức (YouTube, TikTok) — endpoint được nhà cung cấp
 *      mở cho mục đích nhúng, không cần token, không phải scraping.
 *   2. Mô tả do chính người dùng nhập (họ đã xem bài đó).
 *
 * Đầu ra là "công thức" (hook, cấu trúc, nhịp, lý do hiệu quả) để áp vào nội
 * dung MỚI của mình — không phải bản sao của bài gốc.
 */

import { getAIProvider } from "@/lib/ai";

export type SocialPlatformHint =
  | "youtube"
  | "tiktok"
  | "facebook"
  | "instagram"
  | "unknown";

/** Nhận diện nền tảng từ URL để chọn cách lấy metadata. */
export function detectPlatform(url: string): SocialPlatformHint {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
  if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
  if (host.endsWith("tiktok.com")) return "tiktok";
  if (host.endsWith("facebook.com") || host === "fb.watch") return "facebook";
  if (host.endsWith("instagram.com")) return "instagram";
  return "unknown";
}

export interface PublicMetadata {
  platform: SocialPlatformHint;
  title?: string;
  authorName?: string;
  /** Nguồn metadata: 'oembed' | 'none' — minh bạch để hiện cho người dùng. */
  source: "oembed" | "none";
}

const OEMBED_TIMEOUT_MS = 8000;

/**
 * Lấy metadata công khai qua oEmbed chính thức. Chỉ YouTube & TikTok có endpoint
 * mở không cần token; Facebook/Instagram yêu cầu App token (oEmbed Read) nên ta
 * không gọi và để người dùng tự mô tả.
 */
export async function fetchPublicMetadata(url: string): Promise<PublicMetadata> {
  const platform = detectPlatform(url);

  const endpoint =
    platform === "youtube"
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      : platform === "tiktok"
        ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
        : null;

  if (!endpoint) return { platform, source: "none" };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OEMBED_TIMEOUT_MS);
    const res = await fetch(endpoint, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { platform, source: "none" };

    const json = (await res.json()) as {
      title?: string;
      author_name?: string;
    };
    return {
      platform,
      title: json.title,
      authorName: json.author_name,
      source: "oembed",
    };
  } catch {
    // Không lấy được metadata không phải lỗi — chỉ là ít ngữ cảnh hơn.
    return { platform, source: "none" };
  }
}

export interface InspirationAnalysis {
  /** Công thức đúc kết, dùng làm ngữ cảnh cho planner. */
  formula: string;
  /** Các điểm cụ thể để áp dụng. */
  takeaways: string[];
  /** Gợi ý hook mở đầu cho nội dung mới. */
  suggestedHooks: string[];
  warnings: string[];
}

interface RawAnalysis {
  formula?: string;
  takeaways?: unknown;
  suggestedHooks?: unknown;
  warnings?: unknown;
}

export interface AnalyzeInspirationInput {
  url: string;
  /** Người dùng tự mô tả bài đó (quan trọng nhất — họ đã xem). */
  userDescription?: string;
  /** Ngành/ngữ cảnh thương hiệu để công thức áp được. */
  brandContext?: string;
}

/**
 * Đúc kết công thức từ bài tham khảo. Nếu không có cả metadata lẫn mô tả của
 * người dùng thì trả về cảnh báo rõ ràng thay vì bịa ra phân tích.
 */
export async function analyzeInspiration(
  input: AnalyzeInspirationInput,
): Promise<InspirationAnalysis> {
  const meta = await fetchPublicMetadata(input.url);
  const hasContext = Boolean(
    input.userDescription?.trim() || meta.title || meta.authorName,
  );

  if (!hasContext) {
    return {
      formula: "",
      takeaways: [],
      suggestedHooks: [],
      warnings: [
        `Không lấy được thông tin công khai từ link này (${meta.platform}). ` +
          "Hãy mô tả ngắn nội dung bài đó (hook mở đầu, cấu trúc, vì sao bạn thấy hay) để hệ thống đúc kết công thức.",
      ],
    };
  }

  const prompt = buildInspirationPrompt(input, meta);

  try {
    const ai = getAIProvider();
    const res = await ai.completeJson<RawAnalysis>(prompt);
    const raw = res.data;

    return {
      formula: typeof raw?.formula === "string" ? raw.formula.trim() : "",
      takeaways: strArray(raw?.takeaways).slice(0, 8),
      suggestedHooks: strArray(raw?.suggestedHooks).slice(0, 5),
      warnings: strArray(raw?.warnings),
    };
  } catch (err) {
    return {
      formula: "",
      takeaways: [],
      suggestedHooks: [],
      warnings: [`Không phân tích được bài tham khảo: ${(err as Error).message}`],
    };
  }
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function buildInspirationPrompt(
  input: AnalyzeInspirationInput,
  meta: PublicMetadata,
): string {
  const metaBlock = [
    `Nền tảng: ${meta.platform}`,
    meta.title && `Tiêu đề công khai: ${meta.title}`,
    meta.authorName && `Tác giả: ${meta.authorName}`,
    meta.source === "none" && "(Không có metadata công khai — dựa vào mô tả của người dùng.)",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "Bạn là chiến lược gia nội dung social media. Nhiệm vụ: đúc kết CÔNG THỨC từ một bài đăng hiệu quả,",
    "để thương hiệu của chúng tôi tự sản xuất nội dung mới theo cấu trúc đó.",
    "",
    "QUAN TRỌNG: Tuyệt đối KHÔNG sao chép câu chữ, KHÔNG tái sử dụng nội dung của bài gốc.",
    "Chỉ rút ra nguyên tắc (hook, cấu trúc, nhịp kể, cách chốt) — giống như học cách viết, không phải chép bài.",
    "",
    "## Bài tham khảo",
    metaBlock,
    input.userDescription
      ? `\n## Người dùng mô tả bài đó\n${input.userDescription}`
      : "",
    input.brandContext ? `\n## Ngữ cảnh thương hiệu của chúng tôi\n${input.brandContext}` : "",
    "",
    "## Định dạng trả về",
    "Chỉ trả về JSON hợp lệ:",
    "{",
    '  "formula": "mô tả công thức: hook gì, cấu trúc mấy phần, nhịp thế nào, chốt ra sao",',
    '  "takeaways": ["nguyên tắc cụ thể có thể áp dụng"],',
    '  "suggestedHooks": ["gợi ý câu mở đầu MỚI cho nội dung của chúng tôi"],',
    '  "warnings": ["điều cần lưu ý, ví dụ thiếu thông tin để phân tích sâu"]',
    "}",
    "",
    "Viết bằng tiếng Việt. Nếu thông tin quá ít để phân tích chắc chắn, nói rõ trong warnings.",
  ]
    .filter(Boolean)
    .join("\n");
}
