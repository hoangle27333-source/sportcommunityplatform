import { describe, it, expect } from "vitest";
import { sanitizePlan, type EditOp } from "./image-edit";

/**
 * sanitizePlan is the security boundary of the Image-Edit Agent: the AI can
 * propose anything, but only whitelisted, range-clamped ops may execute (§7.2).
 */
describe("sanitizePlan", () => {
  it("drops unknown ops", () => {
    const plan = sanitizePlan([
      { op: "resize", width: 500 },
      { op: "generateImage", prompt: "a dragon" }, // not whitelisted
      { op: "deleteFiles" }, // not whitelisted
    ]);
    expect(plan.map((p) => p.op)).toEqual(["resize"]);
  });

  it("clamps numeric params to safe ranges", () => {
    const plan = sanitizePlan([
      { op: "resize", width: 999999, height: -50 },
      { op: "blur", sigma: 9999 },
      { op: "rotate", degrees: 5000 },
    ]);
    const resize = plan[0] as Extract<EditOp, { op: "resize" }>;
    expect(resize.width).toBeLessThanOrEqual(8000);
    expect(resize.height).toBeGreaterThanOrEqual(1);

    const blur = plan[1] as Extract<EditOp, { op: "blur" }>;
    expect(blur.sigma).toBeLessThanOrEqual(100);

    const rotate = plan[2] as Extract<EditOp, { op: "rotate" }>;
    expect(rotate.degrees).toBeLessThanOrEqual(360);
  });

  it("rejects non-hex colors, falling back to a default", () => {
    const plan = sanitizePlan([{ op: "tint", color: "red; DROP TABLE" }]);
    const tint = plan[0] as Extract<EditOp, { op: "tint" }>;
    expect(tint.color).toMatch(/^#/);
  });

  it("preserves ordering of valid ops", () => {
    const plan = sanitizePlan([
      { op: "crop", left: 0, top: 0, width: 100, height: 100 },
      { op: "grayscale" },
      { op: "format", to: "webp" },
    ]);
    expect(plan.map((p) => p.op)).toEqual(["crop", "grayscale", "format"]);
  });

  it("ignores garbage entries", () => {
    const plan = sanitizePlan([null, "nope", 42, {}, { op: "flip" }] as unknown[]);
    expect(plan.map((p) => p.op)).toEqual(["flip"]);
  });
});
