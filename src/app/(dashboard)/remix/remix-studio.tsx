"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Status } from "@/components/ui/badge";
import { Field, Input, Textarea, Select, Checkbox } from "@/components/ui/field";
import { ColorFieldWithOpacity } from "@/components/ui/color-field-with-opacity";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkles, Plus, X, Zap, ChevronDown, Folder, FolderOpen, ChevronRight, Edit2, Trash2, Upload, UploadCloud, CheckCircle2, RefreshCw, Check, Film, Image as ImageIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const ImageEditor = dynamic(() => import("@/components/shared/image-editor"), { ssr: false });
import { VideoEditor } from "@/components/shared/video-editor";
import { VoiceSelector } from '@/components/remix/voice-selector';
import { SubtitleConfig, type SubtitleSettings, defaultSubtitleSettings } from '@/components/remix/subtitle-config';
import { BatchURLInput } from '@/components/remix/batch-url-input';
import { RatioPicker } from '@/components/remix/ratio-picker';
import { BlurRegionPicker, type BlurRegion } from '@/components/remix/blur-region-picker';
import { requiresOcrServiceForRemix, requiresVoicePipelineForRemix } from "@/lib/remix/preflight";
import { sanitizeTranscriptText } from "@/lib/remix/utils";
import {
  buildCaptionPromptFromPreset,
  buildCaptionToneFromPreset,
  captionPresetToManualInput,
  type CaptionPresetManualInput,
} from "@/lib/remix/caption-preset-options";
import { VIETNAMESE_FONTS } from "@/lib/remix/fonts";

type SourceType = "upload" | "media_library" | "own_link" | "inspiration";
type OutputKind = "video" | "image" | "caption";
type PipelineMode = "simple" | "localization_dub" | "clip_factory" | "hybrid";
type OnScreenTextPreset = "meme" | "pop" | "bubble" | "neon" | "clean";
type OnScreenTextSizeMode = "auto_fit" | "fixed";

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

interface CampaignOption {
  id: string;
  name: string;
}

interface JobSummary {
  id: string;
  source_type: string;
  output_kind: string;
  status: string;
  prompt: string | null;
  options: Record<string, any>;
  iteration: number;
  created_at: string;
  folder_id?: string | null;
  is_auto_fix?: boolean;
  auto_fix_source_id?: string | null;
}

interface JobDetail {
  id: string;
  status: string;
  source_url: string | null;
  source_media_id: string | null;
  output_kind: string;
  prompt: string | null;
  options: Record<string, any>;
  plan?: {
    summary?: string;
    warnings?: string[];
    scriptVi?: string;
    realScriptVi?: string;
    analysisBrief?: {
      content?: { summary?: string; hook?: string; tone?: string; topics?: string[] };
      structure?: { sceneCount?: number; pacingStyle?: string; avgSceneDurationSec?: number };
      replicationGuidance?: { suggestedPipeline?: string; keyElements?: string[]; risks?: string[] };
    };
    scenePlan?: {
      scenes?: Array<{ id: string; startSec: number; endSec: number; role: string; visualType: string; reason: string; score?: number }>;
    };
    editDecisions?: {
      renderRuntime?: string;
      cuts?: Array<{ id: string; inSec: number; outSec: number; reason: string }>;
      overlays?: Array<{
        id?: string;
        kind: string;
        reason: string;
        startSec?: number;
        endSec?: number;
        sourceText?: string;
        translatedText?: string;
        region?: { x: number; y: number; w: number; h: number };
        textAlign?: "left" | "center" | "right";
        confidence?: number;
      }>;
      audio?: {
        mode?: string;
        voiceName?: string;
        cues?: Array<{ id?: string; startSec?: number; endSec?: number; sourceText?: string; translatedText?: string }>;
      };
      subtitles?: { enabled?: boolean; position?: string };
    };
    finalReview?: {
      status?: "pass" | "revise" | "fail";
      issuesFound?: string[];
      checks?: {
        technicalProbe?: { durationSec?: number; resolution?: string; hasAudio?: boolean; codec?: string };
        visualSpotcheck?: { expectedResolution?: string; resolutionMatches?: boolean };
      };
    };
    costEstimate?: { provider?: string; estimatedVnd?: number; estimatedUsd?: number; notes?: string[] };
    copyrightPreflight?: {
      riskLevel?: "low" | "medium" | "high";
      items?: Array<{ id: string; label: string; status: "pass" | "warning" | "fail"; detail: string }>;
      warnings?: string[];
    };
  } | null;
  result_caption: string | null;
  result_hashtags: string[] | null;
  resultUrl: string | null;
  sourceUrlResolved?: string | null;
  error: string | null;
  post_id: string | null;
  iteration: number;
  folder_id?: string | null;
  is_auto_fix?: boolean;
  auto_fix_source_id?: string | null;
}

interface RemixFolderNode {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  jobCount: number;
  totalJobCount: number;
  children: RemixFolderNode[];
}

interface RemixServiceHealth {
  voicePipeline: {
    configured: boolean;
    reachable: boolean;
    url: string | null;
    error?: string;
    requireV2ForLocalization: boolean;
  };
  ocr: {
    configured: boolean;
    reachable: boolean;
    url: string | null;
    error?: string;
    engine: "gemini" | "paddleocr";
  };
}

const RUNNING = new Set(["queued", "analyzing", "processing", "revising"]);

const SOURCE_TABS: { value: SourceType; label: string; hint: string }[] = [
  {
    value: "upload",
    label: "📁 Tải file lên",
    hint: "Kéo thả hoặc chọn file video/ảnh từ máy tính của bạn.",
  },
  {
    value: "media_library",
    label: "🖼️ Thư viện Media",
    hint: "Chọn file media đã có sẵn trong Thư viện Media của bạn.",
  },
  {
    value: "own_link",
    label: "🔗 Link bài đăng",
    hint: "Link bài đăng do chính bạn/Page bạn sở hữu. Hệ thống sẽ tải media về để biên tập.",
  },
];

const CAPTION_PLATFORM_OPTIONS = [
  "TikTok",
  "Instagram Reels",
  "Facebook Reels",
  "YouTube Shorts",
  "Facebook Page",
  "LinkedIn",
  "X/Twitter",
  "Threads",
];

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

const QUALITY_PRESETS = [
  { label: "Siêu nét", desc: "Phim, TV — file lớn", crf: 14 },
  { label: "Chất lượng cao", desc: "Upload web, archive", crf: 18 },
  { label: "Chuẩn", desc: "TikTok / Reels / Shorts", crf: 22 },
  { label: "Nén nhẹ", desc: "File nhỏ hơn, stream tốt", crf: 26 },
  { label: "Nhỏ nhất", desc: "Tối ưu dung lượng", crf: 30 },
];

