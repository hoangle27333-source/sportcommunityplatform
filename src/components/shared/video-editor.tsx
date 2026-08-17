"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ColorFieldWithOpacity } from "@/components/ui/color-field-with-opacity";
import { TrimSlider } from "@/components/remix/trim-slider";
import { RatioPicker } from "@/components/remix/ratio-picker";
import { SubtitleConfig, defaultSubtitleSettings, type SubtitleSettings } from "@/components/remix/subtitle-config";
import { BlurRegionPicker, type BlurRegion } from "@/components/remix/blur-region-picker";
import { VoiceSelector } from "@/components/remix/voice-selector";
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
  processedAudioSource?: string;
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
  source?: "ocr_auto" | "manual";
  status?: "pending" | "approved" | "disabled";
  ocrTrackId?: string;
  sourceText?: string;
  position: { x: number; y: number };
  box?: { x: number; y: number; w: number; h: number };
  eraseBox?: { x: number; y: number; w: number; h: number };
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  bgColor: string;
  backgroundStyle?: "solid" | "blur";
  backgroundOpacity?: number;
  outlineColor?: string;
  bold?: boolean;
  italic?: boolean;
  sizeMode?: "auto_fit" | "fixed";
  animation: 'none' | 'fade_in' | 'fade_out' | 'slide_up' | 'slide_down' | 'scale_in';
}

