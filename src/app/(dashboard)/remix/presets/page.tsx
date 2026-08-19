"use client";

import React from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { LegacyTabs as Tabs } from "@/components/ui/tabs";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/field";
import { ColorFieldWithOpacity } from "@/components/ui/color-field-with-opacity";
import { Plus, Check, Edit2, Trash2, Image as ImageIcon, Video, Type, Mic, Type as TypeIcon, Captions, Droplet } from "lucide-react";
import { VoiceSelector } from "@/components/remix/voice-selector";
import {
  SubtitleConfig,
  defaultSubtitleSettings,
  type SubtitleSettings,
} from "@/components/remix/subtitle-config";
import { RatioPicker } from "@/components/remix/ratio-picker";
import { BlurRegionPicker, type BlurRegion } from "@/components/remix/blur-region-picker";
import {
  captionPresetToManualInput,
  normalizeStringArray,
  type CaptionPresetManualInput,
} from "@/lib/remix/caption-preset-options";
import { VIETNAMESE_FONTS } from "@/lib/remix/fonts";

const ImageEditor = dynamic(() => import("@/components/shared/image-editor"), { ssr: false });

type PresetKind = "video" | "image" | "caption";
type OnScreenTextPreset = "meme" | "pop" | "bubble" | "neon" | "clean";
type OnScreenTextSizeMode = "auto_fit" | "fixed";
type WatermarkMode = "disabled" | "text" | "image";
type ImageTranslateMode = "overlay" | "regenerate" | "none";

type PresetRow = Record<string, any>;

const ON_SCREEN_TEXT_PRESETS: Record<
  OnScreenTextPreset,
  { label: string; font: string; size: number; color: string; bgColor: string; outlineColor: string; bold: boolean }
> = {
  meme: { label: "Meme Impact", font: "Anton", size: 34, color: "#FFFFFF", bgColor: "#000000", outlineColor: "#000000", bold: true },
  pop: { label: "Pop Sticker", font: "Montserrat", size: 34, color: "#FFF200", bgColor: "#FF2A6D", outlineColor: "#101010", bold: true },
  bubble: { label: "Bubble", font: "Baloo 2", size: 32, color: "#111111", bgColor: "#FFFFFF", outlineColor: "#FFB703", bold: true },
  neon: { label: "Neon Reel", font: "Oswald", size: 32, color: "#00F5FF", bgColor: "#090A18", outlineColor: "#FF00E5", bold: true },
  clean: { label: "Clean Caption", font: "Be Vietnam Pro", size: 28, color: "#FFFFFF", bgColor: "#111827", outlineColor: "#111827", bold: false },
};

const QUALITY_PRESETS = [
  { label: "Siêu nét", desc: "Phim, TV — file lớn", crf: 14 },
  { label: "Chất lượng cao", desc: "Upload web, archive", crf: 18 },
  { label: "Chuẩn", desc: "TikTok / Reels / Shorts", crf: 22 },
  { label: "Nén nhẹ", desc: "File nhỏ hơn, stream tốt", crf: 26 },
  { label: "Nhỏ nhất", desc: "Tối ưu dung lượng", crf: 30 },
];

const PLATFORM_OPTIONS = [
  "TikTok",
  "Instagram Reels",
  "Facebook Reels",
  "YouTube Shorts",
  "Facebook Page",
  "LinkedIn",
  "X/Twitter",
  "Threads",
];

function emptyImageTemplateState() {
  return undefined as Record<string, unknown> | undefined;
}

function emptyCaptionPresetState(): CaptionPresetManualInput {
  return {
    platforms: [],
    toneAndVoice: "",
    audience: "",
    captionLength: "",
    hookStyle: "",
    cta: "",
    requiredHashtags: [],
    optionalHashtags: [],
    bannedHashtags: [],
    requiredKeywords: [],
    bannedKeywords: [],
    emojiStyle: "",
    formatStyle: "",
    brandRules: "",
    sampleCaptions: "",
    extraInstructions: "",
  };
}

function tagsToText(values: string[] | undefined) {
  return (values ?? []).join(", ");
}

function textToTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function PresetPage() {
  const [presetKind, setPresetKind] = React.useState<PresetKind>("video");
  const [videoTab, setVideoTab] = React.useState<"general" | "voice" | "subtitle" | "onscreen" | "watermark">("general");
  const [videoPresets, setVideoPresets] = React.useState<PresetRow[]>([]);
  const [imagePresets, setImagePresets] = React.useState<PresetRow[]>([]);
  const [captionPresets, setCaptionPresets] = React.useState<PresetRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [settingDefaultId, setSettingDefaultId] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [voice, setVoice] = React.useState("vi-VN-WaveNet-A");
  const [targetLanguage, setTargetLanguage] = React.useState<"vi" | "en">("vi");
  const [dubMode, setDubMode] = React.useState<"none" | "full" | "preserve_bgm" | "heygen">("none");
  const [subtitleConfig, setSubtitleConfig] = React.useState<SubtitleSettings>(defaultSubtitleSettings);
  const [ratio, setRatio] = React.useState("9:16");
  const [crf, setCrf] = React.useState("18");
  const [blurOriginalSub, setBlurOriginalSub] = React.useState(false);
  const [autoDetectSub, setAutoDetectSub] = React.useState(false);
  const [disableSubtitle, setDisableSubtitle] = React.useState(false);
  const [subtitleLanguage, setSubtitleLanguage] = React.useState<"vi" | "en">("vi");
  const [blurRegion, setBlurRegion] = React.useState<BlurRegion>({ x: 0, y: 0.82, w: 1, h: 0.18 });
  const [translateOnScreenText, setTranslateOnScreenText] = React.useState(false);
  const [onScreenTextPreset, setOnScreenTextPreset] = React.useState<OnScreenTextPreset>("meme");
  const [onScreenTextFont, setOnScreenTextFont] = React.useState("Anton");
  const [onScreenTextSize, setOnScreenTextSize] = React.useState("34");
  const [onScreenTextSizeMode, setOnScreenTextSizeMode] = React.useState<OnScreenTextSizeMode>("auto_fit");
  const [onScreenTextColor, setOnScreenTextColor] = React.useState("#FFFFFF");
  const [onScreenTextBgColor, setOnScreenTextBgColor] = React.useState("#000000");
  const [onScreenTextBackgroundStyle, setOnScreenTextBackgroundStyle] = React.useState<"solid" | "blur">("solid");
  const [onScreenTextBackgroundOpacity, setOnScreenTextBackgroundOpacity] = React.useState(0.72);
  const [onScreenTextOutlineColor, setOnScreenTextOutlineColor] = React.useState("#000000");
  const [onScreenTextOutlineWidth, setOnScreenTextOutlineWidth] = React.useState(2);
  const [onScreenTextBold, setOnScreenTextBold] = React.useState(true);
  const [onScreenTextItalic, setOnScreenTextItalic] = React.useState(false);
  const [imageTranslate, setImageTranslate] = React.useState<ImageTranslateMode>("none");

  const [watermarkMode, setWatermarkMode] = React.useState<WatermarkMode>("disabled");
  const [watermarkText, setWatermarkText] = React.useState("");
  const [watermarkImageMediaId, setWatermarkImageMediaId] = React.useState("");
  const [watermarkOpacity, setWatermarkOpacity] = React.useState("0.9");
  const [watermarkScale, setWatermarkScale] = React.useState("0.15");
  const [watermarkPosition, setWatermarkPosition] = React.useState("bottom-right");
  const [watermarkPositionX, setWatermarkPositionX] = React.useState("0.5");
  const [watermarkPositionY, setWatermarkPositionY] = React.useState("0.5");
  // Per-ratio watermark positions
  const WATERMARK_RATIOS = ["9:16", "16:9", "1:1", "4:5"] as const;
  type WatermarkRatioKey = typeof WATERMARK_RATIOS[number];
  const [watermarkRatioTab, setWatermarkRatioTab] = React.useState<WatermarkRatioKey>("9:16");
  const [watermarkPositionsByRatio, setWatermarkPositionsByRatio] = React.useState<Record<WatermarkRatioKey, { position: string; positionX: string; positionY: string }>>(
    () => Object.fromEntries(["9:16", "16:9", "1:1", "4:5"].map(r => [r, { position: "bottom-right", positionX: "0.5", positionY: "0.5" }])) as Record<WatermarkRatioKey, { position: string; positionX: string; positionY: string }>
  );

  const [templateImage, setTemplateImage] = React.useState<{ id: string; url: string } | null>(null);
  const [templateLoading, setTemplateLoading] = React.useState(false);
  const [editorTemplate, setEditorTemplate] = React.useState<Record<string, unknown> | undefined>(emptyImageTemplateState());
  const [showTemplateEditor, setShowTemplateEditor] = React.useState(false);

  const [captionPreset, setCaptionPreset] = React.useState<CaptionPresetManualInput>(emptyCaptionPresetState());

  const activePresets =
    presetKind === "video"
      ? videoPresets
      : presetKind === "image"
        ? imagePresets
        : captionPresets;

  const fetchAll = React.useCallback(async () => {
    try {
      setLoading(true);
      const [videoRes, imageRes, captionRes] = await Promise.all([
        fetch("/api/remix/presets", { cache: "no-store" }),
        fetch("/api/remix/image-presets", { cache: "no-store" }),
        fetch("/api/remix/caption-presets", { cache: "no-store" }),
      ]);
      const [videoData, imageData, captionData] = await Promise.all([
        videoRes.json(),
        imageRes.json(),
        captionRes.json(),
      ]);
      setVideoPresets(videoData.presets ?? []);
      setImagePresets(imageData.presets ?? []);
      setCaptionPresets(captionData.presets ?? []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const applyOnScreenPreset = React.useCallback((preset: OnScreenTextPreset) => {
    const style = ON_SCREEN_TEXT_PRESETS[preset];
    setOnScreenTextPreset(preset);
    setOnScreenTextFont(style.font);
    setOnScreenTextSize(String(style.size));
    setOnScreenTextColor(style.color);
    setOnScreenTextBgColor(style.bgColor);
    setOnScreenTextBackgroundStyle("solid");
    setOnScreenTextBackgroundOpacity(0.72);
    setOnScreenTextOutlineColor(style.outlineColor);
    setOnScreenTextOutlineWidth(2);
    setOnScreenTextBold(style.bold);
  }, []);

  const resetForm = React.useCallback((kind: PresetKind) => {
    setPresetKind(kind);
    setVideoTab("general");
    setEditingId(null);
    setName("");
    setVoice("vi-VN-WaveNet-A");
    setTargetLanguage("vi");
    setDubMode("none");
    setSubtitleConfig(defaultSubtitleSettings);
    setRatio("9:16");
    setCrf("18");
    setBlurOriginalSub(false);
    setAutoDetectSub(false);
    setBlurRegion({ x: 0, y: 0.82, w: 1, h: 0.18 });
    setTranslateOnScreenText(false);
    applyOnScreenPreset("meme");
    setOnScreenTextSizeMode("auto_fit");
    setOnScreenTextItalic(false);
    setImageTranslate("none");
    setWatermarkMode("disabled");
    setWatermarkText("");
    setWatermarkImageMediaId("");
    setWatermarkOpacity("0.9");
    setWatermarkScale("0.15");
    setWatermarkPosition("bottom-right");
    setWatermarkPositionX("0.5");
    setWatermarkPositionY("0.5");
    setTemplateImage(null);
    setEditorTemplate(emptyImageTemplateState());
    setShowTemplateEditor(false);
    setCaptionPreset(emptyCaptionPresetState());
    setIsCreating(true);
  }, [applyOnScreenPreset]);

  function openCreate(kind: PresetKind) {
    resetForm(kind);
  }

  function openEdit(kind: PresetKind, row: PresetRow) {
    setPresetKind(kind);
    setEditingId(row.id);
    setName(row.name ?? "");
    setRatio(row.output_ratio ?? "9:16");

    const wm = row.watermark_defaults ?? {};
    setWatermarkMode(!wm?.enabled ? "disabled" : wm.type === "image" ? "image" : "text");
    setWatermarkText(wm.text ?? "");
    setWatermarkImageMediaId(wm.imageMediaId ?? "");
    setWatermarkOpacity(String(wm.opacity ?? 0.9));
    setWatermarkScale(String(wm.scale ?? 0.15));
    setWatermarkPosition(wm.position ?? "bottom-right");
    setWatermarkPositionX(String(wm.positionX ?? 0.5));
    setWatermarkPositionY(String(wm.positionY ?? 0.5));
    // Load per-ratio positions
    {
      const defaultPos = { position: wm.position ?? "bottom-right", positionX: String(wm.positionX ?? 0.5), positionY: String(wm.positionY ?? 0.5) };
      setWatermarkPositionsByRatio(
        Object.fromEntries((["9:16", "16:9", "1:1", "4:5"] as const).map(r => {
          const rp = (wm.positionsByRatio as any)?.[r];
          return [r, rp ? { position: rp.position ?? defaultPos.position, positionX: String(rp.positionX ?? 0.5), positionY: String(rp.positionY ?? 0.5) } : { ...defaultPos }];
        })) as Record<WatermarkRatioKey, { position: string; positionX: string; positionY: string }>
      );
      setWatermarkRatioTab("9:16");
    }

    if (kind === "video") {
      setVoice(row.voice_name ?? "vi-VN-WaveNet-A");
      setTargetLanguage(row.target_language === "en" ? "en" : "vi");
      setDubMode((row.dub_mode ?? (row.auto_dub ? "full" : "none")) as "none" | "full" | "preserve_bgm" | "heygen");
      setSubtitleConfig({
        preset: row.subtitle_preset || defaultSubtitleSettings.preset,
        font: row.sub_font || defaultSubtitleSettings.font,
        size: row.sub_font_size || defaultSubtitleSettings.size,
        color: row.sub_color || defaultSubtitleSettings.color,
        bgColor: row.sub_bg_color || defaultSubtitleSettings.bgColor,
        highlightColor: row.sub_highlight_color || defaultSubtitleSettings.highlightColor,
        bold: row.sub_bold ?? defaultSubtitleSettings.bold,
        italic: row.sub_italic ?? defaultSubtitleSettings.italic,
        outline: row.sub_outline ?? defaultSubtitleSettings.outline,
        borderStyle: row.sub_border_style ?? defaultSubtitleSettings.borderStyle,
        backgroundBlur: Boolean(row.sub_background_blur ?? false),
        position: row.sub_position || defaultSubtitleSettings.position,
        customY: row.sub_custom_y ?? defaultSubtitleSettings.customY,
        animation: row.subtitle_animation || defaultSubtitleSettings.animation,
      });
      setCrf(String(row.output_crf ?? 18));
      setBlurOriginalSub(Boolean(row.blur_original_sub));
      setAutoDetectSub(Boolean(row.auto_detect_subtitle_region));
      setDisableSubtitle(row.auto_vietsub === false);
      setTranslateOnScreenText(Boolean(row.translate_on_screen_text));
      setOnScreenTextPreset((row.on_screen_text_preset ?? "meme") as OnScreenTextPreset);
      setOnScreenTextFont(row.on_screen_text_font ?? "Anton");
      setOnScreenTextSize(String(row.on_screen_text_size ?? 34));
      setOnScreenTextSizeMode((row.on_screen_text_size_mode ?? "auto_fit") as OnScreenTextSizeMode);
      setOnScreenTextColor(row.on_screen_text_color ?? "#FFFFFF");
      setOnScreenTextBgColor(row.on_screen_text_bg_color ?? "#000000");
      setOnScreenTextBackgroundStyle((row.on_screen_text_background_style ?? "solid") as "solid" | "blur");
      setOnScreenTextBackgroundOpacity(Number.isFinite(row.on_screen_text_background_opacity) ? row.on_screen_text_background_opacity : 0.72);
      setOnScreenTextOutlineColor(row.on_screen_text_outline_color ?? "#000000");
      setOnScreenTextOutlineWidth(Number.isFinite(row.on_screen_text_outline_width) ? row.on_screen_text_outline_width : 2);
      setOnScreenTextBold(Boolean(row.on_screen_text_bold ?? true));
      setOnScreenTextItalic(Boolean(row.on_screen_text_italic ?? false));
    } else if (kind === "image") {
      setImageTranslate((row.image_translate ?? "none") as ImageTranslateMode);
      setEditorTemplate(row.editor_template ?? emptyImageTemplateState());
    } else {
      setCaptionPreset(captionPresetToManualInput(row));
      setWatermarkMode("disabled");
    }
    setVideoTab("general");
    setIsCreating(true);
  }

  function buildWatermarkDefaults() {
    if (watermarkMode === "disabled") return {};
    const positionsByRatio = Object.fromEntries(
      (["9:16", "16:9", "1:1", "4:5"] as const).map(r => {
        const p = watermarkPositionsByRatio[r];
        return [r, { position: p.position, positionX: p.position === "custom" ? Number(p.positionX) : undefined, positionY: p.position === "custom" ? Number(p.positionY) : undefined }];
      })
    );
    const legacy = watermarkPositionsByRatio["9:16"];
    return {
      enabled: true,
      type: watermarkMode,
      text: watermarkMode === "text" ? watermarkText.trim() || undefined : undefined,
      imageMediaId: watermarkMode === "image" ? watermarkImageMediaId.trim() || undefined : undefined,
      opacity: Number(watermarkOpacity),
      scale: Number(watermarkScale),
      // Legacy fallback = 9:16 position
      position: legacy.position,
      positionX: legacy.position === "custom" ? Number(legacy.positionX) : undefined,
      positionY: legacy.position === "custom" ? Number(legacy.positionY) : undefined,
      positionsByRatio,
    };
  }

  async function handleSave() {
    try {
      let baseUrl = "/api/remix/presets";
      let payload: Record<string, unknown>;

      if (presetKind === "video") {
        payload = {
          name,
          targetLanguage,
          voiceName: voice,
          subtitlePreset: subtitleConfig.preset,
          subtitleAnimation: subtitleConfig.animation,
          subFont: subtitleConfig.font,
          subFontSize: subtitleConfig.size,
          subColor: subtitleConfig.color,
          subBgColor: subtitleConfig.bgColor,
          subHighlightColor: subtitleConfig.highlightColor,
          subBold: subtitleConfig.bold,
          subItalic: subtitleConfig.italic,
          subOutline: subtitleConfig.outline,
          subBorderStyle: subtitleConfig.borderStyle,
          subBackgroundBlur: subtitleConfig.backgroundBlur ?? false,
          subPosition: subtitleConfig.position,
          subCustomY: subtitleConfig.customY,
          outputRatio: ratio,
          outputCrf: Number(crf),
          blurOriginalSub,
          autoDetectSubtitleRegion: autoDetectSub,
          blurRegion,
          autoVietsub: !disableSubtitle,
          translateOnScreenText,
          onScreenTextPreset,
          onScreenTextFont,
          onScreenTextSize: Number(onScreenTextSize),
            onScreenTextSizeMode,
            onScreenTextColor,
            onScreenTextBgColor,
            onScreenTextBackgroundStyle,
            onScreenTextBackgroundOpacity,
            onScreenTextOutlineColor,
            onScreenTextOutlineWidth,
            onScreenTextBold,
            onScreenTextItalic,
          autoDub: dubMode !== "none",
          dubMode,
          watermarkDefaults: buildWatermarkDefaults(),
        };
      } else if (presetKind === "image") {
        baseUrl = "/api/remix/image-presets";
        payload = {
          name,
          outputRatio: ratio,
          imageTranslate: imageTranslate === "none" ? null : imageTranslate,
          watermarkDefaults: buildWatermarkDefaults(),
          editorTemplate,
        };
      } else {
        baseUrl = "/api/remix/caption-presets";
        payload = {
          name,
          platforms: captionPreset.platforms ?? [],
          toneAndVoice: captionPreset.toneAndVoice ?? null,
          audience: captionPreset.audience ?? null,
          captionLength: captionPreset.captionLength ?? null,
          hookStyle: captionPreset.hookStyle ?? null,
          cta: captionPreset.cta ?? null,
          requiredHashtags: captionPreset.requiredHashtags ?? [],
          optionalHashtags: captionPreset.optionalHashtags ?? [],
          bannedHashtags: captionPreset.bannedHashtags ?? [],
          requiredKeywords: captionPreset.requiredKeywords ?? [],
          bannedKeywords: captionPreset.bannedKeywords ?? [],
          emojiStyle: captionPreset.emojiStyle ?? null,
          formatStyle: captionPreset.formatStyle ?? null,
          brandRules: captionPreset.brandRules ?? null,
          sampleCaptions: captionPreset.sampleCaptions ?? null,
          extraInstructions: captionPreset.extraInstructions ?? null,
        };
      }

      const res = await fetch(editingId ? `${baseUrl}/${editingId}` : baseUrl, {
        method: editingId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Lưu preset thất bại");
      await fetchAll();
      setIsCreating(false);
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Bạn có chắc chắn muốn xoá preset này?")) return;
    try {
      const baseUrl =
        presetKind === "video"
          ? "/api/remix/presets"
          : presetKind === "image"
            ? "/api/remix/image-presets"
            : "/api/remix/caption-presets";
      const res = await fetch(`${baseUrl}/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Xoá preset thất bại");
      await fetchAll();
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      setSettingDefaultId(id);
      const baseUrl =
        presetKind === "video"
          ? "/api/remix/presets"
          : presetKind === "image"
            ? "/api/remix/image-presets"
            : "/api/remix/caption-presets";
      const res = await fetch(`${baseUrl}/${id}/default`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Thiết lập mặc định thất bại");
      await fetchAll();
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setSettingDefaultId(null);
    }
  }

  async function handleTemplateUpload(file: File) {
    try {
      setTemplateLoading(true);
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tải ảnh template thất bại");
      setTemplateImage({ id: data.asset.id, url: data.asset.url });
      setShowTemplateEditor(true);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setTemplateLoading(false);
    }
  }

  function renderVideoForm() {
    return (
      <div className="space-y-6">
        {/* Fixed Header section for Video Preset */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Field label="Tên preset">
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="TikTok bold dub" />}
          </Field>
        </div>

        {/* Internal Tabs for Video Preset */}
        <div>
          <div className="tab-bar">
            <button
              type="button"
              onClick={() => setVideoTab("general")}
              aria-selected={videoTab === "general"}
              className="tab-item"
            >
              Cài đặt chung
            </button>
            <button
              type="button"
              onClick={() => setVideoTab("voice")}
              aria-selected={videoTab === "voice"}
              className="tab-item"
            >
              <Mic className="w-3.5 h-3.5" /> Giọng đọc
            </button>
            <button
              type="button"
              onClick={() => setVideoTab("subtitle")}
              aria-selected={videoTab === "subtitle"}
              className="tab-item"
            >
              <TypeIcon className="w-3.5 h-3.5" /> Phụ đề
            </button>
            <button
              type="button"
              onClick={() => setVideoTab("onscreen")}
              aria-selected={videoTab === "onscreen"}
              className="tab-item relative"
            >
              <Captions className="w-3.5 h-3.5" /> Text on-screen
              {translateOnScreenText && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary border-2 border-card" />}
            </button>
            <button
              type="button"
              onClick={() => setVideoTab("watermark")}
              aria-selected={videoTab === "watermark"}
              className="tab-item relative"
            >
              <Droplet className="w-3.5 h-3.5" /> Watermark
              {watermarkMode !== "disabled" && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary border-2 border-card" />}
            </button>
          </div>

          <div className="mt-6">
            {videoTab === "general" && (
               <div className="grid gap-6 lg:grid-cols-2">
                 <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Tỉ lệ đầu ra</label>
                      <RatioPicker value={ratio} onChange={setRatio} />
                    </div>
                 </div>
                 <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Chất lượng video đầu ra</label>
                      <div className="space-y-1.5">
                        {QUALITY_PRESETS.map(preset => {
                          const isActive = Number(crf) === preset.crf;
                          return (
                            <button
                              key={preset.crf}
                              type="button"
                              onClick={() => setCrf(String(preset.crf))}
                              className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-all ${
                                isActive ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted"
                              }`}
                            >
                              <span className="font-medium">{preset.label}</span>
                              <span className={`text-xs ${isActive ? "text-primary/80" : "text-muted-foreground"}`}>{preset.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">Mức đã chọn tương đương CRF {crf} (thấp = chất lượng cao hơn)</p>
                    </div>
                 </div>
               </div>
            )}

            {videoTab === "voice" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Ngôn ngữ & giọng đọc</label>
                    <div className="flex gap-2">
                      <Button variant={targetLanguage === "vi" ? "primary" : "outline"} size="sm" onClick={() => setTargetLanguage("vi")}>Tiếng Việt</Button>
                      <Button variant={targetLanguage === "en" ? "primary" : "outline"} size="sm" onClick={() => setTargetLanguage("en")}>English</Button>
                    </div>
                    <VoiceSelector value={voice} onChange={setVoice} />
                  </div>
                </div>
                <div className="space-y-4">
                  <Field label="Chế độ lồng tiếng">
                    {(p) => (
                      <Select {...p} value={dubMode} onChange={(e) => setDubMode(e.target.value as typeof dubMode)}>
                        <option value="none">Không lồng tiếng</option>
                        <option value="full">Thay toàn bộ audio</option>
                        <option value="preserve_bgm">Giữ nhạc nền</option>
                        <option value="heygen">HeyGen lip-sync</option>
                      </Select>
                    )}
                  </Field>
                </div>
              </div>
            )}

            {videoTab === "subtitle" && (
              <div className="space-y-5">
                {/* Row 1: Enable/Disable + Language picker side by side */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Enable/Disable toggle */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <div
                      onClick={() => setDisableSubtitle(v => !v)}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                        !disableSubtitle ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        !disableSubtitle ? "translate-x-5" : "translate-x-0"
                      }`} />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground">
                        {disableSubtitle ? "🔕 Tắt phụ đề" : "✅ Bật phụ đề"}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {disableSubtitle ? "Không burn-in phụ đề vào video" : "Tạo và burn-in phụ đề dịch"}
                      </p>
                    </div>
                  </label>

                  {/* Language picker — only shown when subtitle is enabled */}
                  {!disableSubtitle && (
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs font-semibold text-foreground">Ngôn ngữ phụ đề:</span>
                      {(["vi", "en"] as const).map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => setSubtitleLanguage(lang)}
                          className={`px-3 py-1 rounded-full border text-xs font-medium transition-all ${
                            subtitleLanguage === lang
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          {lang === "vi" ? "🇻🇳 Tiếng Việt" : "🇺🇸 English"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Subtitle config — hidden when disabled */}
                {!disableSubtitle && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <SubtitleConfig
                        value={subtitleConfig}
                        onChange={setSubtitleConfig}
                        title="Cấu hình phụ đề"
                        sampleText="Đây là subtitle demo theo preset"
                        autoDescription="Preset này sẽ áp dụng cho subtitle burn-in khi job video dùng preset."
                      />
                    </div>
                    <div className="space-y-4">
                      <BlurRegionPicker
                        region={blurRegion}
                        onChange={setBlurRegion}
                        defaultEnabled={blurOriginalSub}
                        onToggle={(value) => setBlurOriginalSub(value)}
                        autoDetect={autoDetectSub}
                        onAutoDetectChange={setAutoDetectSub}
                        label="Blur subtitle gốc"
                        autoDetectLabel="AI tự phát hiện vùng subtitle gốc"
                        autoDetectDescription="Dùng khi source đã có phụ đề và cần che trước khi burn-in phụ đề mới."
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {videoTab === "onscreen" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <Checkbox
                    label="Dịch text on-screen"
                    description="Lưu mặc định style chữ cho phần text overlay tự động."
                    checked={translateOnScreenText}
                    onChange={(e) => setTranslateOnScreenText(e.target.checked)}
                  />
                  
                  {translateOnScreenText && (
                    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(Object.entries(ON_SCREEN_TEXT_PRESETS) as Array<[OnScreenTextPreset, typeof ON_SCREEN_TEXT_PRESETS[OnScreenTextPreset]]>).map(([key, style]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => applyOnScreenPreset(key)}
                            className={`rounded-md border px-3 py-2 text-left text-sm ${onScreenTextPreset === key ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted"}`}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Font chữ">
                          {(p) => (
                            <Select {...p} value={onScreenTextFont} onChange={(e) => setOnScreenTextFont(e.target.value)}>
                              {VIETNAMESE_FONTS.map((f) => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </Select>
                          )}
                        </Field>
                        <Field label="Cỡ chữ / Size mode">
                          {(p) => (
                            <div className="flex gap-2">
                              <Select {...p} value={onScreenTextSizeMode} onChange={(e) => setOnScreenTextSizeMode(e.target.value as OnScreenTextSizeMode)} className="flex-1">
                                <option value="auto_fit">Auto fit</option>
                                <option value="fixed">Fixed</option>
                              </Select>
                              {onScreenTextSizeMode === "fixed" && (
                                <Input type="number" min={1} max={200} value={onScreenTextSize} onChange={(e) => setOnScreenTextSize(e.target.value)} className="w-20 text-center" placeholder="Size" />
                              )}
                            </div>
                          )}
                        </Field>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ColorFieldWithOpacity label="Màu chữ" value={onScreenTextColor} onChange={setOnScreenTextColor} fallback="#FFFFFF" />
                        <ColorFieldWithOpacity label="Màu viền" value={onScreenTextOutlineColor} onChange={setOnScreenTextOutlineColor} fallback="#000000" />
                        <Field label={`Độ dày viền (${onScreenTextOutlineWidth}px)`}>
                          {(p) => (
                            <input
                              {...p}
                              type="range"
                              min="0"
                              max="10"
                              step="0.5"
                              value={onScreenTextOutlineWidth}
                              onChange={(e) => setOnScreenTextOutlineWidth(Number(e.target.value))}
                            />
                          )}
                        </Field>
                      </div>
                      <div className="space-y-3">
                        <Field label="Kiểu nền">
                          {(p) => (
                            <div className="flex gap-2">
                              {(["solid", "blur"] as const).map((style) => (
                                <button
                                  key={style}
                                  type="button"
                                  onClick={() => setOnScreenTextBackgroundStyle(style)}
                                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all ${
                                    onScreenTextBackgroundStyle === style
                                      ? "border-primary bg-primary/10 text-primary font-medium"
                                      : "border-border bg-background hover:bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {style === "solid" ? "🎨 Solid" : "🌫️ Blur"}
                                </button>
                              ))}
                            </div>
                          )}
                        </Field>

                        {onScreenTextBackgroundStyle === "solid" && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <ColorFieldWithOpacity label="Màu nền" value={onScreenTextBgColor} onChange={setOnScreenTextBgColor} fallback="#000000" />
                            <Field label={`Opacity nền (${onScreenTextBackgroundOpacity.toFixed(2)})`}>
                              {(p) => (
                                <input
                                  {...p}
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={onScreenTextBackgroundOpacity}
                                  onChange={(e) => setOnScreenTextBackgroundOpacity(Number(e.target.value))}
                                />
                              )}
                            </Field>
                          </div>
                        )}

                        {onScreenTextBackgroundStyle === "blur" && (
                          <p className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 border border-border/50">
                            🌫️ Blur background tự động làm mờ vùng phía sau chữ — không cần chọn màu hay opacity.
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <Checkbox label="In đậm" checked={onScreenTextBold} onChange={(e) => setOnScreenTextBold(e.target.checked)} />
                        <Checkbox label="In nghiêng" checked={onScreenTextItalic} onChange={(e) => setOnScreenTextItalic(e.target.checked)} />
                      </div>
                    </div>
                  )}
                </div>
                
                {translateOnScreenText && (
                  <div className="space-y-4">
                     <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4 sticky top-6">
                        <h4 className="text-sm font-medium">On-Screen Text Preview</h4>
                        <div className="rounded-md bg-zinc-950 p-4 text-center min-h-[160px] flex items-center justify-center relative overflow-hidden border border-border/50">
                          <span
                            className="inline-block px-3 py-2 leading-tight max-w-[80%]"
                            style={{
                              fontFamily: onScreenTextFont,
                              fontSize: onScreenTextSizeMode === "fixed" ? `${onScreenTextSize}px` : "28px",
                              color: onScreenTextColor,
                              backgroundColor: onScreenTextBackgroundStyle === "blur"
                                ? "rgba(15,23,42,0.5)"
                                : `${onScreenTextBgColor}${Math.round(onScreenTextBackgroundOpacity * 255).toString(16).padStart(2, '0')}`,
                              backdropFilter: onScreenTextBackgroundStyle === "blur" ? "blur(10px)" : undefined,
                              WebkitBackdropFilter: onScreenTextBackgroundStyle === "blur" ? "blur(10px)" : undefined,
                              WebkitTextStroke: onScreenTextOutlineColor && onScreenTextOutlineColor !== "transparent" && onScreenTextOutlineWidth > 0 ? `${onScreenTextOutlineWidth}px ${onScreenTextOutlineColor}` : undefined,
                              fontWeight: onScreenTextBold ? 800 : 500,
                              fontStyle: onScreenTextItalic ? "italic" : "normal",
                              borderRadius: "6px",
                            }}
                          >
                            Chữ hiện trên video sẽ trông như thế này
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">Preview này minh họa style của text. Layout thực tế có thể thay đổi tùy thuộc vào video.</p>
                     </div>
                  </div>
                )}
              </div>
            )}

            {videoTab === "watermark" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  {renderWatermarkForm()}
                </div>
                {watermarkMode !== "disabled" && (
                  <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Watermark Preview</h4>
                      <span className="text-xs text-muted-foreground font-mono bg-background px-2 py-0.5 rounded border border-border">
                        {watermarkRatioTab}
                      </span>
                    </div>
                    <div className="flex items-center justify-center p-3 bg-zinc-900/50 rounded-lg border border-border/40 min-h-[220px]">
                      <div
                        className="relative rounded-md overflow-hidden bg-zinc-950 border border-border/50 shadow-inner w-full flex items-center justify-center transition-all"
                        style={{
                          aspectRatio: watermarkRatioTab === "9:16" ? "9/16" : watermarkRatioTab === "16:9" ? "16/9" : watermarkRatioTab === "1:1" ? "1/1" : "4/5",
                          maxHeight: 220,
                          maxWidth: watermarkRatioTab === "16:9" ? 280 : watermarkRatioTab === "1:1" ? 200 : 160,
                        }}
                      >
                        <div className="absolute inset-0 flex flex-col gap-1 items-center justify-center opacity-10 pointer-events-none p-2">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="w-full h-3 bg-zinc-600 rounded" />
                          ))}
                        </div>
                        <div
                          className="absolute text-white font-bold whitespace-nowrap pointer-events-none transition-all"
                          style={{
                            opacity: Number(watermarkOpacity),
                            fontSize: `${Math.round(Number(watermarkScale) * 140)}px`,
                            top: watermarkPositionsByRatio[watermarkRatioTab].position === "custom"
                              ? `${Number(watermarkPositionsByRatio[watermarkRatioTab].positionY) * 100}%`
                              : watermarkPositionsByRatio[watermarkRatioTab].position.startsWith("top")
                                ? "6%"
                                : undefined,
                            bottom: watermarkPositionsByRatio[watermarkRatioTab].position === "custom"
                              ? undefined
                              : watermarkPositionsByRatio[watermarkRatioTab].position.startsWith("bottom")
                                ? "8%"
                                : undefined,
                            left: watermarkPositionsByRatio[watermarkRatioTab].position === "custom"
                              ? `${Number(watermarkPositionsByRatio[watermarkRatioTab].positionX) * 100}%`
                              : watermarkPositionsByRatio[watermarkRatioTab].position.endsWith("left")
                                ? "5%"
                                : undefined,
                            right: watermarkPositionsByRatio[watermarkRatioTab].position === "custom"
                              ? undefined
                              : watermarkPositionsByRatio[watermarkRatioTab].position.endsWith("right")
                                ? "5%"
                                : undefined,
                            transform: watermarkPositionsByRatio[watermarkRatioTab].position === "custom"
                              ? "translate(-50%, -50%)"
                              : undefined,
                            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                          }}
                        >
                          {watermarkMode === "text" ? (watermarkText || "@yourbrand") : "🖼️"}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Preview minh họa vị trí và độ mờ của watermark trên khung {watermarkRatioTab}.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderImageForm() {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Tên preset">
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Image clean layout" />}
          </Field>
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Tỉ lệ đầu ra</label>
            <RatioPicker value={ratio} onChange={setRatio} />
          </div>
          <Field label="Dịch chữ trên ảnh">
            {(p) => (
              <Select {...p} value={imageTranslate} onChange={(e) => setImageTranslate(e.target.value as ImageTranslateMode)}>
                <option value="none">Không dịch</option>
                <option value="overlay">Overlay</option>
                <option value="regenerate">Regenerate</option>
              </Select>
            )}
          </Field>
        </div>

        <div className="space-y-4">
          {renderWatermarkForm()}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div>
              <h4 className="text-sm font-medium">Image editor template</h4>
              <p className="text-xs text-muted-foreground">
                Template chỉ lưu layout, crop, annotation, watermark tương đối. Không giữ ảnh nguồn cũ.
              </p>
            </div>
            <Field label="Chọn ảnh để dựng template">
              {(p) => (
                <Input
                  {...p}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={templateLoading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleTemplateUpload(file);
                  }}
                />
              )}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!templateImage} onClick={() => setShowTemplateEditor(true)}>
                {editorTemplate ? "Mở lại template" : "Mở Image Editor"}
              </Button>
              {editorTemplate && (
                <Button variant="ghost" onClick={() => setEditorTemplate(emptyImageTemplateState())}>
                  Xoá template
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {editorTemplate ? "Đã lưu template editor." : "Chưa có template editor."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  function renderCaptionForm() {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Tên preset">
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Caption sân bóng cuối tuần" />}
          </Field>

          <Field label="Platform áp dụng">
            {(p) => (
              <Select
                {...p}
                value=""
                onChange={(e) => {
                  const next = e.target.value;
                  if (!next) return;
                  setCaptionPreset((prev) => ({
                    ...prev,
                    platforms: Array.from(new Set([...(prev.platforms ?? []), next])),
                  }));
                }}
              >
                <option value="">Chọn platform để thêm</option>
                {PLATFORM_OPTIONS.map((platform) => (
                  <option key={platform} value={platform}>{platform}</option>
                ))}
              </Select>
            )}
          </Field>

          <div className="flex flex-wrap gap-2">
            {(captionPreset.platforms ?? []).map((platform) => (
              <button
                key={platform}
                type="button"
                className="rounded-full border border-border bg-muted px-3 py-1 text-xs"
                onClick={() =>
                  setCaptionPreset((prev) => ({
                    ...prev,
                    platforms: (prev.platforms ?? []).filter((item) => item !== platform),
                  }))
                }
              >
                {platform} ×
              </button>
            ))}
          </div>

          <Field label="Tone & voice">
            {(p) => <Input {...p} value={captionPreset.toneAndVoice ?? ""} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, toneAndVoice: e.target.value }))} placeholder="Năng động, gần gũi, có tính rủ rê đặt sân" />}
          </Field>

          <Field label="Đối tượng mục tiêu">
            {(p) => <Input {...p} value={captionPreset.audience ?? ""} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, audience: e.target.value }))} placeholder="Nhóm bạn đá tối, dân văn phòng, chủ đội phong trào..." />}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Độ dài caption">
              {(p) => (
                <Select {...p} value={captionPreset.captionLength ?? ""} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, captionLength: e.target.value }))}>
                  <option value="">Chọn độ dài</option>
                  <option value="Ngắn">Ngắn</option>
                  <option value="Vừa">Vừa</option>
                  <option value="Dài">Dài</option>
                </Select>
              )}
            </Field>
            <Field label="Kiểu mở đầu">
              {(p) => (
                <Select {...p} value={captionPreset.hookStyle ?? ""} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, hookStyle: e.target.value }))}>
                  <option value="">Chọn hook style</option>
                  <option value="Question">Question</option>
                  <option value="Benefit">Benefit</option>
                  <option value="Story">Story</option>
                  <option value="Urgency">Urgency</option>
                  <option value="Checklist">Checklist</option>
                </Select>
              )}
            </Field>
          </div>

          <Field label="CTA mặc định">
            {(p) => <Input {...p} value={captionPreset.cta ?? ""} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, cta: e.target.value }))} placeholder="Inbox để giữ sân tối nay / Đặt lịch ngay trong bio..." />}
          </Field>

          <Field label="Quy tắc brand voice">
            {(p) => <Textarea {...p} value={captionPreset.brandRules ?? ""} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, brandRules: e.target.value }))} placeholder="Không nói quá đà, tránh giọng sale lộ liễu, giữ tinh thần chuyên nghiệp..." />}
          </Field>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hashtag bắt buộc">
              {(p) => <Textarea {...p} value={tagsToText(captionPreset.requiredHashtags)} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, requiredHashtags: textToTags(e.target.value) }))} placeholder="#datsan, #bongda..." />}
            </Field>
            <Field label="Hashtag gợi ý">
              {(p) => <Textarea {...p} value={tagsToText(captionPreset.optionalHashtags)} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, optionalHashtags: textToTags(e.target.value) }))} placeholder="#football, #weekendmatch..." />}
            </Field>
            <Field label="Hashtag không dùng">
              {(p) => <Textarea {...p} value={tagsToText(captionPreset.bannedHashtags)} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, bannedHashtags: textToTags(e.target.value) }))} placeholder="#cheap, #spam..." />}
            </Field>
            <Field label="Keyword bắt buộc">
              {(p) => <Textarea {...p} value={tagsToText(captionPreset.requiredKeywords)} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, requiredKeywords: textToTags(e.target.value) }))} placeholder="sân mới, ưu đãi giờ vàng..." />}
            </Field>
            <Field label="Keyword tránh dùng">
              {(p) => <Textarea {...p} value={tagsToText(captionPreset.bannedKeywords)} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, bannedKeywords: textToTags(e.target.value) }))} placeholder="rẻ nhất, số 1 tuyệt đối..." />}
            </Field>
            <Field label="Phong cách emoji">
              {(p) => (
                <Select {...p} value={captionPreset.emojiStyle ?? ""} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, emojiStyle: e.target.value }))}>
                  <option value="">Chọn emoji style</option>
                  <option value="Không dùng">Không dùng</option>
                  <option value="Ít">Ít</option>
                  <option value="Vừa phải">Vừa phải</option>
                  <option value="Nổi bật">Nổi bật</option>
                </Select>
              )}
            </Field>
          </div>

          <Field label="Cấu trúc caption">
            {(p) => <Input {...p} value={captionPreset.formatStyle ?? ""} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, formatStyle: e.target.value }))} placeholder="Hook -> lợi ích -> CTA -> hashtag" />}
          </Field>

          <Field label="Ví dụ caption mẫu">
            {(p) => <Textarea {...p} value={captionPreset.sampleCaptions ?? ""} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, sampleCaptions: e.target.value }))} placeholder="Có slot đẹp cho tối nay, sân mới thay cỏ..." />}
          </Field>

          <Field label="Hướng dẫn thêm">
            {(p) => <Textarea {...p} value={captionPreset.extraInstructions ?? ""} onChange={(e) => setCaptionPreset((prev) => ({ ...prev, extraInstructions: e.target.value }))} placeholder="Giữ văn phong rủ rê, tránh quá nhiều hashtag, ưu tiên CTA ngắn..." />}
          </Field>
        </div>
      </div>
    );
  }

  function renderWatermarkForm() {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
        <div>
          <h4 className="text-sm font-medium">Watermark mặc định</h4>
          <p className="text-xs text-muted-foreground">Áp dụng cho preset video hoặc image của tab hiện tại.</p>
        </div>
        <Field label="Loại watermark">
          {(p) => (
            <Select {...p} value={watermarkMode} onChange={(e) => setWatermarkMode(e.target.value as WatermarkMode)}>
              <option value="disabled">Không dùng</option>
              <option value="text">Text</option>
              <option value="image">Ảnh</option>
            </Select>
          )}
        </Field>
        {watermarkMode === "text" && (
          <Field label="Nội dung text watermark">
            {(p) => <Input {...p} value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder="@yourbrand" />}
          </Field>
        )}
        {watermarkMode === "image" && (
          <Field label="Media ID watermark">
            {(p) => <Input {...p} value={watermarkImageMediaId} onChange={(e) => setWatermarkImageMediaId(e.target.value)} placeholder="asset id PNG watermark" />}
          </Field>
        )}
        {watermarkMode !== "disabled" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Opacity">
                {(p) => <Input {...p} type="number" min={0} max={1} step="0.05" value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(e.target.value)} />}
              </Field>
              <Field label="Scale">
                {(p) => <Input {...p} type="number" min={0.03} max={1} step="0.01" value={watermarkScale} onChange={(e) => setWatermarkScale(e.target.value)} />}
              </Field>
            </div>

            {/* Per-ratio position settings */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Vị trí watermark theo tỉ lệ khung hình</label>
                <p className="text-xs text-muted-foreground mb-2">Tuỳ chỉnh vị trí riêng cho từng tỉ lệ — giúp watermark không bị lệch khung.</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(["9:16", "16:9", "1:1", "4:5"] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setWatermarkRatioTab(r)}
                      className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                        watermarkRatioTab === r
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {r === "9:16" ? "📱 9:16 Dọc" : r === "16:9" ? "🖥️ 16:9 Ngang" : r === "1:1" ? "⬛ 1:1 Vuông" : "🖼️ 4:5 Chân dung"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                <Field label="Vị trí mặc định">
                  {(p) => (
                    <Select {...p} value={watermarkPositionsByRatio[watermarkRatioTab].position} onChange={(e) => setWatermarkPositionsByRatio(prev => ({ ...prev, [watermarkRatioTab]: { ...prev[watermarkRatioTab], position: e.target.value } }))}>
                      <option value="top-left">Top left</option>
                      <option value="top-right">Top right</option>
                      <option value="bottom-left">Bottom left</option>
                      <option value="bottom-right">Bottom right</option>
                      <option value="custom">Tùy chỉnh (X, Y)</option>
                    </Select>
                  )}
                </Field>

                {watermarkPositionsByRatio[watermarkRatioTab].position === "custom" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={`Vị trí X (${watermarkPositionsByRatio[watermarkRatioTab].positionX})`}>
                      {(p) => <Input {...p} type="range" min={0} max={1} step="0.01" value={watermarkPositionsByRatio[watermarkRatioTab].positionX} onChange={(e) => setWatermarkPositionsByRatio(prev => ({ ...prev, [watermarkRatioTab]: { ...prev[watermarkRatioTab], positionX: e.target.value } }))} />}
                    </Field>
                    <Field label={`Vị trí Y (${watermarkPositionsByRatio[watermarkRatioTab].positionY})`}>
                      {(p) => <Input {...p} type="range" min={0} max={1} step="0.01" value={watermarkPositionsByRatio[watermarkRatioTab].positionY} onChange={(e) => setWatermarkPositionsByRatio(prev => ({ ...prev, [watermarkRatioTab]: { ...prev[watermarkRatioTab], positionY: e.target.value } }))} />}
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderCardSummary(kind: PresetKind, preset: PresetRow) {
    if (kind === "video") {
      return (
        <>
          <p>Tỉ lệ: <span className="font-medium text-foreground">{preset.output_ratio || "9:16"}</span></p>
          <p>Voice: <span className="font-medium text-foreground">{preset.dub_mode === "none" ? "Không lồng tiếng" : (preset.voice_name || "Mặc định")}</span></p>
          <p>Subtitle: <span className="font-medium text-foreground">{preset.auto_vietsub === false ? "Tắt" : (preset.subtitle_preset || "tiktok_bold")}</span></p>
          <p>Text on-screen: <span className="font-medium text-foreground">{preset.translate_on_screen_text ? "Dịch & đè text" : "Tắt"}</span></p>
        </>
      );
    }
    if (kind === "image") {
      return (
        <>
          <p>Tỉ lệ: <span className="font-medium text-foreground">{preset.output_ratio || "9:16"}</span></p>
          <p>Image translate: <span className="font-medium text-foreground">{preset.image_translate || "none"}</span></p>
          <p>Template: <span className="font-medium text-foreground">{preset.editor_template && Object.keys(preset.editor_template).length ? "Đã lưu" : "Chưa có"}</span></p>
        </>
      );
    }
    const platforms = normalizeStringArray(preset.platforms);
    return (
      <>
        <p>Platform: <span className="font-medium text-foreground">{platforms.length ? platforms.join(", ") : "Chưa chọn"}</span></p>
        <p>Tone: <span className="font-medium text-foreground">{preset.tone_and_voice || "Chưa set"}</span></p>
        <p>CTA: <span className="font-medium text-foreground">{preset.cta || "Chưa set"}</span></p>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cấu hình Preset Remix"
        description="Quản lý riêng preset video, image và caption để Remix Studio chọn đúng cấu hình cho từng phần."
      />

      <Tabs
        label="Preset type"
        tabs={[
          { value: "video", label: "Video presets" },
          { value: "image", label: "Image presets" },
          { value: "caption", label: "Caption presets" },
        ]}
        defaultValue={presetKind}
      >
        {(active) => {
          const nextKind = active as PresetKind;
          if (nextKind !== presetKind) setTimeout(() => setPresetKind(nextKind), 0);
          return (
            <div className="space-y-6 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium">
                    {nextKind === "video"
                      ? "Danh sách Video Preset"
                      : nextKind === "image"
                        ? "Danh sách Image Preset"
                        : "Danh sách Caption Preset"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {nextKind === "video"
                      ? "Preset cho voice, subtitle, text on-screen và watermark."
                      : nextKind === "image"
                        ? "Preset cho image translate, watermark và editor template."
                        : "Preset cho tone, platform, hashtag, CTA và quy tắc viết caption."}
                  </p>
                </div>
                <Button onClick={() => openCreate(nextKind)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tạo {nextKind} preset
                </Button>
              </div>

              {loading ? (
                <div className="rounded-lg border border-border bg-muted/10 p-10 text-center text-muted-foreground">Đang tải preset...</div>
              ) : activePresets.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/10 p-10 text-center text-muted-foreground">Chưa có preset nào.</div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                  {activePresets.map((preset) => (
                    <div
                      key={preset.id}
                      className={`rounded-lg border p-5 shadow-sm ${preset.is_default ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {nextKind === "video" ? <Video className="h-4 w-4 text-primary" /> : nextKind === "image" ? <ImageIcon className="h-4 w-4 text-primary" /> : <Type className="h-4 w-4 text-primary" />}
                            <h3 className="truncate font-semibold">{preset.name}</h3>
                          </div>
                          {preset.is_default && (
                            <span className="mt-2 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                              Mặc định
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant={preset.is_default ? "secondary" : "outline"}
                            size="sm"
                            disabled={preset.is_default || settingDefaultId === preset.id}
                            onClick={() => handleSetDefault(preset.id)}
                          >
                            <Check className="mr-1 h-4 w-4" />
                            {preset.is_default ? "Mặc định" : "Chọn mặc định"}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(nextKind, preset)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(preset.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                        {renderCardSummary(nextKind, preset)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isCreating && presetKind === nextKind && (
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
                    <h3 className="text-lg font-semibold">{editingId ? "Chỉnh sửa preset" : "Tạo preset mới"}</h3>
                    <Button variant="ghost" onClick={() => setIsCreating(false)}>Huỷ</Button>
                  </div>
                  {nextKind === "video" ? renderVideoForm() : nextKind === "image" ? renderImageForm() : renderCaptionForm()}
                  <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
                    <Button variant="outline" onClick={() => setIsCreating(false)}>Huỷ</Button>
                    <Button onClick={() => void handleSave()}>{editingId ? "Lưu thay đổi" : "Tạo preset"}</Button>
                  </div>
                </div>
              )}
            </div>
          );
        }}
      </Tabs>

      {showTemplateEditor && templateImage?.url && (
        <ImageEditor
          sourceUrl={templateImage.url}
          initialDesignState={editorTemplate}
          onCancel={() => setShowTemplateEditor(false)}
          onSave={async (_file, designState) => {
            setEditorTemplate(designState);
            setShowTemplateEditor(false);
          }}
        />
      )}
    </div>
  );
}
