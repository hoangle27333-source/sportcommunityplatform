/**
 * Provider-agnostic AI types (SPEC §3, §7.1, §6).
 *
 * These types are the stable contract every AIProvider implements. Call sites
 * (content-gen, analysis worker) depend only on these — never on a concrete
 * SDK — so swapping Gemini for Claude/OpenAI later changes only the factory.
 */

// ---------------------------------------------------------------------------
// Text generation — Contextual Captioning (§7.1)
// ---------------------------------------------------------------------------

export interface ToneContext {
  name?: string;
  persona?: string;
  guidelines?: string;
  examples?: string[];
}

export interface TextGenRequest {
  /** Free-form campaign brief / prompt describing what to write. */
  brief: string;
  /** Tone-of-voice profile to condition the output. */
  tone?: ToneContext;
  /** Target platform — influences length/format conventions. */
  platform?: "facebook" | "instagram";
  /** Prior AI learnings to fold in (from Stage 1 analysis). */
  learnings?: string[];
  /** How many distinct variants to return for the user to pick from. */
  variants?: number;
  /** Preferred output language (BCP-47), e.g. "vi", "en". Default "vi". */
  language?: string;
}

export interface CaptionVariant {
  caption: string;
  hashtags: string[];
  cta?: string;
}

export interface TextGenResult {
  variants: CaptionVariant[];
  /** Token accounting for cost tracking (§ requirements: cost per content). */
  usage?: TokenUsage;
  /** Concrete model id that produced the result, for audit. */
  model: string;
}

// ---------------------------------------------------------------------------
// Analysis — Performance Insights & AI Suggestions (§6, Stage 1)
// ---------------------------------------------------------------------------

export interface MetricSample {
  postId?: string;
  caption?: string;
  hashtags?: string[];
  platform?: "facebook" | "instagram";
  reach?: number;
  impressions?: number;
  engagement?: number;
  publishedAt?: string; // ISO
}

export interface AnalysisRequest {
  /** Aggregated performance samples for a campaign / time window. */
  samples: MetricSample[];
  /** Optional context: campaign goal, tone, constraints. */
  context?: string;
  language?: string;
}

export type SuggestionType =
  | "best_time"
  | "caption_style"
  | "hashtag_set"
  | "media_type";

export interface Suggestion {
  type: SuggestionType;
  content: string;
  rationale: string;
}

export interface AnalysisResult {
  suggestions: Suggestion[];
  usage?: TokenUsage;
  model: string;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Kết quả một lần gọi JSON-mode tổng quát. */
export interface JsonCompletion<T> {
  /** Đã parse; null nếu model trả về JSON không hợp lệ. */
  data: T | null;
  usage?: TokenUsage;
  model: string;
}

export interface AIProvider {
  /** Stable provider id, e.g. "gemini", "claude", "openai". */
  readonly id: string;
  generateText(input: TextGenRequest): Promise<TextGenResult>;
  analyze(input: AnalysisRequest): Promise<AnalysisResult>;
  /**
   * Gọi model ở JSON-mode với prompt tự do và trả về object đã parse.
   *
   * Dùng cho các tác vụ có schema riêng (lập kế hoạch remix §7, phân tích
   * bài tham khảo) mà không cần thêm một method chuyên biệt cho từng loại vào
   * interface này. Caller tự validate dữ liệu trả về — không tin model.
   */
  completeJson<T>(prompt: string): Promise<JsonCompletion<T>>;
}
