import { describe, expect, it } from "vitest";
import { sanitizeVideoOps } from "./planner";
import {
  buildBoxBlurOverlayFilter,
  buildDrawtextTextfileParam,
  buildTightTextBlurRegions,
  buildAssSubtitles,
  buildSrt,
  fitTextToRegion,
  reviewRenderedVideo,
  sanitizeTranscriptText,
  scriptToCues,
  transformRegionForReframe,
} from "./video-ops";
import {
  buildPaddleOcrSampleTimestamps,
  buildSampleTimestamps,
  classifyOnScreenTextTrack,
  clampSameSlotTiming,
  filterForegroundOnScreenTextTracks,
  groupOnScreenTextTracks,
} from "./on-screen-text";
import { buildFacebookCopyrightPreflight } from "./copyright-preflight";
import { normalizePaddleOcrResponse } from "./ocr-service";
import { buildRemixOptionsFromPreset } from "./preset-options";
import { buildTextInpaintRegions, buildTextInpaintTracks, hasManualTextOnScreenOverlays, hasRenderableTextOnScreenOverlays } from "./remix-service";
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

describe("buildAssSubtitles", () => {
  it("renders TikTok-like active word highlight events", () => {
    const ass = buildAssSubtitles([
      {
        startSec: 0,
        endSec: 2,
        text: "Xin chao ban",
        words: [
          { word: "Xin", startSec: 0, endSec: 0.5 },
          { word: "chao", startSec: 0.5, endSec: 1.2 },
          { word: "ban", startSec: 1.2, endSec: 2 },
        ],
      },
    ], {
      font: "Montserrat",
      fontSize: 36,
      primaryColor: "#FFFFFF",
      outlineColor: "#000000",
      highlightColor: "#FFF200",
      bold: true,
    });

    expect(ass).toContain("[Events]");
    expect(ass.match(/Dialogue:/g)?.length).toBe(3);
    expect(ass).toContain("&H0000F2FF");
    expect(ass.split("\n").find((line) => line.startsWith("Dialogue:"))).toContain("chao ban");
  });

  it("renders reveal_words as progressive text events", () => {
    const ass = buildAssSubtitles([
      {
        startSec: 0,
        endSec: 2,
        text: "Xin chao ban",
        words: [
          { word: "Xin", startSec: 0, endSec: 0.5 },
          { word: "chao", startSec: 0.5, endSec: 1.2 },
          { word: "ban", startSec: 1.2, endSec: 2 },
        ],
      },
    ], { animation: "reveal_words", borderStyle: 3 });

    const dialogueLines = ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
    expect(dialogueLines).toHaveLength(3);
    expect(dialogueLines[0]).toContain("Xin");
    expect(dialogueLines[0]).not.toContain("chao");
    expect(dialogueLines[1]).toContain("Xin");
    expect(dialogueLines[1]).toContain("chao");
    expect(ass).toContain(",3,");
  });
});

describe("buildFacebookCopyrightPreflight", () => {
  it("flags retained original audio and third-party inspiration risk", () => {
    const result = buildFacebookCopyrightPreflight({
      sourceType: "inspiration",
      options: { dubMode: "none" },
      hasAudio: true,
    });

    expect(result.riskLevel).toBe("high");
    expect(result.warnings.join(" ")).toContain("Nguồn tham khảo");
    expect(result.warnings.join(" ")).toContain("Âm thanh");
  });

  it("lowers audio risk when manual script replaces original audio", () => {
    const result = buildFacebookCopyrightPreflight({
      sourceType: "upload",
      ownershipConfirmed: true,
      options: { scriptInputMode: "manual_script", manualScript: "Xin chào", dubMode: "full" },
      hasAudio: true,
    });

    expect(result.items.find((item) => item.id === "recorded_music")?.status).toBe("pass");
  });
});

describe("sanitizeTranscriptText", () => {
  it("xoa timestamp dang mm:ss khoi script long tieng", () => {
    const cleaned = sanitizeTranscriptText("00:03\nThoi nao, Roxy!\n00:12\nTen co la gi?");
    expect(cleaned).toBe("Thoi nao, Roxy!\nTen co la gi?");
  });
});

describe("reviewRenderedVideo", () => {
  it("fail khi file render bị thiếu", async () => {
    const review = await reviewRenderedVideo({
      outputPath: "/tmp/remix-missing-output.mp4",
      expected: { width: 1080, height: 1920, hasAudio: true },
    });

    expect(review.status).toBe("fail");
    expect(review.recommendedAction).toBe("block");
    expect(review.issuesFound.length).toBeGreaterThan(0);
  });
});

