import { describe, expect, it } from "vitest";
import { extractJson } from "./json";

describe("extractJson", () => {
  it("parses clean JSON directly", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    const text = '```json\n{"variants":[{"caption":"hi"}]}\n```';
    expect(extractJson(text)).toEqual({ variants: [{ caption: "hi" }] });
  });

  it("strips bare ``` fences", () => {
    expect(extractJson('```\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("slices the outermost object out of surrounding prose", () => {
    const text = 'Sure! Here is your JSON:\n{"suggestions":[]}\nHope that helps.';
    expect(extractJson(text)).toEqual({ suggestions: [] });
  });

  it("returns null for empty input", () => {
    expect(extractJson("")).toBeNull();
  });

  it("returns null when no JSON object is present", () => {
    expect(extractJson("no json here")).toBeNull();
  });

  it("returns null for malformed JSON that cannot be recovered", () => {
    expect(extractJson('{"a": }')).toBeNull();
  });

  it("handles nested objects when slicing from prose", () => {
    const text = 'result: {"a":{"b":2},"c":[1,2]} done';
    expect(extractJson(text)).toEqual({ a: { b: 2 }, c: [1, 2] });
  });
});
