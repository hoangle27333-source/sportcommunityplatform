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

// ── Script Segment types ──────────────────────────────────────────────────────
interface ScriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  isEdited?: boolean;
}

// ── Text Overlay types ────────────────────────────────────────────────────────
interface TextOnScreenOverlay {
  id: string;
  start: number;
  end: number;
  text: string;
  position: { x: number; y: number };
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  bgColor: string;
  animation: 'none' | 'fade_in' | 'fade_out' | 'slide_up' | 'slide_down' | 'scale_in';
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 8); }

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function parseMMSS(v: string): number {
  const p = v.split(':');
  return p.length === 2 ? (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0) : parseFloat(v) || 0;
}

function autoSplitSegments(duration: number, interval = 15): ScriptSegment[] {
  if (duration <= 0) return [{ id: genId(), start: 0, end: 0, text: '' }];
  const segs: ScriptSegment[] = [];
  let t = 0;
  while (t < duration) {
    const end = Math.min(t + interval, duration);
    segs.push({ id: genId(), start: t, end, text: '' });
    t = end;
  }
  return segs;
}

export function VideoEditor({ source, initialOptions = {}, onSave, onCancel }: VideoEditorProps) {
  const initialTextStyle = initialOptions.onScreenTextStyle ?? {};
  const initialSubtitle = initialOptions.subtitleConfig ?? {};
  const initialWatermark = initialOptions.watermarkConfig ?? {};

  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(initialOptions.trimStart || 0);
  const [trimEnd, setTrimEnd] = useState<number>(
    (initialOptions.trimStart || 0) + (initialOptions.trimSeconds || 0)
  );
  
  const [outputRatio, setOutputRatio] = useState<string>(initialOptions.outputRatio || (initialOptions.vertical ? '9:16' : 'original'));

  // ── Script & Subtitle ────────────────────────────────────────────────────────
  const [scriptInputMode, setScriptInputMode] = useState<"from_video_audio" | "manual_script">(
    initialOptions.scriptInputMode === "manual_script" ? "manual_script" : "from_video_audio",
  );
  const [scriptSegments, setScriptSegments] = useState<ScriptSegment[]>(() => {
    // Ưu tiên: scriptSegments đã lưu → generatedScript (ASR result) → editedScript → manualScript
    const saved = initialOptions.scriptSegments as ScriptSegment[] | undefined;
    if (saved && saved.length > 0 && saved.some((s: ScriptSegment) => s.text?.trim())) return saved;
    const raw = (initialOptions.generatedScript || initialOptions.editedScript || initialOptions.manualScript || '').trim();
    if (!raw) return [];
    // Parse multiline script → nhiều segments (mỗi câu/dòng là 1 segment)
    // Timestamps sẽ được gán proportionally khi video load xong
    const lines = raw.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    if (lines.length === 1) return [{ id: genId(), start: 0, end: 0, text: lines[0] }];
    return lines.map((line: string, i: number) => ({
      id: genId(),
      start: 0, // sẽ được phân bổ khi video load
      end: 0,
      text: line,
      _lineIndex: i, // dùng nội bộ để phân bổ timestamps
    } as ScriptSegment));
  });
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
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

  // ── Watermark ────────────────────────────────────────────────────────────────
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

  // ── Text On Screen (Translate existing) ──────────────────────────────────────
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

  // ── Custom Text Overlays ──────────────────────────────────────────────────────
  const [textOverlays, setTextOverlays] = useState<TextOnScreenOverlay[]>(
    initialOptions.textOnScreenOverlays || []
  );
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [draggingOverlayId, setDraggingOverlayId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'script' | 'watermark' | 'text_overlay'>('script');

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // ─── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.onloadedmetadata = () => {
        const d = videoRef.current!.duration;
        setDuration(d);
        if (!initialOptions.trimSeconds) setTrimEnd(Math.floor(d));

        setScriptSegments(prev => {
          // Nếu tất cả segments đều chưa có timestamps (start=0, end=0) → phân bổ đều theo duration
          const allUninitialized = prev.length > 0 && prev.every(s => s.start === 0 && s.end === 0);
          if (allUninitialized && prev.length > 0) {
            const segDur = d / prev.length;
            return prev.map((s, i) => ({
              ...s,
              start: Math.round(i * segDur * 10) / 10,
              end: Math.round((i + 1) * segDur * 10) / 10,
            }));
          }
          // Manual mode: chưa có segments → auto split
          if (scriptInputMode === 'manual_script' && prev.length === 0) {
            return autoSplitSegments(d);
          }
          return prev;
        });
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

  useEffect(() => {
    if (scriptSegments.length === 0) return;
    const idx = scriptSegments.findIndex(s => currentTime >= s.start && currentTime < s.end);
    setActiveSegmentIndex(idx);
  }, [currentTime, scriptSegments]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const seekTo = (sec: number) => {
    if (videoRef.current) videoRef.current.currentTime = sec;
  };

  const handleSave = () => {
    const trimSeconds = trimEnd - trimStart;
    const combinedScript = scriptSegments.filter(s => s.text.trim()).map(s => s.text.trim()).join(' ');
    const preflight = buildFacebookCopyrightPreflight({
      options: {
        ...initialOptions,
        muteOriginal: initialOptions.muteOriginal,
        scriptInputMode,
        watermarkConfig: watermarkEnabled
          ? { enabled: true, type: watermarkType, text: watermarkText.trim() || undefined,
              imageMediaId: watermarkMedia?.id || initialWatermark.imageMediaId || initialOptions.logoMediaId,
              opacity: watermarkOpacity, scale: watermarkScale, removeBackground: removeBg,
              position: watermarkPosition as any,
              customPosition: watermarkPosition === "custom" ? watermarkCustom : undefined,
              coverOriginal: coverOriginalWatermark,
              oldWatermarkRegions: coverOriginalWatermark ? [oldWatermarkRegion] : [],
            }
          : { enabled: false },
      },
      hasAudio: true,
    });
    onSave({
      ...initialOptions,
      trimStart, trimSeconds,
      vertical: outputRatio === '9:16', outputRatio,
      scriptInputMode,
      manualScript: scriptInputMode === "manual_script" ? combinedScript : undefined,
      editedScript: scriptInputMode === "manual_script" ? combinedScript : initialOptions.editedScript,
      scriptSegments: scriptSegments.length > 0 ? scriptSegments : undefined,
      vietsub,
      subtitleConfig: vietsub ? subtitleSettings : initialOptions.subtitleConfig,
      subtitleAnimation: subtitleSettings.animation,
      subtitlePreset: subtitleSettings.preset,
      subHighlightColor: subtitleSettings.highlightColor,
      translateOnScreenText,
      textOverlay: translateOnScreenText ? textOverlay.trim() : "",
      onScreenTextStyle: translateOnScreenText
        ? { preset: onScreenTextPreset, font: textFont, size: textFontSize, color: textColor,
            bgColor: textBgColor, outlineColor: textOutlineColor, bold: textBold }
        : undefined,
      textOnScreenOverlays: textOverlays.length > 0 ? textOverlays : undefined,
      watermarkConfig: watermarkEnabled
        ? { enabled: true, type: watermarkType, text: watermarkText.trim() || undefined,
            imageMediaId: watermarkMedia?.id || initialWatermark.imageMediaId || initialOptions.logoMediaId,
            opacity: watermarkOpacity, scale: watermarkScale, removeBackground: removeBg,
            position: watermarkPosition, customPosition: watermarkPosition === "custom" ? watermarkCustom : undefined,
            coverOriginal: coverOriginalWatermark,
            oldWatermarkRegions: coverOriginalWatermark ? [oldWatermarkRegion] : [],
          }
        : { enabled: false },
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
      ...initialOptions, scriptInputMode,
      watermarkConfig: watermarkEnabled
        ? { enabled: true, type: watermarkType, text: watermarkText, opacity: watermarkOpacity,
            scale: watermarkScale, position: watermarkPosition as any,
            coverOriginal: coverOriginalWatermark,
            oldWatermarkRegions: coverOriginalWatermark ? [oldWatermarkRegion] : [],
          }
        : { enabled: false },
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

  const updateSegment = (index: number, patch: Partial<ScriptSegment>) => {
    setScriptSegments(prev => prev.map((s, i) => i === index ? { ...s, ...patch, isEdited: true } : s));
  };

  const deleteSegment = (index: number) => {
    setScriptSegments(prev => prev.length <= 1 ? [{ ...prev[0], text: '' }] : prev.filter((_, i) => i !== index));
  };

  const insertAfter = (index: number) => {
    setScriptSegments(prev => {
      const seg = prev[index];
      const mid = (seg.start + seg.end) / 2;
      const left = { ...seg, id: genId(), end: mid };
      const right: ScriptSegment = { id: genId(), start: mid, end: seg.end, text: '' };
      return [...prev.slice(0, index), left, right, ...prev.slice(index + 1)];
    });
  };

  const mergeWithNext = (index: number) => {
    setScriptSegments(prev => {
      if (index >= prev.length - 1) return prev;
      const a = prev[index], b = prev[index + 1];
      const merged: ScriptSegment = { id: genId(), start: a.start, end: b.end, text: [a.text, b.text].filter(Boolean).join(' '), isEdited: true };
      return [...prev.slice(0, index), merged, ...prev.slice(index + 2)];
    });
  };

  const handleAutoSplit = () => {
    if (duration > 0) setScriptSegments(autoSplitSegments(duration));
  };

  const addTextOverlay = () => {
    const newOverlay: TextOnScreenOverlay = {
      id: genId(), start: Math.floor(currentTime), end: Math.min(Math.floor(currentTime) + 5, duration || 10),
      text: 'Text mới', position: { x: 0.1, y: 0.1 },
      fontFamily: 'Be Vietnam Pro', fontSize: 32, fontColor: '#FFFFFF', bgColor: '#000000CC', animation: 'fade_in',
    };
    setTextOverlays(prev => [...prev, newOverlay]);
    setEditingOverlayId(newOverlay.id);
  };

  const updateOverlay = (id: string, patch: Partial<TextOnScreenOverlay>) => {
    setTextOverlays(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
  };

  const deleteOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(o => o.id !== id));
    if (editingOverlayId === id) setEditingOverlayId(null);
  };

  const handleOverlayDragEnd = (id: string, e: React.DragEvent<HTMLDivElement>) => {
    const container = videoContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    updateOverlay(id, { position: { x, y } });
    setDraggingOverlayId(null);
  };

  const activeOverlays = textOverlays.filter(o => currentTime >= o.start && currentTime <= o.end);

  const FONT_OPTIONS = ["Anton", "Oswald", "Be Vietnam Pro", "Montserrat", "Nunito", "Baloo 2", "Inter", "Impact", "Arial", "Noto Sans"];
  const ANIMATION_OPTIONS: Array<{ value: TextOnScreenOverlay['animation']; label: string }> = [
    { value: 'none', label: 'Không có' },
    { value: 'fade_in', label: 'Fade In' },
    { value: 'fade_out', label: 'Fade Out' },
    { value: 'slide_up', label: 'Slide Up' },
    { value: 'slide_down', label: 'Slide Down' },
    { value: 'scale_in', label: 'Scale In' },
  ];

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
            <div
              ref={videoContainerRef}
              className="relative h-full w-full flex items-center justify-center"
              onDragOver={(e) => e.preventDefault()}
            >
               <video
                ref={videoRef}
                src={source}
                controls
                className={`max-h-full max-w-full rounded-lg shadow-xl ring-1 ring-white/10 ${getAspectClass()}`}
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    const t = videoRef.current.currentTime;
                    setCurrentTime(t);
                    if (t > trimEnd) {
                      videoRef.current.pause();
                      videoRef.current.currentTime = trimStart;
                    }
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
              {activeOverlays.map(overlay => (
                <div
                  key={overlay.id}
                  draggable
                  onDragStart={() => setDraggingOverlayId(overlay.id)}
                  onDragEnd={(e) => handleOverlayDragEnd(overlay.id, e)}
                  onClick={() => { setActiveTab('text_overlay'); setEditingOverlayId(overlay.id); }}
                  className={`absolute cursor-move rounded px-2 py-1 text-sm font-semibold select-none transition-all ${
                    editingOverlayId === overlay.id ? 'ring-2 ring-blue-400' : 'hover:ring-1 hover:ring-white/50'
                  } ${draggingOverlayId === overlay.id ? 'opacity-40' : 'opacity-100'}`}
                  style={{
                    left: `${overlay.position.x * 100}%`,
                    top: `${overlay.position.y * 100}%`,
                    fontFamily: overlay.fontFamily,
                    fontSize: `${Math.min(overlay.fontSize, 36)}px`,
                    color: overlay.fontColor,
                    backgroundColor: overlay.bgColor,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {overlay.text}
                </div>
              ))}
            </div>
          </div>
          
          <div className="w-full lg:w-[500px] border-t lg:border-t-0 lg:border-l border-border flex flex-col min-h-0 bg-muted/10">
            <div className="flex border-b border-border overflow-x-auto">
              {([
                { id: 'script', label: '📝 Script & Phụ đề' },
                { id: 'watermark', label: '💧 Watermark' },
                { id: 'text_overlay', label: '🖊 Text on Screen' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'script' && (
                <>
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
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h4 className="font-semibold text-base">Tỉ lệ khung hình</h4>
                    </div>
                    <RatioPicker value={outputRatio} onChange={setOutputRatio} />
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h4 className="font-semibold text-base">Script & Phụ đề</h4>
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
                        onClick={() => {
                          setScriptInputMode("manual_script");
                          if (scriptSegments.length === 0 && duration > 0) {
                            setScriptSegments(autoSplitSegments(duration));
                          }
                        }}
                        className={`rounded-md border px-3 py-2 text-sm ${scriptInputMode === "manual_script" ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}
                      >
                        Script nhập tay
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {scriptSegments.length} segment{scriptSegments.length !== 1 ? 's' : ''}
                          {duration > 0 && ` · ${fmt(duration)} tổng`}
                        </span>
                        <div className="flex gap-2">
                          {scriptInputMode === 'manual_script' && (
                            <button
                              type="button"
                              onClick={handleAutoSplit}
                              className="text-xs rounded border border-input px-2 py-1 hover:bg-muted"
                              title="Chia lại đều theo thời gian"
                            >
                              ⚡ Auto-chia
                            </button>
                          )}
                        </div>
                      </div>
                      {scriptSegments.length === 0 && scriptInputMode === 'from_video_audio' && (
                        <div className="py-3 text-center border border-dashed rounded-md space-y-1">
                          <p className="text-xs text-muted-foreground italic">Script sẽ được lấy tự động từ audio video</p>
                          <p className="text-[11px] text-muted-foreground/60">Chưa có script từ lần generate trước — chuyển sang "Script nhập tay" để nhập thủ công</p>
                        </div>
                      )}
                      {scriptSegments.length > 0 && scriptInputMode === 'from_video_audio' && (
                        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-400">
                          ℹ️ Script được lấy từ lần generate trước. Bạn có thể chỉnh sửa nội dung từng đoạn, sau đó Lưu &amp; Áp dụng để generate lại với script đã sửa.
                        </div>
                      )}
                      {scriptSegments.map((seg, i) => (
                        <div key={seg.id} className="space-y-1">
                          <div
                            className={`rounded-lg border transition-colors ${
                              activeSegmentIndex === i
                                ? 'border-primary bg-primary/5'
                                : 'border-input bg-background hover:border-muted-foreground/40'
                            }`}
                          >
                            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => seekTo(seg.start)}
                                  className="flex items-center gap-1 text-xs font-mono text-blue-400 hover:text-blue-300 transition-colors"
                                  title="Click để seek video đến đây"
                                >
                                  ⏱ {fmt(seg.start)}
                                </button>
                                <span className="text-xs text-muted-foreground">→</span>
                                {scriptInputMode === 'manual_script' ? (
                                  <input
                                    type="text"
                                    value={fmt(seg.end)}
                                    onChange={(e) => updateSegment(i, { end: parseMMSS(e.target.value) })}
                                    className="w-16 text-xs font-mono bg-transparent border-b border-dashed border-input focus:outline-none focus:border-primary text-blue-400"
                                  />
                                ) : (
                                  <span className="text-xs font-mono text-muted-foreground">{fmt(seg.end)}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {seg.isEdited && (
                                  <span className="text-[10px] bg-amber-500/20 text-amber-500 px-1 py-0.5 rounded">edited</span>
                                )}
                                {i < scriptSegments.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => mergeWithNext(i)}
                                    title="Gộp với segment tiếp theo"
                                    className="text-xs text-muted-foreground hover:text-foreground px-1"
                                  >
                                    ⤵
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => deleteSegment(i)}
                                  className="text-xs text-muted-foreground hover:text-destructive px-1"
                                  title="Xóa segment"
                                >
                                  🗑
                                </button>
                              </div>
                            </div>
                            <div className="p-2">
                              <textarea
                                value={seg.text}
                                onChange={(e) => updateSegment(i, { text: e.target.value })}
                                placeholder={scriptInputMode === 'manual_script'
                                  ? `Nhập script cho đoạn ${fmt(seg.start)} - ${fmt(seg.end)}...`
                                  : 'Script segment...'
                                }
                                rows={2}
                                className="w-full text-sm bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/50"
                              />
                            </div>
                          </div>
                          {scriptInputMode === 'manual_script' && i < scriptSegments.length - 1 && (
                            <div className="flex justify-center">
                              <button
                                type="button"
                                onClick={() => insertAfter(i)}
                                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 py-0.5 px-2 rounded hover:bg-primary/10 transition-colors"
                                title="Chèn segment mới"
                              >
                                ➕ Chèn đoạn
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {scriptInputMode === 'manual_script' && (
                        <button
                          type="button"
                          onClick={() => {
                            const last = scriptSegments[scriptSegments.length - 1];
                            const start = last ? last.end : 0;
                            const end = Math.min(start + 15, duration || start + 15);
                            setScriptSegments(prev => [...prev, { id: genId(), start, end, text: '' }]);
                          }}
                          className="w-full text-sm border border-dashed border-input rounded-lg py-2 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                        >
                          ➕ Thêm segment
                        </button>
                      )}
                    </div>
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
                </>
              )}
              {activeTab === 'watermark' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h4 className="font-semibold text-base">Watermark</h4>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={watermarkEnabled} onChange={(e) => setWatermarkEnabled(e.target.checked)} />
                    Chèn watermark mới
                  </label>
                  {!watermarkEnabled && (
                    <p className="text-xs text-muted-foreground bg-muted rounded-md p-3">
                      💡 Watermark đã tắt — video output sẽ không có watermark nào.
                    </p>
                  )}
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
              )}
              {activeTab === 'text_overlay' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h4 className="font-semibold text-base">Text on Screen</h4>
                    <Button size="sm" variant="outline" onClick={addTextOverlay}>+ Thêm Text</Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    💡 Drag text trên video preview để đặt vị trí. Click text để chọn và chỉnh sửa.
                  </p>

                  {textOverlays.length === 0 && (
                    <div className="text-center py-8 border border-dashed border-input rounded-lg">
                      <p className="text-muted-foreground text-sm">Chưa có text overlay nào</p>
                      <button
                        type="button"
                        onClick={addTextOverlay}
                        className="mt-2 text-sm text-primary hover:underline"
                      >
                        + Thêm text overlay đầu tiên
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    {textOverlays.map((overlay) => (
                      <div
                        key={overlay.id}
                        className={`rounded-lg border transition-colors cursor-pointer ${
                          editingOverlayId === overlay.id
                            ? 'border-primary bg-primary/5'
                            : 'border-input bg-background hover:border-muted-foreground/40'
                        }`}
                        onClick={() => setEditingOverlayId(overlay.id === editingOverlayId ? null : overlay.id)}
                      >
                        <div className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); seekTo(overlay.start); }}
                              className="text-xs font-mono text-blue-400 hover:text-blue-300"
                              title="Seek đến thời điểm này"
                            >
                              ⏱ {fmt(overlay.start)} - {fmt(overlay.end)}
                            </button>
                            <span
                              className="text-xs px-2 py-0.5 rounded font-medium truncate max-w-[120px]"
                              style={{ color: overlay.fontColor, backgroundColor: overlay.bgColor }}
                            >
                              {overlay.text}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteOverlay(overlay.id); }}
                            className="text-xs text-muted-foreground hover:text-destructive px-1"
                          >
                            🗑
                          </button>
                        </div>

                        {editingOverlayId === overlay.id && (
                          <div className="border-t border-border/50 p-3 space-y-3" onClick={e => e.stopPropagation()}>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Nội dung text</label>
                              <input
                                type="text"
                                value={overlay.text}
                                onChange={(e) => updateOverlay(overlay.id, { text: e.target.value })}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Bắt đầu (giây)</label>
                                <input
                                  type="number" min="0" max={duration || 999} step="0.5"
                                  value={overlay.start}
                                  onChange={(e) => updateOverlay(overlay.id, { start: Number(e.target.value) })}
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Kết thúc (giây)</label>
                                <input
                                  type="number" min="0" max={duration || 999} step="0.5"
                                  value={overlay.end}
                                  onChange={(e) => updateOverlay(overlay.id, { end: Number(e.target.value) })}
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">X {overlay.position.x.toFixed(2)}</label>
                                <input type="range" min="0" max="1" step="0.01" value={overlay.position.x}
                                  onChange={(e) => updateOverlay(overlay.id, { position: { ...overlay.position, x: Number(e.target.value) } })}
                                  className="w-full"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Y {overlay.position.y.toFixed(2)}</label>
                                <input type="range" min="0" max="1" step="0.01" value={overlay.position.y}
                                  onChange={(e) => updateOverlay(overlay.id, { position: { ...overlay.position, y: Number(e.target.value) } })}
                                  className="w-full"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Font</label>
                                <select
                                  value={overlay.fontFamily}
                                  onChange={(e) => updateOverlay(overlay.id, { fontFamily: e.target.value })}
                                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                                >
                                  {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Cỡ chữ {overlay.fontSize}px</label>
                                <input type="range" min="12" max="72" value={overlay.fontSize}
                                  onChange={(e) => updateOverlay(overlay.id, { fontSize: Number(e.target.value) })}
                                  className="w-full mt-2"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1">
                                <span className="text-xs text-muted-foreground">Màu chữ</span>
                                <input type="color" value={overlay.fontColor}
                                  onChange={(e) => updateOverlay(overlay.id, { fontColor: e.target.value })}
                                  className="h-9 w-full rounded border border-input bg-background p-1"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-muted-foreground">Màu nền</span>
                                <input type="color" value={overlay.bgColor.slice(0, 7)}
                                  onChange={(e) => updateOverlay(overlay.id, { bgColor: e.target.value })}
                                  className="h-9 w-full rounded border border-input bg-background p-1"
                                />
                              </label>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Animation</label>
                              <select
                                value={overlay.animation}
                                onChange={(e) => updateOverlay(overlay.id, { animation: e.target.value as TextOnScreenOverlay['animation'] })}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                              >
                                {ANIMATION_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                              </select>
                            </div>
                            <div className="rounded-md bg-zinc-950 p-4 text-center">
                              <span
                                className="inline-block rounded px-3 py-1"
                                style={{
                                  fontFamily: overlay.fontFamily,
                                  fontSize: `${Math.min(overlay.fontSize, 40)}px`,
                                  color: overlay.fontColor,
                                  backgroundColor: overlay.bgColor,
                                }}
                              >
                                {overlay.text || 'Preview'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {scriptSegments.some(s => s.text.trim()) && (
                    <div className="border-t border-border pt-4">
                      <button
                        type="button"
                        className="w-full rounded-md border border-dashed border-input py-2 text-sm text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                        onClick={() => {
                          const suggestions: TextOnScreenOverlay[] = [
                            { id: genId(), start: 0, end: 4, text: '🎯 Xem ngay!', position: { x: 0.5, y: 0.1 }, fontFamily: 'Montserrat', fontSize: 36, fontColor: '#FFF200', bgColor: '#FF2A6D', animation: 'scale_in' },
                            { id: genId(), start: 5, end: 10, text: '👆 Link bio', position: { x: 0.5, y: 0.85 }, fontFamily: 'Be Vietnam Pro', fontSize: 28, fontColor: '#FFFFFF', bgColor: '#00000088', animation: 'fade_in' },
                          ];
                          setTextOverlays(prev => [...prev, ...suggestions]);
                        }}
                      >
                        🤖 AI Gợi ý Text Overlay
                      </button>
                    </div>
                  )}

                  <div className="border-t border-border/60 pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-semibold">🌐 Dịch chữ trên video (AI)</h5>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={translateOnScreenText}
                          onChange={(e) => setTranslateOnScreenText(e.target.checked)}
                          className="rounded"
                        />
                        Bật tính năng
                      </label>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      AI phát hiện chữ burn-in/on-screen trong video gốc, dịch tự nhiên rồi chèn đè lên. Kết quả sẽ xuất hiện như các overlay ở trên.
                    </p>
                    {translateOnScreenText && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          placeholder="Hint ngữ cảnh/thuật ngữ cần giữ nguyên..."
                          value={textOverlay}
                          onChange={(e) => setTextOverlay(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          {(Object.entries(ON_SCREEN_TEXT_PRESETS) as Array<[OnScreenTextPreset, typeof ON_SCREEN_TEXT_PRESETS[OnScreenTextPreset]]>).map(([key, style]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => applyOnScreenTextPreset(key)}
                              className={`rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                                onScreenTextPreset === key
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-input bg-background hover:bg-muted"
                              }`}
                            >
                              {style.label}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Font</label>
                            <select
                              value={textFont}
                              onChange={(e) => setTextFont(e.target.value)}
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="Anton">Anton (Meme)</option>
                              <option value="Oswald">Oswald (Condensed)</option>
                              <option value="Be Vietnam Pro">Be Vietnam Pro</option>
                              <option value="Montserrat">Montserrat</option>
                              <option value="Nunito">Nunito</option>
                              <option value="Baloo 2">Baloo 2 (Sticker)</option>
                              <option value="Inter">Inter</option>
                              <option value="Noto Sans">Noto Sans</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Cỡ {textFontSize}px</label>
                            <input type="range" min="16" max="72" value={textFontSize}
                              onChange={(e) => setTextFontSize(Number(e.target.value))}
                              className="w-full mt-2 accent-primary"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Chữ", value: textColor, setter: setTextColor },
                            { label: "Nền", value: textBgColor, setter: setTextBgColor },
                            { label: "Viền", value: textOutlineColor, setter: setTextOutlineColor },
                          ].map(({ label, value, setter }) => (
                            <label key={label} className="space-y-1">
                              <span className="block text-xs text-muted-foreground">{label}</span>
                              <input type="color" value={value}
                                onChange={(e) => setter(e.target.value)}
                                className="h-8 w-full rounded border border-input bg-background p-0.5"
                              />
                            </label>
                          ))}
                        </div>
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={textBold} onChange={(e) => setTextBold(e.target.checked)} />
                          Đậm (Bold)
                        </label>
                        <div className="rounded-md bg-zinc-950 p-3 text-center">
                          <span
                            className="inline-block rounded px-2 py-0.5"
                            style={{
                              fontFamily: textFont,
                              fontSize: `${Math.min(textFontSize, 36)}px`,
                              color: textColor,
                              backgroundColor: textBgColor,
                              WebkitTextStroke: `1px ${textOutlineColor}`,
                              fontWeight: textBold ? 800 : 500,
                            }}
                          >
                            Preview text dịch
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
