/**
 * AI provider factory (SPEC §3 — provider-agnostic, Gemini default).
 *
 * Call sites do: `import { getAIProvider } from "@/lib/ai";`
 * and depend only on the AIProvider interface. Swapping providers is an
 * env change (AI_PROVIDER=gemini|claude|openai) — no call-site edits.
 */
import type { AIProvider } from "./types";
import { GeminiProvider } from "./gemini";

export type { AIProvider } from "./types";
export * from "./types";

type ProviderId = "gemini"; // extend as providers are added: | "claude" | "openai"

let cached: AIProvider | null = null;

/**
 * Returns the configured AIProvider (singleton per process).
 * Throws only when a provider is actually used without its API key, so the
 * app can boot in environments where AI is not exercised (e.g. UI-only dev).
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;

  const id = (process.env.AI_PROVIDER ?? "gemini").toLowerCase() as ProviderId;

  switch (id) {
    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY ?? "";
      cached = new GeminiProvider(apiKey, process.env.GEMINI_TEXT_MODEL);
      return cached;
    }
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${id}". Supported: gemini. ` +
          `Add a provider class and register it in src/lib/ai/index.ts.`,
      );
  }
}

/** Test hook: reset the cached singleton (used by unit tests). */
export function __resetAIProvider(): void {
  cached = null;
}
