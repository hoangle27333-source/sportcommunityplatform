import { describe, expect, it } from "vitest";
import { sanitizeVideoOps } from "./planner";
import {
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
  clampSameSlotTiming,
  groupOnScreenTextTracks,
} from "./on-screen-text";
import { buildFacebookCopyrightPreflight } from "./copyright-preflight";
import { normalizePaddleOcrResponse } from "./ocr-service";
import { buildRemixOptionsFromPreset } from "./preset-options";
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
      on_screen_text_outline_color: "#000000",
      on_screen_text_bold: true,
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
