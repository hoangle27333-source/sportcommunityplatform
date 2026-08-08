"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus, Check, Edit2, Trash2 } from "lucide-react";
import { VoiceSelector } from "@/components/remix/voice-selector";
import { SubtitleConfig, defaultSubtitleSettings, type SubtitleSettings } from "@/components/remix/subtitle-config";
import { RatioPicker } from "@/components/remix/ratio-picker";
import { BlurRegionPicker, type BlurRegion } from "@/components/remix/blur-region-picker";

type OnScreenTextPreset = "meme" | "pop" | "bubble" | "neon" | "clean";
type OnScreenTextSizeMode = "auto_fit" | "fixed";
type WatermarkRatio = "9:16" | "16:9" | "1:1" | "4:5" | "original";

const WATERMARK_RATIOS: WatermarkRatio[] = ["9:16", "16:9", "1:1", "4:5", "original"];
const DEFAULT_WATERMARK_POSITIONS: Record<WatermarkRatio, { x: number; y: number }> = {
  "9:16": { x: 0.82, y: 0.9 },
  "16:9": { x: 0.9, y: 0.86 },
  "1:1": { x: 0.86, y: 0.86 },
  "4:5": { x: 0.84, y: 0.88 },
  original: { x: 0.86, y: 0.86 },
};
const DEFAULT_WATERMARK_SCALES: Record<WatermarkRatio, number> = {
  "9:16": 0.15,
  "16:9": 0.12,
  "1:1": 0.14,
  "4:5": 0.14,
  original: 0.15,
};

function watermarkPositionsForPresetPosition(
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom",
): Record<WatermarkRatio, { x: number; y: number }> {
  const point =
    position === "top-left" ? { x: 0.14, y: 0.12 } :
    position === "top-right" ? { x: 0.86, y: 0.12 } :
    position === "bottom-left" ? { x: 0.14, y: 0.88 } :
    position === "custom" ? DEFAULT_WATERMARK_POSITIONS["9:16"] :
    { x: 0.86, y: 0.88 };
  return {
    "9:16": point,
    "16:9": point,
    "1:1": point,
    "4:5": point,
    original: point,
  };
}

const ON_SCREEN_TEXT_PRESETS: Record<OnScreenTextPreset, {
  label: string;
  font: string;
  size: number;
  color: string;
  bgColor: string;
  outlineColor: string;
  bold: boolean;
}> = {
  meme: { label: "Meme Impact", font: "Anton", size: 34, color: "#FFFFFF", bgColor: "#000000", outlineColor: "#000000", bold: true },
  pop: { label: "Pop Sticker", font: "Montserrat", size: 34, color: "#FFF200", bgColor: "#FF2A6D", outlineColor: "#101010", bold: true },
  bubble: { label: "Bubble", font: "Baloo 2", size: 32, color: "#111111", bgColor: "#FFFFFF", outlineColor: "#FFB703", bold: true },
  neon: { label: "Neon Reel", font: "Oswald", size: 32, color: "#00F5FF", bgColor: "#090A18", outlineColor: "#FF00E5", bold: true },
  clean: { label: "Clean Caption", font: "Be Vietnam Pro", size: 28, color: "#FFFFFF", bgColor: "#111827", outlineColor: "#111827", bold: false },
};

