"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TrimSlider } from "@/components/remix/trim-slider";
import { RatioPicker } from "@/components/remix/ratio-picker";
import { SubtitleConfig, defaultSubtitleSettings, type SubtitleSettings } from "@/components/remix/subtitle-config";
import { BlurRegionPicker, type BlurRegion } from "@/components/remix/blur-region-picker";
import { buildFacebookCopyrightPreflight } from "@/lib/remix/copyright-preflight";

type OnScreenTextPreset = "meme" | "pop" | "bubble" | "neon" | "clean";

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

interface VideoEditorProps {
  source: string;
  initialOptions?: Record<string, any>;
  onSave: (options: Record<string, any>) => void;
  onCancel: () => void;
}

export function VideoEditor({ source, initialOptions = {}, onSave, onCancel }: VideoEditorProps) {
  const initialTextStyle = initialOptions.onScreenTextStyle ?? {};
  const initialSubtitle = initialOptions.subtitleConfig ?? {};
  const initialWatermark = initialOptions.watermarkConfig ?? {};
  const [duration, setDuration] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(initialOptions.trimStart || 0);
  const [trimEnd, setTrimEnd] = useState<number>(
    (initialOptions.trimStart || 0) + (initialOptions.trimSeconds || 0)
  );
  
  const [outputRatio, setOutputRatio] = useState<string>(initialOptions.outputRatio || (initialOptions.vertical ? '9:16' : 'original'));
  const [translateOnScreenText, setTranslateOnScreenText] = useState<boolean>(
    Boolean(initialOptions.translateOnScreenText || initialOptions.textOverlay)
  );
  const [textOverlay, setTextOverlay] = useState<string>(initialOptions.textOverlay || "");
  const [onScreenTextPreset, setOnScreenTextPreset] = useState<OnScreenTextPreset>(
    initialTextStyle.preset ?? "meme",
  );
  const [textFont, setTextFont] = useState<string>(initialTextStyle.font || "Anton");
  const [textFontSize, setTextFontSize] = useState<number>(
    initialTextStyle.size || initialOptions.textFontSize || 34,
  );
  const [textColor, setTextColor] = useState<string>(
    initialTextStyle.color || initialOptions.textColor || "#FFFFFF",
  );
  const [textBgColor, setTextBgColor] = useState<string>(initialTextStyle.bgColor || "#000000");
  const [textOutlineColor, setTextOutlineColor] = useState<string>(
    initialTextStyle.outlineColor || "#000000",
  );
  const [textBold, setTextBold] = useState<boolean>(initialTextStyle.bold ?? true);
  const [scriptInputMode, setScriptInputMode] = useState<"from_video_audio" | "manual_script">(
    initialOptions.scriptInputMode === "manual_script" ? "manual_script" : "from_video_audio",
  );
  const [manualScript, setManualScript] = useState<string>(
    initialOptions.manualScript || initialOptions.editedScript || "",
  );
  const [vietsub, setVietsub] = useState<boolean>(Boolean(initialOptions.vietsub));
  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>({
    ...defaultSubtitleSettings,
    ...initialSubtitle,
    font: initialSubtitle.font || initialOptions.subFont || defaultSubtitleSettings.font,
    size: initialSubtitle.size || initialOptions.subFontSize || defaultSubtitleSettings.size,
    color: initialSubtitle.color || initialOptions.subColor || defaultSubtitleSettings.color,
    bgColor: initialSubtitle.bgColor || initialOptions.subBgColor || defaultSubtitleSettings.bgColor,
    highlightColor: initialSubtitle.highlightColor || initialOptions.subHighlightColor || defaultSubtitleSettings.highlightColor,
    bold: initialSubtitle.bold ?? initialOptions.subBold ?? defaultSubtitleSettings.bold,
    italic: initialSubtitle.italic ?? initialOptions.subItalic ?? defaultSubtitleSettings.italic,
    outline: initialSubtitle.outline ?? initialOptions.subOutline ?? defaultSubtitleSettings.outline,
    borderStyle: initialSubtitle.borderStyle ?? initialOptions.subBorderStyle ?? defaultSubtitleSettings.borderStyle,
    position: initialSubtitle.position || initialOptions.subPosition || defaultSubtitleSettings.position,
    animation: initialSubtitle.animation || initialOptions.subtitleAnimation || defaultSubtitleSettings.animation,
  });
  const [watermarkEnabled, setWatermarkEnabled] = useState<boolean>(
    Boolean(initialWatermark.enabled || initialOptions.brandLogo),
  );
  const [watermarkType, setWatermarkType] = useState<"image" | "text">(
    initialWatermark.type || (initialOptions.logoMediaId ? "image" : "text"),
  );
  const [watermarkText, setWatermarkText] = useState<string>(initialWatermark.text || "");
  const [watermarkMedia, setWatermarkMedia] = useState<{ id: string; url: string } | null>(null);
  const [uploadingWatermark, setUploadingWatermark] = useState(false);
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(initialWatermark.opacity ?? 0.9);
  const [watermarkScale, setWatermarkScale] = useState<number>(initialWatermark.scale ?? 0.15);
  const [watermarkPosition, setWatermarkPosition] = useState<string>(
    initialWatermark.position || initialOptions.logoPosition || "bottom-right",
  );
  const [watermarkCustom, setWatermarkCustom] = useState<{ x: number; y: number }>(
    initialWatermark.customPosition || { x: 0.82, y: 0.9 },
  );
  const [removeBg, setRemoveBg] = useState<boolean>(Boolean(initialWatermark.removeBackground));
  const [coverOriginalWatermark, setCoverOriginalWatermark] = useState<boolean>(Boolean(initialWatermark.coverOriginal));
  const [oldWatermarkRegion, setOldWatermarkRegion] = useState<BlurRegion>(
    initialWatermark.oldWatermarkRegions?.[0] || { x: 0.72, y: 0.88, w: 0.24, h: 0.08 },
  );
  
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.onloadedmetadata = () => {
        const d = videoRef.current!.duration;
        setDuration(d);
        if (!initialOptions.trimSeconds) {
          setTrimEnd(Math.floor(d));
        }
      };
    }
  }, [initialOptions.trimSeconds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) videoRef.current.play();
        else videoRef.current.pause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSave = () => {
    const trimSeconds = trimEnd - trimStart;
    const preflight = buildFacebookCopyrightPreflight({
      options: {
        ...initialOptions,
        muteOriginal: initialOptions.muteOriginal,
        scriptInputMode,
        watermarkConfig: watermarkEnabled
          ? {
              enabled: true,
              type: watermarkType,
              text: watermarkText.trim() || undefined,
              imageMediaId: watermarkMedia?.id || initialWatermark.imageMediaId || initialOptions.logoMediaId,
              opacity: watermarkOpacity,
              scale: watermarkScale,
              removeBackground: removeBg,
              position: watermarkPosition as any,
              customPosition: watermarkPosition === "custom" ? watermarkCustom : undefined,
              coverOriginal: coverOriginalWatermark,
              oldWatermarkRegions: coverOriginalWatermark ? [oldWatermarkRegion] : [],
            }
          : undefined,
      },
      hasAudio: true,
    });
    onSave({
      ...initialOptions,
      trimStart,
      trimSeconds,
      vertical: outputRatio === '9:16',
      outputRatio,
      scriptInputMode,
      manualScript: scriptInputMode === "manual_script" ? manualScript.trim() : undefined,
      editedScript: scriptInputMode === "manual_script" ? manualScript.trim() : initialOptions.editedScript,
      vietsub,
      subtitleConfig: vietsub ? subtitleSettings : initialOptions.subtitleConfig,
      subtitleAnimation: subtitleSettings.animation,
      subtitlePreset: subtitleSettings.preset,
      subHighlightColor: subtitleSettings.highlightColor,
      translateOnScreenText,
      textOverlay: translateOnScreenText ? textOverlay.trim() : "",
      onScreenTextStyle: translateOnScreenText
        ? {
            preset: onScreenTextPreset,
            font: textFont,
            size: textFontSize,
            color: textColor,
            bgColor: textBgColor,
            outlineColor: textOutlineColor,
            bold: textBold,
          }
        : undefined,
      watermarkConfig: watermarkEnabled
        ? {
            enabled: true,
            type: watermarkType,
            text: watermarkText.trim() || undefined,
            imageMediaId: watermarkMedia?.id || initialWatermark.imageMediaId || initialOptions.logoMediaId,
            opacity: watermarkOpacity,
            scale: watermarkScale,
            removeBackground: removeBg,
            position: watermarkPosition,
            customPosition: watermarkPosition === "custom" ? watermarkCustom : undefined,
            coverOriginal: coverOriginalWatermark,
            oldWatermarkRegions: coverOriginalWatermark ? [oldWatermarkRegion] : [],
          }
        : undefined,
      brandLogo: watermarkEnabled && watermarkType === "image",
      logoMediaId: watermarkMedia?.id || initialOptions.logoMediaId,
      logoPosition: watermarkPosition === "custom" ? "bottom-right" : watermarkPosition,
      copyrightPreflight: preflight,
    });
  };

  const uploadWatermark = async (file: File) => {
    setUploadingWatermark(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tải watermark thất bại.");
      setWatermarkMedia(data.asset);
    } finally {
      setUploadingWatermark(false);
    }
  };

  const preflight = buildFacebookCopyrightPreflight({
    options: {
      ...initialOptions,
      scriptInputMode,
      watermarkConfig: watermarkEnabled
        ? {
            enabled: true,
            type: watermarkType,
            text: watermarkText,
            opacity: watermarkOpacity,
            scale: watermarkScale,
            position: watermarkPosition as any,
            coverOriginal: coverOriginalWatermark,
            oldWatermarkRegions: coverOriginalWatermark ? [oldWatermarkRegion] : [],
          }
        : undefined,
    },
    hasAudio: true,
  });

  const applyOnScreenTextPreset = (preset: OnScreenTextPreset) => {
    const style = ON_SCREEN_TEXT_PRESETS[preset];
    setOnScreenTextPreset(preset);
    setTextFont(style.font);
    setTextFontSize(style.size);
    setTextColor(style.color);
    setTextBgColor(style.bgColor);
    setTextOutlineColor(style.outlineColor);
    setTextBold(style.bold);
  };

  const getAspectClass = () => {
    switch (outputRatio) {
      case '9:16': return 'aspect-[9/16] object-cover';
      case '16:9': return 'aspect-video object-cover';
      case '1:1': return 'aspect-square object-cover';
      case '4:5': return 'aspect-[4/5] object-cover';
      default: return 'aspect-video object-contain';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="w-[90vw] h-[90vh] bg-card rounded-xl flex flex-col overflow-hidden relative shadow-2xl border border-border">
        <div className="flex items-center justify-between p-4 bg-muted/30 border-b">
          <h3 className="font-semibold text-lg">Video Editor</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>Huỷ</Button>
            <Button size="sm" onClick={handleSave}>Lưu & Áp dụng</Button>
          </div>
        </div>
      
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          <div className="flex-1 p-6 flex items-center justify-center bg-zinc-950">
            <div className="relative h-full w-full flex items-center justify-center">
               <video
                ref={videoRef}
                src={source}
                controls
                className={`max-h-full max-w-full rounded-lg shadow-xl ring-1 ring-white/10 ${getAspectClass()}`}
                onTimeUpdate={() => {
                  if (videoRef.current && videoRef.current.currentTime > trimEnd) {
                    videoRef.current.pause();
                    videoRef.current.currentTime = trimStart;
                  }
                }}
              />
              {watermarkEnabled && (
                <div
                  className="pointer-events-none absolute rounded px-2 py-1 text-xs font-bold text-white shadow"
                  style={{
                    left: `${watermarkPosition === "custom" ? watermarkCustom.x * 100 : watermarkPosition.includes("right") ? 78 : 6}%`,
                    top: `${watermarkPosition === "custom" ? watermarkCustom.y * 100 : watermarkPosition.includes("bottom") ? 86 : 6}%`,
                    opacity: watermarkOpacity,
                    transform: `scale(${Math.max(0.7, watermarkScale / 0.15)})`,
                    background: watermarkType === "text" ? "rgba(0,0,0,0.45)" : "transparent",
                  }}
                >
                  {watermarkType === "image"
                    ? (watermarkMedia ? "WATERMARK" : "LOGO")
                    : (watermarkText || "Watermark")}
                </div>
              )}
            </div>
          </div>
          
          <div className="w-full lg:w-[480px] border-t lg:border-t-0 lg:border-l border-border p-6 flex flex-col gap-8 overflow-y-auto bg-muted/10">
            {/* Trim */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-semibold text-base">Cắt Video (Trim)</h4>
              </div>
              <TrimSlider 
                duration={duration} 
                start={trimStart} 
                end={trimEnd} 
                onChange={(s, e) => {
                  setTrimStart(s);
                  setTrimEnd(e);
                  if (videoRef.current) videoRef.current.currentTime = s;
                }} 
              />
            </div>

            {/* Ratio */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-semibold text-base">Tỉ lệ khung hình</h4>
              </div>
              <RatioPicker value={outputRatio} onChange={setOutputRatio} />
            </div>

            {/* Script & subtitle */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-semibold text-base">Script & phụ đề</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScriptInputMode("from_video_audio")}
                  className={`rounded-md border px-3 py-2 text-sm ${scriptInputMode === "from_video_audio" ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}
                >
                  Audio video
                </button>
                <button
                  type="button"
                  onClick={() => setScriptInputMode("manual_script")}
                  className={`rounded-md border px-3 py-2 text-sm ${scriptInputMode === "manual_script" ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}
                >
                  Script nhập tay
                </button>
              </div>
              {scriptInputMode === "manual_script" && (
                <textarea
                  value={manualScript}
                  onChange={(e) => setManualScript(e.target.value)}
                  placeholder="Paste script để tạo voice/subtitle trực tiếp..."
                  className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={vietsub} onChange={(e) => setVietsub(e.target.checked)} />
                Burn-in phụ đề
              </label>
              {vietsub && (
                <SubtitleConfig
                  value={subtitleSettings}
                  onChange={setSubtitleSettings}
                  title="Style phụ đề"
                  sampleText="TikTok nhả từng từ"
                />
              )}
            </div>

            {/* Watermark */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-semibold text-base">Watermark</h4>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={watermarkEnabled} onChange={(e) => setWatermarkEnabled(e.target.checked)} />
                Chèn watermark mới
              </label>
              {watermarkEnabled && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setWatermarkType("image")} className={`rounded-md border px-3 py-2 text-sm ${watermarkType === "image" ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}>
                      Ảnh/logo
                    </button>
                    <button type="button" onClick={() => setWatermarkType("text")} className={`rounded-md border px-3 py-2 text-sm ${watermarkType === "text" ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}>
                      Text
                    </button>
                  </div>
                  {watermarkType === "image" ? (
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={uploadingWatermark}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadWatermark(f);
                        }}
                        className="text-sm"
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} />
                        Remove background nền sáng
                      </label>
                    </div>
                  ) : (
                    <input
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      placeholder="Nhập watermark text..."
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                    />
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">Opacity {Math.round(watermarkOpacity * 100)}%</span>
                      <input type="range" min="0" max="1" step="0.05" value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))} className="w-full" />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">Size {Math.round(watermarkScale * 100)}%</span>
                      <input type="range" min="0.03" max="0.5" step="0.01" value={watermarkScale} onChange={(e) => setWatermarkScale(Number(e.target.value))} className="w-full" />
                    </label>
                  </div>
                  <select
                    value={watermarkPosition}
                    onChange={(e) => setWatermarkPosition(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  >
                    <option value="bottom-right">Dưới phải</option>
                    <option value="bottom-left">Dưới trái</option>
                    <option value="top-right">Trên phải</option>
                    <option value="top-left">Trên trái</option>
                    <option value="custom">Tuỳ chỉnh</option>
                  </select>
                  {watermarkPosition === "custom" && (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1 text-sm">
                        <span>X {watermarkCustom.x.toFixed(2)}</span>
                        <input type="range" min="0" max="1" step="0.01" value={watermarkCustom.x} onChange={(e) => setWatermarkCustom((p) => ({ ...p, x: Number(e.target.value) }))} />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span>Y {watermarkCustom.y.toFixed(2)}</span>
                        <input type="range" min="0" max="1" step="0.01" value={watermarkCustom.y} onChange={(e) => setWatermarkCustom((p) => ({ ...p, y: Number(e.target.value) }))} />
                      </label>
                    </div>
                  )}
                  <BlurRegionPicker
                    videoUrl={source}
                    region={oldWatermarkRegion}
                    onChange={setOldWatermarkRegion}
                    defaultEnabled={coverOriginalWatermark}
                    onToggle={setCoverOriginalWatermark}
                    autoDetect={false}
                    label="Che watermark/logo cũ đã xác nhận"
                    autoDetectLabel="AI detect rồi xác nhận vùng"
                    autoDetectDescription="Bản đầu dùng vùng xác nhận thủ công/AI-preflight trước khi che để tránh che nhầm nội dung chính."
                  />
                </div>
              )}
            </div>

            {/* On-screen text translation */}
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-semibold text-base">Dịch chữ trên video</h4>
              </div>

              <label className="flex items-start gap-3 rounded-md border border-input bg-background p-3 text-sm">
                <input
                  type="checkbox"
                  checked={translateOnScreenText}
                  onChange={(e) => setTranslateOnScreenText(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">Tự phát hiện và dịch text on-screen</span>
                  <span className="block text-muted-foreground">
                    AI sẽ đọc chữ đang có trong frame gốc, review tone/mood rồi dịch tự nhiên theo ngôn ngữ đã setting.
                  </span>
                </span>
              </label>

              {translateOnScreenText && (
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Hint ngữ cảnh/thuật ngữ cần giữ, không phải nội dung chèn trực tiếp..."
                    value={textOverlay}
                    onChange={(e) => setTextOverlay(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    {(Object.entries(ON_SCREEN_TEXT_PRESETS) as Array<[OnScreenTextPreset, typeof ON_SCREEN_TEXT_PRESETS[OnScreenTextPreset]]>).map(([key, style]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyOnScreenTextPreset(key)}
                        className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                          onScreenTextPreset === key
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input bg-background hover:bg-muted"
                        }`}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Font chữ</label>
                      <select
                        value={textFont}
                        onChange={(e) => setTextFont(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
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

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground flex justify-between">
                        <span>Cỡ chữ</span>
                        <span className="text-foreground">{textFontSize}px</span>
                      </label>
                      <input
                        type="range"
                        min="16"
                        max="72"
                        value={textFontSize}
                        onChange={(e) => setTextFontSize(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Màu chữ", value: textColor, setter: setTextColor },
                      { label: "Màu nền", value: textBgColor, setter: setTextBgColor },
                      { label: "Màu viền", value: textOutlineColor, setter: setTextOutlineColor },
                    ].map(({ label, value, setter }) => (
                      <label key={label} className="space-y-1">
                        <span className="block text-xs text-muted-foreground">{label}</span>
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => setter(e.target.value)}
                          className="h-9 w-full rounded border border-input bg-background p-1"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={textBold}
                        onChange={(e) => setTextBold(e.target.checked)}
                      />
                      Đậm
                    </label>
                  </div>

                  <div className="rounded-md bg-zinc-950 p-4 text-center">
                    <span
                      className="inline-block rounded px-3 py-1 leading-tight"
                      style={{
                        fontFamily: textFont,
                        fontSize: `${Math.min(textFontSize, 42)}px`,
                        color: textColor,
                        backgroundColor: textBgColor,
                        WebkitTextStroke: `1px ${textOutlineColor}`,
                        fontWeight: textBold ? 800 : 500,
                      }}
                    >
                      Text on-screen mẫu
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-md border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-base">Facebook copyright preflight</h4>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${preflight.riskLevel === "high" ? "bg-destructive/10 text-destructive" : preflight.riskLevel === "medium" ? "bg-amber-500/10 text-amber-700" : "bg-success/10 text-success"}`}>
                  {preflight.riskLevel}
                </span>
              </div>
              <div className="space-y-2">
                {preflight.items.map((item) => (
                  <div key={item.id} className="rounded border border-border/70 p-2 text-xs">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-muted-foreground">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
