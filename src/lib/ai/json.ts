/**
 * Best-effort extraction of a JSON object from an LLM text response.
 *
 * Even in JSON mode, models occasionally wrap output in ```json fences or emit
 * leading/trailing prose. This tries a direct parse first, then falls back to
 * slicing the outermost {...} span. Returns null on failure — callers must
 * handle the empty case rather than trusting the model.
 */
export function extractJson<T>(text: string): T | null {
  if (!text) return null;

  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped) as T;
  } catch {
    // fall through to brace slicing
  }

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(stripped.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }

  return null;
}