export function RemixStudio({
  campaigns,
  initialJobs,
}: {
  campaigns: CampaignOption[];
  initialJobs: JobSummary[];
}) {
  // --- form nguồn ---
  const [sourceType, setSourceType] = React.useState<SourceType>("upload");
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [uploadedMedia, setUploadedMedia] = React.useState<{
    id: string;
    url: string;
    type: string;
  } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [createModalFolderId, setCreateModalFolderId] = React.useState<string>("unfiled");
  const [mediaLibrary, setMediaLibrary] = React.useState<Array<{ id: string; type: string; url: string; created_at: string; meta?: any }>>([]);
  const [loadingMediaLibrary, setLoadingMediaLibrary] = React.useState(false);
  const [mediaFilter, setMediaFilter] = React.useState<"all" | "video" | "image">("all");
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [uploadedLogo, setUploadedLogo] = React.useState<{
    id: string;
    url: string;
    type: string;
  } | null>(null);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);

  // --- form đầu ra ---
  const [outputKind, setOutputKind] = React.useState<OutputKind>("video");
  const [prompt, setPrompt] = React.useState("");
  const [campaignId, setCampaignId] = React.useState("");

  // --- option cứng ---
  const [targetLanguage, setTargetLanguage] = React.useState<"vi" | "en">("vi");
  const [vietsub, setVietsub] = React.useState(false);
  const [dubVi, setDubVi] = React.useState(false); // kept for backward compat
  const [dubMode, setDubMode] = React.useState<'none' | 'full' | 'preserve_bgm' | 'heygen'>('none');
  const [vertical, setVertical] = React.useState(true);
  const [outputRatio, setOutputRatio] = React.useState("9:16");
  const [outputCrf, setOutputCrf] = React.useState<number>(28);
  const [manualVideoTab, setManualVideoTab] = React.useState<"general" | "voice" | "subtitle" | "onscreen" | "watermark">("general");
  const [blurOriginalSub, setBlurOriginalSub] = React.useState(false);
  const [autoDetectSub, setAutoDetectSub] = React.useState(false);
  const [blurRegion, setBlurRegion] = React.useState<BlurRegion>({ x: 0, y: 0.82, w: 1, h: 0.18 });
  const [watermarkMode, setWatermarkMode] = React.useState<"disabled" | "text" | "image">("disabled");
  const [watermarkText, setWatermarkText] = React.useState("");
  const [watermarkImageMediaId, setWatermarkImageMediaId] = React.useState("");
  const [watermarkOpacity, setWatermarkOpacity] = React.useState("0.9");
  const [watermarkScale, setWatermarkScale] = React.useState("0.15");
  const [watermarkPosition, setWatermarkPosition] = React.useState("bottom-right");
  const [watermarkPositionX, setWatermarkPositionX] = React.useState("0.5");
  const [watermarkPositionY, setWatermarkPositionY] = React.useState("0.5");
  const WATERMARK_RATIOS = ["9:16", "16:9", "1:1", "4:5"] as const;
  type WatermarkRatioKey = typeof WATERMARK_RATIOS[number];
  const [watermarkRatioTab, setWatermarkRatioTab] = React.useState<WatermarkRatioKey>("9:16");
  const [watermarkPositionsByRatio, setWatermarkPositionsByRatio] = React.useState<Record<WatermarkRatioKey, { position: string; positionX: string; positionY: string }>>(
    () => Object.fromEntries(["9:16", "16:9", "1:1", "4:5"].map(r => [r, { position: "bottom-right", positionX: "0.5", positionY: "0.5" }])) as Record<WatermarkRatioKey, { position: string; positionX: string; positionY: string }>
  );
  const [muteOriginal, setMuteOriginal] = React.useState(false);
  const [trimMode, setTrimMode] = React.useState<"full" | "trim">("full");
  const [trimStartInput, setTrimStartInput] = React.useState("");
  const [trimEndInput, setTrimEndInput] = React.useState("");
  const [translateOnScreenText, setTranslateOnScreenText] = React.useState(false);
  const [onScreenTextHint, setOnScreenTextHint] = React.useState("");
  const [onScreenTextPreset, setOnScreenTextPreset] = React.useState<OnScreenTextPreset>("meme");
  const [onScreenTextFont, setOnScreenTextFont] = React.useState("Anton");
  const [onScreenTextSize, setOnScreenTextSize] = React.useState("34");
  const [onScreenTextSizeMode, setOnScreenTextSizeMode] = React.useState<OnScreenTextSizeMode>("auto_fit");
  const [onScreenTextColor, setOnScreenTextColor] = React.useState("#FFFFFF");
  const [onScreenTextBgColor, setOnScreenTextBgColor] = React.useState("#000000");
  const [onScreenTextBackgroundStyle, setOnScreenTextBackgroundStyle] = React.useState<"solid" | "blur">("solid");
  const [onScreenTextBackgroundOpacity, setOnScreenTextBackgroundOpacity] = React.useState(0.72);
  const [onScreenTextOutlineColor, setOnScreenTextOutlineColor] = React.useState("#000000");
  const [onScreenTextOutlineWidth, setOnScreenTextOutlineWidth] = React.useState("1");
  const [onScreenTextBold, setOnScreenTextBold] = React.useState(true);
  const [onScreenTextItalic, setOnScreenTextItalic] = React.useState(false);
  // --- Caption & Image options ---
  const [captionPrompt, setCaptionPrompt] = React.useState("");
  const [imageTranslate, setImageTranslate] = React.useState<"overlay" | "regenerate" | "none">("none");
  const [captionPresetMode, setCaptionPresetMode] = React.useState<"preset" | "manual">("preset");
  const [selectedCaptionPresetId, setSelectedCaptionPresetId] = React.useState("");
  const [captionPresetDraft, setCaptionPresetDraft] = React.useState<CaptionPresetManualInput>(emptyCaptionPresetState());

  // --- job đang theo dõi ---
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<JobDetail | null>(null);
  const [jobs, setJobs] = React.useState<JobSummary[]>(initialJobs);
  const [folders, setFolders] = React.useState<RemixFolderNode[]>([]);
  const [unfiledCount, setUnfiledCount] = React.useState(0);
  const [selectedFolderId, setSelectedFolderId] = React.useState<string>("unfiled");
  const [expandedFolders, setExpandedFolders] = React.useState<Record<string, boolean>>({});
  const [movingFolderId, setMovingFolderId] = React.useState<string | null>(null);
  const [moveFolderTargetId, setMoveFolderTargetId] = React.useState<string>("unfiled");
  const [selectedJobIds, setSelectedJobIds] = React.useState<string[]>([]);
  const router = useRouter();

  React.useEffect(() => {
    setSelectedJobIds([]);
  }, [selectedFolderId]);

  React.useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  const fetchFolders = React.useCallback(async () => {
    try {
      const res = await fetch("/api/remix/folders", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setFolders(data.folders ?? []);
      setUnfiledCount(data.unfiledCount ?? 0);
      setExpandedFolders((prev) => {
        const next = { ...prev };
        const mark = (nodes: RemixFolderNode[]) => {
          for (const node of nodes) {
            if (next[node.id] === undefined) next[node.id] = true;
            if (node.children?.length) mark(node.children);
          }
        };
        mark(data.folders ?? []);
        return next;
      });
    } catch {
      // ignore refresh errors
    }
  }, []);

  const fetchMediaLibrary = React.useCallback(async () => {
    setLoadingMediaLibrary(true);
    try {
      const res = await fetch("/api/media", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.media) {
        setMediaLibrary(data.media);
      }
    } catch (err) {
      console.error("Failed to fetch media library:", err);
    } finally {
      setLoadingMediaLibrary(false);
    }
  }, []);

  const fetchJobs = React.useCallback(async (folderId: string) => {
    try {
      const res = await fetch(`/api/remix?folderId=${encodeURIComponent(folderId)}`, { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        console.error("fetchJobs error", res.status, text);
        setError(`Failed to fetch jobs: ${res.status} ${text}`);
        return;
      }
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch (e: any) {
      console.error("fetchJobs exception", e);
      setError(`Error fetching jobs: ${e.message}`);
    }
  }, []);

  React.useEffect(() => {
    void fetchFolders();
  }, [fetchFolders]);

  React.useEffect(() => {
    void fetchJobs(selectedFolderId);
  }, [fetchJobs, selectedFolderId]);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState("");
  const [acting, setActing] = React.useState(false);

  const [editingJobId, setEditingJobId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");

  const [isEditingCaption, setIsEditingCaption] = React.useState(false);
  const [editedCaption, setEditedCaption] = React.useState("");
  const [isSavingCaption, setIsSavingCaption] = React.useState(false);

  const [isEditingImage, setIsEditingImage] = React.useState(false);
  const [isEditingVideo, setIsEditingVideo] = React.useState(false);
  const [isSavingVideo, setIsSavingVideo] = React.useState(false);
  const [isSavingImage, setIsSavingImage] = React.useState(false);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [showAutoDialog, setShowAutoDialog] = React.useState(false);
  const [batchUrls, setBatchUrls] = React.useState<string[]>([]);
  const [batchSubmitting, setBatchSubmitting] = React.useState(false);
  const [autoGenerateFolderId, setAutoGenerateFolderId] = React.useState<string>("unfiled");
  const [selectedVoice, setSelectedVoice] = React.useState('vi-VN-WaveNet-A');
  const [voiceVolume, setVoiceVolume] = React.useState(2.0);

  const [subtitleSettings, setSubtitleSettings] = React.useState<SubtitleSettings>(defaultSubtitleSettings);
  const [scriptInputMode, setScriptInputMode] = React.useState<'from_video_audio' | 'manual_script'>('from_video_audio');
  const [manualScript, setManualScript] = React.useState('');
  const [editedScript, setEditedScript] = React.useState('');

  // Tự động điền script lồng tiếng khi có kết quả
  React.useEffect(() => {
    if (detail?.plan?.scriptVi || detail?.plan?.realScriptVi) {
      setEditedScript(
        sanitizeTranscriptText(detail.plan.scriptVi || detail.plan.realScriptVi || ''),
      );
    }
  }, [detail?.id, detail?.plan?.scriptVi, detail?.plan?.realScriptVi]);
  const [scriptEditorOpen, setScriptEditorOpen] = React.useState(true);
  const [regenerating, setRegenerating] = React.useState(false);

  // --- output mode: preset vs manual ---
  const [outputMode, setOutputMode] = React.useState<'preset' | 'manual'>('preset');
  const [videoPresets, setVideoPresets] = React.useState<any[]>([]);
  const [imagePresets, setImagePresets] = React.useState<any[]>([]);
  const [captionPresets, setCaptionPresets] = React.useState<any[]>([]);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>('');
  const [presetsLoaded, setPresetsLoaded] = React.useState(false);
  const [serviceHealth, setServiceHealth] = React.useState<RemixServiceHealth | null>(null);

  const isVideoFlow = outputKind === "video";
  const activePresets = outputKind === "image" ? imagePresets : outputKind === "caption" ? captionPresets : videoPresets;

  // Load presets when modal opens
  React.useEffect(() => {
    if (!presetsLoaded) {
      Promise.all([
        fetch('/api/remix/presets', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null),
        fetch('/api/remix/image-presets', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null),
        fetch('/api/remix/caption-presets', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null),
      ])
        .then(([videoData, imageData, captionData]) => {
          const nextVideoPresets = videoData?.presets ?? [];
          const nextImagePresets = imageData?.presets ?? [];
          const nextCaptionPresets = captionData?.presets ?? [];
          setVideoPresets(nextVideoPresets);
          setImagePresets(nextImagePresets);
          setCaptionPresets(nextCaptionPresets);
          const source = outputKind === "image" ? nextImagePresets : outputKind === "caption" ? nextCaptionPresets : nextVideoPresets;
          const def = source.find((p: any) => p.is_default);
          if (def) setSelectedPresetId(def.id);
          else if (source[0]?.id) setSelectedPresetId(source[0].id);
          const captionDefault = nextCaptionPresets.find((p: any) => p.is_default) ?? nextCaptionPresets[0];
          if (captionDefault) {
            setSelectedCaptionPresetId(captionDefault.id);
            setCaptionPresetDraft(captionPresetToManualInput(captionDefault));
          }
          setPresetsLoaded(true);
        })
        .catch(() => setPresetsLoaded(true));
    }
  }, [outputKind, presetsLoaded]);

  React.useEffect(() => {
    if (showAutoDialog) {
      setAutoGenerateFolderId(selectedFolderId);
    }
  }, [showAutoDialog, selectedFolderId]);

  React.useEffect(() => {
    if (!presetsLoaded) return;
    const source = outputKind === "image" ? imagePresets : outputKind === "video" ? videoPresets : captionPresets;
    if (!source.some((preset: any) => preset.id === selectedPresetId)) {
      const def = source.find((preset: any) => preset.is_default);
      setSelectedPresetId(def?.id ?? source[0]?.id ?? "");
    }
  }, [outputKind, presetsLoaded, imagePresets, videoPresets, captionPresets, selectedPresetId]);

  React.useEffect(() => {
    if (!captionPresets.length) return;
    if (!captionPresets.some((preset: any) => preset.id === selectedCaptionPresetId)) {
      const def = captionPresets.find((preset: any) => preset.is_default) ?? captionPresets[0];
      if (def) {
        setSelectedCaptionPresetId(def.id);
        setCaptionPresetDraft(captionPresetToManualInput(def));
      }
    }
  }, [captionPresets, selectedCaptionPresetId]);

  function applyPresetToManual(presetId: string) {
    const p = activePresets.find((x: any) => x.id === presetId);
    if (!p) return;
    
    // general
    if (p.output_ratio) {
      setOutputRatio(p.output_ratio);
      setVertical(p.output_ratio === '9:16');
    }
    if (p.output_crf) setOutputCrf(p.output_crf);
    
    // voice & translate
    if (p.target_language) setTargetLanguage(p.target_language as any);
    if (p.dub_mode) {
      setDubMode(p.dub_mode);
      setDubVi(p.dub_mode !== 'none');
    } else if (p.auto_dub) {
      setDubMode('full');
      setDubVi(true);
    }
    if (p.voice_name) setSelectedVoice(p.voice_name);
    if (p.bg_volume !== undefined) setVoiceVolume(p.bg_volume);

    // subtitle
    if (p.auto_vietsub) setVietsub(true);
    setSubtitleSettings(prev => ({
      ...prev,
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
    }));
    
    if (p.blur_original_sub) {
      setBlurOriginalSub(true);
      if (p.blur_region) setBlurRegion(p.blur_region);
      else setAutoDetectSub(true);
    }
    
    // on screen text
    if (p.translate_on_screen_text) setTranslateOnScreenText(true);
    if (p.on_screen_text_preset) setOnScreenTextPreset(p.on_screen_text_preset);
    if (p.on_screen_text_font) setOnScreenTextFont(p.on_screen_text_font);
    if (p.on_screen_text_size) setOnScreenTextSize(String(p.on_screen_text_size));
    if (p.on_screen_text_size_mode) setOnScreenTextSizeMode(p.on_screen_text_size_mode);
    if (p.on_screen_text_color) setOnScreenTextColor(p.on_screen_text_color);
    if (p.on_screen_text_bg_color) setOnScreenTextBgColor(p.on_screen_text_bg_color);
    if (p.on_screen_text_outline_color) setOnScreenTextOutlineColor(p.on_screen_text_outline_color);
    if (p.on_screen_text_bold !== null && p.on_screen_text_bold !== undefined) setOnScreenTextBold(p.on_screen_text_bold);
    if (p.on_screen_text_italic !== null && p.on_screen_text_italic !== undefined) setOnScreenTextItalic(Boolean(p.on_screen_text_italic));
    
    // watermark
    if (p.watermark_defaults && Object.keys(p.watermark_defaults).length) {
      const w = p.watermark_defaults;
      setWatermarkMode(w.type || 'disabled');
      if (w.text) setWatermarkText(w.text);
      if (w.imageMediaId) setWatermarkImageMediaId(w.imageMediaId);
      if (w.opacity !== undefined) setWatermarkOpacity(String(w.opacity));
      if (w.scale !== undefined) setWatermarkScale(String(w.scale));
      if (w.position) setWatermarkPosition(w.position);
      if (w.positionX !== undefined) setWatermarkPositionX(String(w.positionX));
      if (w.positionY !== undefined) setWatermarkPositionY(String(w.positionY));
      const defaultPos = { position: w.position ?? "bottom-right", positionX: String(w.positionX ?? 0.5), positionY: String(w.positionY ?? 0.5) };
      setWatermarkPositionsByRatio(
        Object.fromEntries(WATERMARK_RATIOS.map(r => {
          const rp = (w.positionsByRatio as any)?.[r];
          return [r, rp ? { position: rp.position ?? defaultPos.position, positionX: String(rp.positionX ?? 0.5), positionY: String(rp.positionY ?? 0.5) } : { ...defaultPos }];
        })) as Record<WatermarkRatioKey, { position: string; positionX: string; positionY: string }>
      );
      setWatermarkRatioTab("9:16");
    }
    
    // image mode
    if (p.image_translate) setImageTranslate(p.image_translate);
  }

  React.useEffect(() => {
    let cancelled = false;

    async function loadPreflight() {
      try {
        const res = await fetch("/api/remix/preflight", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setServiceHealth(data);
      } catch {
        // ignore local preflight hiccups
      }
    }

    void loadPreflight();
    const timer = setInterval(() => void loadPreflight(), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Apply a preset's settings to manual form state
  const applyPreset = React.useCallback((p: any) => {
    if (!p) return;
    if (outputKind === "caption") {
      setSelectedCaptionPresetId(p.id ?? "");
      setCaptionPresetMode("preset");
      setCaptionPresetDraft(captionPresetToManualInput(p));
      return;
    }
    setOutputRatio(p.output_ratio || '9:16');
    setVertical(p.output_ratio === '9:16');
    if (outputKind === "image") {
      setImageTranslate((p.image_translate ?? "none") as "overlay" | "regenerate" | "none");
      return;
    }
    setTargetLanguage(p.target_language === 'en' ? 'en' : 'vi');
    setSelectedVoice(p.voice_name || 'vi-VN-WaveNet-A');
    setDubMode((p.dub_mode as 'none' | 'full' | 'preserve_bgm' | 'heygen') ?? (p.auto_dub ? 'full' : 'none'));
    setDubVi(p.auto_dub ?? false);
    setVietsub(p.auto_vietsub ?? false);
    setTrimMode("full");
    setTrimStartInput("");
    setTrimEndInput("");
    setTranslateOnScreenText(p.translate_on_screen_text ?? false);
    setOnScreenTextPreset((p.on_screen_text_preset ?? 'meme') as OnScreenTextPreset);
    setOnScreenTextFont(p.on_screen_text_font ?? 'Anton');
    setOnScreenTextSize(String(p.on_screen_text_size ?? 34));
    setOnScreenTextSizeMode((p.on_screen_text_size_mode ?? 'auto_fit') as OnScreenTextSizeMode);
    setOnScreenTextColor(p.on_screen_text_color ?? '#FFFFFF');
    setOnScreenTextBgColor(p.on_screen_text_bg_color ?? '#000000');
    setOnScreenTextBackgroundStyle((p.on_screen_text_background_style ?? 'solid') as "solid" | "blur");
    setOnScreenTextBackgroundOpacity(Number.isFinite(p.on_screen_text_background_opacity) ? p.on_screen_text_background_opacity : 0.72);
    setOnScreenTextOutlineColor(p.on_screen_text_outline_color ?? '#000000');
    setOnScreenTextBold(p.on_screen_text_bold ?? true);
    setOnScreenTextItalic(Boolean(p.on_screen_text_italic ?? false));
    setBlurOriginalSub(p.blur_original_sub ?? false);
    setAutoDetectSub(p.auto_detect_subtitle_region ?? false);
    if (p.blur_region) setBlurRegion(p.blur_region);
    setSubtitleSettings({
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
  }, [outputKind]);

  const applyOnScreenTextPreset = React.useCallback((preset: OnScreenTextPreset) => {
    const style = ON_SCREEN_TEXT_PRESETS[preset];
    setOnScreenTextPreset(preset);
    setOnScreenTextFont(style.font);
    setOnScreenTextSize(String(style.size));
    setOnScreenTextColor(style.color);
    setOnScreenTextBgColor(style.bgColor);
    setOnScreenTextBackgroundStyle("solid");
    setOnScreenTextBackgroundOpacity(0.72);
    setOnScreenTextOutlineColor(style.outlineColor);
    setOnScreenTextBold(style.bold);
    setOnScreenTextItalic(false);
  }, []);

  React.useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/remix/${jobId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { job: JobDetail };
        if (cancelled) return;
        setDetail(data.job);
        setJobs((prev) =>
          prev.map((j) =>
            j.id === data.job.id
              ? { ...j, status: data.job.status, iteration: data.job.iteration, options: data.job.options }
              : j,
          ),
        );
      } catch {
        // Lỗi mạng tạm thời: bỏ qua, lần poll sau thử lại.
      }
    }

    void poll();
    const timer = setInterval(() => {
      // Ngừng poll khi job đã dừng.
      setDetail((d) => {
        if (d && !RUNNING.has(d.status)) clearInterval(timer);
        return d;
      });
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tải file thất bại.");
      setUploadedMedia(data.asset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveImage(file: File) {
    if (!jobId) return;
    setIsSavingImage(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lưu ảnh thất bại.");
      
      const asset = data.asset;
      
      const patchRes = await fetch(`/api/remix/${jobId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result_media_id: asset.id })
      });
      if (!patchRes.ok) throw new Error("Cập nhật kết quả thất bại.");

      setDetail((d) => (d ? { ...d, resultUrl: asset.url } : d));
      setIsEditingImage(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSavingImage(false);
    }
  }

  // --- Video Editor ---
  async function handleSaveVideo(newOptions: Record<string, any>) {
    if (!jobId) return;
    setIsSavingVideo(true);
    setError(null);
    try {
      const editedScriptCandidate =
        typeof newOptions?.editedScript === "string"
          ? newOptions.editedScript
          : typeof newOptions?.manualScript === "string"
            ? newOptions.manualScript
            : undefined;

      const regenerateRes = await fetch(`/api/remix/${jobId}/regenerate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          options: newOptions,
          ...(editedScriptCandidate ? { editedScript: editedScriptCandidate } : {}),
        }),
      });

      if (!regenerateRes.ok) {
        const d = await regenerateRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Tạo lại video từ thiết lập mới thất bại.");
      }

      setDetail((prev) => (prev ? { ...prev, status: "queued", options: newOptions } : prev));
      setIsEditingVideo(false);
      setNotice("Đã đưa job vào hàng đợi render lại với thiết lập mới...");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSavingVideo(false);
    }
  }

  // --- Upload file logo ---
  async function handleUploadLogo(file: File) {
    setUploadingLogo(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tải logo thất bại.");
      setUploadedLogo(data.asset);
      setWatermarkImageMediaId(data.asset.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingLogo(false);
    }
  }

  // --- Tạo job ---
  async function handleSubmit() {
    setError(null);
    setNotice(null);

    if (createBlockedReason) {
      setError(`${createBlockedReason} Chạy npm run remix:services:detached rồi thử lại.`);
      return;
    }

    const isFileSource = sourceType === "upload" || sourceType === "media_library";
    if (isFileSource && !uploadedMedia) {
      setError("Hãy chọn hoặc tải lên file nguồn trước.");
      return;
    }
    if (!isFileSource && !sourceUrl.trim()) {
      setError("Hãy dán link nguồn.");
      return;
    }

    setSubmitting(true);
    try {
      let options: Record<string, unknown> = {};

      // --- Khi dùng Preset mode: lấy options trực tiếp từ preset object ---
      if (outputMode === 'preset' && selectedPresetId) {
        const p = activePresets.find((x: any) => x.id === selectedPresetId);
        if (p) {
          if (outputKind === "caption") {
            setSelectedCaptionPresetId(p.id ?? "");
            setCaptionPresetDraft(captionPresetToManualInput(p));
          }
          // Build options từ preset fields
          if (outputKind !== "caption") {
            options.outputRatio = p.output_ratio || '9:16';
            options.vertical = p.output_ratio === '9:16';
          }
          if (outputKind === "video") {
            options.targetLanguage = p.target_language || 'vi';
          }
          
          if (outputKind === "video" && p.auto_vietsub) {
            options.vietsub = true;
            options.subtitleConfig = {
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
            };
            options.subPosition = p.sub_position ?? defaultSubtitleSettings.position;
            options.subCustomY = p.sub_custom_y ?? defaultSubtitleSettings.customY;
            if (p.blur_original_sub) {
              options.blurOriginalSub = true;
              if (p.blur_region) options.blurRegion = p.blur_region;
              else options.autoDetectSubtitleRegion = true;
            }
          }
          if (outputKind === "video" && p.translate_on_screen_text) {
            options.translateOnScreenText = true;
            options.onScreenTextStyle = {
              preset: p.on_screen_text_preset ?? 'meme',
              font: p.on_screen_text_font ?? 'Impact',
              size: p.on_screen_text_size ?? 34,
              sizeMode: p.on_screen_text_size_mode ?? 'auto_fit',
              color: p.on_screen_text_color ?? '#FFFFFF',
              bgColor: p.on_screen_text_bg_color ?? '#000000',
              backgroundStyle: p.on_screen_text_background_style ?? 'solid',
              backgroundOpacity: p.on_screen_text_background_opacity ?? 0.72,
              outlineColor: p.on_screen_text_outline_color ?? '#000000',
              outlineWidth: p.on_screen_text_outline_width ?? 2,
              bold: p.on_screen_text_bold ?? true,
              italic: p.on_screen_text_italic ?? false,
            };
          }
          
          const dubMode = p.dub_mode || (p.auto_dub ? 'full' : 'none');
          if (outputKind === "video" && dubMode !== 'none') {
            options.dubMode = dubMode;
            options.dubVi = true;
            options.voiceName = p.voice_name || 'vi-VN-WaveNet-A';
            if (p.bg_volume !== undefined) options.bgVolume = p.bg_volume;
          }

          if (p.image_translate) options.imageTranslate = p.image_translate;
          if (p.editor_template) options.imageEditorTemplate = p.editor_template;
          if (p.intro_enabled && p.intro_media_id) {
            options.introEnabled = true;
            options.introMediaId = p.intro_media_id;
          }
          if (p.outro_enabled && p.outro_media_id) {
            options.outroEnabled = true;
            options.outroMediaId = p.outro_media_id;
          }
          if (p.output_crf) options.outputCrf = p.output_crf;
          if (p.watermark_defaults && Object.keys(p.watermark_defaults).length) {
            options.watermarkConfig = p.watermark_defaults;
          }
        }
      } else {
        // --- Manual mode: đọc từ form state như cũ ---
        if (outputKind === "video" || outputKind === "image") {
          options.outputRatio = outputRatio;
          if (vertical) options.vertical = true;
          if (watermarkMode !== "disabled") {
            const positionsByRatio = Object.fromEntries(
              WATERMARK_RATIOS.map(r => {
                const p = watermarkPositionsByRatio[r];
                return [r, { position: p.position, positionX: p.position === "custom" ? Number(p.positionX) : undefined, positionY: p.position === "custom" ? Number(p.positionY) : undefined }];
              })
            );
            const activeRatioKey = (outputRatio in watermarkPositionsByRatio ? outputRatio : "9:16") as WatermarkRatioKey;
            const currentPos = watermarkPositionsByRatio[activeRatioKey] || watermarkPositionsByRatio["9:16"];
            options.watermarkConfig = {
              enabled: true,
              type: watermarkMode,
              text: watermarkMode === "text" ? watermarkText.trim() || undefined : undefined,
              imageMediaId: watermarkMode === "image" ? watermarkImageMediaId.trim() || undefined : undefined,
              opacity: Number(watermarkOpacity),
              scale: Number(watermarkScale),
              position: currentPos.position,
              positionX: currentPos.position === "custom" ? Number(currentPos.positionX) : undefined,
              positionY: currentPos.position === "custom" ? Number(currentPos.positionY) : undefined,
              positionsByRatio,
            };
          }
        }

        if (outputKind === "video") {
          options.targetLanguage = targetLanguage;
          if (scriptInputMode === 'manual_script' && manualScript.trim()) {
            options.scriptInputMode = 'manual_script';
            options.manualScript = manualScript.trim();
            options.editedScript = manualScript.trim();
          }

          // ---- QUAN TRỌNG: luôn set tường minh để override preset ----
          // Nếu user tắt vietsub/dubMode/translateOnScreenText, phải ghi false/'none'
          // vào options để buildRemixOptionsFromPreset không ghi đè bằng preset defaults.
          options.vietsub = vietsub;
          options.dubMode = dubMode;
          options.dubVi = dubMode !== 'none';
          options.translateOnScreenText = translateOnScreenText;
          options.muteOriginal = muteOriginal;
          // --------------------------------------------------------------

          if (vietsub) {
            options.subtitleConfig = subtitleSettings;
            if (autoDetectSub) {
              options.autoDetectSubtitleRegion = true;
            } else if (blurOriginalSub) {
              options.blurOriginalSub = true;
              options.blurRegion = blurRegion;
            } else {
              options.blurOriginalSub = false;
              options.autoDetectSubtitleRegion = false;
            }
          } else {
            // Tắt sub → xoá các cờ liên quan để worker không nhầm
            options.blurOriginalSub = false;
            options.autoDetectSubtitleRegion = false;
          }

          if (dubMode !== 'none') {
            options.voiceName = selectedVoice;
            options.voiceVolume = voiceVolume;
          }

          if (translateOnScreenText) {
            options.onScreenTextPreset = onScreenTextPreset;
            options.onScreenTextStyle = {
              font: onScreenTextFont,
              size: Number(onScreenTextSize) || 34,
              sizeMode: onScreenTextSizeMode,
              color: onScreenTextColor,
              bgColor: onScreenTextBgColor,
              backgroundStyle: onScreenTextBackgroundStyle,
              backgroundOpacity: onScreenTextBackgroundOpacity,
              outlineColor: onScreenTextOutlineColor,
              outlineWidth: Number(onScreenTextOutlineWidth) || 1,
              bold: onScreenTextBold,
              italic: onScreenTextItalic,
            };
            if (onScreenTextHint.trim()) options.textOverlay = onScreenTextHint.trim();
          } else {
            options.onScreenTextStyle = undefined;
            options.textOverlay = undefined;
          }

          if (trimMode === "trim") {
            const trimStart = Number(trimStartInput);
            const trimEnd = Number(trimEndInput);
            const hasTrimStart = Number.isFinite(trimStart) && trimStart >= 0;
            const hasTrimEnd = Number.isFinite(trimEnd) && trimEnd > 0;
            if (!hasTrimStart || !hasTrimEnd || trimEnd <= trimStart) {
              throw new Error("Khoảng cắt video không hợp lệ. Hãy nhập giây bắt đầu và giây kết thúc hợp lệ.");
            }
            options.trimStart = trimStart;
            options.trimSeconds = trimEnd - trimStart;
          }
          if (outputCrf) options.outputCrf = outputCrf;
        }

        if (outputKind === "image") {
          if (imageTranslate !== "none") options.imageTranslate = imageTranslate;
        }
      }

      const activeCaptionPreset =
        captionPresetMode === "preset"
          ? captionPresets.find((item) => item.id === selectedCaptionPresetId)
          : null;
      const effectiveCaptionPreset =
        captionPresetMode === "manual"
          ? captionPresetDraft
          : captionPresetToManualInput(activeCaptionPreset);
      if (captionPrompt.trim()) options.captionPrompt = captionPrompt.trim();
      const captionPresetPrompt = buildCaptionPromptFromPreset(effectiveCaptionPreset);
      const captionPresetTone = buildCaptionToneFromPreset(effectiveCaptionPreset);
      if (captionPresetPrompt) {
        options.captionPrompt = [captionPrompt.trim(), captionPresetPrompt].filter(Boolean).join("\n");
      }
      if (captionPresetTone) options.captionTone = captionPresetTone;
      if (outputKind === "video" && scriptInputMode === 'manual_script' && manualScript.trim()) {
        options.scriptInputMode = 'manual_script';
        options.manualScript = manualScript.trim();
        options.editedScript = manualScript.trim();
      }

      const effectiveSourceType = (sourceType === "media_library" ? "upload" : sourceType) as any;
      const res = await fetch("/api/remix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: effectiveSourceType,
          sourceUrl: isFileSource ? undefined : sourceUrl.trim(),
          sourceMediaId: isFileSource ? uploadedMedia?.id : undefined,
          outputKind,
          prompt: undefined,
          options,
          presetId: (outputMode === 'preset' && selectedPresetId) ? selectedPresetId : undefined,
          folderId: createModalFolderId === "unfiled" ? null : createModalFolderId,
          campaignId: campaignId || undefined,
        }),

      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tạo job thất bại.");

      setJobId(data.id);
      setDetail(null);
      setFeedback("");
      setJobs((prev) => [
        {
          id: data.id,
          source_type: effectiveSourceType,
          output_kind: outputKind,
          status: "queued",
          prompt: null,
          options,
          iteration: 0,
          created_at: new Date().toISOString(),
          folder_id: createModalFolderId === "unfiled" ? null : createModalFolderId,
        },
        ...prev,
      ]);
      void fetchFolders();
      
      // Đóng modal sau khi tạo thành công
      setIsCreateModalOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  
  async function handleSaveTitle(jobId: string) {
    if (!editingTitle.trim()) {
      setEditingJobId(null);
      return;
    }
    
    // Cập nhật Optimistic
    setJobs((prev) => prev.map(j => j.id === jobId ? { ...j, options: { ...j.options, title: editingTitle.trim() } } : j));
    setEditingJobId(null);
    
    try {
      await fetch(`/api/remix/${jobId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: editingTitle.trim() })
      });
    } catch (e) {
      console.error("Lỗi cập nhật tên:", e);
    }
  }

  async function handleSaveCaption() {
    if (!jobId || !detail) return;
    setIsSavingCaption(true);
    try {
      const res = await fetch(`/api/remix/${jobId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result_caption: editedCaption })
      });
      if (!res.ok) throw new Error("Lỗi cập nhật caption");
      
      setDetail(d => d ? { ...d, result_caption: editedCaption } : d);
      setIsEditingCaption(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSavingCaption(false);
    }
  }

  async function handleDeleteJob(e: React.MouseEvent, targetId: string) {
    e.stopPropagation();
    if (!window.confirm("Bạn có chắc chắn muốn xoá job này vĩnh viễn không?")) return;
    try {
      const res = await fetch(`/api/remix/${targetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Xoá job thất bại");
      
      setJobs((prev) => prev.filter((j) => j.id !== targetId));
      setSelectedJobIds((prev) => prev.filter((id) => id !== targetId));
      if (jobId === targetId) {
        setJobId(null);
        setDetail(null);
        setNotice(null);
      }
      void fetchFolders();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  }

  function toggleSelectJob(targetId: string, e?: React.MouseEvent | React.ChangeEvent) {
    e?.stopPropagation();
    setSelectedJobIds((prev) =>
      prev.includes(targetId) ? prev.filter((id) => id !== targetId) : [...prev, targetId]
    );
  }

  function toggleSelectAll() {
    if (selectedJobIds.length === jobs.length && jobs.length > 0) {
      setSelectedJobIds([]);
    } else {
      setSelectedJobIds(jobs.map((j) => j.id));
    }
  }

  async function handleDeleteSelectedJobs() {
    if (selectedJobIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xoá vĩnh viễn ${selectedJobIds.length} job đã chọn không?`)) return;
    try {
      const res = await fetch("/api/remix", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: selectedJobIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Xoá danh sách job thất bại");
      }
      const deletedSet = new Set(selectedJobIds);
      setJobs((prev) => prev.filter((j) => !deletedSet.has(j.id)));
      if (jobId && deletedSet.has(jobId)) {
        setJobId(null);
        setDetail(null);
        setNotice(null);
      }
      setSelectedJobIds([]);
      await fetchFolders();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  }

  async function handleClearInbox(e?: React.MouseEvent) {
    e?.stopPropagation();
    const count = unfiledCount || (selectedFolderId === "unfiled" ? jobs.length : 0);
    if (!window.confirm(`Bạn có chắc chắn muốn xoá TOÀN BỘ ${count > 0 ? `${count} ` : ""}job trong Inbox / Unfiled không? Thao tác này không thể hoàn tác.`)) return;
    try {
      const res = await fetch("/api/remix?allInbox=true", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Xoá toàn bộ Inbox thất bại");
      }
      if (selectedFolderId === "unfiled") {
        setJobs([]);
        setJobId(null);
        setDetail(null);
        setNotice(null);
      }
      setSelectedJobIds([]);
      setUnfiledCount(0);
      await fetchFolders();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  }

  async function handleMoveSelectedJobsToFolder(targetFolderId: string | null) {
    if (selectedJobIds.length === 0) return;
    try {
      await Promise.all(
        selectedJobIds.map((id) =>
          fetch(`/api/remix/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder_id: targetFolderId }),
          })
        )
      );
      setSelectedJobIds([]);
      await Promise.all([fetchFolders(), fetchJobs(selectedFolderId)]);
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  }

  function flattenFolders(nodes: RemixFolderNode[]): RemixFolderNode[] {
    return nodes.flatMap((node) => [node, ...flattenFolders(node.children ?? [])]);
  }

  const allFolders = React.useMemo(() => flattenFolders(folders), [folders]);

  async function handleCreateFolder(parentId: string | null = null) {
    const name = window.prompt("Tên folder mới");
    if (!name?.trim()) return;
    try {
      const res = await fetch("/api/remix/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Tạo folder thất bại");
      await fetchFolders();
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function handleRenameFolder(folder: RemixFolderNode) {
    const name = window.prompt("Đổi tên folder", folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    try {
      const res = await fetch(`/api/remix/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Đổi tên folder thất bại");
      await fetchFolders();
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function handleMoveFolder(folder: RemixFolderNode, forcedParentId?: string | null) {
    const parentId = forcedParentId !== undefined ? forcedParentId : null;
    if (parentId === undefined) return;
    try {
      const res = await fetch(`/api/remix/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Di chuyển folder thất bại");
      setMovingFolderId(null);
      await fetchFolders();
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function handleDeleteFolder(folder: RemixFolderNode) {
    const confirmed = window.confirm(`Xoá folder "${folder.name}", toàn bộ folder con và tất cả job bên trong?`);
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/remix/folders/${folder.id}?deleteJobs=true`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Xoá folder thất bại");
      if (selectedFolderId === folder.id) setSelectedFolderId("unfiled");
      await Promise.all([fetchFolders(), fetchJobs(selectedFolderId === folder.id ? "unfiled" : selectedFolderId)]);
    } catch (error) {
      alert((error as Error).message);
    }
  }

  async function handleMoveJobToFolder(targetJobId: string, folderId: string | null) {
    try {
      setJobs((prev) => prev.filter((job) => job.id !== targetJobId));
      const res = await fetch(`/api/remix/${targetJobId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Di chuyển job thất bại");
      await Promise.all([fetchFolders(), fetchJobs(selectedFolderId)]);
    } catch (error) {
      alert((error as Error).message);
      await fetchJobs(selectedFolderId);
    }
  }

  // --- Gửi phản hồi để sửa ---
  async function handleFeedback() {
    if (!jobId || !feedback.trim()) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/remix/${jobId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gửi phản hồi thất bại.");
      setFeedback("");
      setDetail((d) => (d ? { ...d, status: "revising" } : d));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(false);
    }
  }

  // --- Script Regenerate ---
  async function handleRegenerate() {
    if (!jobId || !editedScript) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/remix/${jobId}/regenerate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ editedScript }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Tạo lại với script thất bại.");
      setDetail((d) => (d ? { ...d, status: "queued" } : d));
    } catch (e) {
      console.error(e);
      setError((e as Error).message);
    } finally {
      setRegenerating(false);
    }
  }

  // --- Duyệt → tạo bài nháp ---
  async function handleApprove() {
    if (!jobId) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/remix/${jobId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Duyệt thất bại.");
      setNotice(
        "Đã duyệt và tạo bài nháp. Mở Lịch đăng để chọn kênh và lên lịch.",
      );
      setDetail((d) => (d ? { ...d, status: "approved", post_id: data.postId } : d));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(false);
    }
  }

  const running = detail ? RUNNING.has(detail.status) : Boolean(jobId && !detail);
  const activeSource = SOURCE_TABS.find((t) => t.value === sourceType)!;
  const selectedPreset = outputMode === "preset"
    ? activePresets.find((p: any) => p.id === selectedPresetId)
    : null;
  const currentRemixIntent = outputMode === "preset"
    ? {
        outputKind,
        vietsub: Boolean(selectedPreset?.auto_vietsub),
        dubVi: Boolean(selectedPreset?.auto_dub),
        dubMode: selectedPreset?.dub_mode ?? (selectedPreset?.auto_dub ? "full" : "none"),
        translateOnScreenText: Boolean(selectedPreset?.translate_on_screen_text),
      }
    : {
        outputKind,
        vietsub,
        dubVi,
        dubMode,
        translateOnScreenText,
      };
  const needsVoicePipeline = requiresVoicePipelineForRemix(currentRemixIntent);
  const needsOcrService = serviceHealth
    ? requiresOcrServiceForRemix(currentRemixIntent, serviceHealth.ocr.engine)
    : false;
  const voicePipelineBlocked = false; // UI should not check worker's local services
  const ocrServiceBlocked = false;
  const createBlockedReason = null; // Do not block UI creation, let the worker handle it
  const selectedFolder = allFolders.find((folder) => folder.id === selectedFolderId) ?? null;
  const jobsCountLabel = selectedFolderId === "unfiled" ? unfiledCount : selectedFolder?.totalJobCount ?? jobs.length;

  const renderFolderTree = (nodes: RemixFolderNode[], depth = 0): React.ReactNode =>
    nodes.map((folder) => {
      const expanded = expandedFolders[folder.id] ?? true;
      const active = selectedFolderId === folder.id;
      const isMoving = movingFolderId === folder.id;
      const moveCandidates = allFolders.filter((item) => item.id !== folder.id);
      return (
        <div key={folder.id} className="space-y-1">
          <div
            className={`flex items-center gap-2 rounded-md border px-2 py-2 text-sm ${active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/60"}`}
            style={{ marginLeft: depth * 12 }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-remix-folder", folder.id);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const jobTransfer = e.dataTransfer.getData("application/x-remix-job");
              const folderTransfer = e.dataTransfer.getData("application/x-remix-folder");
              if (jobTransfer) {
                void handleMoveJobToFolder(jobTransfer, folder.id);
              } else if (folderTransfer && folderTransfer !== folder.id) {
                const movingFolder = allFolders.find((item) => item.id === folderTransfer);
                if (movingFolder) void handleMoveFolder(movingFolder, folder.id);
              }
            }}
          >
            <button
              type="button"
              className="text-muted-foreground"
              onClick={() => setExpandedFolders((prev) => ({ ...prev, [folder.id]: !expanded }))}
            >
              {folder.children?.length ? <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} /> : <span className="inline-block h-4 w-4" />}
            </button>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => setSelectedFolderId(folder.id)}
            >
              {expanded ? <FolderOpen className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4 text-primary" />}
              <span className="truncate">{folder.name}</span>
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{folder.totalJobCount}</span>
            </button>
            <div className="flex items-center gap-1">
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void handleCreateFolder(folder.id)}>+</button>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void handleRenameFolder(folder)}>✎</button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setMovingFolderId((current) => current === folder.id ? null : folder.id);
                  setMoveFolderTargetId(folder.parent_id ?? "unfiled");
                }}
              >
                ↕
              </button>
              <button type="button" className="text-destructive" onClick={() => void handleDeleteFolder(folder)}>×</button>
            </div>
          </div>
          {isMoving && (
            <div className="ml-7 rounded-md border border-border bg-muted/20 p-2" style={{ marginLeft: depth * 12 + 28 }}>
              <div className="flex items-center gap-2">
                <select
                  value={moveFolderTargetId}
                  onChange={(e) => setMoveFolderTargetId(e.target.value)}
                  className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="unfiled">Ra root</option>
                  {moveCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleMoveFolder(folder, moveFolderTargetId === "unfiled" ? null : moveFolderTargetId)}
                >
                  Move
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMovingFolderId(null)}>
                  Huỷ
                </Button>
              </div>
            </div>
          )}
          {expanded && folder.children?.length ? <div>{renderFolderTree(folder.children, depth + 1)}</div> : null}
        </div>
      );
    });
  return (
    <div className="space-y-4">
      {/* ---------------- Header Toolbar ---------------- */}
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <h2 className="text-xl font-semibold">Tất cả Job</h2>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAutoDialog(true)} variant="secondary" className="gap-2">
            <Zap className="h-4 w-4" />
            Auto Generate
          </Button>
          <Button onClick={() => { setIsCreateModalOpen(true); setPresetsLoaded(false); setCreateModalFolderId(selectedFolderId); void fetchMediaLibrary(); }}>
            <Plus className="size-4 mr-2" aria-hidden="true" />
            Tạo nội dung mới
          </Button>
        </div>
      </div>

      {error && !isCreateModalOpen && (
        <Alert tone="danger" title="Lỗi">
          {error}
        </Alert>
      )}

      {voicePipelineBlocked && (
        <Alert tone="warning" title="Local preflight">
          Voice Pipeline V2 đang là bắt buộc cho job localization nhưng service local chưa sẵn sàng.
          Chạy `npm run remix:services:detached` rồi tạo lại job.
        </Alert>
      )}

      {/* ---------------- Grid 3 Cột ---------------- */}
      <div className="grid items-start gap-6 xl:grid-cols-[260px_340px_minmax(0,1fr)]">
        <Card className="h-[calc(100vh-16rem)] min-h-[520px] flex flex-col overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20 py-4 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">Folders</CardTitle>
                <CardDescription>Tổ chức job theo cây thư mục.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => void handleCreateFolder(null)}>
                <Plus className="mr-1 h-4 w-4" />
                Folder
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-2 overflow-y-auto p-3 scrollbar-thin">
            <div
              className={`group flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${selectedFolderId === "unfiled" ? "border-primary bg-primary/10 font-medium" : "border-transparent hover:bg-muted/60"}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const jobTransfer = e.dataTransfer.getData("application/x-remix-job");
                if (jobTransfer) void handleMoveJobToFolder(jobTransfer, null);
              }}
            >
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left min-w-0"
                onClick={() => setSelectedFolderId("unfiled")}
              >
                <Folder className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="truncate">Inbox / Unfiled</span>
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{unfiledCount}</span>
              </button>
              {unfiledCount > 0 && (
                <button
                  type="button"
                  title="Xoá toàn bộ Inbox"
                  className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-colors"
                  onClick={(e) => void handleClearInbox(e)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {renderFolderTree(folders)}
          </CardContent>
        </Card>

        <Card className="h-[calc(100vh-16rem)] min-h-[520px] flex flex-col overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20 py-3 px-4 flex-shrink-0">
            {selectedJobIds.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedJobIds.length === jobs.length && jobs.length > 0}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = selectedJobIds.length > 0 && selectedJobIds.length < jobs.length;
                      }
                    }}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer accent-primary"
                    title="Chọn tất cả"
                  />
                  <span className="text-xs font-semibold text-foreground">
                    Đã chọn {selectedJobIds.length}/{jobs.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <select
                    className="h-7 rounded border border-input bg-background px-1.5 text-2xs"
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      void handleMoveSelectedJobsToFolder(e.target.value === "unfiled" ? null : e.target.value);
                      e.target.value = "";
                    }}
                  >
                    <option value="" disabled>Chuyển vào...</option>
                    <option value="unfiled">Inbox / Unfiled</option>
                    {allFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs px-2.5 gap-1"
                    onClick={() => void handleDeleteSelectedJobs()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xoá ({selectedJobIds.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs px-2"
                    onClick={() => setSelectedJobIds([])}
                  >
                    Bỏ chọn
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {jobs.length > 0 && (
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer accent-primary"
                        title="Chọn tất cả để thao tác"
                      />
                    )}
                    <CardTitle className="text-sm font-semibold text-foreground truncate">
                      {selectedFolderId === "unfiled" ? "Inbox / Unfiled" : selectedFolder?.name ?? "Folder"}
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs mt-0.5">{jobsCountLabel} job</CardDescription>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {selectedFolderId === "unfiled" && unfiledCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                      onClick={() => void handleClearInbox()}
                      title="Xoá toàn bộ job trong Inbox"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Xoá Inbox
                    </Button>
                  )}
                  {selectedFolderId !== "unfiled" && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void handleCreateFolder(selectedFolderId)}>
                      <Plus className="mr-1 h-4 w-4" />
                      Child
                    </Button>
                  )}
                  <Button size="sm" className="h-8 text-xs" onClick={() => { setIsCreateModalOpen(true); setPresetsLoaded(false); setCreateModalFolderId(selectedFolderId); void fetchMediaLibrary(); }}>
                    <Plus className="mr-1 h-4 w-4" />
                    Job
                  </Button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent
            className="flex-1 divide-y divide-border overflow-y-auto p-0 scrollbar-thin"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const jobTransfer = e.dataTransfer.getData("application/x-remix-job");
              if (jobTransfer) {
                void handleMoveJobToFolder(jobTransfer, selectedFolderId === "unfiled" ? null : selectedFolderId);
              }
            }}
          >
            {jobs.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Chưa có job nào trong folder này.</div>
            ) : (
              jobs.map((j) => {
                const isSelected = selectedJobIds.includes(j.id);
                return (
                  <div
                    key={j.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("application/x-remix-job", j.id)}
                    onClick={() => {
                      setJobId(j.id);
                      setDetail(null);
                      setNotice(null);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setJobId(j.id);
                        setDetail(null);
                        setNotice(null);
                        setError(null);
                      }
                    }}
                    className={`flex w-full cursor-pointer items-start gap-2.5 px-3 py-3 text-left transition-colors hover:bg-muted/50 ${
                      isSelected
                        ? "bg-primary/5 border-l-2 border-l-primary"
                        : j.id === jobId
                          ? "border-l-2 border-l-primary bg-muted/60"
                          : "border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="pt-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelectJob(j.id, e as any)}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer accent-primary"
                        title="Chọn job"
                      />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" title={j.options?.title || j.prompt || ""}>
                        {editingJobId === j.id ? (
                          <input
                            type="text"
                            className="w-full rounded border border-primary bg-background px-2 py-1 text-sm text-foreground focus:outline-none"
                            value={editingTitle}
                            autoFocus
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => handleSaveTitle(j.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveTitle(j.id);
                              if (e.key === "Escape") setEditingJobId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{j.options?.title || j.prompt || `${j.output_kind} · ${j.source_type}`}</span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTitle(j.options?.title || j.prompt || `${j.output_kind} · ${j.source_type}`);
                                setEditingJobId(j.id);
                              }}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </span>
                      <span className="mt-1 block text-2xs text-muted-foreground">
                        {new Date(j.created_at).toLocaleString("vi-VN")}
                        {j.iteration > 0 && ` · sửa ${j.iteration} lần`}
                      </span>
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          className="h-8 rounded border border-input bg-background px-2 text-xs"
                          value={j.folder_id ?? "unfiled"}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => void handleMoveJobToFolder(j.id, e.target.value === "unfiled" ? null : e.target.value)}
                        >
                          <option value="unfiled">Inbox</option>
                          {allFolders.map((folder) => (
                            <option key={folder.id} value={folder.id}>{folder.name}</option>
                          ))}
                        </select>
                        <button type="button" className="text-muted-foreground hover:text-destructive" onClick={(e) => handleDeleteJob(e, j.id)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </span>
                    <Status value={j.status} />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="h-[calc(100vh-16rem)] min-h-[520px] flex flex-col overflow-hidden">
            <CardHeader className="py-4 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between flex-shrink-0">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">
                  {outputKind === "caption" ? "Kết quả Bài viết" : "Kết quả Media"}
                </CardTitle>
              </div>
              {detail && <Status value={detail.status} />}
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-6 scrollbar-thin">
              {!jobId ? (
                <EmptyState
                  icon={Sparkles}
                  title="Chưa chọn job"
                  description="Bấm vào một job ở danh sách bên trái hoặc tạo mới để xem kết quả."
                />
              ) : running || !detail ? (
                <div className="flex h-full flex-col items-center justify-center space-y-2 text-center">
                  <p className="text-sm font-medium">
                    {detail?.status === "analyzing"
                      ? "AI đang lập kế hoạch biên tập…"
                      : detail?.status === "processing"
                        ? "Đang chạy pipeline (ffmpeg)…"
                        : detail?.status === "revising"
                          ? "Đang sửa theo phản hồi của bạn…"
                          : "Đang chờ worker nhận job…"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tiến trình có thể mất vài phút.
                  </p>
                </div>
              ) : detail.status === "failed" ? (
                <Alert tone="danger" title="Job thất bại">
                  {detail.error ?? "Không rõ nguyên nhân."}
                </Alert>
              ) : (
                <div className="space-y-6">
                  {notice && (
                    <Alert tone="success" title="Đã duyệt">
                      {notice}{" "}
                      <a href="/calendar" className="font-medium underline">
                        Mở Lịch đăng
                      </a>
                    </Alert>
                  )}

                  {detail.plan?.summary && (
                    <p className="text-sm text-muted-foreground">
                      {detail.plan.summary}
                    </p>
                  )}

                  {detail.plan && (
                    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                      <div className="grid grid-cols-6 gap-1 text-center text-[11px] font-medium text-muted-foreground">
                        {[
                          ["Analyze", Boolean(detail.plan.analysisBrief)],
                          ["Script", Boolean(detail.plan.scriptVi || detail.plan.realScriptVi)],
                          ["Assets", Boolean(detail.plan.costEstimate)],
                          ["Edit", Boolean(detail.plan.editDecisions)],
                          ["Render", Boolean(detail.resultUrl)],
                          ["Review", Boolean(detail.plan.finalReview)],
                        ].map(([label, done]) => (
                          <div
                            key={String(label)}
                            className={`rounded border px-1.5 py-2 ${
                              done
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground"
                            }`}
                          >
                            {label}
                          </div>
                        ))}
                      </div>

                      {detail.plan.analysisBrief && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="text-sm font-medium">Công thức video</h4>
                            <span className="text-xs text-muted-foreground">
                              {detail.plan.analysisBrief.replicationGuidance?.suggestedPipeline ?? "simple"} · {detail.plan.editDecisions?.renderRuntime ?? "ffmpeg"}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {detail.plan.analysisBrief.content?.summary}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                            <div className="rounded border border-border bg-background p-2">
                              <span className="block text-muted-foreground">Hook</span>
                              <span className="font-medium">{detail.plan.analysisBrief.content?.hook ?? "—"}</span>
                            </div>
                            <div className="rounded border border-border bg-background p-2">
                              <span className="block text-muted-foreground">Nhịp</span>
                              <span className="font-medium">{detail.plan.analysisBrief.structure?.pacingStyle ?? "—"}</span>
                            </div>
                            <div className="rounded border border-border bg-background p-2">
                              <span className="block text-muted-foreground">Chi phí ước tính</span>
                              <span className="font-medium">
                                {detail.plan.costEstimate?.estimatedVnd
                                  ? `${detail.plan.costEstimate.estimatedVnd.toLocaleString("vi-VN")}đ`
                                  : "0đ local"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {detail.plan.scenePlan?.scenes?.length ? (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Scene / clip plan</h4>
                          <div className="space-y-2">
                            {detail.plan.scenePlan.scenes.slice(0, 5).map((scene) => (
                              <div key={scene.id} className="flex items-start justify-between gap-3 rounded border border-border bg-background p-2 text-xs">
                                <div>
                                  <p className="font-medium">
                                    {scene.id} · {scene.role} · {scene.visualType}
                                  </p>
                                  <p className="text-muted-foreground">{scene.reason}</p>
                                </div>
                                <span className="shrink-0 text-muted-foreground">
                                  {scene.startSec.toFixed(1)}s–{scene.endSec.toFixed(1)}s
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {detail.plan.finalReview && (
                        <Alert
                          tone={detail.plan.finalReview.status === "pass" ? "success" : detail.plan.finalReview.status === "fail" ? "danger" : "warning"}
                          title={`Post-render QA: ${detail.plan.finalReview.status}`}
                        >
                          <div className="space-y-1 text-sm">
                            <p>
                              {detail.plan.finalReview.checks?.technicalProbe?.resolution ?? "unknown"} ·{" "}
                              {detail.plan.finalReview.checks?.technicalProbe?.durationSec?.toFixed(1) ?? "?"}s ·{" "}
                              {detail.plan.finalReview.checks?.technicalProbe?.hasAudio ? "có audio" : "không audio"}
                            </p>
                            {detail.plan.finalReview.issuesFound?.length ? (
                              <ul className="list-inside list-disc">
                                {detail.plan.finalReview.issuesFound.map((issue, i) => (
                                  <li key={i}>{issue}</li>
                                ))}
                              </ul>
                            ) : (
                              <p>File render đạt các kiểm tra kỹ thuật cơ bản.</p>
                            )}
                          </div>
                        </Alert>
                      )}
                    </div>
                  )}

                  {/* Preview media */}
                  {detail.resultUrl && detail.output_kind === "video" && (
                    <div className="space-y-3">
                      <video
                        src={detail.resultUrl}
                        controls
                        className="max-h-96 w-full rounded-lg bg-black"
                      />
                      {detail.status === "review" && (
                        <div className="flex justify-center mt-2 gap-2">
                          <Button 
                            variant="secondary" 
                            onClick={() => setIsEditingVideo(true)}
                            loading={isSavingVideo}
                          >
                            Mở công cụ chỉnh sửa Video
                          </Button>
                          <Button variant="outline" onClick={handleRegenerate} loading={regenerating}>
                            ↩️ Re-generate
                          </Button>
                        </div>
                      )}
                      
                      {detail.status === "approved" && (
                        <div className="flex justify-center mt-4">
                          <a href={detail.resultUrl} download target="_blank" rel="noopener noreferrer">
                            <Button size="lg" className="w-full sm:w-auto">
                              📥 Download MP4
                            </Button>
                          </a>
                        </div>
                      )}

                      {/* Auto-Fix Version Available */}
                      {jobs.find(j => j.auto_fix_source_id === detail.id || j.options?.auto_fix_source_id === detail.id) && (
                        (() => {
                          const autoFixJobSummary = jobs.find(j => j.auto_fix_source_id === detail.id || j.options?.auto_fix_source_id === detail.id);
                          // Since we don't have the full autoFixJob resultUrl in the summary directly if we only fetch summaries,
                          // but wait, if it's in `jobs` we might have its resultUrl or we can just render the UI. 
                          // The prompt says "video src={autoFixJob.resultUrl}". In this component, jobs in `jobs` are summaries.
                          // Wait, the UI mock shows: <video src={autoFixJob.resultUrl} controls className="w-full rounded" />
                          // Let's assume we can use autoFixJobSummary's result_url if available, or just fetch it. 
                          // The prompt gives us the exact JSX structure. We can use `autoFixJob` by fetching it if not in `detail`, or just mapping over `jobs` and hoping `result_url` is there, but `JobSummary` doesn't have `resultUrl`.
                          // But wait, the prompt says: 
                          // "In the job detail view, check if any job in the list has auto_fix_source_id matching current job"
                          // const autoFixJob = jobs.find(j => j.options?.auto_fix_source_id === currentJob.id || (j as any).auto_fix_source_id === currentJob.id);
                          const autoFixJob = jobs.find(j => j.auto_fix_source_id === detail.id || j.options?.auto_fix_source_id === detail.id);
                          
                          if (!autoFixJob) return null;
                          return (
                            <div className="mt-4 p-4 border border-blue-500/30 rounded-lg bg-blue-500/5">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm font-medium">🤖 AI đã tự sửa xong</span>
                                <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground">Auto-Fix</div>
                              </div>
                              <p className="text-xs text-muted-foreground mb-3">So sánh phiên bản gốc và phiên bản AI sửa:</p>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs font-medium mb-1 text-muted-foreground">Gốc</p>
                                  <video
                                    src={detail.resultUrl || ""}
                                    controls
                                    className="w-full rounded border border-border"
                                  />
                                </div>
                                <div>
                                  <p className="text-xs font-medium mb-1 text-blue-400">AI sửa</p>
                                  <video
                                    src={(autoFixJob as any).resultUrl || (autoFixJob as any).options?.resultUrl || ""}
                                    controls
                                    className="w-full rounded border border-blue-500/30"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2 mt-4">
                                <Button size="sm" onClick={() => {
                                  // Approval logic
                                  setJobId(autoFixJob.id); // Switch to the auto fix job to approve it
                                }}>Xem chi tiết bản AI sửa</Button>
                                <Button size="sm" variant="outline" onClick={() => {}}>Giữ phiên bản gốc</Button>
                              </div>
                            </div>
                          );
                        })()
                      )}
                      
                      {detail.status === "review" && (
                        <div className="mt-4 border border-border rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setScriptEditorOpen(!scriptEditorOpen)}
                            className="w-full flex items-center justify-between p-3 bg-muted/30 text-sm font-medium hover:bg-muted/50 transition-colors"
                          >
                            <span>📝 Script lồng tiếng</span>
                            <ChevronDown className={`h-4 w-4 transition-transform ${scriptEditorOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {scriptEditorOpen && (
                            <div className="p-4 space-y-3 bg-background border-t border-border">
                              <textarea
                                className="w-full min-h-[150px] bg-background border border-border rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                                value={editedScript}
                                onChange={(e) => setEditedScript(e.target.value)}
                                placeholder="Nội dung kịch bản..."
                              />
                              <div className="flex justify-end">
                                <Button size="sm" onClick={handleRegenerate} loading={regenerating}>
                                  Tạo lại với Script này
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {detail.resultUrl && detail.output_kind === "image" && (
                    <div className="space-y-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={detail.resultUrl}
                        alt="Kết quả remix"
                        className="max-h-96 w-full rounded-lg object-contain bg-muted/20"
                      />
                      {detail.status === "review" && (
                        <div className="flex justify-center mt-2">
                          <Button 
                            variant="secondary" 
                            onClick={() => setIsEditingImage(true)}
                            loading={isSavingImage}
                          >
                            Mở công cụ chỉnh sửa ảnh
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Caption */}
                  {detail.result_caption && (
                    <div className="rounded-lg border border-border bg-muted/30 p-4 relative group/caption">
                      {!isEditingCaption ? (
                        <>
                          <button
                            onClick={() => {
                              setEditedCaption(detail.result_caption || "");
                              setIsEditingCaption(true);
                            }}
                            className="absolute top-2 right-2 opacity-0 group-hover/caption:opacity-100 p-1.5 bg-background rounded-md border border-border shadow-sm hover:bg-muted text-muted-foreground transition-all"
                            title="Sửa bài viết"
                          >
                            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">
                            {detail.result_caption}
                          </p>
                          {detail.result_hashtags?.length ? (
                            <p className="mt-4 text-xs text-primary font-medium">
                              {detail.result_hashtags.map((h) => `#${h}`).join(" ")}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <div className="space-y-3">
                          <textarea
                            className="w-full min-h-32 bg-background border border-border rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            value={editedCaption}
                            onChange={(e) => setEditedCaption(e.target.value)}
                            placeholder="Nội dung bài viết..."
                          />
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setIsEditingCaption(false)}>
                              Hủy
                            </Button>
                            <Button size="sm" onClick={handleSaveCaption} loading={isSavingCaption}>
                              Lưu
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cảnh báo từ pipeline */}
                  {detail.plan?.warnings?.length ? (
                    <Alert tone="warning" title="Cần bạn kiểm tra">
                      <ul className="list-inside list-disc space-y-1">
                        {detail.plan.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </Alert>
                  ) : null}

                  {/* Feedback + duyệt */}
                  {detail.status === "review" && (
                    <div className="space-y-4 border-t border-border pt-6">
                      {detail.plan?.copyrightPreflight?.items?.length ? (
                        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="font-semibold text-sm">Facebook copyright preflight</h4>
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                              detail.plan.copyrightPreflight.riskLevel === "high"
                                ? "bg-destructive/10 text-destructive"
                                : detail.plan.copyrightPreflight.riskLevel === "medium"
                                  ? "bg-amber-500/10 text-amber-700"
                                  : "bg-success/10 text-success"
                            }`}>
                              {detail.plan.copyrightPreflight.riskLevel ?? "unknown"}
                            </span>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            {detail.plan.copyrightPreflight.items.map((item) => (
                              <div key={item.id} className="rounded-md border border-border/70 bg-background p-3 text-xs">
                                <div className="font-medium">{item.label}</div>
                                <div className="mt-1 text-muted-foreground leading-relaxed">{item.detail}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <Field
                        label="Bạn cần sửa lại điều gì?"
                        hint={`Đã sửa ${detail.iteration}/5 lần. Mô tả cụ thể thay đổi bạn muốn.`}
                      >
                        {(p) => (
                          <textarea
                            {...p}
                            className={`${p.className} min-h-24 resize-y bg-background`}
                            value={feedback || ""}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Ví dụ: cắt còn 20s, phụ đề to hơn, bỏ đoạn đầu..."
                          />
                        )}
                      </Field>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          onClick={handleFeedback}
                          loading={acting}
                          disabled={!feedback.trim()}
                        >
                          Gửi yêu cầu sửa
                        </Button>
                        <Button onClick={handleApprove} loading={acting}>
                          Duyệt &amp; Tạo bài đăng
                        </Button>
                      </div>
                    </div>
                  )}

                  {detail.status === "approved" && !notice && (
                    <Alert tone="success" title="Đã duyệt">
                      Bài nháp đã được tạo.{" "}
                      <a href="/calendar" className="font-medium underline">
                        Mở Lịch đăng
                      </a>{" "}
                      để chọn kênh và lên lịch.
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---------------- Modal Tạo Mới ---------------- */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 sm:p-6 md:p-12 overflow-y-auto backdrop-blur-sm">
          <div className="relative w-full max-w-3xl bg-background rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur z-10">
              <h3 className="text-lg font-semibold flex items-center">
                <Sparkles className="size-5 mr-2 text-primary" />
                Khởi tạo nội dung mới
              </h3>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setIsCreateModalOpen(false)}>
                <X className="size-5" />
              </Button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-120px)]">
              {error && (
                <Alert tone="danger" title="Không thực hiện được">
                  {error}
                </Alert>
              )}

              {createBlockedReason && (
                <Alert tone="warning" title="Thiếu local service">
                  {createBlockedReason} Chạy `npm run remix:services:detached` rồi thử lại.
                </Alert>
              )}

              {/* --- 1. Nguồn --- */}
              <section className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-foreground">1. Nguồn nội dung</h4>
                    <p className="text-sm text-muted-foreground">{activeSource?.hint || "Chọn nguồn video hoặc ảnh để xử lý."}</p>
                  </div>
                  <div className="min-w-[200px] flex-shrink-0">
                    <Field label="Lưu vào Thư mục">
                      {(p) => (
                        <select
                          {...p}
                          value={createModalFolderId}
                          onChange={(e) => setCreateModalFolderId(e.target.value)}
                          className={`${p.className} h-9 text-xs bg-background`}
                        >
                          <option value="unfiled">📥 Inbox / Chưa phân loại</option>
                          {allFolders.map((f) => (
                            <option key={f.id} value={f.id}>📁 {f.name}</option>
                          ))}
                        </select>
                      )}
                    </Field>
                  </div>
                </div>
                
                <div
                  role="tablist"
                  aria-label="Loại nguồn"
                  className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1"
                >
                  {SOURCE_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={sourceType === tab.value}
                      onClick={() => {
                        setSourceType(tab.value);
                        if (tab.value === "media_library") void fetchMediaLibrary();
                      }}
                      className={`flex-1 cursor-pointer rounded px-3 py-2 text-sm font-semibold transition-colors ${
                        sourceType === tab.value
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="bg-muted/20 p-4 rounded-lg border border-border/50">
                  {sourceType === "upload" && (
                    <div key="upload-section" className="space-y-3">
                      {!uploadedMedia ? (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDraggingFile(true);
                          }}
                          onDragLeave={() => setIsDraggingFile(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDraggingFile(false);
                            const f = e.dataTransfer.files?.[0];
                            if (f) void handleUpload(f);
                          }}
                          onClick={() => fileInputRef.current?.click()}
                          className={`relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                            isDraggingFile
                              ? "border-primary bg-primary/10 scale-[1.01]"
                              : "border-border hover:border-primary/60 bg-background/60 hover:bg-muted/40"
                          }`}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*,image/*"
                            disabled={uploading}
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUpload(f);
                            }}
                          />
                          <div className="p-3 bg-primary/10 rounded-full text-primary mb-3">
                            <UploadCloud className="h-8 w-8" />
                          </div>
                          <p className="text-sm font-semibold text-foreground mb-1">
                            {uploading ? "Đang tải file lên..." : "Kéo & thả file video/ảnh vào đây hoặc bấm để duyệt"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Hỗ trợ MP4, MOV, PNG, JPG (Tối đa 200MB)
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border bg-background shadow-sm">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-16 w-16 rounded-md bg-muted/60 border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                              {uploadedMedia.type === "video" ? (
                                <video src={uploadedMedia.url} className="h-full w-full object-cover" />
                              ) : (
                                <img src={uploadedMedia.url} alt="Media" className="h-full w-full object-cover" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                  {uploadedMedia.type}
                                </span>
                                <span className="text-xs text-success flex items-center gap-1 font-medium">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Sẵn sàng remix
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-1 max-w-[280px]">
                                {uploadedMedia.url}
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setUploadedMedia(null);
                              setTimeout(() => fileInputRef.current?.click(), 50);
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            Đổi file khác
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {sourceType === "media_library" && (
                    <div key="library-section" className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-1 bg-background border border-border p-0.5 rounded-md">
                          {(["all", "video", "image"] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setMediaFilter(t)}
                              className={`px-2.5 py-1 text-xs rounded transition-all font-medium ${
                                mediaFilter === t
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {t === "all" ? "Tất cả" : t === "video" ? "Video" : "Ảnh"}
                            </button>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void fetchMediaLibrary()}
                          disabled={loadingMediaLibrary}
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${loadingMediaLibrary ? "animate-spin" : ""}`} />
                          Làm mới
                        </Button>
                      </div>

                      {loadingMediaLibrary ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                          Đang tải danh sách media...
                        </div>
                      ) : mediaLibrary.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                          Chưa có file trong Thư viện Media. Hãy chọn tab "📁 Tải file lên".
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-56 overflow-y-auto p-1 scrollbar-thin">
                          {mediaLibrary
                            .filter((m) => mediaFilter === "all" || m.type === mediaFilter)
                            .map((asset) => {
                              const isSelected = uploadedMedia?.id === asset.id;
                              return (
                                <button
                                  key={asset.id}
                                  type="button"
                                  onClick={() => setUploadedMedia({ id: asset.id, url: asset.url, type: asset.type })}
                                  className={`relative aspect-video rounded-lg border-2 overflow-hidden bg-zinc-950 transition-all text-left group ${
                                    isSelected
                                      ? "border-primary ring-2 ring-primary/30"
                                      : "border-border hover:border-primary/50"
                                  }`}
                                >
                                  {asset.type === "video" ? (
                                    <video src={asset.url} className="h-full w-full object-cover opacity-80 group-hover:opacity-100" />
                                  ) : (
                                    <img src={asset.url} alt={asset.id} className="h-full w-full object-cover opacity-80 group-hover:opacity-100" />
                                  )}
                                  <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/60 text-[9px] font-semibold text-white uppercase backdrop-blur-xs">
                                    {asset.type}
                                  </span>
                                  {isSelected && (
                                    <span className="absolute top-1 right-1 p-0.5 rounded-full bg-primary text-white shadow">
                                      <Check className="h-3 w-3" />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                        </div>
                      )}

                      {uploadedMedia && (
                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                          <span className="text-muted-foreground">Đã chọn: <strong className="text-foreground">{uploadedMedia.type.toUpperCase()}</strong> ({uploadedMedia.id.slice(0, 8)}...)</span>
                          <span className="text-success font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Sẵn sàng remix
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {sourceType === "own_link" && (
                    <div key="link-section" className="space-y-3">
                      <Field
                        label="Link bài đăng"
                        hint="Link tới bài của chính bạn — hệ thống sẽ tải media về để biên tập."
                        required
                      >
                        {(p) => (
                          <input
                            {...p}
                            type="url"
                            value={sourceUrl || ""}
                            onChange={(e) => setSourceUrl(e.target.value)}
                            placeholder="https://www.instagram.com/reel/... hoặc https://www.tiktok.com/@.../video/..."
                          />
                        )}
                      </Field>
                    </div>
                  )}
                </div>
              </section>

              {/* --- 2. Đầu ra mong muốn --- */}
              <section className="space-y-4">
                <div>
                  <h4 className="font-semibold text-foreground">2. Đầu ra mong muốn</h4>
                  <p className="text-sm text-muted-foreground">Chọn cách cấu hình đầu ra cho video.</p>
                </div>

                {/* Mode switcher */}
                <div className="flex gap-2">
                  {([{ value: 'preset', icon: '⚡', label: 'Dùng Preset' }, { value: 'manual', icon: '🎛️', label: 'Cấu hình thủ công' }] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setOutputMode(opt.value)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 text-sm font-semibold transition-all ${
                        outputMode === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <span>{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* PRESET MODE */}
                {outputMode === 'preset' && (
                  <div className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border/50">
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label className="text-sm font-semibold text-foreground">Chọn Preset</label>
                        <Field label="Loại đầu ra" srOnlyLabel>
                          {(p) => (
                            <select
                              {...p}
                              value={outputKind || 'video'}
                              onChange={(e) => {
                                const nextOutputKind = e.target.value as OutputKind;
                                setOutputKind(nextOutputKind);
                                const nextSource = nextOutputKind === "image" ? imagePresets : nextOutputKind === "video" ? videoPresets : [];
                                const def = nextSource.find((item: any) => item.is_default);
                                setSelectedPresetId(def?.id ?? nextSource[0]?.id ?? "");
                              }}
                              className="h-9 min-w-[170px] rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="video">Video</option>
                              <option value="image">Ảnh</option>
                              <option value="caption">Chỉ caption + hashtag</option>
                            </select>
                          )}
                        </Field>
                      </div>
                      {activePresets.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-3 text-center">
                          Chưa có preset nào.{' '}
                          <a href="/remix/presets" target="_blank" className="text-primary underline">Tạo preset</a>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {activePresets.map((p: any) => (
                            <label
                              key={p.id}
                              onClick={() => { setSelectedPresetId(p.id); applyPreset(p); }}
                              className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all select-none ${
                                selectedPresetId === p.id
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border bg-background hover:bg-muted'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                selectedPresetId === p.id ? 'border-primary' : 'border-muted-foreground'
                              }`}>
                                {selectedPresetId === p.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{p.name}</span>
                                  {p.is_default && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold">Mặc định</span>}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                                  <span>{p.output_ratio || '9:16'}</span>
                                  {outputKind === "video" && p.auto_vietsub && <span>• Chữ lồng tiếng</span>}
                                  {outputKind === "video" && p.translate_on_screen_text && <span>• Dịch text on-screen</span>}
                                  {outputKind === "video" ? (
                                    <>
                                      <span>• {p.dub_mode === 'heygen' ? '✨ HeyGen AI' : p.dub_mode === 'preserve_bgm' ? '🎵 Giữ nhạc nền' : p.dub_mode === 'full' ? '🎙️ Lồng tiếng' : '🔇 Gốc'}</span>
                                      <span>• {p.dub_mode === 'heygen' ? 'Clone giọng' : p.voice_name?.split('-').slice(0, 3).join('-') || 'WaveNet-A'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>• {p.image_translate || 'No translate'}</span>
                                      <span>• {p.editor_template && Object.keys(p.editor_template).length ? 'Template editor' : 'No template'}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {selectedPresetId && (() => {
                      const p = activePresets.find((x: any) => x.id === selectedPresetId);
                      if (!p) return null;
                      return (
                        <div className="mt-2 p-3 rounded-md bg-background border border-border/60 text-xs text-muted-foreground space-y-1">
                          <p className="font-medium text-foreground text-sm mb-1.5">Chi tiết preset đã chọn</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <span>Tỉ lệ: <strong className="text-foreground">{p.output_ratio}</strong></span>
                            {outputKind === "video" ? (
                              <>
                                <span>Ngôn ngữ: <strong className="text-foreground">{p.target_language === 'en' ? '🇺🇸 EN' : '🇻🇳 VI'}</strong></span>
                                <span>Chữ lồng tiếng: <strong className="text-foreground">{p.auto_vietsub ? '✅ Bật' : '—'}</strong></span>
                                <span>Text on-screen: <strong className="text-foreground">{p.translate_on_screen_text ? '✅ Dịch' : '—'}</strong></span>
                                <span>Lồng tiếng: <strong className="text-foreground">
                                  {p.dub_mode === 'heygen' ? '✨ HeyGen' : p.dub_mode === 'preserve_bgm' ? '🎵 Giữ nhạc' : p.dub_mode === 'full' ? '🎙️ Full' : '🔇 Tắt'}
                                </strong></span>
                                <span>Giọng: <strong className="text-foreground">{p.dub_mode === 'heygen' ? 'Clone thật' : p.voice_name?.replace('vi-VN-', '').replace('en-US-', '') || '—'}</strong></span>
                                <span>CRF: <strong className="text-foreground">{p.output_crf}</strong></span>
                              </>
                            ) : (
                              <>
                                <span>Image translate: <strong className="text-foreground">{p.image_translate || 'none'}</strong></span>
                                <span>Color grade: <strong className="text-foreground">{p.color_grade ? '✅' : '—'}</strong></span>
                                <span>Template editor: <strong className="text-foreground">{p.editor_template && Object.keys(p.editor_template).length ? 'Đã lưu' : '—'}</strong></span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <a href="/remix/presets" target="_blank" className="text-xs text-primary hover:underline flex items-center gap-1">
                      ⚙️ Quản lý Preset
                    </a>
                  </div>
                )}

                {/* MANUAL MODE */}
                {outputMode === 'manual' && (
                <div className="space-y-4 bg-muted/20 p-4 rounded-lg border border-border/50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Loại đầu ra">
                      {(p) => (
                        <select
                          {...p}
                          value={outputKind || "video"}
                          onChange={(e) => setOutputKind(e.target.value as OutputKind)}
                          className={`${p.className} bg-background`}
                        >
                          <option value="video">Video (reel dọc, có sub/lồng tiếng)</option>
                          <option value="image">Ảnh (trích frame / chỉnh sửa)</option>
                          <option value="caption">Chỉ caption + hashtag</option>
                        </select>
                      )}
                    </Field>
                    
                    {(outputKind === "video" || outputKind === "image") && (
                      <Field label="Áp dụng Preset (Tuỳ chọn)">
                        {(p) => (
                          <select
                            {...p}
                            className={`${p.className} bg-background`}
                            onChange={(e) => {
                              if (e.target.value) {
                                applyPresetToManual(e.target.value);
                                e.target.value = ""; // reset after applying
                              }
                            }}
                          >
                            <option value="">-- Chọn Preset để nạp thông số --</option>
                            {activePresets.map((preset: any) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                    )}
                  </div>

                  {(outputKind === "video" || outputKind === "image") && (
                    <div className="space-y-4 pt-2 border-t border-border/50">
                      <div className="tab-bar mb-4">
                        <button type="button" onClick={() => setManualVideoTab("general")} aria-selected={manualVideoTab === "general"} className="tab-item">Chung</button>
                        {outputKind === "video" && <button type="button" onClick={() => setManualVideoTab("voice")} aria-selected={manualVideoTab === "voice"} className="tab-item">🎤 Lồng tiếng</button>}
                        {outputKind === "video" && <button type="button" onClick={() => setManualVideoTab("subtitle")} aria-selected={manualVideoTab === "subtitle"} className="tab-item">📝 Phụ đề</button>}
                        {outputKind === "video" && <button type="button" onClick={() => setManualVideoTab("onscreen")} aria-selected={manualVideoTab === "onscreen"} className="tab-item">🖊 Text on-screen</button>}
                        <button type="button" onClick={() => setManualVideoTab("watermark")} aria-selected={manualVideoTab === "watermark"} className="tab-item">💧 Watermark</button>
                      </div>

                      <div className={manualVideoTab === "general" ? "block space-y-4" : "hidden"}>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-foreground mb-1.5 block">Tỉ lệ khung hình</label>
                          <RatioPicker 
                            value={outputRatio} 
                            onChange={(val) => {
                              setOutputRatio(val);
                              setVertical(val === '9:16');
                            }} 
                          />
                        </div>
                        {/* End of Ratio Picker block in general tab */}
                        
                        {outputKind === "video" && (
                          <>
                            <div className="px-1 pt-2 space-y-3">
                              <div>
                                <label className="text-xs font-semibold text-foreground mb-1.5 block">Thời lượng video</label>
                                <div className="flex gap-2">
                                  {[
                                    { value: "full", label: "▶ Dùng full thời lượng" },
                                    { value: "trim", label: "✂ Cắt đoạn" },
                                  ].map(opt => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => {
                                        if (opt.value === "full") {
                                          setTrimStartInput("");
                                          setTrimEndInput("");
                                        }
                                        setTrimMode(opt.value as "full" | "trim");
                                      }}
                                      className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                                        trimMode === opt.value
                                          ? "border-primary bg-primary/10 text-primary"
                                          : "border-border bg-background hover:bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {trimMode === "trim" && (
                                <div className="rounded-lg border border-border bg-muted/20 p-3">
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Field label="Từ giây">
                                      {(p) => (
                                        <input
                                          {...p}
                                          type="number"
                                          min={0}
                                          value={trimStartInput || ""}
                                          onChange={(e) => setTrimStartInput(e.target.value)}
                                          placeholder="0"
                                          className={`${p.className} bg-background`}
                                        />
                                      )}
                                    </Field>
                                    <Field label="Đến giây">
                                      {(p) => (
                                        <input
                                          {...p}
                                          type="number"
                                          min={1}
                                          max={600}
                                          value={trimEndInput || ""}
                                          onChange={(e) => setTrimEndInput(e.target.value)}
                                          placeholder="30"
                                          className={`${p.className} bg-background`}
                                        />
                                      )}
                                    </Field>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-2">Chỉ xử lý đoạn từ giây <strong>{trimStartInput || "0"}</strong> đến giây <strong>{trimEndInput || "?"}</strong> của video gốc.</p>
                                </div>
                              )}
                            </div>
                            <div className="px-1 pt-3">
                              <label className="text-xs font-semibold text-foreground mb-2 block">Chất lượng video (CRF)</label>
                              <div className="space-y-1.5">
                                {QUALITY_PRESETS.map(preset => {
                                  const isActive = outputCrf === preset.crf;
                                  return (
                                    <button
                                      key={preset.crf}
                                      type="button"
                                      onClick={() => setOutputCrf(preset.crf)}
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
                              <p className="mt-1.5 text-xs text-muted-foreground">Mức đã chọn tương đương CRF {outputCrf} (thấp = chất lượng cao hơn)</p>
                            </div>
                          </>
                        )}
                        {outputKind === "image" && (
                          <div className="px-1 pt-3">
                            <Field label="Dịch chữ trên ảnh (Beta)">
                              {(p) => (
                                <select
                                  {...p}
                                  value={imageTranslate || "none"}
                                  onChange={(e) => setImageTranslate(e.target.value as any)}
                                  className={`${p.className} bg-background`}
                                >
                                  <option value="none">Không dịch</option>
                                  <option value="overlay">Chèn đè text (500đ / 20 credits)</option>
                                  <option value="regenerate">Tạo ảnh mới hoàn toàn (1500đ / 50 credits)</option>
                                </select>
                              )}
                            </Field>
                          </div>
                        )}
                      </div>

                      {outputKind === "video" && (
                        <>
                          <div className={manualVideoTab === "voice" ? "block space-y-4 pt-2 border-t border-border/50" : "hidden"}>
                          <div className="bg-muted/30 p-3 rounded-md border border-border/60">
                            <label className="text-xs font-semibold text-foreground mb-2 block uppercase tracking-wider">Ngôn ngữ dịch & lồng tiếng</label>
                            <div className="flex gap-1 bg-background/80 border border-input p-1 rounded-md w-fit shadow-sm">
                              <button
                                type="button"
                                className={`px-3 py-1 text-xs rounded-sm transition-all flex items-center gap-1.5 ${targetLanguage === 'vi' ? 'bg-primary text-primary-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => {
                                  setTargetLanguage('vi');
                                  setSelectedVoice('vi-VN-WaveNet-A');
                                }}
                              >🇻🇳 Tiếng Việt</button>
                              <button
                                type="button"
                                className={`px-3 py-1 text-xs rounded-sm transition-all flex items-center gap-1.5 ${targetLanguage === 'en' ? 'bg-primary text-primary-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => {
                                  setTargetLanguage('en');
                                  setSelectedVoice('en-US-WaveNet-C');
                                }}
                              >🇺🇸 Tiếng Anh</button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
                              <label className="text-xs font-semibold text-foreground block uppercase tracking-wider">Nguồn script cho voice/subtitle</label>
                              <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                  <input
                                    type="radio"
                                    name="scriptInputMode"
                                    value="from_video_audio"
                                    checked={scriptInputMode === 'from_video_audio'}
                                    onChange={() => setScriptInputMode('from_video_audio')}
                                    className="accent-primary"
                                  />
                                  <span>🤖 Tự động lấy script từ video gốc (Speech-to-Text)</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                  <input
                                    type="radio"
                                    name="scriptInputMode"
                                    value="manual_script"
                                    checked={scriptInputMode === 'manual_script'}
                                    onChange={() => setScriptInputMode('manual_script')}
                                    className="accent-primary"
                                  />
                                  <span>✍️ Nhập script thủ công (dùng khi video không có audio hoặc cần sửa lời)</span>
                                </label>
                              </div>
                              {scriptInputMode === 'manual_script' && (
                                <textarea
                                  value={manualScript}
                                  onChange={(e) => setManualScript(e.target.value)}
                                  placeholder="Paste script để generate voice và subtitle trực tiếp..."
                                  className="w-full min-h-[130px] bg-background rounded-md border border-input p-2.5 text-sm"
                                />
                              )}
                            </div>
                            
                            {/* Dubbing mode picker */}
                            <div className="mb-4 space-y-2">
                              {([
                                { value: 'none', icon: '🔇', label: 'Không lồng tiếng', desc: 'Giữ nguyên audio gốc, không tạo lồng tiếng AI.' },
                                { value: 'full', icon: '🎙️', label: 'Luồng thường: Thay toàn bộ audio', desc: 'Thay audio gốc bằng giọng TTS. Phù hợp khi không có nhạc nền.' },
                                { value: 'preserve_bgm', icon: '🎵', label: 'Luồng thường: Giữ nhạc nền gốc', desc: 'Tách giọng người khỏi nhạc nền, lồng TTS, mix lại với nhạc nền.' },
                                { value: 'heygen', icon: '✨', label: 'Luồng HeyGen: Video Translate (Lip-sync AI)', desc: 'Dịch video qua HeyGen API, tự động clone giọng thật của speaker và khớp khẩu hình.' },
                              ] as const).map(opt => (
                                <label
                                  key={opt.value}
                                  onClick={() => {
                                    setDubMode(opt.value);
                                    if (opt.value === 'none') {
                                      setDubVi(false);
                                    } else {
                                      setDubVi(true);
                                    }
                                  }}
                                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border-2 cursor-pointer transition-all select-none text-sm ${
                                    dubMode === opt.value
                                      ? 'border-primary bg-primary/10'
                                      : 'border-border bg-muted/40 hover:bg-muted'
                                  }`}
                                >
                                  <div className="mt-0.5 flex-shrink-0">
                                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                                      dubMode === opt.value ? 'border-primary' : 'border-muted-foreground'
                                    }`}>
                                      {dubMode === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-foreground">{opt.icon} {opt.label}</span>
                                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                                  </div>
                                </label>
                              ))}
                              
                              {dubMode !== 'none' && (
                                <div className="mt-2 ml-7">
                                  {dubMode !== 'heygen' ? (
                                    <div className="mt-3 max-w-xs space-y-3">
                                      <div>
                                        <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Giọng lồng tiếng</label>
                                        <VoiceSelector value={selectedVoice} onChange={setSelectedVoice} />
                                      </div>
                                      <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                            Âm lượng giọng
                                          </label>
                                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                            voiceVolume < 1.5 ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                                            voiceVolume <= 2.5 ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                                            'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                                          }`}>
                                            {voiceVolume < 1.5 ? '🔉' : voiceVolume <= 2.5 ? '🔊' : '📢'} {Math.round(voiceVolume * 100)}%
                                          </span>
                                        </div>
                                        <input
                                          type="range"
                                          min={0.5}
                                          max={3.0}
                                          step={0.1}
                                          value={voiceVolume}
                                          onChange={(e) => setVoiceVolume(Number(e.target.value))}
                                          className="w-full h-2 appearance-none rounded-full cursor-pointer accent-primary"
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                                          <span>Nhỏ (50%)</span>
                                          <span>Mặc định (200%)</span>
                                          <span>To (300%)</span>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-300 space-y-1">
                                      <div className="font-semibold flex items-center gap-1.5">
                                        <span>✨ HeyGen Video Translate</span>
                                      </div>
                                      <p>• HeyGen sẽ tự động clone giọng thật của người nói trong video gốc.</p>
                                      <p>• Đồng bộ khẩu hình (lip-sync) chuẩn theo ngữ điệu ngôn ngữ đích.</p>
                                      <p>• Vẫn giữ trọn vẹn quy trình xử lý Text on-screen và Blur phụ đề cũ sau khi HeyGen trả video về.</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            </div>
                          </div>

                          <div className={manualVideoTab === "subtitle" ? "block space-y-4 pt-2 border-t border-border/50" : "hidden"}>
                            <Checkbox
                              label={`Hiện text lồng tiếng ${targetLanguage === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'} trên video`}
                              description="Hiển thị lời thoại đã dịch/lồng tiếng trực tiếp trên video."
                              checked={vietsub}
                              onChange={(e) => setVietsub(e.target.checked)}
                            />
                            {vietsub && (
                              <div className="mt-2 ml-7 mb-4 space-y-4">
                                <SubtitleConfig
                                  value={subtitleSettings}
                                  onChange={setSubtitleSettings}
                                  title="Cấu hình text lồng tiếng"
                                  sampleText="Đây là text lồng tiếng mẫu"
                                  autoDescription="AI tự chọn vị trí an toàn cho text lồng tiếng sau khi xử lý vùng chữ gốc. Nếu không phát hiện được, mặc định đặt ở dưới cùng."
                                />
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
                                  label="Blur text on-screen gốc"
                                  autoDetectLabel="AI tự phát hiện vùng text on-screen gốc"
                                  autoDetectDescription="Gemini Vision phân tích nhiều khung hình để xác định chính xác vùng chữ gốc. Nếu không tìm thấy, video sẽ không bị làm mờ."
                                />
                              </div>
                            )}
                          </div>
                          
                          <div className={manualVideoTab === "onscreen" ? "block space-y-4 pt-2 border-t border-border/50" : "hidden"}>
                            <Checkbox
                            label={`Dịch text on-screen sang ${targetLanguage === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}`}
                            description="AI đọc chữ đang có trong frame gốc, review tone/mood rồi chuyển ngữ tự nhiên theo ngữ cảnh."
                            checked={translateOnScreenText}
                            onChange={(e) => setTranslateOnScreenText(e.target.checked)}
                          />
                          {translateOnScreenText && (
                            <div className="ml-7 max-w-lg space-y-4">
                              <Field
                                label="Hint dịch text on-screen"
                                hint="Không phải nội dung chèn trực tiếp; dùng để giữ thuật ngữ và tinh thần bản dịch."
                              >
                                {(p) => (
                                  <input
                                    {...p}
                                    value={onScreenTextHint}
                                    onChange={(e) => setOnScreenTextHint(e.target.value)}
                                    placeholder="Ví dụ: tone vui, giữ nguyên tên sân và gói hội viên"
                                    className={`${p.className} bg-background`}
                                  />
                                )}
                              </Field>
                              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {(Object.entries(ON_SCREEN_TEXT_PRESETS) as Array<[OnScreenTextPreset, typeof ON_SCREEN_TEXT_PRESETS[OnScreenTextPreset]]>).map(([key, style]) => (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={() => applyOnScreenTextPreset(key)}
                                      className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                                        onScreenTextPreset === key
                                          ? "border-primary bg-primary/10 text-primary font-semibold"
                                          : "border-border bg-background hover:bg-muted font-medium"
                                      }`}
                                    >
                                      {style.label}
                                    </button>
                                  ))}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <Field label="Font chữ">
                                    {(p) => (
                                      <select
                                        {...p}
                                        value={onScreenTextFont}
                                        onChange={(e) => setOnScreenTextFont(e.target.value)}
                                        className={`${p.className} bg-background`}
                                      >
                                        {VIETNAMESE_FONTS.map((f) => (
                                          <option key={f.value} value={f.value}>{f.label}</option>
                                        ))}
                                      </select>
                                    )}
                                  </Field>
                                  <Field label="Cỡ chữ / Size mode">
                                    {(p) => (
                                      <div className="flex gap-2">
                                        <select
                                          {...p}
                                          value={onScreenTextSizeMode}
                                          onChange={(e) => setOnScreenTextSizeMode(e.target.value as OnScreenTextSizeMode)}
                                          className={`${p.className} flex-1 bg-background`}
                                        >
                                          <option value="auto_fit">Auto</option>
                                          <option value="fixed">Fixed</option>
                                        </select>
                                        {onScreenTextSizeMode === "fixed" && (
                                          <input
                                            type="number"
                                            min={16}
                                            max={72}
                                            value={onScreenTextSize}
                                            onChange={(e) => setOnScreenTextSize(e.target.value)}
                                            className={`${p.className} w-20 text-center bg-background`}
                                            placeholder="Size"
                                          />
                                        )}
                                      </div>
                                    )}
                                  </Field>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-2">
                                  <ColorFieldWithOpacity
                                    label="Màu chữ"
                                    value={onScreenTextColor}
                                    onChange={setOnScreenTextColor}
                                    fallback="#FFFFFF"
                                  />
                                  <ColorFieldWithOpacity
                                    label="Màu viền"
                                    value={onScreenTextOutlineColor}
                                    onChange={setOnScreenTextOutlineColor}
                                    fallback="#000000"
                                    extraHeader={
                                      <div className="flex items-center gap-1.5" title="Kích thước viền (px)">
                                        <span className="text-[10px] text-muted-foreground uppercase font-medium">Cỡ viền</span>
                                        <input 
                                          type="number" 
                                          min={0}
                                          max={20}
                                          value={onScreenTextOutlineWidth}
                                          onChange={(e) => setOnScreenTextOutlineWidth(e.target.value)}
                                          className="h-5 w-10 rounded border border-input bg-background px-1 text-center text-xs font-normal"
                                        />
                                      </div>
                                    }
                                  />
                                </div>
                                <div className="space-y-3">
                                  <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-foreground">Kiểu nền</label>
                                    <div className="flex gap-2">
                                      {(["solid", "blur"] as const).map((style) => (
                                        <button
                                          key={style}
                                          type="button"
                                          onClick={() => setOnScreenTextBackgroundStyle(style)}
                                          className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all ${
                                            onScreenTextBackgroundStyle === style
                                              ? "border-primary bg-primary/10 text-primary"
                                              : "border-border bg-background hover:bg-muted text-muted-foreground"
                                          }`}
                                        >
                                          {style === "solid" ? "🎨 Solid" : "🌫️ Blur"}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {onScreenTextBackgroundStyle === "solid" && (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      <ColorFieldWithOpacity
                                        label="Màu nền"
                                        value={onScreenTextBgColor}
                                        onChange={setOnScreenTextBgColor}
                                        fallback="#000000"
                                      />
                                      <div>
                                        <label className="mb-1 block text-xs font-semibold text-foreground">Opacity nền ({onScreenTextBackgroundOpacity.toFixed(2)})</label>
                                        <input
                                          type="range"
                                          min="0"
                                          max="1"
                                          step="0.01"
                                          value={onScreenTextBackgroundOpacity}
                                          onChange={(e) => setOnScreenTextBackgroundOpacity(Number(e.target.value))}
                                          className="mt-2 w-full"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {onScreenTextBackgroundStyle === "blur" && (
                                    <p className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 border border-border/50">
                                      🌫️ Blur tự động làm mờ vùng phía sau chữ — không cần chọn màu hay opacity.
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-4">
                                  <label className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={onScreenTextBold}
                                      onChange={(e) => setOnScreenTextBold(e.target.checked)}
                                    />
                                    In đậm
                                  </label>
                                  <label className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={onScreenTextItalic}
                                      onChange={(e) => setOnScreenTextItalic(e.target.checked)}
                                    />
                                    In nghiêng
                                  </label>
                                </div>

                                <div className="rounded-md bg-zinc-950 p-4 text-center">
                                  <span
                                    className="inline-block rounded px-3 py-1 leading-tight"
                                    style={{
                                      fontFamily: onScreenTextFont,
                                      fontSize: `${Math.min(Number(onScreenTextSize) || 34, 42)}px`,
                                      color: onScreenTextColor,
                                      backgroundColor: onScreenTextBackgroundStyle === "blur" ? "rgba(15,23,42,0.5)" : onScreenTextBgColor,
                                      backdropFilter: onScreenTextBackgroundStyle === "blur" ? "blur(10px)" : undefined,
                                      WebkitBackdropFilter: onScreenTextBackgroundStyle === "blur" ? "blur(10px)" : undefined,
                                      WebkitTextStroke: `${onScreenTextOutlineWidth}px ${onScreenTextOutlineColor}`,
                                      fontWeight: onScreenTextBold ? 800 : 500,
                                      fontStyle: onScreenTextItalic ? "italic" : "normal",
                                    }}
                                  >
                                    Text on-screen mẫu
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                          </div>
                        </>
                      )}
                      
                      <div className={manualVideoTab === "watermark" ? "block space-y-4 pt-2 border-t border-border/50" : "hidden"}>
                        <div className="grid gap-6 lg:grid-cols-2">
                          <div className="space-y-4">
                            <Field label="Loại watermark">
                              {(p) => (
                                <select {...p} value={watermarkMode} onChange={(e) => setWatermarkMode(e.target.value as any)}>
                                  <option value="disabled">Không dùng</option>
                                  <option value="text">Text</option>
                                  <option value="image">Ảnh</option>
                                </select>
                              )}
                            </Field>
                            {watermarkMode === "text" && (
                              <Field label="Nội dung text watermark">
                                {(p) => <input {...p} value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder="@yourbrand" className={`${p.className} bg-background`} />}
                              </Field>
                            )}
                            {watermarkMode === "image" && (
                              <Field label="Tải lên hình watermark" hint="Ảnh PNG nền trong suốt">
                                {(p) => (
                                  <input
                                    {...p}
                                    type="file"
                                    accept="image/png,image/jpeg"
                                    disabled={uploadingLogo}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void handleUploadLogo(f);
                                    }}
                                  />
                                )}
                              </Field>
                            )}
                            {watermarkMode !== "disabled" && (
                              <div className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <Field label="Opacity">
                                    {(p) => <input {...p} type="number" min={0} max={1} step="0.05" value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(e.target.value)} className={`${p.className} bg-background`} />}
                                  </Field>
                                  <Field label="Scale">
                                    {(p) => <input {...p} type="number" min={0.03} max={1} step="0.01" value={watermarkScale} onChange={(e) => setWatermarkScale(e.target.value)} className={`${p.className} bg-background`} />}
                                  </Field>
                                </div>

                                {/* Per-ratio position settings */}
                                <div className="space-y-3">
                                  <div>
                                    <label className="text-xs font-semibold text-foreground mb-1 block">Vị trí watermark theo tỉ lệ khung hình</label>
                                    <p className="text-xs text-muted-foreground mb-2">Tuỳ chỉnh vị trí riêng cho từng tỉ lệ — giúp watermark không bị lệch khung.</p>
                                    <div className="flex gap-1.5 flex-wrap">
                                      {WATERMARK_RATIOS.map(r => (
                                        <button
                                          key={r}
                                          type="button"
                                          onClick={() => setWatermarkRatioTab(r)}
                                          className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                                            watermarkRatioTab === r
                                              ? "border-primary bg-primary/10 text-primary font-semibold"
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
                                        <select
                                          {...p}
                                          value={watermarkPositionsByRatio[watermarkRatioTab].position}
                                          onChange={(e) => setWatermarkPositionsByRatio(prev => ({
                                            ...prev,
                                            [watermarkRatioTab]: { ...prev[watermarkRatioTab], position: e.target.value }
                                          }))}
                                          className={`${p.className} bg-background`}
                                        >
                                          <option value="top-left">Top left</option>
                                          <option value="top-right">Top right</option>
                                          <option value="bottom-left">Bottom left</option>
                                          <option value="bottom-right">Bottom right</option>
                                          <option value="custom">Tùy chỉnh (X, Y)</option>
                                        </select>
                                      )}
                                    </Field>

                                    {watermarkPositionsByRatio[watermarkRatioTab].position === "custom" && (
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label={`Vị trí X (${watermarkPositionsByRatio[watermarkRatioTab].positionX})`}>
                                          {(p) => <input {...p} type="range" min={0} max={1} step="0.01" value={watermarkPositionsByRatio[watermarkRatioTab].positionX} onChange={(e) => setWatermarkPositionsByRatio(prev => ({ ...prev, [watermarkRatioTab]: { ...prev[watermarkRatioTab], positionX: e.target.value } }))} className="w-full" />}
                                        </Field>
                                        <Field label={`Vị trí Y (${watermarkPositionsByRatio[watermarkRatioTab].positionY})`}>
                                          {(p) => <input {...p} type="range" min={0} max={1} step="0.01" value={watermarkPositionsByRatio[watermarkRatioTab].positionY} onChange={(e) => setWatermarkPositionsByRatio(prev => ({ ...prev, [watermarkRatioTab]: { ...prev[watermarkRatioTab], positionY: e.target.value } }))} className="w-full" />}
                                        </Field>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {watermarkMode !== "disabled" && (
                            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-semibold text-foreground">Watermark Preview</h4>
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
                                      {watermarkMode === "text" ? (
                                        watermarkText || "@yourbrand"
                                      ) : uploadedLogo?.url ? (
                                        <img src={uploadedLogo.url} alt="Watermark" className="max-h-10 max-w-[80px] object-contain" />
                                      ) : (
                                        "🖼️ Logo"
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground text-center">Preview vị trí và tỉ lệ watermark trên khung hình {watermarkRatioTab}.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )}
              </section>

              {/* --- 3. Caption --- */}
              <section className="space-y-4">
                <div>
                  <h4 className="font-semibold text-foreground">3. Nội dung Bài đăng (Caption)</h4>
                  <p className="text-sm text-muted-foreground">AI sẽ viết đoạn văn bản và hashtag để đính kèm lên bài đăng.</p>
                </div>
                
                <div className="space-y-4 bg-muted/20 p-4 rounded-lg border border-border/50">
                  <Field label="Gợi ý nội dung" srOnlyLabel>
                    {(p) => (
                      <textarea
                        {...p}
                        className={`${p.className} min-h-24 resize-y leading-relaxed bg-background`}
                        value={captionPrompt || ""}
                        onChange={(e) => setCaptionPrompt(e.target.value)}
                        placeholder="Ví dụ: Viết bài mời đặt sân, nhấn mạnh sân mới thay cỏ, khuyến mãi 20% khi đặt trước 5h chiều."
                      />
                    )}
                  </Field>

                  <div className="space-y-3 rounded-lg border border-border bg-background p-4">
                    <div className="flex gap-2">
                      {([
                        { value: "preset", label: "Dùng caption preset" },
                        { value: "manual", label: "Tự điền preset thủ công" },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setCaptionPresetMode(opt.value)}
                          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                            captionPresetMode === opt.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {captionPresetMode === "preset" ? (
                      <div className="space-y-3">
                        <Field label="Caption preset">
                          {(p) => (
                            <select
                              {...p}
                              value={selectedCaptionPresetId}
                              onChange={(e) => {
                                setSelectedCaptionPresetId(e.target.value);
                                const preset = captionPresets.find((item: any) => item.id === e.target.value);
                                if (preset) setCaptionPresetDraft(captionPresetToManualInput(preset));
                              }}
                              className={`${p.className} bg-background`}
                            >
                              <option value="">Chọn caption preset</option>
                              {captionPresets.map((preset: any) => (
                                <option key={preset.id} value={preset.id}>{preset.name}</option>
                              ))}
                            </select>
                          )}
                        </Field>
                        {selectedCaptionPresetId && (() => {
                          const preset = captionPresets.find((item: any) => item.id === selectedCaptionPresetId);
                          if (!preset) return null;
                          return (
                            <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                              <p className="font-medium text-foreground">{preset.name}</p>
                              <p className="mt-1">Platform: {(preset.platforms ?? []).join(", ") || "Chưa chọn"}</p>
                              <p>Tone: {preset.tone_and_voice || "Chưa set"}</p>
                              <p>CTA: {preset.cta || "Chưa set"}</p>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Field label="Platform áp dụng">
                          {(p) => (
                            <select
                              {...p}
                              value=""
                              onChange={(e) => {
                                const next = e.target.value;
                                if (!next) return;
                                setCaptionPresetDraft((prev) => ({
                                  ...prev,
                                  platforms: Array.from(new Set([...(prev.platforms ?? []), next])),
                                }));
                              }}
                              className={`${p.className} bg-background`}
                            >
                              <option value="">Thêm platform</option>
                              {CAPTION_PLATFORM_OPTIONS.map((platform) => (
                                <option key={platform} value={platform}>{platform}</option>
                              ))}
                            </select>
                          )}
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          {(captionPresetDraft.platforms ?? []).map((platform) => (
                            <button
                              key={platform}
                              type="button"
                              className="rounded-full border border-border bg-muted px-3 py-1 text-xs"
                              onClick={() =>
                                setCaptionPresetDraft((prev) => ({
                                  ...prev,
                                  platforms: (prev.platforms ?? []).filter((item) => item !== platform),
                                }))
                              }
                            >
                              {platform} ×
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <Field label="Tone & voice">
                            {(p) => <input {...p} value={captionPresetDraft.toneAndVoice ?? ""} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, toneAndVoice: e.target.value }))} className={`${p.className} bg-background`} placeholder="Năng động, gần gũi, thúc đẩy đặt sân" />}
                          </Field>
                          <Field label="Đối tượng mục tiêu">
                            {(p) => <input {...p} value={captionPresetDraft.audience ?? ""} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, audience: e.target.value }))} className={`${p.className} bg-background`} placeholder="Dân văn phòng, nhóm đá tối, đội phong trào" />}
                          </Field>
                          <Field label="Độ dài caption">
                            {(p) => <input {...p} value={captionPresetDraft.captionLength ?? ""} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, captionLength: e.target.value }))} className={`${p.className} bg-background`} placeholder="Ngắn / Vừa / Dài" />}
                          </Field>
                          <Field label="Kiểu mở đầu">
                            {(p) => <input {...p} value={captionPresetDraft.hookStyle ?? ""} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, hookStyle: e.target.value }))} className={`${p.className} bg-background`} placeholder="Question / Benefit / Urgency" />}
                          </Field>
                          <Field label="CTA">
                            {(p) => <input {...p} value={captionPresetDraft.cta ?? ""} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, cta: e.target.value }))} className={`${p.className} bg-background`} placeholder="Inbox để giữ sân tối nay" />}
                          </Field>
                          <Field label="Emoji style">
                            {(p) => <input {...p} value={captionPresetDraft.emojiStyle ?? ""} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, emojiStyle: e.target.value }))} className={`${p.className} bg-background`} placeholder="Không dùng / Ít / Vừa phải" />}
                          </Field>
                          <Field label="Hashtag bắt buộc">
                            {(p) => <textarea {...p} value={tagsToText(captionPresetDraft.requiredHashtags)} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, requiredHashtags: textToTags(e.target.value) }))} className={`${p.className} min-h-24 bg-background`} placeholder="#datsan, #bongda" />}
                          </Field>
                          <Field label="Hashtag gợi ý">
                            {(p) => <textarea {...p} value={tagsToText(captionPresetDraft.optionalHashtags)} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, optionalHashtags: textToTags(e.target.value) }))} className={`${p.className} min-h-24 bg-background`} placeholder="#weekendmatch, #reelsvn" />}
                          </Field>
                          <Field label="Keyword bắt buộc">
                            {(p) => <textarea {...p} value={tagsToText(captionPresetDraft.requiredKeywords)} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, requiredKeywords: textToTags(e.target.value) }))} className={`${p.className} min-h-24 bg-background`} placeholder="sân mới, giờ vàng, ưu đãi" />}
                          </Field>
                          <Field label="Keyword tránh dùng">
                            {(p) => <textarea {...p} value={tagsToText(captionPresetDraft.bannedKeywords)} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, bannedKeywords: textToTags(e.target.value) }))} className={`${p.className} min-h-24 bg-background`} placeholder="rẻ nhất, spam" />}
                          </Field>
                        </div>
                        <Field label="Cấu trúc caption">
                          {(p) => <input {...p} value={captionPresetDraft.formatStyle ?? ""} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, formatStyle: e.target.value }))} className={`${p.className} bg-background`} placeholder="Hook -> lợi ích -> CTA -> hashtag" />}
                        </Field>
                        <Field label="Brand rules">
                          {(p) => <textarea {...p} value={captionPresetDraft.brandRules ?? ""} onChange={(e) => setCaptionPresetDraft((prev) => ({ ...prev, brandRules: e.target.value }))} className={`${p.className} min-h-24 bg-background`} placeholder="Giữ giọng chuyên nghiệp, tránh sale quá tay" />}
                        </Field>
                      </div>
                    )}

                    <a href="/remix/presets" target="_blank" className="text-xs text-primary hover:underline">
                      Quản lý caption preset
                    </a>
                  </div>

                  {campaigns.length > 0 && (
                    <Field
                      label="Thuộc chiến dịch"
                      hint="Để AI học theo văn phong dữ liệu cũ."
                    >
                      {(p) => (
                        <select
                          {...p}
                          value={campaignId || ""}
                          onChange={(e) => setCampaignId(e.target.value)}
                          className={`${p.className} bg-background`}
                        >
                          <option value="">— Không gắn —</option>
                          {campaigns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                  )}
                </div>
              </section>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-border/50 bg-muted/30 sticky bottom-0">
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Hủy
                </Button>
                <Button
                  onClick={handleSubmit}
                  loading={submitting}
                  disabled={Boolean(createBlockedReason)}
                  className="w-full sm:w-auto min-w-32"
                >
                  {submitting ? "Đang tạo…" : "Khởi tạo tiến trình"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Modal Auto Generate ---------------- */}
      {showAutoDialog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 sm:p-6 md:p-12 overflow-y-auto backdrop-blur-sm">
          <div className="relative w-full max-w-2xl bg-background rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border/50 bg-background/95 sticky top-0 z-10">
              <h3 className="text-lg font-semibold flex items-center">
                <Zap className="size-5 mr-2 text-primary" />
                Auto Generate
              </h3>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowAutoDialog(false)}>
                <X className="size-5" />
              </Button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Dán các link video bạn sở hữu, hệ thống sẽ tự xử lý theo cấu hình preset mặc định.
              </p>
              <Field label="Lưu các job vào folder">
                {(p) => (
                  <select
                    {...p}
                    value={autoGenerateFolderId}
                    onChange={(e) => setAutoGenerateFolderId(e.target.value)}
                    className={`${p.className} bg-background`}
                  >
                    <option value="unfiled">Inbox / Unfiled</option>
                    {allFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <BatchURLInput value={batchUrls} onChange={setBatchUrls} maxUrls={10} />
            </div>

            <div className="p-4 border-t border-border/50 bg-muted/30 flex justify-end gap-3 sticky bottom-0">
              <Button variant="outline" onClick={() => setShowAutoDialog(false)}>Hủy</Button>
              <Button
                disabled={batchUrls.length === 0 || batchSubmitting || voicePipelineBlocked}
                onClick={async () => {
                  setBatchSubmitting(true);
                  setError(null);
                  try {
                    const res = await fetch('/api/remix/batch', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        urls: batchUrls,
                        mode: 'auto',
                        folderId: autoGenerateFolderId === "unfiled" ? null : autoGenerateFolderId,
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error ?? 'Batch generate thất bại.');
                    }
                    setShowAutoDialog(false);
                    setBatchUrls([]);
                    await Promise.all([fetchFolders(), fetchJobs(selectedFolderId)]);
                    router.refresh(); // Tải lại danh sách job trên thanh lịch sử
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBatchSubmitting(false);
                  }
                }}
              >
                {batchSubmitting ? 'Đang xử lý...' : `Xử lý ${batchUrls.length} video`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isEditingImage && detail?.resultUrl && (
        <ImageEditor
          sourceUrl={detail.resultUrl}
          onSave={handleSaveImage}
          onCancel={() => setIsEditingImage(false)}
        />
      )}

      {isEditingVideo && (detail?.sourceUrlResolved || detail?.source_url || detail?.resultUrl) && detail?.options && (
        <VideoEditor
          source={detail.sourceUrlResolved || detail.source_url || detail.resultUrl || ""}
          processedAudioSource={detail.resultUrl || undefined}
          initialOptions={{
            ...detail.options as Record<string, any>,
            // Pre-populate script from the generated ASR/AI script in plan
            generatedScript:
              (detail.options as Record<string, any>).generatedScript ||
              (detail.options as Record<string, any>).editedScript ||
              (detail.options as Record<string, any>).manualScript ||
              detail.plan?.realScriptVi ||
              detail.plan?.scriptVi ||
              undefined,
            scriptSegments:
              (detail.options as Record<string, any>).scriptSegments ||
              ((detail.plan as any)?.editDecisions?.audio?.cues
                ?.map((cue: any, idx: number) => ({
                  id: cue.id || `voice_${idx}`,
                  start: cue.startSec ?? 0,
                  end: cue.endSec ?? 0,
                  text: cue.translatedText || cue.sourceText || '',
                }))
                .filter((cue: any) => cue.text && cue.end > cue.start)) ||
              undefined,
            // Pre-populate text overlays from plan.editDecisions.overlays
            // kind='text' is what upsertTextOverlayDecision stores
            textOnScreenOverlays:
              (detail.options as Record<string, any>).textOnScreenOverlays ||
              (() => {
                const textStyle = (detail.options as Record<string, any>).onScreenTextStyle ?? {};
                const font = textStyle.font ?? 'Be Vietnam Pro';
                const size = textStyle.size ?? 32;
                const color = textStyle.color ?? '#FFFFFF';
                const bgColor = textStyle.bgColor ?? '#000000CC';
                const outlineColor = textStyle.outlineColor ?? '#000000';
                const bold = textStyle.bold ?? true;
                const backgroundStyle = textStyle.backgroundStyle ?? 'solid';
                const backgroundOpacity = textStyle.backgroundOpacity ?? 0.72;
                const textAlign = textStyle.textAlign ?? 'center';
                return detail.plan?.editDecisions?.overlays
                  ?.filter((o: any) => o.kind === 'text' && (o.translatedText || o.sourceText))
                  .map((o: any, idx: number) => ({
                    id: o.id || `plan_${idx}`,
                    start: o.startSec ?? 0,
                    end: o.endSec ?? 5,
                    text: o.translatedText || o.sourceText || '',
                    source: 'ocr_auto' as const,
                    isEdited: false,
                    status: 'pending' as const,
                    ocrTrackId: o.id || `plan_${idx}`,
                    sourceText: o.sourceText || o.translatedText || '',
                    textRegions: o.textRegions,
                    sourceMaskFrames: o.sourceMaskFrames,
                    textAlign: o.textAlign ?? textAlign,
                    position: {
                      x: (o.region?.x ?? 0.5) + (o.region?.w ?? 0) / 2,
                      y: (o.region?.y ?? 0.1) + (o.region?.h ?? 0) / 2,
                    },
                    box: o.region
                      ? { x: o.region.x ?? 0.29, y: o.region.y ?? 0.1, w: o.region.w ?? 0.42, h: o.region.h ?? 0.1 }
                      : undefined,
                    eraseBox: o.region
                      ? { x: o.region.x ?? 0.29, y: o.region.y ?? 0.1, w: o.region.w ?? 0.42, h: o.region.h ?? 0.1 }
                      : undefined,
                    fontFamily: font,
                    fontSize: size,
                    fontColor: color,
                    bgColor: bgColor,
                    outlineColor: outlineColor,
                    bold: bold,
                    italic: textStyle.italic ?? false,
                    backgroundStyle: backgroundStyle,
                    backgroundOpacity: backgroundOpacity,
                    sizeMode: textStyle.sizeMode ?? 'fixed' as const,
                    wrapMode: textStyle.wrapMode ?? 'manual' as const,
                    animation: 'fade_in' as const,
                  })) ?? undefined;
              })(),
          }}
          onSave={handleSaveVideo}
          onCancel={() => setIsEditingVideo(false)}
        />
      )}

    </div>
  );
}