interface ManualBlurRegion extends BlurRegion {
  id: string;
  startSec: number;
  endSec: number;
  label?: string;
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

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function defaultOverlayBox(position?: { x: number; y: number }) {
  const x = clamp01(position?.x ?? 0.5);
  const y = clamp01(position?.y ?? 0.15);
  const w = 0.42;
  const h = 0.1;
  return {
    x: Math.max(0, Math.min(1 - w, x - w / 2)),
    y: Math.max(0, Math.min(1 - h, y - h / 2)),
    w,
    h,
  };
}

function normalizeOverlay(raw: TextOnScreenOverlay): TextOnScreenOverlay {
  const box = raw.box ?? defaultOverlayBox(raw.position);
  return {
    ...raw,
    source: raw.source ?? (raw.id.startsWith("ai_") || raw.id.startsWith("plan_") ? "ocr_auto" : "manual"),
    status: raw.status ?? (raw.source === "ocr_auto" || raw.id.startsWith("ai_") || raw.id.startsWith("plan_") ? "pending" : "approved"),
    box: {
      x: clamp01(box.x),
      y: clamp01(box.y),
      w: Math.max(0.04, Math.min(1 - clamp01(box.x), box.w || 0.42)),
      h: Math.max(0.03, Math.min(1 - clamp01(box.y), box.h || 0.1)),
    },
    eraseBox: raw.eraseBox
      ? {
          x: clamp01(raw.eraseBox.x),
          y: clamp01(raw.eraseBox.y),
          w: Math.max(0.04, Math.min(1 - clamp01(raw.eraseBox.x), raw.eraseBox.w || 0.42)),
          h: Math.max(0.03, Math.min(1 - clamp01(raw.eraseBox.y), raw.eraseBox.h || 0.1)),
        }
      : undefined,
    backgroundStyle: raw.backgroundStyle ?? "solid",
    backgroundOpacity: Number.isFinite(raw.backgroundOpacity) ? Math.max(0, Math.min(1, raw.backgroundOpacity!)) : 0.72,
    outlineColor: raw.outlineColor ?? "#000000",
    bold: raw.bold ?? true,
    sizeMode: raw.sizeMode ?? "fixed",
    position: raw.position ?? {
      x: (box.x ?? 0) + (box.w ?? 0.42) / 2,
      y: (box.y ?? 0) + (box.h ?? 0.1) / 2,
    },
  };
}

function normalizeBlurRegion(raw: Partial<ManualBlurRegion>, duration: number, idx = 0): ManualBlurRegion {
  return {
    id: raw.id || genId(),
    x: clamp01(raw.x ?? 0.18),
    y: clamp01(raw.y ?? 0.72),
    w: Math.max(0.04, Math.min(1 - clamp01(raw.x ?? 0.18), raw.w ?? 0.64)),
    h: Math.max(0.03, Math.min(1 - clamp01(raw.y ?? 0.72), raw.h ?? 0.12)),
    startSec: Math.max(0, raw.startSec ?? 0),
    endSec: Math.max(raw.startSec ?? 0.1, raw.endSec ?? (duration || 5)),
    label: raw.label || `Blur ${idx + 1}`,
  };
}

export function VideoEditor({ source, processedAudioSource, initialOptions = {}, onSave, onCancel }: VideoEditorProps) {
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
    customY: initialSubtitle.customY ?? initialOptions.subCustomY ?? defaultSubtitleSettings.customY,
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
  const [textBackgroundStyle, setTextBackgroundStyle] = useState<"solid" | "blur">(
    initialTextStyle.backgroundStyle === "blur" ? "blur" : "solid",
  );
  const [textBackgroundOpacity, setTextBackgroundOpacity] = useState<number>(
    Number.isFinite(initialTextStyle.backgroundOpacity) ? initialTextStyle.backgroundOpacity : 0.72,
  );
  const [textOutlineColor, setTextOutlineColor] = useState<string>(
    initialTextStyle.outlineColor || "#000000",
  );
  const [textBold, setTextBold] = useState<boolean>(initialTextStyle.bold ?? true);

  // ── Custom Text Overlays ──────────────────────────────────────────────────────
  const [textOverlays, setTextOverlays] = useState<TextOnScreenOverlay[]>(
    (initialOptions.textOnScreenOverlays || []).map(normalizeOverlay)
  );
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [selectedOverlayIds, setSelectedOverlayIds] = useState<Set<string>>(new Set());
  const [previewAudioMode, setPreviewAudioMode] = useState<"source" | "processed">("source");
  const [manualBlurRegions, setManualBlurRegions] = useState<ManualBlurRegion[]>(
    (initialOptions.manualBlurRegions || []).map((r: Partial<ManualBlurRegion>, idx: number) =>
      normalizeBlurRegion(r, Number(initialOptions.trimSeconds) || 5, idx),
    )
  );
  const [editingBlurId, setEditingBlurId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trim_ratio' | 'voice' | 'script' | 'text_overlay' | 'blur_regions' | 'watermark'>('trim_ratio');

  // ── Voice / Dub ───────────────────────────────────────────────────────────────
  const [voiceName, setVoiceName] = useState<string>(initialOptions.voiceName ?? 'vi-VN-WaveNet-A');
  const [targetLanguage, setTargetLanguage] = useState<'vi' | 'en'>(
    initialOptions.targetLanguage === 'en' ? 'en' : 'vi'
  );
  const [dubMode, setDubMode] = useState<string>(initialOptions.dubMode ?? 'none');
  const [bgVolume, setBgVolume] = useState<number>(
    Number.isFinite(initialOptions.bgVolume) ? initialOptions.bgVolume : 0.3
  );

  // ── Presets (loaded from API for dropdowns) ───────────────────────────────────
  const [remixPresets, setRemixPresets] = useState<Array<Record<string, any>>>([]);
  useEffect(() => {
    fetch('/api/remix/presets', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setRemixPresets(d.presets ?? []))
      .catch(() => {});
  }, []);

  const [interaction, setInteraction] = useState<
    | null
    | { kind: 'move-overlay'; id: string; offsetX: number; offsetY: number }
    | { kind: 'resize-overlay'; id: string; handle: 'nw' | 'ne' | 'sw' | 'se' }
    | { kind: 'move-blur'; id: string; offsetX: number; offsetY: number }
    | { kind: 'resize-blur'; id: string; handle: 'nw' | 'ne' | 'sw' | 'se' }
    | { kind: 'subtitle-y' }
  >(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const processedAudioRef = useRef<HTMLAudioElement>(null);
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
    const combinedScript = scriptSegments.filter(s => s.text.trim()).map(s => s.text.trim()).join('\n');
    const scriptWasEdited = scriptSegments.some(s => s.isEdited);
    const savedScriptInputMode = scriptInputMode === "manual_script" || scriptWasEdited
      ? "manual_script"
      : scriptInputMode;
    const preflight = buildFacebookCopyrightPreflight({
      options: {
        ...initialOptions,
        muteOriginal: initialOptions.muteOriginal,
        scriptInputMode: savedScriptInputMode,
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
      // Voice / Dub
      voiceName,
      targetLanguage,
      dubMode,
      dubVi: dubMode !== 'none',
      bgVolume,
      // Script
      scriptInputMode: savedScriptInputMode,
      manualScript: savedScriptInputMode === "manual_script" ? combinedScript : initialOptions.manualScript,
      editedScript: savedScriptInputMode === "manual_script" ? combinedScript : initialOptions.editedScript,
      scriptSegments: scriptSegments.length > 0 ? scriptSegments : undefined,
      vietsub,
      subtitleConfig: vietsub ? subtitleSettings : initialOptions.subtitleConfig,
      subtitleAnimation: subtitleSettings.animation,
      subtitlePreset: subtitleSettings.preset,
      subHighlightColor: subtitleSettings.highlightColor,
      subPosition: subtitleSettings.position,
      subCustomY: subtitleSettings.customY,
      translateOnScreenText,
      textOverlay: translateOnScreenText ? textOverlay.trim() : "",
      onScreenTextStyle: translateOnScreenText
        ? { preset: onScreenTextPreset, font: textFont, size: textFontSize, color: textColor,
            bgColor: textBgColor, backgroundStyle: textBackgroundStyle, backgroundOpacity: textBackgroundOpacity, outlineColor: textOutlineColor, bold: textBold }
        : undefined,
      textOnScreenOverlays: textOverlays.length > 0 ? textOverlays : undefined,
      manualBlurRegions: manualBlurRegions.length > 0 ? manualBlurRegions : undefined,
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
    setTextBackgroundStyle("solid");
    setTextBackgroundOpacity(0.72);
    setTextOutlineColor(style.outlineColor);
    setTextBold(style.bold);
  };

  const getFrameAspectClass = () => {
    switch (outputRatio) {
      case '9:16': return 'aspect-[9/16]';
      case '16:9': return 'aspect-video';
      case '1:1': return 'aspect-square';
      case '4:5': return 'aspect-[4/5]';
      default: return 'aspect-video';
    }
  };

  const getVideoFitClass = () => outputRatio === 'original' ? 'object-contain' : 'object-cover';

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
    const box = { x: 0.29, y: 0.08, w: 0.42, h: 0.1 };
    const newOverlay: TextOnScreenOverlay = {
      id: genId(), start: Math.floor(currentTime), end: Math.min(Math.floor(currentTime) + 5, duration || 10),
      text: 'Text mới', position: { x: box.x + box.w / 2, y: box.y + box.h / 2 }, box,
      fontFamily: 'Be Vietnam Pro', fontSize: 32, fontColor: '#FFFFFF', bgColor: '#000000CC', backgroundStyle: 'solid', backgroundOpacity: 0.72, animation: 'fade_in',
    };
    setTextOverlays(prev => [...prev, newOverlay]);
    setEditingOverlayId(newOverlay.id);
  };

  const updateOverlay = (id: string, patch: Partial<TextOnScreenOverlay>) => {
    setTextOverlays(prev => prev.map(o => o.id === id ? normalizeOverlay({ ...o, ...patch }) : o));
  };

  const toggleOverlaySelection = (id: string) => {
    setSelectedOverlayIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAllOverlaySelection = (checked: boolean) => {
    setSelectedOverlayIds(checked ? new Set(textOverlays.map(o => o.id)) : new Set());
  };

  const applyStyleToSelected = () => {
    if (selectedOverlayIds.size === 0) return;
    setTextOverlays(prev => prev.map(overlay => selectedOverlayIds.has(overlay.id)
      ? normalizeOverlay({
          ...overlay,
          fontFamily: textFont,
          fontSize: textFontSize,
          fontColor: textColor,
          bgColor: textBgColor,
          outlineColor: textOutlineColor,
          bold: textBold,
          italic: overlay.italic,
          status: overlay.status === "disabled" ? "approved" : overlay.status,
        })
      : overlay));
  };

  const updateSelectedOverlayStatus = (status: TextOnScreenOverlay["status"]) => {
    if (selectedOverlayIds.size === 0) return;
    setTextOverlays(prev => prev.map(overlay => selectedOverlayIds.has(overlay.id)
      ? normalizeOverlay({ ...overlay, status })
      : overlay));
  };

  const deleteOverlay = (id: string) => {
    setTextOverlays(prev => prev.filter(o => o.id !== id));
    if (editingOverlayId === id) setEditingOverlayId(null);
  };

  const addBlurRegion = (seed?: Partial<ManualBlurRegion>) => {
    const next = normalizeBlurRegion({
      ...seed,
      id: genId(),
      startSec: seed?.startSec ?? Math.max(0, Math.floor(currentTime)),
      endSec: seed?.endSec ?? Math.min(Math.max(1, Math.floor(currentTime) + 5), duration || 5),
      label: seed?.label,
    }, duration, manualBlurRegions.length);
    setManualBlurRegions(prev => [...prev, next]);
    setEditingBlurId(next.id);
    setActiveTab('blur_regions');
  };

  const updateBlurRegion = (id: string, patch: Partial<ManualBlurRegion>) => {
    setManualBlurRegions(prev => prev.map((region, idx) =>
      region.id === id ? normalizeBlurRegion({ ...region, ...patch }, duration, idx) : region,
    ));
  };

  const deleteBlurRegion = (id: string) => {
    setManualBlurRegions(prev => prev.filter(region => region.id !== id));
    if (editingBlurId === id) setEditingBlurId(null);
  };

  const duplicateBlurRegion = (id: string) => {
    const region = manualBlurRegions.find(item => item.id === id);
    if (!region) return;
    addBlurRegion({ ...region, id: undefined, label: `${region.label ?? 'Blur'} copy` });
  };

  const importAiZones = () => {
    const imported = textOverlays
      .map((overlay, idx) => normalizeBlurRegion({
        ...(overlay.box ?? defaultOverlayBox(overlay.position)),
        startSec: overlay.start,
        endSec: overlay.end,
        label: `AI text ${idx + 1}`,
      }, duration, idx));
    const watermarkZone = coverOriginalWatermark
      ? [normalizeBlurRegion({
          ...oldWatermarkRegion,
          startSec: 0,
          endSec: duration || 5,
          label: 'Watermark cũ',
        }, duration, imported.length)]
      : [];
    setManualBlurRegions(prev => [...prev, ...imported, ...watermarkZone]);
    setActiveTab('blur_regions');
  };

  const normFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = videoContainerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  };

  const resizeBox = (
    box: { x: number; y: number; w: number; h: number },
    point: { x: number; y: number },
    handle: 'nw' | 'ne' | 'sw' | 'se',
  ) => {
    const minW = 0.05;
    const minH = 0.035;
    let left = box.x;
    let top = box.y;
    let right = box.x + box.w;
    let bottom = box.y + box.h;
    if (handle.includes('n')) top = Math.min(bottom - minH, point.y);
    if (handle.includes('s')) bottom = Math.max(top + minH, point.y);
    if (handle.includes('w')) left = Math.min(right - minW, point.x);
    if (handle.includes('e')) right = Math.max(left + minW, point.x);
    left = clamp01(left);
    top = clamp01(top);
    right = clamp01(right);
    bottom = clamp01(bottom);
    return {
      x: Math.min(left, right - minW),
      y: Math.min(top, bottom - minH),
      w: Math.max(minW, right - left),
      h: Math.max(minH, bottom - top),
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction) return;
    const point = normFromPointer(e);
    if (!point) return;
    if (interaction.kind === 'move-overlay') {
      const overlay = textOverlays.find(item => item.id === interaction.id);
      if (!overlay) return;
      const box = overlay.box ?? defaultOverlayBox(overlay.position);
      const nextBox = {
        ...box,
        x: Math.max(0, Math.min(1 - box.w, point.x - interaction.offsetX)),
        y: Math.max(0, Math.min(1 - box.h, point.y - interaction.offsetY)),
      };
      updateOverlay(interaction.id, {
        box: nextBox,
        position: { x: nextBox.x + nextBox.w / 2, y: nextBox.y + nextBox.h / 2 },
      });
    } else if (interaction.kind === 'resize-overlay') {
      const overlay = textOverlays.find(item => item.id === interaction.id);
      if (!overlay) return;
      const nextBox = resizeBox(overlay.box ?? defaultOverlayBox(overlay.position), point, interaction.handle);
      updateOverlay(interaction.id, {
        box: nextBox,
        position: { x: nextBox.x + nextBox.w / 2, y: nextBox.y + nextBox.h / 2 },
      });
    } else if (interaction.kind === 'move-blur') {
      const region = manualBlurRegions.find(item => item.id === interaction.id);
      if (!region) return;
      updateBlurRegion(interaction.id, {
        x: Math.max(0, Math.min(1 - region.w, point.x - interaction.offsetX)),
        y: Math.max(0, Math.min(1 - region.h, point.y - interaction.offsetY)),
      });
    } else if (interaction.kind === 'resize-blur') {
      const region = manualBlurRegions.find(item => item.id === interaction.id);
      if (!region) return;
      updateBlurRegion(interaction.id, resizeBox(region, point, interaction.handle));
    } else if (interaction.kind === 'subtitle-y') {
      setSubtitleSettings(prev => ({ ...prev, position: 'custom', customY: Math.max(0.05, Math.min(0.9, point.y)) }));
      setActiveTab('script');
    }
  };

  const beginMoveOverlay = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    const point = normFromPointer(e);
    const overlay = textOverlays.find(item => item.id === id);
    if (!point || !overlay) return;
    const box = overlay.box ?? defaultOverlayBox(overlay.position);
    setEditingOverlayId(id);
    setActiveTab('text_overlay');
    setInteraction({ kind: 'move-overlay', id, offsetX: point.x - box.x, offsetY: point.y - box.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const beginMoveBlur = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    const point = normFromPointer(e);
    const region = manualBlurRegions.find(item => item.id === id);
    if (!point || !region) return;
    setEditingBlurId(id);
    setActiveTab('blur_regions');
    setInteraction({ kind: 'move-blur', id, offsetX: point.x - region.x, offsetY: point.y - region.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const activeOverlays = textOverlays.filter(o => o.status !== "disabled" && currentTime >= o.start && currentTime <= o.end);

  // Sub text đang active theo currentTime (dùng cho subtitle preview)
  const activeSubtitleSeg = scriptSegments.find(s => s.text?.trim() && currentTime >= s.start && currentTime <= s.end);

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
            {processedAudioSource && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreviewAudioMode((mode) => {
                    const next = mode === "source" ? "processed" : "source";
                    const video = videoRef.current;
                    const audio = processedAudioRef.current;
                    if (video) video.muted = next === "processed";
                    audio?.pause();
                    if (next === "processed" && video && audio && !video.paused) {
                      audio.currentTime = video.currentTime;
                      void audio.play().catch(() => {});
                    }
                    return next;
                  });
                }}
              >
                Audio: {previewAudioMode === "source" ? "Gốc" : "Đã xử lý"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onCancel}>Huỷ</Button>
            <Button size="sm" onClick={handleSave}>Lưu & Áp dụng</Button>
          </div>
        </div>
      
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          <div className="flex-1 p-6 flex items-center justify-center bg-zinc-950">
            <div
              ref={videoContainerRef}
              className={`relative max-h-full max-w-full overflow-hidden rounded-lg bg-black shadow-xl ring-1 ring-white/10 ${getFrameAspectClass()}`}
              style={{
                height: outputRatio === '9:16' || outputRatio === '4:5' ? '100%' : undefined,
                width: outputRatio === '16:9' || outputRatio === '1:1' || outputRatio === 'original' ? '100%' : undefined,
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={() => setInteraction(null)}
              onPointerCancel={() => setInteraction(null)}
            >
               <video
                ref={videoRef}
                src={source}
                controls
                muted={previewAudioMode === "processed" && Boolean(processedAudioSource)}
                className={`absolute inset-0 h-full w-full ${getVideoFitClass()}`}
                onPlay={() => {
                  if (previewAudioMode === "processed" && processedAudioRef.current && videoRef.current) {
                    processedAudioRef.current.currentTime = videoRef.current.currentTime;
                    void processedAudioRef.current.play().catch(() => {});
                  }
                }}
                onPause={() => processedAudioRef.current?.pause()}
                onSeeking={() => {
                  if (processedAudioRef.current && videoRef.current) {
                    processedAudioRef.current.currentTime = videoRef.current.currentTime;
                  }
                }}
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    const t = videoRef.current.currentTime;
                    setCurrentTime(t);
                    if (previewAudioMode === "processed" && processedAudioRef.current && Math.abs(processedAudioRef.current.currentTime - t) > 0.35) {
                      processedAudioRef.current.currentTime = t;
                    }
                    if (t > trimEnd) {
                      videoRef.current.pause();
                      videoRef.current.currentTime = trimStart;
                    }
                  }
                }}
              />
              {processedAudioSource && (
                <audio ref={processedAudioRef} src={processedAudioSource} preload="metadata" />
              )}
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
                (() => {
                  const box = overlay.box ?? defaultOverlayBox(overlay.position);
                  return (
                <div
                  key={overlay.id}
                  onPointerDown={(e) => beginMoveOverlay(overlay.id, e)}
                  onClick={() => { setActiveTab('text_overlay'); setEditingOverlayId(overlay.id); }}
                  className={`absolute cursor-move rounded border px-2 py-1 text-sm font-semibold select-none transition-all ${
                    editingOverlayId === overlay.id ? 'ring-2 ring-blue-400' : 'hover:ring-1 hover:ring-white/50'
                  }`}
                  style={{
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.w * 100}%`,
                    height: `${box.h * 100}%`,
                    fontFamily: overlay.fontFamily,
                    fontSize: `${Math.min(overlay.fontSize, 36)}px`,
                    fontWeight: overlay.bold ? 800 : 400,
                    fontStyle: overlay.italic ? 'italic' : 'normal',
                    color: overlay.fontColor,
                    WebkitTextStroke: overlay.outlineColor && overlay.outlineColor !== '#000000' && overlay.outlineColor !== 'transparent'
                      ? `1px ${overlay.outlineColor}`
                      : undefined,
                    backgroundColor:
                      overlay.backgroundStyle === "blur"
                        ? `rgba(15,23,42,${overlay.backgroundOpacity ?? 0.72})`
                        : overlay.bgColor,
                    backdropFilter:
                      overlay.backgroundStyle === "blur"
                        ? `blur(${Math.max(6, Math.round(overlay.fontSize * 0.18))}px)`
                        : undefined,
                    WebkitBackdropFilter:
                      overlay.backgroundStyle === "blur"
                        ? `blur(${Math.max(6, Math.round(overlay.fontSize * 0.18))}px)`
                        : undefined,
                    borderColor: editingOverlayId === overlay.id ? '#60a5fa' : 'rgba(255,255,255,0.28)',
                  }}
                >
                  <span className="flex h-full w-full items-center justify-center text-center leading-tight">
                    {overlay.text}
                  </span>
                  {editingOverlayId === overlay.id && (['nw', 'ne', 'sw', 'se'] as const).map(handle => (
                    <span
                      key={handle}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setInteraction({ kind: 'resize-overlay', id: overlay.id, handle });
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      className={`absolute h-3 w-3 rounded-sm border border-white bg-blue-400 ${
                        handle === 'nw' ? '-left-1.5 -top-1.5 cursor-nwse-resize' :
                        handle === 'ne' ? '-right-1.5 -top-1.5 cursor-nesw-resize' :
                        handle === 'sw' ? '-left-1.5 -bottom-1.5 cursor-nesw-resize' :
                        '-right-1.5 -bottom-1.5 cursor-nwse-resize'
                      }`}
                    />
                  ))}
                </div>
                  );
                })()
              ))}
              {vietsub && activeSubtitleSeg && (
                <div
                  onPointerDown={(e) => {
                    setInteraction({ kind: 'subtitle-y' });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  className="absolute left-1/2 z-20 cursor-ns-resize select-none rounded px-3 py-1 text-center leading-tight ring-1 ring-white/20"
                  style={{
                    top: `${(subtitleSettings.position === 'custom' ? (subtitleSettings.customY ?? 0.78) : subtitleSettings.position === 'top' ? 0.12 : 0.78) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    fontFamily: subtitleSettings.font,
                    fontSize: `${Math.min(subtitleSettings.size, 36)}px`,
                    color: subtitleSettings.color,
                    backgroundColor: subtitleSettings.borderStyle === 3 ? subtitleSettings.bgColor : 'rgba(0,0,0,0.35)',
                    WebkitTextStroke: subtitleSettings.borderStyle === 1 ? `${subtitleSettings.outline}px ${subtitleSettings.bgColor}` : undefined,
                    fontWeight: subtitleSettings.bold ? 800 : 500,
                    fontStyle: subtitleSettings.italic ? 'italic' : 'normal',
                  }}
                  title="Kéo lên/xuống để chỉnh vị trí phụ đề"
                >
                  {activeSubtitleSeg.text}
                </div>
              )}
              {manualBlurRegions.map(region => {
                const active = currentTime >= region.startSec && currentTime <= region.endSec;
                return (
                  <div
                    key={region.id}
                    onPointerDown={(e) => beginMoveBlur(region.id, e)}
                    onClick={() => { setActiveTab('blur_regions'); setEditingBlurId(region.id); }}
                    className={`absolute z-10 cursor-move select-none border-2 ${
                      editingBlurId === region.id ? 'border-purple-300 bg-purple-500/35' : 'border-purple-500/80 bg-purple-500/20'
                    } ${active ? 'opacity-100' : 'opacity-45'}`}
                    style={{
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.w * 100}%`,
                      height: `${region.h * 100}%`,
                    }}
                  >
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">
                      {region.label}
                    </span>
                    {editingBlurId === region.id && (['nw', 'ne', 'sw', 'se'] as const).map(handle => (
                      <span
                        key={handle}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setInteraction({ kind: 'resize-blur', id: region.id, handle });
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        className={`absolute h-3 w-3 rounded-sm border border-white bg-purple-400 ${
                          handle === 'nw' ? '-left-1.5 -top-1.5 cursor-nwse-resize' :
                          handle === 'ne' ? '-right-1.5 -top-1.5 cursor-nesw-resize' :
                          handle === 'sw' ? '-left-1.5 -bottom-1.5 cursor-nesw-resize' :
                          '-right-1.5 -bottom-1.5 cursor-nwse-resize'
                        }`}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="w-full lg:w-[500px] border-t lg:border-t-0 lg:border-l border-border flex flex-col min-h-0 bg-muted/10">
            <div className="flex gap-0.5 overflow-x-auto border-b border-border bg-muted/30 px-2 scrollbar-thin">
              {([
                { id: 'trim_ratio', label: '✂ Trim & Ratio' },
                { id: 'voice', label: '🎤 Voice' },
                { id: 'script', label: '📝 Script & Phụ đề' },
                { id: 'text_overlay', label: '🖊 Text on Screen' },
                { id: 'blur_regions', label: '▧ Blur Regions' },
                { id: 'watermark', label: '💧 Watermark' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? 'border-primary text-primary bg-card rounded-t-[6px]'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'trim_ratio' && (
                <div className="space-y-6">
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
                </div>
              )}
              {activeTab === 'voice' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h4 className="font-semibold text-base">🎤 Voice & Lồng tiếng</h4>
                  </div>

                  {/* Language */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Ngôn ngữ dịch</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTargetLanguage('vi')}
                        className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all ${
                          targetLanguage === 'vi' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background hover:bg-muted'
                        }`}
                      >
                        🇻🇳 Tiếng Việt
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetLanguage('en')}
                        className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all ${
                          targetLanguage === 'en' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background hover:bg-muted'
                        }`}
                      >
                        🇬🇧 English
                      </button>
                    </div>
                  </div>

                  {/* Voice selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Giọng đọc TTS</label>
                    <VoiceSelector value={voiceName} onChange={setVoiceName} />
                  </div>

                  {/* Dub mode */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Chế độ lồng tiếng</label>
                    <select
                      value={dubMode}
                      onChange={(e) => setDubMode(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="none">Không lồng tiếng (chỉ phụ đề)</option>
                      <option value="full">Thay toàn bộ audio</option>
                      <option value="preserve_bgm">Giữ nhạc nền</option>
                      <option value="heygen">HeyGen lip-sync</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {dubMode === 'none' && 'Chỉ đọc phụ đề burn-in, không thay audio gốc.'}
                      {dubMode === 'full' && 'Thay toàn bộ audio gốc bằng giọng TTS đã chọn.'}
                      {dubMode === 'preserve_bgm' && 'Giữ nhạc nền gốc, chỉ thay phần lời.'}
                      {dubMode === 'heygen' && 'Sử dụng HeyGen để lồng tiếng với lip-sync.'}
                    </p>
                  </div>

                  {/* BG Volume */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Âm lượng nhạc nền {Math.round(bgVolume * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={bgVolume}
                      onChange={(e) => setBgVolume(Number(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Điều chỉnh âm lượng nhạc nền so với giọng đọc.
                    </p>
                  </div>

                  <div className="rounded-md bg-blue-500/10 border border-blue-500/30 p-3 text-xs text-blue-400 space-y-1">
                    <p className="font-semibold">ℹ️ Sau khi lưu & áp dụng:</p>
                    <p>Nếu bạn đã chỉnh script ở tab Script, AI sẽ đọc lại script đó bằng giọng đã chọn.</p>
                    <p>Nếu lần generate đầu không bật voice, bây giờ có thể bật thêm tại đây.</p>
                  </div>
                </div>
              )}
              {activeTab === 'script' && (
                <>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h4 className="font-semibold text-base">Script & Phụ đề</h4>
                    </div>
                    {remixPresets.length > 0 && (
                      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">🎬 Theo preset:</span>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const p = remixPresets.find(x => x.id === e.target.value);
                            if (!p) return;
                            setVietsub(Boolean(p.auto_vietsub));
                            setSubtitleSettings({
                              ...defaultSubtitleSettings,
                              preset: p.subtitle_preset ?? defaultSubtitleSettings.preset,
                              font: p.sub_font ?? defaultSubtitleSettings.font,
                              size: p.sub_font_size ?? defaultSubtitleSettings.size,
                              color: p.sub_color ?? defaultSubtitleSettings.color,
                              bgColor: p.sub_bg_color ?? defaultSubtitleSettings.bgColor,
                              highlightColor: p.sub_highlight_color ?? defaultSubtitleSettings.highlightColor,
                              bold: p.sub_bold ?? defaultSubtitleSettings.bold,
                              italic: p.sub_italic ?? defaultSubtitleSettings.italic,
                              outline: p.sub_outline ?? defaultSubtitleSettings.outline,
                              borderStyle: p.sub_border_style ?? defaultSubtitleSettings.borderStyle,
                              position: p.sub_position ?? defaultSubtitleSettings.position,
                              customY: p.sub_custom_y ?? defaultSubtitleSettings.customY,
                              animation: p.subtitle_animation ?? defaultSubtitleSettings.animation,
                            });
                            (e.target as HTMLSelectElement).value = '';
                          }}
                          className="flex-1 h-8 rounded border border-input bg-background px-2 text-xs"
                        >
                          <option value="">— Áp dụng phụ đề theo preset —</option>
                          {remixPresets.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
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
                    <div className="space-y-3 rounded-md border border-border bg-background p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h5 className="text-sm font-semibold">Format script & phụ đề</h5>
                          <p className="text-xs text-muted-foreground">
                            Chỉnh segment script bên dưới, style/vị trí phụ đề ở block này.
                          </p>
                        </div>
                        <label className="flex shrink-0 items-center gap-2 text-sm">
                          <input type="checkbox" checked={vietsub} onChange={(e) => setVietsub(e.target.checked)} />
                          Burn-in phụ đề
                        </label>
                      </div>
                      {vietsub ? (
                        <SubtitleConfig
                          value={subtitleSettings}
                          onChange={setSubtitleSettings}
                          title="Style phụ đề"
                          sampleText="TikTok nhả từng từ"
                        />
                      ) : (
                        <div className="rounded-md border border-dashed border-input px-3 py-2 text-xs text-muted-foreground">
                          Bật burn-in để chỉnh font, màu, hiệu ứng nhả chữ và vị trí phụ đề.
                        </div>
                      )}
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
                  </div>
                  {/* Facebook copyright preflight — tạm ẩn */}
                  {false && (
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
                  )}
                </>
              )}
              {activeTab === 'blur_regions' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h4 className="font-semibold text-base">Blur text on-screen</h4>
                    <Button size="sm" variant="outline" onClick={() => addBlurRegion()}>+ Thêm vùng</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Kéo vùng tím trên preview để đổi vị trí, kéo các góc để resize. Mỗi vùng có thời gian bắt đầu/kết thúc riêng.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={importAiZones}
                      className="rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      Import vùng AI/text
                    </button>
                    <button
                      type="button"
                      onClick={() => addBlurRegion({ x: 0, y: 0.82, w: 1, h: 0.18, label: 'Bottom subtitle' })}
                      className="rounded-md border border-input px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      + Dưới cùng 18%
                    </button>
                  </div>
                  {manualBlurRegions.length === 0 && (
                    <div className="rounded-lg border border-dashed border-input py-8 text-center text-sm text-muted-foreground">
                      Chưa có vùng blur thủ công.
                    </div>
                  )}
                  <div className="space-y-2">
                    {manualBlurRegions.map((region) => (
                      <div
                        key={region.id}
                        className={`rounded-lg border bg-background transition-colors ${
                          editingBlurId === region.id ? 'border-primary bg-primary/5' : 'border-input'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setEditingBlurId(editingBlurId === region.id ? null : region.id)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left"
                        >
                          <span className="text-sm font-medium">{region.label}</span>
                          <span className="font-mono text-xs text-muted-foreground">{fmt(region.startSec)} - {fmt(region.endSec)}</span>
                        </button>
                        {editingBlurId === region.id && (
                          <div className="space-y-3 border-t border-border/50 p-3">
                            <input
                              value={region.label ?? ''}
                              onChange={(e) => updateBlurRegion(region.id, { label: e.target.value })}
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              placeholder="Tên vùng blur"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1">
                                <span className="text-xs text-muted-foreground">Bắt đầu</span>
                                <input type="number" min="0" max={duration || 999} step="0.5" value={region.startSec}
                                  onChange={(e) => updateBlurRegion(region.id, { startSec: Number(e.target.value) })}
                                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs text-muted-foreground">Kết thúc</span>
                                <input type="number" min="0" max={duration || 999} step="0.5" value={region.endSec}
                                  onChange={(e) => updateBlurRegion(region.id, { endSec: Number(e.target.value) })}
                                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                />
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {([
                                ['x', 'X'],
                                ['y', 'Y'],
                                ['w', 'Width'],
                                ['h', 'Height'],
                              ] as const).map(([key, label]) => (
                                <label key={key} className="space-y-1">
                                  <span className="text-xs text-muted-foreground">{label} {region[key].toFixed(2)}</span>
                                  <input
                                    type="range"
                                    min={key === 'w' || key === 'h' ? 0.03 : 0}
                                    max="1"
                                    step="0.01"
                                    value={region[key]}
                                    onChange={(e) => updateBlurRegion(region.id, { [key]: Number(e.target.value) } as Partial<ManualBlurRegion>)}
                                    className="w-full"
                                  />
                                </label>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => duplicateBlurRegion(region.id)}>Duplicate</Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteBlurRegion(region.id)}>Xóa</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'watermark' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h4 className="font-semibold text-base">Watermark</h4>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={watermarkEnabled} onChange={(e) => setWatermarkEnabled(e.target.checked)} />
                  {remixPresets.length > 0 && (
                    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">💧 Theo preset:</span>
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const p = remixPresets.find(x => x.id === e.target.value);
                          if (!p) return;
                          const wm = p.watermark_defaults ?? {};
                          if (!wm.enabled) {
                            setWatermarkEnabled(false);
                          } else {
                            setWatermarkEnabled(true);
                            setWatermarkType(wm.type === 'image' ? 'image' : 'text');
                            setWatermarkText(wm.text ?? '');
                            setWatermarkOpacity(wm.opacity ?? 0.9);
                            setWatermarkScale(wm.scale ?? 0.15);
                            setWatermarkPosition(wm.position ?? 'bottom-right');
                          }
                          (e.target as HTMLSelectElement).value = '';
                        }}
                        className="flex-1 h-8 rounded border border-input bg-background px-2 text-xs"
                      >
                        <option value="">— Áp watermark theo preset —</option>
                        {remixPresets.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
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
                  {remixPresets.length > 0 && (
                    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">🎨 Style theo preset (tất cả):</span>
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const p = remixPresets.find(x => x.id === e.target.value);
                          if (!p) return;
                          setTextOverlays(prev => prev.map(o => ({
                            ...o,
                            fontFamily: p.on_screen_text_font ?? o.fontFamily,
                            fontSize: p.on_screen_text_size ?? o.fontSize,
                            fontColor: p.on_screen_text_color ?? o.fontColor,
                            bgColor: p.on_screen_text_bg_color ?? o.bgColor,
                            outlineColor: p.on_screen_text_outline_color ?? o.outlineColor,
                            bold: p.on_screen_text_bold ?? o.bold,
                            italic: p.on_screen_text_italic ?? o.italic,
                            backgroundStyle: p.on_screen_text_background_style ?? o.backgroundStyle,
                            backgroundOpacity: p.on_screen_text_background_opacity ?? o.backgroundOpacity,
                          })));
                          (e.target as HTMLSelectElement).value = '';
                        }}
                        className="flex-1 h-8 rounded border border-input bg-background px-2 text-xs"
                      >
                        <option value="">— Áp style lên tất cả overlay —</option>
                        {remixPresets.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    💡 Drag text trên video preview để đặt vị trí. Click text để chọn và chỉnh sửa.
                  </p>

                  {textOverlays.length > 0 && (
                    <div className="rounded-md border border-border bg-background p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedOverlayIds.size > 0 && selectedOverlayIds.size === textOverlays.length}
                            onChange={(e) => setAllOverlaySelection(e.target.checked)}
                          />
                          Chọn tất cả ({selectedOverlayIds.size}/{textOverlays.length})
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" disabled={selectedOverlayIds.size === 0} onClick={applyStyleToSelected}>
                            Apply style
                          </Button>
                          <Button size="sm" variant="outline" disabled={selectedOverlayIds.size === 0} onClick={() => updateSelectedOverlayStatus("approved")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" disabled={selectedOverlayIds.size === 0} onClick={() => updateSelectedOverlayStatus("disabled")}>
                            Disable
                          </Button>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        OCR auto mặc định pending. Chỉ overlay approved/manual mới được render khi Lưu & Áp dụng.
                      </p>
                    </div>
                  )}

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
                            <input
                              type="checkbox"
                              checked={selectedOverlayIds.has(overlay.id)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleOverlaySelection(overlay.id)}
                            />
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
                              style={{
                                fontFamily: overlay.fontFamily,
                                fontWeight: overlay.bold ? 800 : 500,
                                fontStyle: overlay.italic ? 'italic' : 'normal',
                                color: overlay.fontColor,
                                backgroundColor:
                                  overlay.backgroundStyle === "blur"
                                    ? `rgba(15,23,42,${overlay.backgroundOpacity ?? 0.72})`
                                    : overlay.bgColor,
                                backdropFilter: overlay.backgroundStyle === "blur" ? "blur(8px)" : undefined,
                                WebkitBackdropFilter: overlay.backgroundStyle === "blur" ? "blur(8px)" : undefined,
                              }}
                            >
                              {overlay.text}
                            </span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                              overlay.status === "approved" ? "bg-emerald-500/15 text-emerald-400" :
                              overlay.status === "disabled" ? "bg-zinc-500/15 text-zinc-400" :
                              "bg-amber-500/15 text-amber-400"
                            }`}>
                              {overlay.status ?? "pending"}
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
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Trạng thái render</label>
                              <select
                                value={overlay.status ?? "pending"}
                                onChange={(e) => updateOverlay(overlay.id, { status: e.target.value as TextOnScreenOverlay["status"] })}
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                              >
                                <option value="pending">Pending - chỉ preview/chờ duyệt</option>
                                <option value="approved">Approved - render vào video</option>
                                <option value="disabled">Disabled - bỏ qua</option>
                              </select>
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
                              {(() => {
                                const box = overlay.box ?? defaultOverlayBox(overlay.position);
                                return ([
                                  ['x', 'X'],
                                  ['y', 'Y'],
                                  ['w', 'Width'],
                                  ['h', 'Height'],
                                ] as const).map(([key, label]) => (
                                  <div key={key} className="space-y-1">
                                    <label className="text-xs text-muted-foreground">{label} {box[key].toFixed(2)}</label>
                                    <input
                                      type="range"
                                      min={key === 'w' || key === 'h' ? 0.03 : 0}
                                      max="1"
                                      step="0.01"
                                      value={box[key]}
                                      onChange={(e) => {
                                        const nextBox = { ...box, [key]: Number(e.target.value) };
                                        updateOverlay(overlay.id, {
                                          box: nextBox,
                                          position: { x: nextBox.x + nextBox.w / 2, y: nextBox.y + nextBox.h / 2 },
                                        });
                                      }}
                                      className="w-full"
                                    />
                                  </div>
                                ));
                              })()}
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
                              {remixPresets.length > 0 && (
                                <div className="space-y-1 sm:col-span-2">
                                  <label className="text-xs text-muted-foreground">🎨 Áp style theo preset (chỉ line này)</label>
                                  <select
                                    defaultValue=""
                                    onChange={(e) => {
                                      const p = remixPresets.find(x => x.id === e.target.value);
                                      if (!p) return;
                                      updateOverlay(overlay.id, {
                                        fontFamily: p.on_screen_text_font ?? overlay.fontFamily,
                                        fontSize: p.on_screen_text_size ?? overlay.fontSize,
                                        fontColor: p.on_screen_text_color ?? overlay.fontColor,
                                        bgColor: p.on_screen_text_bg_color ?? overlay.bgColor,
                                        outlineColor: p.on_screen_text_outline_color ?? overlay.outlineColor,
                                        bold: p.on_screen_text_bold ?? overlay.bold,
                                        italic: p.on_screen_text_italic ?? overlay.italic,
                                        backgroundStyle: p.on_screen_text_background_style ?? overlay.backgroundStyle,
                                        backgroundOpacity: p.on_screen_text_background_opacity ?? overlay.backgroundOpacity,
                                      });
                                      (e.target as HTMLSelectElement).value = '';
                                    }}
                                    className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                                  >
                                    <option value="">— Chọn preset —</option>
                                    {remixPresets.map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Cỡ chữ {overlay.fontSize}px</label>
                                <input type="range" min="1" max="72" value={overlay.fontSize}
                                  onChange={(e) => updateOverlay(overlay.id, { fontSize: Number(e.target.value) })}
                                  className="w-full mt-2"
                                />
                                <input
                                  type="number"
                                  min="1"
                                  max="120"
                                  value={overlay.fontSize}
                                  onChange={(e) => updateOverlay(overlay.id, { fontSize: Number(e.target.value) })}
                                  className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <ColorFieldWithOpacity
                                label="Màu chữ"
                                value={overlay.fontColor}
                                onChange={(next) => updateOverlay(overlay.id, { fontColor: next })}
                                fallback="#FFFFFF"
                              />
                              <ColorFieldWithOpacity
                                label="Màu nền"
                                value={overlay.bgColor}
                                onChange={(next) => updateOverlay(overlay.id, { bgColor: next })}
                                fallback="#000000"
                              />
                              <ColorFieldWithOpacity
                                label="Màu viền"
                                value={overlay.outlineColor || 'transparent'}
                                onChange={(next) => updateOverlay(overlay.id, { outlineColor: next })}
                                fallback="transparent"
                              />
                            </div>
                            <div className="flex items-center gap-4 py-1">
                              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={overlay.bold ?? false}
                                  onChange={(e) => updateOverlay(overlay.id, { bold: e.target.checked })}
                                  className="rounded border-input bg-background"
                                />
                                <strong>In đậm (Bold)</strong>
                              </label>
                              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={overlay.italic ?? false}
                                  onChange={(e) => updateOverlay(overlay.id, { italic: e.target.checked })}
                                  className="rounded border-input bg-background"
                                />
                                <em>In nghiêng (Italic)</em>
                              </label>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Kiểu nền</label>
                                <select
                                  value={overlay.backgroundStyle ?? "solid"}
                                  onChange={(e) => updateOverlay(overlay.id, { backgroundStyle: e.target.value as "solid" | "blur" })}
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                  <option value="solid">Solid</option>
                                  <option value="blur">Blur background</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-medium text-muted-foreground">Opacity nền</label>
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-2xs tabular text-foreground">
                                    {Math.round((overlay.backgroundOpacity ?? 0.72) * 100)}%
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={overlay.backgroundOpacity ?? 0.72}
                                  onChange={(e) => updateOverlay(overlay.id, { backgroundOpacity: Number(e.target.value) })}
                                  className="range-slider w-full"
                                  aria-label="Background opacity"
                                />
                              </div>
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
                                  fontWeight: overlay.bold ? 800 : 400,
                                  fontStyle: overlay.italic ? 'italic' : 'normal',
                                  color: overlay.fontColor,
                                  WebkitTextStroke: overlay.outlineColor && overlay.outlineColor !== '#000000' && overlay.outlineColor !== 'transparent'
                                    ? `1px ${overlay.outlineColor}`
                                    : undefined,
                                  backgroundColor:
                                    overlay.backgroundStyle === "blur"
                                      ? `rgba(15,23,42,${overlay.backgroundOpacity ?? 0.72})`
                                      : overlay.bgColor,
                                  backdropFilter: overlay.backgroundStyle === "blur" ? "blur(10px)" : undefined,
                                  WebkitBackdropFilter: overlay.backgroundStyle === "blur" ? "blur(10px)" : undefined,
                                }}
                              >
                                {overlay.text || 'Preview'}
                              </span>
                            </div>
                            {selectedOverlayIds.size > 0 && !selectedOverlayIds.has(overlay.id) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTextOverlays(prev => prev.map(o =>
                                    selectedOverlayIds.has(o.id)
                                      ? normalizeOverlay({
                                          ...o,
                                          fontFamily: overlay.fontFamily,
                                          fontSize: overlay.fontSize,
                                          fontColor: overlay.fontColor,
                                          bgColor: overlay.bgColor,
                                          backgroundStyle: overlay.backgroundStyle,
                                          backgroundOpacity: overlay.backgroundOpacity,
                                          outlineColor: overlay.outlineColor,
                                          bold: overlay.bold,
                                          italic: overlay.italic,
                                          animation: overlay.animation,
                                        })
                                      : o
                                  ));
                                }}
                                className="w-full rounded-md border border-dashed border-primary/40 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
                              >
                                📋 Apply style này lên {selectedOverlayIds.size} overlay đã chọn
                              </button>
                            )}
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
                            normalizeOverlay({ id: genId(), start: 0, end: 4, text: 'Xem ngay!', position: { x: 0.5, y: 0.1 }, box: { x: 0.28, y: 0.05, w: 0.44, h: 0.1 }, fontFamily: 'Montserrat', fontSize: 36, fontColor: '#FFF200', bgColor: '#FF2A6D', animation: 'scale_in' }),
                            normalizeOverlay({ id: genId(), start: 5, end: 10, text: 'Link bio', position: { x: 0.5, y: 0.85 }, box: { x: 0.32, y: 0.8, w: 0.36, h: 0.09 }, fontFamily: 'Be Vietnam Pro', fontSize: 28, fontColor: '#FFFFFF', bgColor: '#00000088', backgroundStyle: 'blur', backgroundOpacity: 0.58, animation: 'fade_in' }),
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
                            <input type="range" min="1" max="72" value={textFontSize}
                              onChange={(e) => setTextFontSize(Number(e.target.value))}
                              className="w-full mt-2 accent-primary"
                            />
                            <input
                              type="number"
                              min="1"
                              max="120"
                              value={textFontSize}
                              onChange={(e) => setTextFontSize(Number(e.target.value))}
                              className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          {[
                            { label: "Chữ", value: textColor, setter: setTextColor },
                            { label: "Nền", value: textBgColor, setter: setTextBgColor },
                            { label: "Viền", value: textOutlineColor, setter: setTextOutlineColor },
                          ].map(({ label, value, setter }) => (
                            <ColorFieldWithOpacity
                              key={label}
                              label={label}
                              value={value}
                              onChange={setter}
                              fallback={label === "Chữ" ? "#FFFFFF" : "#000000"}
                            />
                          ))}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Kiểu nền</label>
                            <select
                              value={textBackgroundStyle}
                              onChange={(e) => setTextBackgroundStyle(e.target.value as "solid" | "blur")}
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="solid">Solid</option>
                              <option value="blur">Blur background</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-medium text-muted-foreground">Opacity nền</label>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-2xs tabular text-foreground">
                                {Math.round(textBackgroundOpacity * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={textBackgroundOpacity}
                              onChange={(e) => setTextBackgroundOpacity(Number(e.target.value))}
                              className="range-slider w-full"
                              aria-label="Text background opacity"
                            />
                          </div>
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
                              backgroundColor: textBackgroundStyle === "blur" ? `rgba(15,23,42,${textBackgroundOpacity})` : textBgColor,
                              backdropFilter: textBackgroundStyle === "blur" ? "blur(10px)" : undefined,
                              WebkitBackdropFilter: textBackgroundStyle === "blur" ? "blur(10px)" : undefined,
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
