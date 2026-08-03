import { describe, it, expect, afterEach } from "vitest";
import { estimateCostUsd } from "./cost";

/**
 * estimateCostUsd converts token usage → USD using per-1M-token prices. The
 * VND conversion (usdToVnd) uses USD_TO_VND_RATE; we assert USD here since it
 * is the deterministic, provider-priced part (R4.7/R9.2).
 */
describe("estimateCostUsd", () => {
  const origIn = process.env.AI_PRICE_INPUT_PER_M_USD;
  const origOut = process.env.AI_PRICE_OUTPUT_PER_M_USD;

  afterEach(() => {
    process.env.AI_PRICE_INPUT_PER_M_USD = origIn;
    process.env.AI_PRICE_OUTPUT_PER_M_USD = origOut;
  });

  it("returns null when usage is missing", () => {
    expect(estimateCostUsd(undefined)).toBeNull();
  });

  it("prices prompt + completion tokens with configured rates", () => {
    process.env.AI_PRICE_INPUT_PER_M_USD = "1"; // $1 / 1M input
    process.env.AI_PRICE_OUTPUT_PER_M_USD = "2"; // $2 / 1M output
    const cost = estimateCostUsd({
      promptTokens: 1_000_000,
      completionTokens: 500_000,
      totalTokens: 1_500_000,
    });
    // 1M input * $1/M + 0.5M output * $2/M = 1 + 1 = 2
    expect(cost).toBeCloseTo(2, 6);
  });

  it("treats missing token counts as zero", () => {
    process.env.AI_PRICE_INPUT_PER_M_USD = "1";
    process.env.AI_PRICE_OUTPUT_PER_M_USD = "2";
    const cost = estimateCostUsd({ promptTokens: 1_000_000 });
    expect(cost).toBeCloseTo(1, 6);
  });
});
