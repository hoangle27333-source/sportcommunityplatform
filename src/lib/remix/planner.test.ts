import { describe, expect, it } from "vitest";
import { sanitizeVideoOps } from "./planner";
import { buildSrt, scriptToCues } from "./video-ops";
import type { VideoInfo } from "./video-ops";

/**
 * Các test này bảo vệ ranh giới "AI chỉ đề xuất, hệ thống mới quyết định":
 * op lạ bị bỏ, tham số bị kẹp biên, và phụ đề không bao giờ vượt thời lượng.
 */

const INFO: VideoInfo = {
  durationSec: 60,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true,
};

describe("sanitizeVideoOps", () => {
  it("bỏ op không có trong whitelist", () => {
    const ops = sanitizeVideoOps(
      [{ op: "deleteEverything" }, { op: "runShell", cmd: "rm -rf /" }],
      INFO,
    );
    expect(ops).toEqual([]);
  });

  it("bỏ op subtitles/overlayLogo do AI tự đề xuất (cần file thật)", () => {
    const ops = sanitizeVideoOps(
      [
        { op: "subtitles", srt: "fake" },
        { op: "overlayLogo", logoPath: "/etc/passwd", position: "top-left" },
        { op: "replaceAudio", audioPath: "/tmp/evil.mp3" },
      ],
      INFO,
    );
    expect(ops).toEqual([]);
  });

  it("kẹp trim trong thời lượng video", () => {
    const ops = sanitizeVideoOps(
      [{ op: "trim", start: 50, duration: 999 }],
      INFO,
    );
    expect(ops).toEqual([{ op: "trim", start: 50, duration: 10 }]);
  });

  it("bỏ trim có duration <= 0", () => {
    expect(sanitizeVideoOps([{ op: "trim", start: 0, duration: 0 }], INFO)).toEqual(
      [],
    );
  });

  it("kẹp kích thước reframe vào biên an toàn", () => {
    const ops = sanitizeVideoOps(
      [{ op: "reframe", width: 99999, height: 1, mode: "crop" }],
      INFO,
    );
    expect(ops).toEqual([
      { op: "reframe", width: 4096, height: 64, mode: "crop" },
    ]);
  });

  it("mặc định reframe mode về pad khi giá trị không hợp lệ", () => {
    const ops = sanitizeVideoOps(
      [{ op: "reframe", width: 1080, height: 1920, mode: "warp" }],
      INFO,
    );
    expect(ops[0]).toMatchObject({ mode: "pad" });
  });

  it("kẹp crf/fps của op encode", () => {
    const ops = sanitizeVideoOps([{ op: "encode", fps: 240, crf: 1 }], INFO);
    expect(ops).toEqual([{ op: "encode", fps: 60, crf: 18 }]);
  });

  it("trả rỗng khi input không phải mảng", () => {
    expect(sanitizeVideoOps(null, INFO)).toEqual([]);
    expect(sanitizeVideoOps({ op: "trim" }, INFO)).toEqual([]);
    expect(sanitizeVideoOps("trim", INFO)).toEqual([]);
  });
});

describe("scriptToCues", () => {
  it("không sinh cue vượt quá thời lượng video", () => {
    const cues = scriptToCues("một hai ba bốn năm sáu bảy tám chín mười", 5);
    expect(cues.length).toBeGreaterThan(0);
    for (const c of cues) {
      expect(c.endSec).toBeLessThanOrEqual(5);
    }
  });

  it("trả rỗng khi không có nội dung hoặc thời lượng", () => {
    expect(scriptToCues("", 30)).toEqual([]);
    expect(scriptToCues("có chữ", 0)).toEqual([]);
  });

  it("ngắt dòng theo giới hạn ký tự để dễ đọc trên khung dọc", () => {
    const cues = scriptToCues("a".repeat(10) + " " + "b".repeat(10), 10, 12);
    expect(cues.length).toBe(2);
  });
});

describe("buildSrt", () => {
  it("xuất đúng định dạng SRT với timestamp có dấu phẩy", () => {
    const srt = buildSrt([
      { startSec: 0, endSec: 1.5, text: "Xin chào" },
      { startSec: 1.5, endSec: 3, text: "Các bạn" },
    ]);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,500\nXin chào");
    expect(srt).toContain("2\n00:00:01,500 --> 00:00:03,000\nCác bạn");
  });
});