export default function PresetPage() {
  const [presets, setPresets] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [voice, setVoice] = useState("vi-VN-WaveNet-A");
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleSettings>(defaultSubtitleSettings);
  const [ratio, setRatio] = useState("9:16");
  const [crf, setCrf] = useState("18");
  const [blurOriginalSub, setBlurOriginalSub] = useState(false);
  const [autoDetectSub, setAutoDetectSub] = useState(false);
  const [translateOnScreenText, setTranslateOnScreenText] = useState(false);
  const [onScreenTextPreset, setOnScreenTextPreset] = useState<OnScreenTextPreset>("meme");
  const [onScreenTextFont, setOnScreenTextFont] = useState("Anton");
  const [onScreenTextSize, setOnScreenTextSize] = useState("34");
  const [onScreenTextSizeMode, setOnScreenTextSizeMode] = useState<OnScreenTextSizeMode>("auto_fit");
  const [onScreenTextColor, setOnScreenTextColor] = useState("#FFFFFF");
  const [onScreenTextBgColor, setOnScreenTextBgColor] = useState("#000000");
  const [onScreenTextOutlineColor, setOnScreenTextOutlineColor] = useState("#000000");
  const [onScreenTextBold, setOnScreenTextBold] = useState(true);
  const [showDubbedText, setShowDubbedText] = useState(false);
  const [blurRegion, setBlurRegion] = useState<BlurRegion>({ x: 0, y: 0.82, w: 1, h: 0.18 });
  const [intro, setIntro] = useState(false);
  const [introMediaId, setIntroMediaId] = useState("");
  const [outro, setOutro] = useState(false);
  const [outroMediaId, setOutroMediaId] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<'vi' | 'en'>('vi');
  const [dubMode, setDubMode] = useState<'none' | 'full' | 'preserve_bgm' | 'heygen'>('none');
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkType, setWatermarkType] = useState<"image" | "text">("text");
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkImageMediaId, setWatermarkImageMediaId] = useState("");
  const [watermarkOpacity, setWatermarkOpacity] = useState("0.9");
  const [watermarkScale, setWatermarkScale] = useState("0.15");
  const [watermarkPosition, setWatermarkPosition] = useState<"top-left" | "top-right" | "bottom-left" | "bottom-right" | "custom">("bottom-right");
  const [watermarkCustomX, setWatermarkCustomX] = useState("0.82");
  const [watermarkCustomY, setWatermarkCustomY] = useState("0.9");
  const [watermarkPreviewRatio, setWatermarkPreviewRatio] = useState<WatermarkRatio>("9:16");
  const [watermarkPerRatioPosition, setWatermarkPerRatioPosition] = useState<Record<WatermarkRatio, { x: number; y: number }>>(DEFAULT_WATERMARK_POSITIONS);
  const [watermarkPerRatioScale, setWatermarkPerRatioScale] = useState<Record<WatermarkRatio, number>>(DEFAULT_WATERMARK_SCALES);
  const [coverOriginalWatermark, setCoverOriginalWatermark] = useState(false);
  const [oldWatermarkRegion, setOldWatermarkRegion] = useState<BlurRegion>({ x: 0.72, y: 0.88, w: 0.24, h: 0.08 });

  const fetchPresets = async () => {
    try {
      const res = await fetch("/api/remix/presets", { cache: "no-store" });
      const data = await res.json();
      setPresets(data.presets || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, []);

  const openCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setName("");
    setVoice("vi-VN-WaveNet-A");
    setSubtitleConfig(defaultSubtitleSettings);
    setRatio("9:16");
    setCrf("18");
    setBlurOriginalSub(false);
    setAutoDetectSub(false);
    setTranslateOnScreenText(false);
    applyOnScreenTextPreset("meme");
    setOnScreenTextSizeMode("auto_fit");
    setShowDubbedText(false);
    setTargetLanguage('vi');
    setDubMode('none');
    setVoice('vi-VN-WaveNet-A');
    setIntro(false);
    setIntroMediaId("");
    setOutro(false);
    setOutroMediaId("");
    setWatermarkEnabled(false);
    setWatermarkType("text");
    setWatermarkText("");
    setWatermarkImageMediaId("");
    setWatermarkOpacity("0.9");
    setWatermarkScale("0.15");
    setWatermarkPosition("bottom-right");
    setWatermarkCustomX("0.82");
    setWatermarkCustomY("0.9");
    setWatermarkPreviewRatio("9:16");
    setWatermarkPerRatioPosition(DEFAULT_WATERMARK_POSITIONS);
    setWatermarkPerRatioScale(DEFAULT_WATERMARK_SCALES);
    setCoverOriginalWatermark(false);
    setOldWatermarkRegion({ x: 0.72, y: 0.88, w: 0.24, h: 0.08 });
  };

  const openEdit = (p: any) => {
    setIsCreating(true);
    setEditingId(p.id);
    setName(p.name || "");
    setVoice(p.voice_name || "vi-VN-WaveNet-A");
    setSubtitleConfig({
      preset: p.subtitle_preset || defaultSubtitleSettings.preset,
      font: p.sub_font || defaultSubtitleSettings.font,
      size: p.sub_font_size || defaultSubtitleSettings.size,
      color: p.sub_color || defaultSubtitleSettings.color,
      bgColor: p.sub_bg_color || defaultSubtitleSettings.bgColor,
      highlightColor: p.sub_highlight_color || defaultSubtitleSettings.highlightColor,
      bold: p.sub_bold ?? defaultSubtitleSettings.bold,
      italic: p.sub_italic ?? defaultSubtitleSettings.italic,
      outline: p.sub_outline ?? defaultSubtitleSettings.outline,
      borderStyle: p.sub_border_style !== undefined ? p.sub_border_style : defaultSubtitleSettings.borderStyle,
      position: p.sub_position || defaultSubtitleSettings.position,
      customY: p.sub_custom_y ?? defaultSubtitleSettings.customY,
      animation: p.subtitle_animation || defaultSubtitleSettings.animation,
    });
    setRatio(p.output_ratio || "9:16");
    setCrf(p.output_crf?.toString() || "18");
    setBlurOriginalSub(p.blur_original_sub ?? false);
    setAutoDetectSub(p.auto_detect_subtitle_region ?? false);
    setTranslateOnScreenText(p.translate_on_screen_text ?? false);
    setOnScreenTextPreset((p.on_screen_text_preset ?? "meme") as OnScreenTextPreset);
    setOnScreenTextFont(p.on_screen_text_font ?? "Impact");
    setOnScreenTextSize(String(p.on_screen_text_size ?? 34));
    setOnScreenTextSizeMode((p.on_screen_text_size_mode ?? "auto_fit") as OnScreenTextSizeMode);
    setOnScreenTextColor(p.on_screen_text_color ?? "#FFFFFF");
    setOnScreenTextBgColor(p.on_screen_text_bg_color ?? "#000000");
    setOnScreenTextOutlineColor(p.on_screen_text_outline_color ?? "#000000");
    setOnScreenTextBold(p.on_screen_text_bold ?? true);
    setShowDubbedText(p.auto_vietsub ?? false);
    if (p.blur_region) setBlurRegion(p.blur_region);
    const lang = (p.target_language === 'en' ? 'en' : 'vi') as 'vi' | 'en';
    setTargetLanguage(lang);
    const savedDubMode = (p.dub_mode as 'none' | 'full' | 'preserve_bgm' | 'heygen') ?? (p.auto_dub ? 'full' : 'none');
    setDubMode(savedDubMode);
    setIntro(p.intro_enabled ?? false);
    setIntroMediaId(p.intro_media_id || "");
    setOutro(p.outro_enabled ?? false);
    setOutroMediaId(p.outro_media_id || "");
    const wm = p.watermark_defaults ?? {};
    setWatermarkEnabled(Boolean(wm.enabled));
    setWatermarkType(wm.type === "image" ? "image" : "text");
    setWatermarkText(wm.text ?? "");
    setWatermarkImageMediaId(wm.imageMediaId ?? "");
    setWatermarkOpacity(String(wm.opacity ?? 0.9));
    setWatermarkScale(String(wm.scale ?? 0.15));
    setWatermarkPosition(wm.position ?? "bottom-right");
    setWatermarkCustomX(String(wm.customPosition?.x ?? 0.82));
    setWatermarkCustomY(String(wm.customPosition?.y ?? 0.9));
    setWatermarkPreviewRatio("9:16");
    setWatermarkPerRatioPosition({
      ...watermarkPositionsForPresetPosition(wm.position ?? "bottom-right"),
      ...(wm.perRatioPosition ?? {}),
    });
    setWatermarkPerRatioScale({
      ...DEFAULT_WATERMARK_SCALES,
      ...(wm.perRatioScale ?? {}),
    });
    setCoverOriginalWatermark(Boolean(wm.coverOriginal));
    setOldWatermarkRegion(wm.oldWatermarkRegions?.[0] ?? { x: 0.72, y: 0.88, w: 0.24, h: 0.08 });
  };

  const handleSave = async () => {
    try {
      const payload = {
        name,
        voiceName: voice,
        subFont: subtitleConfig.font,
        subFontSize: subtitleConfig.size,
        subColor: subtitleConfig.color,
        subBgColor: subtitleConfig.bgColor,
        subHighlightColor: subtitleConfig.highlightColor,
        subBold: subtitleConfig.bold,
        subItalic: subtitleConfig.italic,
        subOutline: subtitleConfig.outline,
        subBorderStyle: subtitleConfig.borderStyle,
        subPosition: subtitleConfig.position,
        subCustomY: subtitleConfig.customY ?? defaultSubtitleSettings.customY,
        subtitlePreset: subtitleConfig.preset,
        subtitleAnimation: subtitleConfig.animation,
        outputRatio: ratio,
        outputCrf: Number(crf),
        blurOriginalSub,
        autoDetectSubtitleRegion: autoDetectSub,
        translateOnScreenText,
        onScreenTextPreset,
        onScreenTextFont,
        onScreenTextSize: Number(onScreenTextSize),
        onScreenTextSizeMode,
        onScreenTextColor,
        onScreenTextBgColor,
        onScreenTextOutlineColor,
        onScreenTextBold,
        blurRegion,
        targetLanguage,
        dubMode,
        autoDub: dubMode !== 'none',
        autoVietsub: showDubbedText,
        watermarkDefaults: watermarkEnabled ? {
          enabled: true,
          type: watermarkType,
          text: watermarkType === "text" ? watermarkText.trim() || undefined : undefined,
          imageMediaId: watermarkType === "image" ? watermarkImageMediaId.trim() || undefined : undefined,
          opacity: Number(watermarkOpacity),
          scale: Number(watermarkScale),
          position: watermarkPosition,
          customPosition: watermarkPosition === "custom"
            ? { x: Number(watermarkCustomX), y: Number(watermarkCustomY) }
            : undefined,
          perRatioPosition: watermarkPerRatioPosition,
          perRatioScale: watermarkPerRatioScale,
          coverOriginal: coverOriginalWatermark,
          oldWatermarkRegions: coverOriginalWatermark ? [oldWatermarkRegion] : [],
        } : {},
        introEnabled: intro,
        introMediaId: introMediaId.trim() || null,
        outroEnabled: outro,
        outroMediaId: outroMediaId.trim() || null,
      };

      const url = editingId ? `/api/remix/presets/${editingId}` : '/api/remix/presets';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Lỗi lưu preset');
      }

      await fetchPresets();
      setIsCreating(false);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xoá preset này?")) return;
    try {
      const res = await fetch(`/api/remix/presets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Xoá thất bại');
      await fetchPresets();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/remix/presets/${id}/default`, { method: 'POST' });
      if (!res.ok) throw new Error('Thiết lập mặc định thất bại');
      await fetchPresets();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const applyOnScreenTextPreset = (preset: OnScreenTextPreset) => {
    const style = ON_SCREEN_TEXT_PRESETS[preset];
    setOnScreenTextPreset(preset);
    setOnScreenTextFont(style.font);
    setOnScreenTextSize(String(style.size));
    setOnScreenTextColor(style.color);
    setOnScreenTextBgColor(style.bgColor);
    setOnScreenTextOutlineColor(style.outlineColor);
    setOnScreenTextBold(style.bold);
  };

  const updateWatermarkRatioPosition = (axis: "x" | "y", value: string) => {
    const next = Math.max(0, Math.min(1, Number(value)));
    setWatermarkPerRatioPosition((current) => ({
      ...current,
      [watermarkPreviewRatio]: {
        ...current[watermarkPreviewRatio],
        [axis]: next,
      },
    }));
    setWatermarkPosition("custom");
    if (axis === "x") setWatermarkCustomX(String(next));
    if (axis === "y") setWatermarkCustomY(String(next));
  };

  const updateWatermarkRatioScale = (value: string) => {
    const next = Math.max(0.03, Math.min(0.5, Number(value)));
    setWatermarkPerRatioScale((current) => ({
      ...current,
      [watermarkPreviewRatio]: next,
    }));
    setWatermarkScale(String(next));
  };

  const changeWatermarkPosition = (position: typeof watermarkPosition) => {
    setWatermarkPosition(position);
    if (position !== "custom") {
      const nextPositions = watermarkPositionsForPresetPosition(position);
      setWatermarkPerRatioPosition(nextPositions);
      setWatermarkCustomX(String(nextPositions[watermarkPreviewRatio].x));
      setWatermarkCustomY(String(nextPositions[watermarkPreviewRatio].y));
    }
  };

  const activeWatermarkPosition = watermarkPerRatioPosition[watermarkPreviewRatio] ?? DEFAULT_WATERMARK_POSITIONS[watermarkPreviewRatio];
  const activeWatermarkScale = watermarkPerRatioScale[watermarkPreviewRatio] ?? DEFAULT_WATERMARK_SCALES[watermarkPreviewRatio];
  const watermarkPreviewAspect = watermarkPreviewRatio === "16:9"
    ? "16 / 9"
    : watermarkPreviewRatio === "1:1"
      ? "1 / 1"
      : watermarkPreviewRatio === "4:5"
        ? "4 / 5"
        : "9 / 16";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cấu hình Preset Remix"
        description="Quản lý cấu hình lồng tiếng, text on-screen, blur vùng chữ gốc và đầu ra video mặc định."
      />
      
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium">Danh sách Preset</h2>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Tạo Preset mới
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground animate-pulse">Đang tải presets...</div>
      ) : presets.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground border rounded-lg bg-muted/10">Chưa có preset nào.</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
          {presets.map(p => (
            <div key={p.id} className={`border ${p.is_default ? 'border-primary shadow-sm bg-primary/5' : 'border-border bg-card shadow-sm'} rounded-lg p-5 space-y-4`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{p.name}</h3>
                  {p.is_default && <span className="inline-block mt-1 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">Mặc định</span>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(p)}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Giọng đọc: <span className="font-medium text-foreground">{p.voice_name || 'Mặc định'}</span></p>
                <p>Tỉ lệ: <span className="font-medium text-foreground">{p.output_ratio || '9:16'}</span> • CRF: <span className="font-medium text-foreground">{p.output_crf || '18'}</span></p>
                <p>Lồng tiếng: <span className="font-medium text-foreground">
                  {p.dub_mode === 'preserve_bgm' ? '🎵 Giữ nhạc nền' : p.dub_mode === 'full' ? '🎙️ Thay audio' : '🔇 Tắt'}
                </span></p>
                <p>Text on-screen: <span className="font-medium text-foreground">
                  {p.translate_on_screen_text ? 'Dịch chữ gốc' : 'Không dịch'}
                </span></p>
              </div>
              
              {!p.is_default && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => handleSetDefault(p.id)}>
                  <Check className="h-4 w-4 mr-2" /> Đặt làm mặc định
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {isCreating && (
        <div className="border border-border rounded-xl p-6 bg-card space-y-6 shadow-sm">
          <div className="flex justify-between items-center border-b border-border pb-4">
            <h3 className="font-semibold text-lg">{editingId ? 'Chỉnh sửa Preset' : 'Tạo Preset mới'}</h3>
            <Button variant="ghost" onClick={() => setIsCreating(false)}>Huỷ</Button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Tên Preset</label>
                <input 
                  type="text" 
                  value={name} onChange={e => setName(e.target.value)} 
                  className="w-full h-10 rounded-md border border-input bg-background px-3 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary" 
                  placeholder="VD: Reels Tiktok..."
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Chế độ lồng tiếng</label>
                <div className="space-y-2">
                  {([
                    { value: 'none', icon: '🔇', label: 'Không lồng tiếng', desc: 'Giữ nguyên âm thanh gốc của video.' },
                    { value: 'full', icon: '🎙️', label: 'Luồng thường: Lồng tiếng AI (thay toàn bộ audio)', desc: 'Thay audio gốc bằng giọng đọc AI (TTS). Phù hợp khi không có nhạc nền.' },
                    { value: 'preserve_bgm', icon: '🎵', label: 'Luồng thường: Lồng tiếng AI + Giữ nhạc nền', desc: 'AI tự động tách giọng người khỏi nhạc nền, lồng giọng TTS mới và mix lại với nhạc nền gốc.' },
                    { value: 'heygen', icon: '✨', label: 'Luồng HeyGen: Video Translate (Lip-sync & giọng chuẩn)', desc: 'Dịch giọng nói bằng HeyGen API, tự động clone giọng thật của speaker và đồng bộ khẩu hình chuẩn xác.' },
                  ] as const).map(opt => (
                    <label
                      key={opt.value}
                      onClick={() => setDubMode(opt.value)}
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all select-none ${
                        dubMode === opt.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          dubMode === opt.value ? 'border-primary' : 'border-muted-foreground'
                        }`}>
                          {dubMode === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium">{opt.icon} {opt.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {dubMode !== 'none' && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Ngôn ngữ lồng tiếng</label>
                    <div className="flex gap-1 bg-muted/50 border border-input p-1 rounded-md w-fit shadow-sm mb-3">
                      <button
                        type="button"
                        className={`px-4 py-1.5 text-sm rounded-sm transition-all flex items-center gap-1.5 ${targetLanguage === 'vi' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => { setTargetLanguage('vi'); setVoice('vi-VN-WaveNet-A'); }}
                      >🇻🇳 Tiếng Việt</button>
                      <button
                        type="button"
                        className={`px-4 py-1.5 text-sm rounded-sm transition-all flex items-center gap-1.5 ${targetLanguage === 'en' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => { setTargetLanguage('en'); setVoice('en-US-WaveNet-C'); }}
                      >🇺🇸 Tiếng Anh</button>
                    </div>
                    <p className="text-xs text-muted-foreground">Ngôn ngữ dùng để dịch và tổng hợp giọng lồng tiếng.</p>
                  </div>

                  {dubMode !== 'heygen' ? (
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Giọng lồng tiếng</label>
                      <VoiceSelector value={voice} onChange={setVoice} />
                    </div>
                  ) : (
                    <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-300 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <span>✨ HeyGen Video Translate</span>
                      </div>
                      <p>• HeyGen sẽ tự động nhận diện và clone giọng gốc của người nói trong video để tạo bản dịch tự nhiên nhất.</p>
                      <p>• Tự động khớp khẩu hình (lip-sync) và sinh phụ đề chuẩn theo ngữ điệu mới.</p>
                      <p>• Video được xử lý qua 2 giai đoạn: gửi HeyGen → nhận webhook callback → tiếp tục overlay phụ đề & text on-screen theo flow cũ.</p>
                    </div>
                  )}

                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background cursor-pointer select-none hover:bg-muted">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      checked={showDubbedText}
                      onChange={(e) => setShowDubbedText(e.target.checked)}
                    />
                    <span>
                      <span className="block text-sm font-medium">Hiện text lồng tiếng trên video</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        Bật để hiển thị lời thoại đã dịch/lồng tiếng trực tiếp trên video. Tắt nếu chỉ muốn audio lồng tiếng.
                      </span>
                    </span>
                  </label>
                </>
              )}

              <div className="space-y-3 pt-4 border-t border-border">
                <label className="text-sm font-medium block">Text on screen</label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background cursor-pointer select-none hover:bg-muted">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    checked={translateOnScreenText}
                    onChange={(e) => setTranslateOnScreenText(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium">Dịch text on-screen gốc</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      AI đọc chữ đang có trong frame gốc, review tone/mood rồi dịch tự nhiên theo ngôn ngữ đã chọn.
                    </span>
                  </span>
                </label>
                {translateOnScreenText && (
                  <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(Object.entries(ON_SCREEN_TEXT_PRESETS) as Array<[OnScreenTextPreset, typeof ON_SCREEN_TEXT_PRESETS[OnScreenTextPreset]]>).map(([key, style]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyOnScreenTextPreset(key)}
                          className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            onScreenTextPreset === key
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:bg-muted"
                          }`}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Font chữ</label>
                        <select
                          value={onScreenTextFont}
                          onChange={(e) => setOnScreenTextFont(e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="Anton">Anton (Meme / Impact - Việt hoá)</option>
                          <option value="Oswald">Oswald (Condensed - Việt hoá)</option>
                          <option value="Be Vietnam Pro">Be Vietnam Pro (Tiêu chuẩn - Việt hoá)</option>
                          <option value="Montserrat">Montserrat (Hiện đại - Việt hoá)</option>
                          <option value="Nunito">Nunito (Bo tròn - Việt hoá)</option>
                          <option value="Baloo 2">Baloo 2 (Sticker - Việt hoá)</option>
                          <option value="Inter">Inter (Tối giản - Việt hoá)</option>
                          <option value="Impact">Impact (Cơ bản)</option>
                          <option value="Arial">Arial (Cơ bản)</option>
                          <option value="Arial Black">Arial Black (Cơ bản)</option>
                          <option value="Noto Sans">Noto Sans (Cơ bản)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Cách tính kích cỡ</label>
                        <select
                          value={onScreenTextSizeMode}
                          onChange={(e) => setOnScreenTextSizeMode(e.target.value as OnScreenTextSizeMode)}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="auto_fit">Auto theo text gốc</option>
                          <option value="fixed">Cố định theo preset</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Kích cỡ</label>
                        <input
                          type="number"
                          min={16}
                          max={72}
                          value={onScreenTextSize}
                          onChange={(e) => setOnScreenTextSize(e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4">
                      {[
                        ["Màu chữ", onScreenTextColor, setOnScreenTextColor],
                        ["Màu nền", onScreenTextBgColor, setOnScreenTextBgColor],
                        ["Màu viền", onScreenTextOutlineColor, setOnScreenTextOutlineColor],
                      ].map(([label, value, setter]) => (
                        <label key={String(label)} className="space-y-1">
                          <span className="block text-xs text-muted-foreground">{String(label)}</span>
                          <input
                            type="color"
                            value={String(value)}
                            onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                            className="h-9 w-12 rounded border border-input bg-background p-1"
                          />
                        </label>
                      ))}
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={onScreenTextBold}
                          onChange={(e) => setOnScreenTextBold(e.target.checked)}
                        />
                        Đậm
                      </label>
                    </div>

                    <div className="rounded-md bg-zinc-950 p-4 text-center">
                      <span
                        className="inline-block rounded px-3 py-1 leading-tight"
                        style={{
                          fontFamily: onScreenTextFont,
                          fontSize: `${Math.min(Number(onScreenTextSize) || 34, 42)}px`,
                          color: onScreenTextColor,
                          backgroundColor: onScreenTextBgColor,
                          WebkitTextStroke: `1px ${onScreenTextOutlineColor}`,
                          fontWeight: onScreenTextBold ? 800 : 500,
                        }}
                      >
                        Text on-screen mẫu
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-4 pt-4 border-t border-border">
                <label className="text-sm font-medium block">Cấu hình đầu ra</label>
                <RatioPicker value={ratio} onChange={setRatio} />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1.5 block">Chất lượng nén (CRF: {crf})</label>
                <input 
                  type="range" min={18} max={28} 
                  value={crf} onChange={e => setCrf(e.target.value)} 
                  className="w-full accent-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">Càng thấp càng nét, file càng nặng (Mặc định: 18)</p>
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background cursor-pointer select-none hover:bg-muted">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    checked={watermarkEnabled}
                    onChange={(e) => setWatermarkEnabled(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium">Watermark mặc định</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Áp dụng watermark này cho Auto Generate và job dùng preset.
                    </span>
                  </span>
                </label>

                {watermarkEnabled && (
                  <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setWatermarkType("text")}
                        className={`rounded-md border px-3 py-2 text-sm ${watermarkType === "text" ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}
                      >
                        Text watermark
                      </button>
                      <button
                        type="button"
                        onClick={() => setWatermarkType("image")}
                        className={`rounded-md border px-3 py-2 text-sm ${watermarkType === "image" ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}
                      >
                        Ảnh watermark
                      </button>
                    </div>

                    {watermarkType === "text" ? (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Nội dung watermark</label>
                        <input
                          value={watermarkText}
                          onChange={(e) => setWatermarkText(e.target.value)}
                          placeholder="VD: sport community"
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Media ID ảnh watermark</label>
                        <input
                          value={watermarkImageMediaId}
                          onChange={(e) => setWatermarkImageMediaId(e.target.value)}
                          placeholder="UUID media asset"
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Opacity {Math.round(Number(watermarkOpacity) * 100)}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={watermarkOpacity}
                          onChange={(e) => setWatermarkOpacity(e.target.value)}
                          className="w-full accent-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Size {Math.round(Number(watermarkScale) * 100)}%
                        </label>
                        <input
                          type="range"
                          min="0.03"
                          max="0.5"
                          step="0.01"
                          value={watermarkScale}
                          onChange={(e) => {
                            setWatermarkScale(e.target.value);
                            updateWatermarkRatioScale(e.target.value);
                          }}
                          className="w-full accent-primary"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Vị trí</label>
                      <select
                        value={watermarkPosition}
                        onChange={(e) => changeWatermarkPosition(e.target.value as typeof watermarkPosition)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="top-left">Trên trái</option>
                        <option value="top-right">Trên phải</option>
                        <option value="bottom-left">Dưới trái</option>
                        <option value="bottom-right">Dưới phải</option>
                        <option value="custom">Tuỳ chỉnh</option>
                      </select>
                    </div>

                    {watermarkPosition === "custom" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="text-xs text-muted-foreground">
                          X {Number(watermarkCustomX).toFixed(2)}
                          <input type="range" min="0" max="1" step="0.01" value={watermarkCustomX} onChange={(e) => setWatermarkCustomX(e.target.value)} className="mt-1 w-full accent-primary" />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Y {Number(watermarkCustomY).toFixed(2)}
                          <input type="range" min="0" max="1" step="0.01" value={watermarkCustomY} onChange={(e) => setWatermarkCustomY(e.target.value)} className="mt-1 w-full accent-primary" />
                        </label>
                      </div>
                    )}

                    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {WATERMARK_RATIOS.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setWatermarkPreviewRatio(item)}
                            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                              watermarkPreviewRatio === item
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-muted/30 hover:bg-muted"
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[minmax(120px,180px)_1fr] gap-4 items-center">
                        <div
                          className="relative mx-auto w-full max-w-[180px] overflow-hidden rounded-md border border-border bg-zinc-950"
                          style={{ aspectRatio: watermarkPreviewAspect }}
                        >
                          <div className="absolute inset-0 bg-[linear-gradient(135deg,#111827,#334155_45%,#020617)]" />
                          <div className="absolute inset-x-3 top-3 h-7 rounded bg-white/10" />
                          <div className="absolute inset-x-4 bottom-5 h-10 rounded bg-black/30" />
                          <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 rounded border border-white/60 bg-black/45 px-2 py-1 text-[10px] font-bold text-white shadow"
                            style={{
                              left: `${activeWatermarkPosition.x * 100}%`,
                              top: `${activeWatermarkPosition.y * 100}%`,
                              transform: `translate(-50%, -50%) scale(${Math.max(0.6, activeWatermarkScale / 0.15)})`,
                              opacity: Number(watermarkOpacity),
                            }}
                          >
                            {watermarkType === "text" ? watermarkText || "watermark" : "LOGO"}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">
                            X ratio {activeWatermarkPosition.x.toFixed(2)}
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={activeWatermarkPosition.x}
                              onChange={(e) => updateWatermarkRatioPosition("x", e.target.value)}
                              className="mt-1 w-full accent-primary"
                            />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Y ratio {activeWatermarkPosition.y.toFixed(2)}
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={activeWatermarkPosition.y}
                              onChange={(e) => updateWatermarkRatioPosition("y", e.target.value)}
                              className="mt-1 w-full accent-primary"
                            />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            Scale ratio {Math.round(activeWatermarkScale * 100)}%
                            <input
                              type="range"
                              min="0.03"
                              max="0.5"
                              step="0.01"
                              value={activeWatermarkScale}
                              onChange={(e) => updateWatermarkRatioScale(e.target.value)}
                              className="mt-1 w-full accent-primary"
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background cursor-pointer select-none hover:bg-muted">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                        checked={coverOriginalWatermark}
                        onChange={(e) => setCoverOriginalWatermark(e.target.checked)}
                      />
                      <span>
                        <span className="block text-sm font-medium">Che watermark/logo cũ</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          Blur vùng watermark cũ trước khi chèn watermark mới.
                        </span>
                      </span>
                    </label>

                    {coverOriginalWatermark && (
                      <BlurRegionPicker
                        region={oldWatermarkRegion}
                        onChange={setOldWatermarkRegion}
                        defaultEnabled={coverOriginalWatermark}
                        onToggle={setCoverOriginalWatermark}
                        label="Vùng watermark/logo cũ"
                        autoDetect={false}
                        onAutoDetectChange={() => undefined}
                      />
                    )}
                  </div>
                )}
              </div>
              
              <div className="space-y-4 pt-4 border-t border-border">
                <BlurRegionPicker 
                  region={blurRegion}
                  onChange={setBlurRegion}
                  defaultEnabled={blurOriginalSub}
                  onToggle={(v) => {
                    setBlurOriginalSub(v);
                    if (!v) setAutoDetectSub(false);
                  }}
                  autoDetect={autoDetectSub}
                  onAutoDetectChange={setAutoDetectSub}
                />
                
                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-input text-primary focus:ring-primary" checked={intro} onChange={e => setIntro(e.target.checked)} />
                    Tự động chèn Intro
                  </label>
                  {intro && (
                    <input 
                      type="text" placeholder="URL hoặc Media ID của Intro..."
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ml-7 shadow-sm"
                      value={introMediaId} onChange={e => setIntroMediaId(e.target.value)}
                    />
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-input text-primary focus:ring-primary" checked={outro} onChange={e => setOutro(e.target.checked)} />
                    Tự động chèn Outro
                  </label>
                  {outro && (
                    <input 
                      type="text" placeholder="URL hoặc Media ID của Outro..."
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ml-7 shadow-sm"
                      value={outroMediaId} onChange={e => setOutroMediaId(e.target.value)}
                    />
                  )}
                </div>
              </div>
            </div>
            
            <div>
              <SubtitleConfig
                value={subtitleConfig}
                onChange={setSubtitleConfig}
                title="Cấu hình lồng tiếng"
                sampleText="Đây là chữ lồng tiếng mẫu"
                autoDescription="AI đặt chữ lồng tiếng theo vị trí an toàn sau khi xử lý vùng text on-screen gốc. Nếu không phát hiện được, mặc định đặt ở dưới cùng."
              />
            </div>
          </div>
          
          <div className="flex justify-end pt-6 border-t border-border gap-2">
            <Button variant="outline" onClick={() => setIsCreating(false)}>Huỷ</Button>
            <Button onClick={handleSave} disabled={!name} className="min-w-32">Lưu Preset</Button>
          </div>
        </div>
      )}
    </div>
  );
}
