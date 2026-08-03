import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AIProvider,
  AnalysisRequest,
  AnalysisResult,
  CaptionVariant,
  JsonCompletion,
  Suggestion,
  TextGenRequest,
  TextGenResult,
  TokenUsage,
} from "./types";
import { extractJson } from "./json";

/**
 * Google Gemini implementation of AIProvider (SPEC §3 — default provider).
 *
 * Uses JSON-mode (responseMimeType) so we get structured output we can parse
 * deterministically rather than scraping prose. Model id is configurable via
 * GEMINI_MODEL; defaults to a current flash model for cost efficiency.
 */
export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  private readonly client: GoogleGenerativeAI;
  private readonly modelId: string;

  constructor(apiKey: string, modelId?: string) {
    if (!apiKey) throw new Error("GeminiProvider: missing API key");
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelId =
      modelId ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
  }

  async generateText(input: TextGenRequest): Promise<TextGenResult> {
    const language = input.language ?? "vi";
    const variants = Math.min(Math.max(input.variants ?? 3, 1), 5);
    const model = this.client.getGenerativeModel({
      model: this.modelId,
      generationConfig: { responseMimeType: "application/json" },
    });

    const prompt = buildCaptionPrompt(input, language, variants);
    const res = await model.generateContent(prompt);
    const text = res.response.text();
    const parsed = extractJson<{ variants: CaptionVariant[] }>(text);

    const out: CaptionVariant[] = (parsed?.variants ?? [])
      .slice(0, variants)
      .map((v) => ({
        caption: String(v.caption ?? "").trim(),
        hashtags: normalizeHashtags(v.hashtags),
        cta: v.cta ? String(v.cta).trim() : undefined,
      }))
      .filter((v) => v.caption.length > 0);

    return {
      variants: out,
      model: this.modelId,
      usage: readUsage(res),
    };
  }

  async analyze(input: AnalysisRequest): Promise<AnalysisResult> {
    const language = input.language ?? "vi";
    const model = this.client.getGenerativeModel({
      model: this.modelId,
      generationConfig: { responseMimeType: "application/json" },
    });

    const prompt = buildAnalysisPrompt(input, language);
    const res = await model.generateContent(prompt);
    const text = res.response.text();
    const parsed = extractJson<{ suggestions: Suggestion[] }>(text);

    const allowed = new Set([
      "best_time",
      "caption_style",
      "hashtag_set",
      "media_type",
    ]);
    const suggestions: Suggestion[] = (parsed?.suggestions ?? [])
      .filter((s) => allowed.has(s.type))
      .map((s) => ({
        type: s.type,
        content: String(s.content ?? "").trim(),
        rationale: String(s.rationale ?? "").trim(),
      }))
      .filter((s) => s.content.length > 0);

    return {
      suggestions,
      model: this.modelId,
      usage: readUsage(res),
    };
  }

  /**
   * Generic JSON-mode completion (dùng cho remix planner / inspiration analyzer).
   * Trả về object đã parse, hoặc null nếu model không trả JSON hợp lệ — caller
   * quyết định fallback thay vì ném lỗi giữa pipeline.
   */
  async completeJson<T>(prompt: string): Promise<JsonCompletion<T>> {
    const model = this.client.getGenerativeModel({
      model: this.modelId,
      generationConfig: { responseMimeType: "application/json" },
    });

    const res = await model.generateContent(prompt);
    const parsed = extractJson<T>(res.response.text());

    return { data: parsed, model: this.modelId, usage: readUsage(res) };
  }
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildCaptionPrompt(
  input: TextGenRequest,
  language: string,
  variants: number,
): string {
  const tone = input.tone;
  const toneBlock = tone
    ? [
        tone.persona && `Persona: ${tone.persona}`,
        tone.guidelines && `Guidelines: ${tone.guidelines}`,
        tone.examples?.length && `Examples:\n- ${tone.examples.join("\n- ")}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "No specific tone provided; use a friendly, engaging brand voice.";

  const learnings = input.learnings?.length
    ? `Apply these learnings from past performance:\n- ${input.learnings.join("\n- ")}`
    : "";

  return [
    `You are a social media copywriter. Write ${variants} distinct ${input.platform ?? "facebook"} post variants.`,
    `Output language: ${language}.`,
    `\n## Brief\n${input.brief}`,
    `\n## Tone of voice\n${toneBlock}`,
    learnings && `\n## Learnings\n${learnings}`,
    `\n## Output format`,
    `Return ONLY valid JSON of the shape:`,
    `{"variants":[{"caption":"...","hashtags":["tag1","tag2"],"cta":"..."}]}`,
    `Rules: hashtags without the leading '#'. Keep captions platform-appropriate. cta is optional.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAnalysisPrompt(input: AnalysisRequest, language: string): string {
  return [
    `You are a social media performance analyst.`,
    `Given post performance samples, extract actionable learnings.`,
    `Output language: ${language}.`,
    input.context && `\n## Context\n${input.context}`,
    `\n## Samples (JSON)\n${JSON.stringify(input.samples).slice(0, 12000)}`,
    `\n## Output format`,
    `Return ONLY valid JSON of the shape:`,
    `{"suggestions":[{"type":"best_time|caption_style|hashtag_set|media_type","content":"...","rationale":"..."}]}`,
    `Give concrete, specific suggestions grounded in the data.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeHashtags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => String(t).trim().replace(/^#+/, ""))
    .filter((t) => t.length > 0);
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

function readUsage(res: {
  response: { usageMetadata?: GeminiUsageMetadata };
}): TokenUsage | undefined {
  const u = res.response.usageMetadata;
  if (!u) return undefined;
  return {
    promptTokens: u.promptTokenCount,
    completionTokens: u.candidatesTokenCount,
    totalTokens: u.totalTokenCount,
  };
}