describe("on-screen text tracking", () => {
  it("sample frame dày cho video ngắn để giảm bỏ sót text giữa video", () => {
    const timestamps = buildSampleTimestamps(40);
    expect(timestamps.length).toBeGreaterThanOrEqual(16);
    expect(timestamps[0]).toBeGreaterThanOrEqual(0.2);
    expect(timestamps[timestamps.length - 1]).toBeLessThanOrEqual(39.8);
  });

  it("sample PaddleOCR dày hơn để bắt text xuất hiện ngắn", () => {
    const timestamps = buildPaddleOcrSampleTimestamps(40);
    expect(timestamps.length).toBeGreaterThanOrEqual(39);
    expect(timestamps[0]).toBeGreaterThanOrEqual(0.2);
    expect(timestamps[timestamps.length - 1]).toBeLessThanOrEqual(39.8);
  });

  it("sample PaddleOCR bám theo FPS video để tránh duplicate frame quá mức", () => {
    const timestamps = buildPaddleOcrSampleTimestamps(10, 24);
    expect(timestamps[1]! - timestamps[0]!).toBeCloseTo(0.04, 2);
  });

  it("gom cùng text qua nhiều frame thành một track", () => {
    const tracks = groupOnScreenTextTracks([
      {
        detectedText: "A BAD HELPER",
        translatedText: "Một trợ thủ tệ hại",
        region: { x: 0.2, y: 0.08, w: 0.6, h: 0.1 },
        startSec: 0,
        endSec: 2,
        timestampSec: 1,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
      {
        detectedText: "A BAD HELPER",
        translatedText: "Một trợ thủ tệ hại",
        region: { x: 0.21, y: 0.09, w: 0.58, h: 0.1 },
        startSec: 2,
        endSec: 4,
        timestampSec: 3,
        toneMood: "meme",
        confidence: 0.75,
        notes: [],
      },
    ], 40);

    expect(tracks).toHaveLength(1);
    expect(tracks[0].startSec).toBe(0);
    expect(tracks[0].endSec).toBeGreaterThanOrEqual(4);
  });

  it("tách top caption và bottom caption cùng timestamp thành track riêng", () => {
    const tracks = groupOnScreenTextTracks([
      {
        detectedText: "A BAD HELPER",
        translatedText: "Một trợ thủ tệ hại",
        region: { x: 0.2, y: 0.08, w: 0.6, h: 0.1 },
        startSec: 10,
        endSec: 14,
        timestampSec: 12,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
      {
        detectedText: "DELICIOUS",
        translatedText: "Ngon tuyệt",
        region: { x: 0.36, y: 0.62, w: 0.28, h: 0.08 },
        startSec: 10,
        endSec: 14,
        timestampSec: 12,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
    ], 40);

    expect(tracks).toHaveLength(2);
    expect(tracks.map((track) => track.detectedText)).toEqual(["A BAD HELPER", "DELICIOUS"]);
  });

  it("không merge các chữ ngắn khác nhau dù cùng vùng xuất hiện gần nhau", () => {
    const tracks = groupOnScreenTextTracks([
      {
        detectedText: "COURSE",
        translatedText: "Tất nhiên",
        region: { x: 0.36, y: 0.62, w: 0.28, h: 0.08 },
        startSec: 10,
        endSec: 12,
        timestampSec: 11,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
      {
        detectedText: "DELICIOUS",
        translatedText: "Ngon tuyệt",
        region: { x: 0.36, y: 0.62, w: 0.28, h: 0.08 },
        startSec: 13,
        endSec: 15,
        timestampSec: 14,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
    ], 40);

    expect(tracks).toHaveLength(2);
    expect(tracks.find((track) => track.detectedText === "COURSE")?.translatedText).toBe("Món");
  });

  it("không merge các chữ khác nhau cùng slot khi thời gian còn overlap", () => {
    const tracks = groupOnScreenTextTracks([
      {
        detectedText: "COURSE",
        translatedText: "Món",
        region: { x: 0.36, y: 0.62, w: 0.28, h: 0.08 },
        startSec: 10,
        endSec: 14,
        timestampSec: 11,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
      {
        detectedText: "DELICIOUS",
        translatedText: "Ngon tuyệt",
        region: { x: 0.36, y: 0.62, w: 0.28, h: 0.08 },
        startSec: 12,
        endSec: 16,
        timestampSec: 13,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
    ], 40);

    expect(tracks).toHaveLength(2);
    expect(tracks.map((track) => track.detectedText)).toEqual(["COURSE", "DELICIOUS"]);
  });

  it("giữ bản OCR đầy đủ nhất khi cùng track có frame đọc thiếu chữ", () => {
    const tracks = groupOnScreenTextTracks([
      {
        detectedText: "BALLS",
        translatedText: "Những quả bóng",
        region: { x: 0.36, y: 0.62, w: 0.28, h: 0.08 },
        startSec: 0,
        endSec: 3,
        timestampSec: 1,
        toneMood: "meme",
        confidence: 0.92,
        notes: [],
      },
      {
        detectedText: "BALLS\nFROM",
        translatedText: "Những quả bóng\nTừ",
        region: { x: 0.35, y: 0.61, w: 0.3, h: 0.11 },
        startSec: 1,
        endSec: 4,
        timestampSec: 2,
        toneMood: "meme",
        confidence: 0.72,
        notes: [],
      },
    ], 40);

    expect(tracks).toHaveLength(1);
    expect(tracks[0].detectedText).toBe("BALLS\nFROM");
    expect(tracks[0].translatedText).toContain("Từ");
  });

  it("fallback dịch label ngắn sang tiếng Việt thay vì giữ nguyên tiếng Anh", () => {
    const tracks = groupOnScreenTextTracks([
      {
        detectedText: "BALLS\nFROM",
        translatedText: "BALLS\nFROM",
        region: { x: 0.35, y: 0.61, w: 0.3, h: 0.11 },
        startSec: 1,
        endSec: 4,
        timestampSec: 2,
        toneMood: "meme",
        confidence: 0.72,
        notes: [],
      },
    ], 40);

    expect(tracks[0].translatedText).toBe("Những quả bóng\nTừ");
  });

  it("cắt thời gian khi hai text khác nhau cùng slot bị overlap", () => {
    const tracks = clampSameSlotTiming([
      {
        detectedText: "COURSE",
        translatedText: "Món",
        region: { x: 0.36, y: 0.62, w: 0.28, h: 0.08 },
        startSec: 10,
        endSec: 14,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
      {
        detectedText: "DELICIOUS",
        translatedText: "Ngon tuyệt",
        region: { x: 0.36, y: 0.62, w: 0.28, h: 0.08 },
        startSec: 12,
        endSec: 16,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
    ], 40);

    expect(tracks[0].endSec).toBeLessThanOrEqual(11.95);
    expect(tracks[0].endSec).toBeLessThanOrEqual(tracks[1].startSec);
  });

  it("giữ nguyên thời gian cho các dòng OCR đồng thời ở gần nhau", () => {
    const tracks = clampSameSlotTiming([
      {
        detectedText: "My body:",
        translatedText: "Cơ thể tôi:",
        region: { x: 0.35, y: 0.46, w: 0.3, h: 0.07 },
        startSec: 0,
        endSec: 7.4,
        toneMood: "meme",
        confidence: 0.9,
        notes: [],
      },
      {
        detectedText: "We're dying",
        translatedText: "Chúng ta đang chết dần",
        region: { x: 0.31, y: 0.5, w: 0.38, h: 0.08 },
        startSec: 0,
        endSec: 7.4,
        toneMood: "meme",
        confidence: 0.9,
        notes: [],
      },
    ], 7.4);

    expect(tracks).toHaveLength(2);
    expect(tracks[0].endSec).toBe(7.4);
    expect(tracks[1].endSec).toBe(7.4);
  });

  it("loại các track trùng vùng và trùng thời gian để tránh overlay chồng", () => {
    const tracks = groupOnScreenTextTracks([
      {
        detectedText: "A BAD HELPER",
        translatedText: "Một trợ thủ tệ hại",
        region: { x: 0.2, y: 0.08, w: 0.6, h: 0.1 },
        startSec: 0,
        endSec: 20,
        timestampSec: 4,
        toneMood: "meme",
        confidence: 0.82,
        notes: [],
      },
      {
        detectedText: "BAD HELPER",
        translatedText: "Một trợ thủ tôi tệ",
        region: { x: 0.23, y: 0.1, w: 0.55, h: 0.1 },
        startSec: 0,
        endSec: 20,
        timestampSec: 8,
        toneMood: "meme",
        confidence: 0.52,
        notes: [],
      },
      {
        detectedText: "DISH",
        translatedText: "Món ăn",
        region: { x: 0.4, y: 0.65, w: 0.2, h: 0.08 },
        startSec: 18,
        endSec: 22,
        timestampSec: 20,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
    ], 40);

    expect(tracks).toHaveLength(2);
    expect(tracks.filter((track) => track.region.y < 0.2)).toHaveLength(1);
  });

  it("không giữ nguyên ALL CAPS nếu đã có bản dịch tiếng Việt", () => {
    const tracks = groupOnScreenTextTracks([
      {
        detectedText: "JOE",
        translatedText: "Người thay thế",
        region: { x: 0.44, y: 0.76, w: 0.12, h: 0.06 },
        startSec: 18,
        endSec: 22,
        timestampSec: 20,
        toneMood: "meme",
        confidence: 0.8,
        notes: [],
      },
    ], 40);

    expect(tracks[0].translatedText).toBe("Người thay thế");
  });

  it("loại signage/background nhỏ dù OCR lặp nhiều frame", () => {
    const tracks = filterForegroundOnScreenTextTracks([
      {
        detectedText: "outside",
        translatedText: "bên ngoài",
        region: { x: 0.12, y: 0.57, w: 0.07, h: 0.025 },
        startSec: 0,
        endSec: 11,
        toneMood: "sports",
        confidence: 0.92,
        notes: ["detections=8"],
      },
    ]);

    expect(tracks).toHaveLength(0);
  });

  it("giữ caption/subtitle foreground đủ rộng ở lower/mid frame", () => {
    const track = {
      detectedText: "every family has that one unstable child who does this for fun",
      translatedText: "gia đình nào cũng có một đứa liều lĩnh làm vậy cho vui",
      region: { x: 0.16, y: 0.49, w: 0.62, h: 0.055 },
      startSec: 0,
      endSec: 11,
      toneMood: "sports",
      confidence: 0.82,
      notes: ["detections=12"],
    };

    expect(classifyOnScreenTextTrack(track).reason).toBe("caption_like");
    expect(filterForegroundOnScreenTextTracks([track])).toHaveLength(1);
  });

  it("giữ overlay lớn/meme text nổi bật", () => {
    const track = {
      detectedText: "A BAD HELPER",
      translatedText: "Một trợ thủ tệ",
      region: { x: 0.18, y: 0.08, w: 0.64, h: 0.09 },
      startSec: 0,
      endSec: 4,
      toneMood: "meme",
      confidence: 0.8,
      notes: ["detections=2"],
    };

    expect(classifyOnScreenTextTrack(track).keep).toBe(true);
    expect(filterForegroundOnScreenTextTracks([track])).toHaveLength(1);
  });

  it("giữ meme text ngắn nhưng lớn để blur không sót chữ gốc", () => {
    const tracks = [
      {
        detectedText: "Me:",
        translatedText: "Tôi:",
        region: { x: 0.42, y: 0.72, w: 0.18, h: 0.07 },
        startSec: 0,
        endSec: 7,
        toneMood: "meme",
        confidence: 0.88,
        notes: ["detections=4"],
      },
      {
        detectedText: "fun",
        translatedText: "vui",
        region: { x: 0.38, y: 0.82, w: 0.22, h: 0.08 },
        startSec: 0,
        endSec: 7,
        toneMood: "meme",
        confidence: 0.84,
        notes: ["detections=3"],
      },
    ];

    expect(tracks.map(classifyOnScreenTextTrack).every((item) => item.keep)).toBe(true);
    expect(filterForegroundOnScreenTextTracks(tracks)).toHaveLength(2);
  });

  it("giữ top title ngắn nếu đủ lớn và ổn định", () => {
    const track = {
      detectedText: "Ghost Rider",
      translatedText: "Kỵ sĩ ma",
      region: { x: 0.31, y: 0.02, w: 0.38, h: 0.05 },
      startSec: 0,
      endSec: 6,
      toneMood: "meme",
      confidence: 0.86,
      notes: ["detections=6"],
    };

    expect(classifyOnScreenTextTrack(track).reason).toBe("top_title");
    expect(filterForegroundOnScreenTextTracks([track])).toHaveLength(1);
  });
});

describe("PaddleOCR response normalization", () => {
  it("giữ block nhiều dòng và clamp bbox hợp lệ", () => {
    const result = normalizePaddleOcrResponse({
      items: [
        {
          detectedText: "BALLS\nFROM",
          region: { x: -0.2, y: 0.62, w: 2, h: 0.08 },
          timestampSec: 1.4,
          startSec: 0.2,
          endSec: 3.8,
          confidence: 0.86,
          source: "paddleocr",
        },
      ],
      warnings: ["minor"],
    }, 40);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].detectedText).toBe("BALLS\nFROM");
    expect(result.items[0].translatedText).toBe("BALLS\nFROM");
    expect(result.items[0].region?.x).toBe(0);
    expect(result.items[0].region?.w).toBe(1);
    expect(result.warnings).toEqual(["minor"]);
  });

  it("bỏ item thiếu text/bbox hoặc confidence quá thấp", () => {
    const result = normalizePaddleOcrResponse({
      items: [
        { detectedText: "", region: { x: 0, y: 0, w: 0.2, h: 0.1 }, confidence: 0.9 },
        { detectedText: "OK", confidence: 0.9 },
        { detectedText: "Tiny", region: { x: 0, y: 0, w: 0.2, h: 0.1 }, confidence: 0.1 },
      ],
    }, 10);

    expect(result.items).toEqual([]);
  });

  it("ghi lại metadata timing/sample trong notes để debug OCR", () => {
    const result = normalizePaddleOcrResponse({
      items: [
        {
          detectedText: "HELPER",
          region: { x: 0.2, y: 0.1, w: 0.3, h: 0.08 },
          timestampSec: 1.5,
          firstSeenSec: 1.42,
          lastSeenSec: 1.63,
          startSec: 1.4,
          endSec: 1.65,
          confidence: 0.9,
          detections: 6,
          sampleIntervalSec: 0.04,
          sampleCount: 6,
          maxGapSec: 0.25,
          source: "paddleocr",
        },
      ],
    }, 10);

    expect(result.items[0]?.notes).toContain("sampleIntervalSec=0.040");
    expect(result.items[0]?.notes).toContain("firstSeenSec=1.42");
    expect(result.items[0]?.notes).toContain("lastSeenSec=1.63");
  });
});

describe("fitTextToRegion", () => {
  it("giảm font size khi bản dịch dài hơn bbox", () => {
    const fitted = fitTextToRegion("Một trợ thủ tệ hại không tưởng", {
      width: 150,
      height: 44,
      desiredFontSize: 42,
      minFontSize: 14,
      maxFontSize: 42,
    });

    expect(fitted.fontSize).toBeLessThan(42);
    expect(fitted.lines.length).toBeLessThanOrEqual(2);
  });

  it("bẻ token dài mà không cắt mất nội dung", () => {
    const fitted = fitTextToRegion("SuperHyperUltraMegaLongOverlayWord", {
      width: 120,
      height: 40,
      desiredFontSize: 28,
      minFontSize: 12,
      maxFontSize: 28,
    });

    expect(fitted.text.replace(/[-\n ]/g, "")).toBe("SuperHyperUltraMegaLongOverlayWord");
  });

  it("giữ đủ text nhiều dòng thay vì truncate im lặng", () => {
    const source = [
      'Me: "Listen to your body"',
      'My body: "We’re dying"',
      'Me: "Shut up, we’re having fun"',
    ].join("\n");
    const fitted = fitTextToRegion(source, {
      width: 180,
      height: 54,
      desiredFontSize: 32,
      minFontSize: 10,
      maxFontSize: 32,
    });

    expect(fitted.text).toContain("Listen");
    expect(fitted.text).toContain("dying");
    expect(fitted.text.replace(/\s+/g, " ")).toContain("having fun");
  });
});

describe("buildTightTextBlurRegions", () => {
  it("tách multiline thành nhiều blur region nhỏ hơn", () => {
    const regions = buildTightTextBlurRegions({
      region: { x: 0.2, y: 0.3, w: 0.4, h: 0.18 },
      lines: ["Dong mot", "Dong hai"],
      fontSize: 34,
      frameWidth: 1080,
      frameHeight: 1920,
      minimumWidthRatio: 0.22,
    });

    expect(regions).toHaveLength(2);
    expect(regions[0]!.y).toBeLessThan(regions[1]!.y);
  });

  it("giữ tổng vùng blur nhỏ hơn khung overlay gốc", () => {
    const region = { x: 0.18, y: 0.32, w: 0.48, h: 0.16 };
    const regions = buildTightTextBlurRegions({
      region,
      lines: ["Nghe co the cua ban"],
      fontSize: 32,
      frameWidth: 1080,
      frameHeight: 1920,
      minimumWidthRatio: 0.18,
    });

    const sourceArea = region.w * region.h;
    const blurArea = regions.reduce((sum, item) => sum + item.w * item.h, 0);
    expect(blurArea).toBeLessThan(sourceArea);
  });

  it("kẹp blur region trong khung video", () => {
    const regions = buildTightTextBlurRegions({
      region: { x: 0.82, y: 0.9, w: 0.16, h: 0.09 },
      lines: ["Vuot mep"],
      fontSize: 28,
      frameWidth: 1080,
      frameHeight: 1920,
    });

    expect(regions[0]!.x).toBeGreaterThanOrEqual(0);
    expect(regions[0]!.y).toBeGreaterThanOrEqual(0);
    expect(regions[0]!.x + regions[0]!.w).toBeLessThanOrEqual(1);
    expect(regions[0]!.y + regions[0]!.h).toBeLessThanOrEqual(1);
  });

  it("giữ xuống dòng tay thành các khối blur riêng", () => {
    const lines = "Toi:\n\"Im di, chung ta dang vui ma\"".split("\n");
    const regions = buildTightTextBlurRegions({
      region: { x: 0.3, y: 0.62, w: 0.32, h: 0.18 },
      lines,
      fontSize: 30,
      frameWidth: 1080,
      frameHeight: 1920,
      minimumWidthRatio: 0.3,
    });

    expect(regions).toHaveLength(2);
    expect(regions[1]!.w).toBeGreaterThan(regions[0]!.w);
  });

  it("phủ OCR text rộng hơn manual để che outline chữ gốc", () => {
    const region = { x: 0.2, y: 0.48, w: 0.5, h: 0.12 };
    const manual = buildTightTextBlurRegions({
      region,
      lines: ["Listen to your body"],
      fontSize: 36,
      frameWidth: 1080,
      frameHeight: 1920,
      outlineWidth: 2,
      coverOriginalText: false,
    });
    const ocr = buildTightTextBlurRegions({
      region,
      lines: ["Listen to your body"],
      fontSize: 36,
      frameWidth: 1080,
      frameHeight: 1920,
      outlineWidth: 2,
      coverOriginalText: true,
    });

    const manualArea = manual.reduce((sum, item) => sum + item.w * item.h, 0);
    const ocrArea = ocr.reduce((sum, item) => sum + item.w * item.h, 0);
    expect(ocrArea).toBeGreaterThan(manualArea);
  });

  it("tăng padding blur khi outline lớn hơn", () => {
    const region = { x: 0.2, y: 0.48, w: 0.5, h: 0.12 };
    const thin = buildTightTextBlurRegions({
      region,
      lines: ["Listen to your body"],
      fontSize: 36,
      frameWidth: 1080,
      frameHeight: 1920,
      outlineWidth: 1,
      coverOriginalText: true,
    });
    const thick = buildTightTextBlurRegions({
      region,
      lines: ["Listen to your body"],
      fontSize: 36,
      frameWidth: 1080,
      frameHeight: 1920,
      outlineWidth: 8,
      coverOriginalText: true,
    });

    expect(thick[0]!.w * thick[0]!.h).toBeGreaterThan(thin[0]!.w * thin[0]!.h);
  });

  it("ưu tiên OCR text regions thật thay vì ước lượng chiều dài chuỗi", () => {
    const regions = buildTightTextBlurRegions({
      region: { x: 0.15, y: 0.4, w: 0.7, h: 0.2 },
      textRegions: [
        { x: 0.18, y: 0.43, w: 0.52, h: 0.05 },
        { x: 0.25, y: 0.51, w: 0.34, h: 0.05 },
      ],
      lines: ["short", "x"],
      fontSize: 34,
      frameWidth: 1080,
      frameHeight: 1920,
      outlineWidth: 4,
      coverOriginalText: true,
    });

    expect(regions).toHaveLength(2);
    expect(regions[0]!.w).toBeGreaterThan(0.52);
    expect(regions[1]!.w).toBeGreaterThan(0.34);
    expect(regions[1]!.w).toBeLessThan(regions[0]!.w);
  });
});

describe("OCR text regions", () => {
  it("normalize PaddleOCR line regions để renderer dùng bbox thật", () => {
    const result = normalizePaddleOcrResponse(
      {
        items: [
          {
            detectedText: "Listen\nto your body",
            region: { x: 0.2, y: 0.4, w: 0.5, h: 0.16 },
            lineRegions: [
              { x: 0.21, y: 0.41, w: 0.42, h: 0.06 },
              { x: 0.27, y: 0.49, w: 0.28, h: 0.05 },
            ],
            confidence: 0.9,
          },
        ],
      },
      7,
    );

    expect(result.items[0]!.textRegions).toEqual([
      { x: 0.21, y: 0.41, w: 0.42, h: 0.06 },
      { x: 0.27, y: 0.49, w: 0.28, h: 0.05 },
    ]);
  });

  it("normalize PaddleOCR word regions dạng { text, region }", () => {
    const result = normalizePaddleOcrResponse(
      {
        items: [
          {
            detectedText: "Listen",
            region: { x: 0.2, y: 0.4, w: 0.5, h: 0.12 },
            wordRegions: [
              { text: "Listen", region: { x: 0.22, y: 0.42, w: 0.2, h: 0.05 } },
            ],
            confidence: 0.9,
          },
        ],
      },
      7,
    );

    expect(result.items[0]!.textRegions).toEqual([
      { x: 0.22, y: 0.42, w: 0.2, h: 0.05 },
    ]);
  });

  it("giữ OCR mask samples và polygon để GPU inpaint không đoán theo text dịch", () => {
    const result = normalizePaddleOcrResponse(
      {
        items: [
          {
            detectedText: "Listen",
            region: { x: 0.2, y: 0.4, w: 0.3, h: 0.08 },
            confidence: 0.9,
            maskFrames: [
              {
                timestampSec: 1.25,
                regions: [{ x: 0.21, y: 0.41, w: 0.27, h: 0.05 }],
                polygons: [[
                  { x: 0.21, y: 0.41 }, { x: 0.48, y: 0.41 },
                  { x: 0.48, y: 0.46 }, { x: 0.21, y: 0.46 },
                ]],
              },
            ],
          },
        ],
      },
      7,
    );

    expect(result.items[0]!.maskFrames).toEqual([
      expect.objectContaining({
        timestampSec: 1.25,
        regions: [{ x: 0.21, y: 0.41, w: 0.27, h: 0.05 }],
        polygons: expect.any(Array),
      }),
    ]);
  });

  it("group track union từng text region theo dòng", () => {
    const tracks = groupOnScreenTextTracks(
      [
        {
          detectedText: "A\nB",
          translatedText: "A\nB",
          region: { x: 0.2, y: 0.4, w: 0.5, h: 0.2 },
          textRegions: [
            { x: 0.2, y: 0.42, w: 0.4, h: 0.05 },
            { x: 0.3, y: 0.52, w: 0.2, h: 0.05 },
          ],
          timestampSec: 1,
          startSec: 0.8,
          endSec: 1.2,
          toneMood: "meme",
          confidence: 0.9,
          notes: [],
        },
        {
          detectedText: "A\nB",
          translatedText: "A\nB",
          region: { x: 0.22, y: 0.41, w: 0.5, h: 0.2 },
          textRegions: [
            { x: 0.22, y: 0.43, w: 0.42, h: 0.05 },
            { x: 0.29, y: 0.53, w: 0.22, h: 0.05 },
          ],
          timestampSec: 1.2,
          startSec: 1,
          endSec: 1.4,
          toneMood: "meme",
          confidence: 0.9,
          notes: [],
        },
      ],
      7,
    );

    expect(tracks[0]!.textRegions).toHaveLength(2);
    expect(tracks[0]!.textRegions![0]!.x).toBeCloseTo(0.2);
    expect(tracks[0]!.textRegions![0]!.w).toBeCloseTo(0.44);
    expect(tracks[0]!.textRegions![1]!.w).toBeCloseTo(0.22);
  });
});

describe("buildDrawtextTextfileParam", () => {
  it("dùng textfile để tránh newline bị render thành chữ n", () => {
    const param = buildDrawtextTextfileParam("/tmp/overlay text.txt");

    expect(param).toContain("textfile=");
    expect(param).not.toContain("text='");
    expect(param).not.toContain("\\n");
  });
});

describe("buildBoxBlurOverlayFilter", () => {
  it("dùng crop/boxblur/overlay cho text blur thay vì delogo", () => {
    const filter = buildBoxBlurOverlayFilter({
      region: { x: 0.2, y: 0.4, w: 0.42, h: 0.08, startSec: 0, endSec: 7 },
      frameWidth: 1080,
      frameHeight: 1920,
      inputLabel: "0:v",
      outputLabel: "vout",
      baseLabel: "base",
      cropInputLabel: "cropin",
      blurLabel: "blurred",
    });

    expect(filter).toContain("crop=");
    expect(filter).toContain("boxblur=");
    expect(filter).toContain("overlay=");
    expect(filter).toContain("enable=");
    expect(filter).not.toContain("delogo");
  });
});

describe("buildTextInpaintRegions", () => {
  it("uses padded per-line OCR boxes and excludes non-OCR overlays", () => {
    const regions = buildTextInpaintRegions([
      {
        op: "overlayText",
        text: "replacement",
        sourceText: "original",
        coverRegion: true,
        backgroundStyle: "blur",
        startSec: 1,
        endSec: 4,
        textRegions: [
          { x: 0.2, y: 0.3, w: 0.4, h: 0.04 },
          { x: 0.3, y: 0.36, w: 0.22, h: 0.04 },
        ],
      },
      { op: "overlayText", text: "manual", backgroundStyle: "blur", region: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } },
    ], 7);

    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({ startSec: 1, endSec: 4 });
    expect(regions[0]!.x).toBeLessThan(0.2);
    expect(regions[0]!.h).toBeGreaterThan(0.04);
    expect(regions[1]!.y).toBeLessThan(0.36);
  });

  it("removes source text for OCR overlays even when their replacement uses a solid background", () => {
    const regions = buildTextInpaintRegions([{
      op: "overlayText",
      text: "replacement",
      sourceText: "original",
      coverRegion: true,
      backgroundStyle: "solid",
      startSec: 1,
      endSec: 2,
      textRegions: [{ x: 0.4, y: 0.4, w: 0.2, h: 0.04 }],
    }], 3);

    expect(regions).toHaveLength(1);
    expect(regions[0]!.w).toBeGreaterThan(0.2);
  });

  it("uses rectangle regions only as a compatibility fallback when mask samples are absent", () => {
    const regions = buildTextInpaintRegions([{
      op: "overlayText",
      text: "replacement",
      sourceText: "original",
      coverRegion: true,
      startSec: 1,
      endSec: 2,
      textRegions: [{ x: 0.4, y: 0.4, w: 0.2, h: 0.04 }],
      sourceMaskFrames: [{
        timestampSec: 1.5,
        regions: [{ x: 0.4, y: 0.4, w: 0.2, h: 0.04 }],
        polygons: [[{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.44 }, { x: 0.4, y: 0.44 }]],
      }],
    }], 3);

    expect(regions).toEqual([]);
  });
});

describe("buildTextInpaintTracks", () => {
  it("uses OCR samples, preserves polygons, and deduplicates an applied track", () => {
    const op = {
      op: "overlayText" as const,
      text: "Bản dịch",
      sourceText: "Original text",
      coverRegion: true,
      backgroundStyle: "blur" as const,
      startSec: 1,
      endSec: 4,
      sourceMaskFrames: [
        {
          timestampSec: 1.1,
          regions: [{ x: 0.2, y: 0.3, w: 0.4, h: 0.05 }],
          polygons: [[{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.6, y: 0.35 }, { x: 0.2, y: 0.35 }]],
        },
      ],
    };
    const tracks = buildTextInpaintTracks([op, { ...op }], 7);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.frames[0]!.polygons).toHaveLength(1);
    expect(tracks[0]!.frames[0]!.regions[0]).toMatchObject({ x: 0.2, y: 0.3 });
  });

  it("creates a compatible single sample for older OCR overlays", () => {
    const tracks = buildTextInpaintTracks([{
      op: "overlayText",
      text: "replacement",
      sourceText: "original",
      coverRegion: true,
      backgroundStyle: "blur",
      startSec: 2,
      endSec: 6,
      textRegions: [{ x: 0.2, y: 0.5, w: 0.3, h: 0.06 }],
    }], 7);

    expect(tracks[0]!.frames).toEqual([{ timestampSec: 4, regions: [{ x: 0.2, y: 0.5, w: 0.3, h: 0.06 }] }]);
  });

  it("keeps source polygon samples across a text track instead of using replacement text geometry", () => {
    const tracks = buildTextInpaintTracks([{
      op: "overlayText",
      text: "Bản dịch dài hơn rất nhiều",
      sourceText: "Short source",
      coverRegion: true,
      backgroundStyle: "blur",
      startSec: 0,
      endSec: 3,
      sourceMaskFrames: [
        {
          timestampSec: 0.5,
          regions: [{ x: 0.2, y: 0.4, w: 0.15, h: 0.04 }],
          polygons: [[{ x: 0.2, y: 0.4 }, { x: 0.35, y: 0.4 }, { x: 0.35, y: 0.44 }, { x: 0.2, y: 0.44 }]],
        },
        {
          timestampSec: 2.5,
          regions: [{ x: 0.22, y: 0.4, w: 0.15, h: 0.04 }],
          polygons: [[{ x: 0.22, y: 0.4 }, { x: 0.37, y: 0.4 }, { x: 0.37, y: 0.44 }, { x: 0.22, y: 0.44 }]],
        },
      ],
    }], 3);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.frames.map((frame) => frame.timestampSec)).toEqual([0.5, 2.5]);
    expect(tracks[0]!.frames[0]!.regions[0]!.w).toBe(0.15);
  });

  it("does not merge different source tracks that merely overlap on screen", () => {
    const tracks = buildTextInpaintTracks([
      {
        op: "overlayText",
        text: "A",
        sourceText: "Source A",
        coverRegion: true,
        backgroundStyle: "blur",
        startSec: 0,
        endSec: 2,
        sourceMaskFrames: [{ timestampSec: 1, regions: [{ x: 0.2, y: 0.3, w: 0.3, h: 0.06 }] }],
      },
      {
        op: "overlayText",
        text: "B",
        sourceText: "Source B",
        coverRegion: true,
        backgroundStyle: "blur",
        startSec: 0,
        endSec: 2,
        sourceMaskFrames: [{ timestampSec: 1, regions: [{ x: 0.35, y: 0.3, w: 0.3, h: 0.06 }] }],
      },
    ], 2);

    expect(tracks).toHaveLength(2);
  });

  it("deduplicates by stable OCR track ID even when source text changes", () => {
    const sourceMaskFrames = [{ timestampSec: 1, regions: [{ x: 0.2, y: 0.3, w: 0.3, h: 0.06 }] }];
    const tracks = buildTextInpaintTracks([
      { op: "overlayText", text: "A", sourceText: "old OCR", ocrTrackId: "track-1", coverRegion: true, startSec: 0, endSec: 2, sourceMaskFrames },
      { op: "overlayText", text: "A edited", sourceText: "corrected OCR", ocrTrackId: "track-1", coverRegion: true, startSec: 0, endSec: 2, sourceMaskFrames },
    ], 2);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.id).toBe("track-1");
  });
});

describe("text overlay ownership", () => {
  it("does not treat untouched pending OCR overlays as user edits", () => {
    expect(hasRenderableTextOnScreenOverlays([{
      id: "ocr-1", start: 0, end: 1, text: "Dịch", source: "ocr_auto", status: "pending",
      position: { x: 0.5, y: 0.5 }, fontFamily: "Arial", fontSize: 24, fontColor: "#fff", bgColor: "#000", animation: "none",
    }])).toBe(false);
  });

  it("treats manual and explicitly edited OCR overlays as user-owned", () => {
    const base = { id: "overlay", start: 0, end: 1, text: "Dịch", status: "pending" as const, position: { x: 0.5, y: 0.5 }, fontFamily: "Arial", fontSize: 24, fontColor: "#fff", bgColor: "#000", animation: "none" as const };
    expect(hasRenderableTextOnScreenOverlays([{ ...base, source: "manual" }])).toBe(true);
    expect(hasRenderableTextOnScreenOverlays([{ ...base, source: "ocr_auto", isEdited: true }])).toBe(true);
  });

  it("keeps OCR translation enabled for an edited OCR overlay", () => {
    const overlay = {
      id: "ocr-1", start: 0, end: 1, text: "Dịch", source: "ocr_auto" as const, isEdited: true,
      status: "approved" as const, position: { x: 0.5, y: 0.5 }, fontFamily: "Arial", fontSize: 24,
      fontColor: "#fff", bgColor: "#000", animation: "none" as const,
    };
    expect(hasManualTextOnScreenOverlays([overlay])).toBe(false);
  });
});

describe("buildRemixOptionsFromPreset", () => {
  it("snapshot đầy đủ style OCR và watermark per-ratio cho auto generate", () => {
    const options = buildRemixOptionsFromPreset({
      output_ratio: "9:16",
      target_language: "vi",
      auto_vietsub: true,
      auto_dub: true,
      dub_mode: "preserve_bgm",
      voice_name: "vi-VN-WaveNet-A",
      sub_font: "Be Vietnam Pro",
      sub_font_size: 36,
      sub_color: "#FFFFFF",
      sub_bg_color: "#000000",
      sub_highlight_color: "#FFF200",
      sub_bold: true,
      sub_italic: false,
      sub_outline: 2,
      sub_border_style: 1,
      sub_position: "custom",
      sub_custom_y: 0.63,
      subtitle_preset: "tiktok_bold",
      subtitle_animation: "reveal_words",
      translate_on_screen_text: true,
      on_screen_text_preset: "meme",
      on_screen_text_font: "Anton",
      on_screen_text_size: 42,
      on_screen_text_size_mode: "auto_fit",
      on_screen_text_color: "#FFFF00",
      on_screen_text_bg_color: "#111111",
      on_screen_text_background_style: "blur",
      on_screen_text_background_opacity: 0,
      on_screen_text_outline_color: "#000000",
      on_screen_text_outline_width: 4,
      on_screen_text_bold: true,
      on_screen_text_italic: true,
      watermark_defaults: {
        enabled: true,
        type: "text",
        text: "sport community",
        perRatioPosition: { "9:16": { x: 0.5, y: 0.9 } },
        perRatioScale: { "9:16": 0.18 },
      },
    });

    expect(options.subtitleConfig?.font).toBe("Be Vietnam Pro");
    expect(options.subtitleConfig?.position).toBe("custom");
    expect(options.subtitleConfig?.customY).toBe(0.63);
    expect(options.subtitleConfig?.animation).toBe("reveal_words");
    expect(options.onScreenTextStyle?.sizeMode).toBe("auto_fit");
    expect(options.onScreenTextStyle?.color).toBe("#FFFF00");
    expect(options.onScreenTextStyle?.backgroundStyle).toBe("blur");
    expect(options.onScreenTextStyle?.backgroundOpacity).toBe(0);
    expect(options.onScreenTextStyle?.outlineWidth).toBe(4);
    expect(options.onScreenTextStyle?.italic).toBe(true);
    expect(options.watermarkConfig?.perRatioScale?.["9:16"]).toBe(0.18);
    expect(options.dubMode).toBe("preserve_bgm");
  });
});

describe("transformRegionForReframe", () => {
  it("map bbox từ video ngang sang output dọc crop đúng vị trí", () => {
    const region = transformRegionForReframe(
      { x: 0.45, y: 0.08, w: 0.1, h: 0.12 },
      1920,
      1080,
      { op: "reframe", width: 1080, height: 1920, mode: "crop" },
    );

    expect(region.x + region.w / 2).toBeCloseTo(0.5, 2);
    expect(region.y).toBeCloseTo(0.08, 2);
    expect(region.w).toBeGreaterThan(0.25);
    expect(region.h).toBeCloseTo(0.12, 2);
  });

  it("map bbox sang output pad có tính offset letterbox", () => {
    const region = transformRegionForReframe(
      { x: 0.25, y: 0.8, w: 0.5, h: 0.1 },
      1080,
      1920,
      { op: "reframe", width: 1920, height: 1080, mode: "pad" },
    );

    expect(region.x).toBeGreaterThan(0.35);
    expect(region.x + region.w).toBeLessThan(0.65);
    expect(region.y).toBeCloseTo(0.8, 2);
  });
});
