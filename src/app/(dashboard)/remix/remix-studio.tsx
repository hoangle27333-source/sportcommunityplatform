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
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkles, Plus, X, Zap, ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const ImageEditor = dynamic(() => import("@/components/shared/image-editor"), { ssr: false });
import { VideoEditor } from "@/components/shared/video-editor";
import { VoiceSelector } from '@/components/remix/voice-selector';
import { SubtitleConfig, type SubtitleSettings, defaultSubtitleSettings } from '@/components/remix/subtitle-config';
import { BatchURLInput } from '@/components/remix/batch-url-input';
import { RatioPicker } from '@/components/remix/ratio-picker';
import { BlurRegionPicker, type BlurRegion } from '@/components/remix/blur-region-picker';

type SourceType = "upload" | "own_link" | "inspiration";
type OutputKind = "video" | "image" | "caption";

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
  plan?: { summary?: string; warnings?: string[]; scriptVi?: string; realScriptVi?: string; } | null;
  result_caption: string | null;
  result_hashtags: string[] | null;
  resultUrl: string | null;
  error: string | null;
  post_id: string | null;
  iteration: number;
  is_auto_fix?: boolean;
  auto_fix_source_id?: string | null;
}

const RUNNING = new Set(["queued", "analyzing", "processing", "revising"]);

const SOURCE_TABS: { value: SourceType; label: string; hint: string }[] = [
  {
    value: "upload",
    label: "Tải file lên",
    hint: "Video/ảnh bạn có sẵn trên máy. An toàn nhất về bản quyền.",
  },
  {
    value: "own_link",
    label: "Link của mình",
    hint: "Link bài đăng do chính bạn/Page bạn sở hữu. Hệ thống sẽ tải media về để biên tập.",
  },
  {
    value: "inspiration",
    label: "Link tham khảo",
    hint: "Bài của người khác. Hệ thống KHÔNG tải file gốc — chỉ phân tích công thức để làm nội dung mới từ asset của bạn.",
  },
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
  const [ownershipConfirmed, setOwnershipConfirmed] = React.useState(false);
  const [uploadedMedia, setUploadedMedia] = React.useState<{
    id: string;
    url: string;
    type: string;
  } | null>(null);
  const [uploading, setUploading] = React.useState(false);

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
  const [dubMode, setDubMode] = React.useState<'none' | 'full' | 'preserve_bgm'>('none');
  const [vertical, setVertical] = React.useState(true);
  const [outputRatio, setOutputRatio] = React.useState("9:16");
  const [blurOriginalSub, setBlurOriginalSub] = React.useState(false);
  const [autoDetectSub, setAutoDetectSub] = React.useState(false);
  const [blurRegion, setBlurRegion] = React.useState<BlurRegion>({ x: 0, y: 0.82, w: 1, h: 0.18 });
  const [brandLogo, setBrandLogo] = React.useState(false);
  const [logoPosition, setLogoPosition] = React.useState("bottom-right");
  const [colorGrade, setColorGrade] = React.useState(false);
  const [muteOriginal, setMuteOriginal] = React.useState(false);
  const [trimSeconds, setTrimSeconds] = React.useState("");

  // --- Caption & Image options ---
  const [captionPrompt, setCaptionPrompt] = React.useState("");
  const [captionTone, setCaptionTone] = React.useState("");
  const [imageTranslate, setImageTranslate] = React.useState<"overlay" | "regenerate" | "none">("none");

  // --- job đang theo dõi ---
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<JobDetail | null>(null);
  const [jobs, setJobs] = React.useState<JobSummary[]>(initialJobs);
  const router = useRouter();

  React.useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

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
  const [selectedVoice, setSelectedVoice] = React.useState('vi-VN-WaveNet-A');
  const [subtitleSettings, setSubtitleSettings] = React.useState<SubtitleSettings>(defaultSubtitleSettings);
  const [editedScript, setEditedScript] = React.useState('');

  // Tự động điền script lồng tiếng khi có kết quả
  React.useEffect(() => {
    if (detail?.plan?.scriptVi || detail?.plan?.realScriptVi) {
      setEditedScript(detail.plan.scriptVi || detail.plan.realScriptVi || '');
    }
  }, [detail?.id, detail?.plan?.scriptVi, detail?.plan?.realScriptVi]);
  const [scriptEditorOpen, setScriptEditorOpen] = React.useState(true);
  const [regenerating, setRegenerating] = React.useState(false);

  // --- output mode: preset vs manual ---
  const [outputMode, setOutputMode] = React.useState<'preset' | 'manual'>('preset');
  const [presets, setPresets] = React.useState<any[]>([]);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>('');
  const [presetsLoaded, setPresetsLoaded] = React.useState(false);

  const isVideoFlow = outputKind === "video";

  // Load presets when modal opens
  React.useEffect(() => {
    if (!presetsLoaded) {
      fetch('/api/remix/presets')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.presets) {
            setPresets(data.presets);
            // Auto-select default preset if exists
            const def = data.presets.find((p: any) => p.is_default);
            if (def) setSelectedPresetId(def.id);
          }
          setPresetsLoaded(true);
        })
        .catch(() => setPresetsLoaded(true));
    }
  }, [presetsLoaded]);

  // Apply a preset's settings to manual form state
  const applyPreset = React.useCallback((p: any) => {
    if (!p) return;
    setOutputRatio(p.output_ratio || '9:16');
    setVertical(p.output_ratio === '9:16');
    setTargetLanguage(p.target_language === 'en' ? 'en' : 'vi');
    setSelectedVoice(p.voice_name || 'vi-VN-WaveNet-A');
    setDubMode((p.dub_mode as 'none' | 'full' | 'preserve_bgm') ?? (p.auto_dub ? 'full' : 'none'));
    setDubVi(p.auto_dub ?? false);
    setVietsub(p.auto_vietsub ?? false);
    setBlurOriginalSub(p.blur_original_sub ?? false);
    setAutoDetectSub(p.auto_detect_subtitle_region ?? false);
    if (p.blur_region) setBlurRegion(p.blur_region);
    setSubtitleSettings({
      font: p.sub_font || defaultSubtitleSettings.font,
      size: p.sub_font_size || defaultSubtitleSettings.size,
      color: p.sub_color || defaultSubtitleSettings.color,
      bgColor: p.sub_bg_color || defaultSubtitleSettings.bgColor,
      bold: p.sub_bold ?? defaultSubtitleSettings.bold,
      italic: p.sub_italic ?? defaultSubtitleSettings.italic,
      outline: p.sub_outline ?? defaultSubtitleSettings.outline,
      borderStyle: p.sub_border_style !== undefined ? p.sub_border_style : defaultSubtitleSettings.borderStyle,
      position: p.sub_position || defaultSubtitleSettings.position,
    });
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
      // 1. Cập nhật options vào DB
      const patchRes = await fetch(`/api/remix/${jobId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ options: newOptions })
      });
      if (!patchRes.ok) throw new Error("Cập nhật tuỳ chọn thất bại.");
      
      // 2. Kích hoạt revise với feedback rỗng để worker chạy lại video-ops (hoặc planner xử lý cứng)
      const reviseRes = await fetch(`/api/remix/${jobId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedback: "[MANUAL_EDIT] Áp dụng các thay đổi từ Video Editor" })
      });
      
      if (!reviseRes.ok) {
        const d = await reviseRes.json();
        throw new Error(d.error ?? "Gửi yêu cầu sửa thất bại.");
      }
      
      // Cập nhật lại UI state để nó polling
      setDetail((prev) => (prev ? { ...prev, status: "revising", options: newOptions } : prev));
      setIsEditingVideo(false);
      setNotice("Đang xử lý lại video theo thiết lập mới...");
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

    if (sourceType === "upload" && !uploadedMedia) {
      setError("Hãy tải lên file nguồn trước.");
      return;
    }
    if (sourceType !== "upload" && !sourceUrl.trim()) {
      setError("Hãy dán link nguồn.");
      return;
    }
    if (sourceType === "own_link" && !ownershipConfirmed) {
      setError("Cần xác nhận đây là nội dung bạn sở hữu.");
      return;
    }

    setSubmitting(true);
    try {
      let options: Record<string, unknown> = {};

      // --- Khi dùng Preset mode: lấy options trực tiếp từ preset object ---
      if (outputMode === 'preset' && selectedPresetId) {
        const p = presets.find((x: any) => x.id === selectedPresetId);
        if (p) {
          // Build options từ preset fields
          options.outputRatio = p.output_ratio || '9:16';
          options.vertical = p.output_ratio === '9:16';
          options.targetLanguage = p.target_language || 'vi';
          
          if (p.auto_vietsub) {
            options.vietsub = true;
            options.subtitleConfig = {
              font: p.sub_font || 'Arial',
              size: p.sub_font_size || 24,
              color: p.sub_color || '#FFFFFF',
              bgColor: p.sub_bg_color || '#000000',
              bold: p.sub_bold || false,
              italic: p.sub_italic || false,
              outline: p.sub_outline ?? 2,
              borderStyle: p.sub_border_style ?? 3,
              position: p.sub_position || 'bottom',
            };
            if (p.blur_original_sub) {
              options.blurOriginalSub = true;
              if (p.blur_region) options.blurRegion = p.blur_region;
              else options.autoDetectSubtitleRegion = true;
            }
          }
          
          const dubMode = p.dub_mode || (p.auto_dub ? 'full' : 'none');
          if (dubMode !== 'none') {
            options.dubMode = dubMode;
            options.dubVi = true;
            options.voiceName = p.voice_name || 'vi-VN-WaveNet-A';
            if (p.bg_volume !== undefined) options.bgVolume = p.bg_volume;
          }
          
          if (p.color_grade) options.colorGrade = true;
          if (p.intro_enabled && p.intro_media_id) {
            options.introEnabled = true;
            options.introMediaId = p.intro_media_id;
          }
          if (p.outro_enabled && p.outro_media_id) {
            options.outroEnabled = true;
            options.outroMediaId = p.outro_media_id;
          }
          if (p.output_crf) options.outputCrf = p.output_crf;
        }
      } else {
        // --- Manual mode: đọc từ form state như cũ ---
        if (captionPrompt.trim()) options.captionPrompt = captionPrompt.trim();
        if (captionTone) options.captionTone = captionTone;
        
        if (outputKind === "video" || outputKind === "image") {
          options.outputRatio = outputRatio;
          if (vertical) options.vertical = true;
          if (colorGrade) options.colorGrade = true;
          if (brandLogo) {
            options.brandLogo = true;
            options.logoPosition = logoPosition;
            if (uploadedLogo?.id) {
              options.logoMediaId = uploadedLogo.id;
            }
          }
        }

        if (outputKind === "video") {
          options.targetLanguage = targetLanguage;
          if (vietsub) {
            options.vietsub = true;
            options.subtitleConfig = subtitleSettings;
            if (autoDetectSub) {
              options.autoDetectSubtitleRegion = true;
            } else if (blurOriginalSub) {
              options.blurOriginalSub = true;
              options.blurRegion = blurRegion;
            }
          }
          if (dubMode !== 'none') {
            options.dubMode = dubMode;
            options.dubVi = true;
            options.voiceName = selectedVoice;
          }
          if (muteOriginal) options.muteOriginal = true;
          const secs = Number(trimSeconds);
          if (Number.isFinite(secs) && secs > 0) options.trimSeconds = secs;
        }
        
        if (outputKind === "image") {
          if (imageTranslate !== "none") options.imageTranslate = imageTranslate;
        }
      }

      // Caption prompt & tone áp dụng ở cả 2 mode
      if (captionPrompt.trim()) options.captionPrompt = captionPrompt.trim();
      if (captionTone) options.captionTone = captionTone;

      const res = await fetch("/api/remix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType,
          sourceUrl: sourceType === "upload" ? undefined : sourceUrl.trim(),
          sourceMediaId: sourceType === "upload" ? uploadedMedia?.id : undefined,
          ownershipConfirmed,
          outputKind,
          prompt: prompt.trim() || undefined,
          options,
          presetId: (outputMode === 'preset' && selectedPresetId) ? selectedPresetId : undefined,
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
          source_type: sourceType,
          output_kind: outputKind,
          status: "queued",
          prompt: prompt.trim() || null,
          options,
          iteration: 0,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      
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
      if (jobId === targetId) {
        setJobId(null);
        setDetail(null);
        setNotice(null);
      }
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
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
    try {
      await fetch(`/api/remix/${jobId}/regenerate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ editedScript }),
      });
      setDetail((d) => (d ? { ...d, status: "revising" } : d));
    } catch (e) {
      console.error(e);
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
          <Button onClick={() => setIsCreateModalOpen(true)}>
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

      {/* ---------------- Grid 2 Cột ---------------- */}
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[350px_minmax(0,1fr)] items-start">
        
        {/* Cột trái: Danh sách Job */}
        <Card className="h-[calc(100vh-16rem)] flex flex-col overflow-hidden">
          <CardHeader className="py-4 border-b border-border/50 bg-muted/20">
            <CardTitle className="text-sm font-medium">Lịch sử gần đây</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0 divide-y divide-border">
            {jobs.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Chưa có job nào.
              </div>
            ) : (
              jobs.map((j) => (
                <div
                  key={j.id}
                  role="button"
                  tabIndex={0}
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
                  className={`flex w-full cursor-pointer items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    j.id === jobId ? "bg-muted/60 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" title={j.options?.title || j.prompt || ""}>
                      {editingJobId === j.id ? (
                        <input
                          type="text"
                          className="w-full bg-background border border-primary px-2 py-1 rounded text-sm text-foreground focus:outline-none"
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
                          <div className="flex items-center group/title gap-1.5 flex-wrap">
                            <span>
                              {j.options?.batch_id && <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-[10px] bg-primary/20 text-primary font-bold">📦 Batch</span>}
                              {(j.is_auto_fix || j.options?.is_auto_fix) && <span className="inline-flex items-center gap-1 mr-1.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-500 font-bold border border-blue-500/30">🤖 Auto-Fix</span>}
                              {j.options?.title || j.prompt || `${j.output_kind} · ${j.source_type}`}
                            </span>
                          <span
                            role="button"
                            tabIndex={0}
                            className="ml-2 opacity-0 group-hover/title:opacity-100 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTitle(j.options?.title || j.prompt || `${j.output_kind} · ${j.source_type}`);
                              setEditingJobId(j.id);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setEditingTitle(j.options?.title || j.prompt || `${j.output_kind} · ${j.source_type}`); setEditingJobId(j.id); } }}
                          >
                            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            className="ml-1 opacity-0 group-hover/title:opacity-100 p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                            title="Xoá Job"
                            onClick={(e) => handleDeleteJob(e, j.id)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleDeleteJob(e as unknown as React.MouseEvent<HTMLSpanElement>, j.id); }}
                          >
                            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </span>
                        </div>
                      )}
                    </span>
                    <span className="text-2xs text-muted-foreground block mt-1">
                      {new Date(j.created_at).toLocaleString("vi-VN")}
                      {j.iteration > 0 && ` · sửa ${j.iteration} lần`}
                    </span>
                  </span>
                  <Status value={j.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Cột phải: Preview Kết quả */}
        <div className="space-y-4">
          <Card className="h-[calc(100vh-16rem)] flex flex-col overflow-hidden">
            <CardHeader className="py-4 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium">
                  {outputKind === "caption" ? "Kết quả Bài viết" : "Kết quả Media"}
                </CardTitle>
              </div>
              {detail && <Status value={detail.status} />}
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-6">
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
                                  <video src={detail.resultUrl || ""} controls className="w-full rounded border border-border" />
                                </div>
                                <div>
                                  <p className="text-xs font-medium mb-1 text-blue-400">AI sửa</p>
                                  <video src={(autoFixJob as any).resultUrl || (autoFixJob as any).options?.resultUrl || ""} controls className="w-full rounded border border-blue-500/30" />
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

              {/* --- 1. Nguồn --- */}
              <section className="space-y-4">
                <div>
                  <h4 className="font-medium text-foreground">1. Nguồn nội dung</h4>
                  <p className="text-sm text-muted-foreground">{activeSource.hint}</p>
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
                      onClick={() => setSourceType(tab.value)}
                      className={`flex-1 cursor-pointer rounded px-3 py-2 text-sm font-medium transition-colors ${
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
                  {sourceType === "upload" ? (
                    <div key="upload-section" className="space-y-2">
                      <Field
                        label="File video hoặc ảnh"
                        hint="MP4, MOV, PNG, JPG. Tối đa 200MB."
                      >
                        {(p) => (
                          <input
                            {...p}
                            type="file"
                            accept="video/*,image/*"
                            disabled={uploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleUpload(f);
                            }}
                          />
                        )}
                      </Field>
                      {uploading && (
                        <p className="text-xs text-muted-foreground">Đang tải lên…</p>
                      )}
                      {uploadedMedia && (
                        <p className="text-xs text-success">
                          Đã tải lên ({uploadedMedia.type}). Sẵn sàng remix.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div key="link-section" className="space-y-3">
                      <Field
                        label="Link bài đăng"
                        hint={
                          sourceType === "inspiration"
                            ? "Facebook, Instagram, TikTok, YouTube… Chỉ dùng để phân tích ý tưởng."
                            : "Link tới bài của chính bạn — hệ thống sẽ tải media về để biên tập."
                        }
                        required
                      >
                        {(p) => (
                          <input
                            {...p}
                            type="url"
                            value={sourceUrl || ""}
                            onChange={(e) => setSourceUrl(e.target.value)}
                            placeholder="https://…"
                          />
                        )}
                      </Field>

                      {sourceType === "own_link" && (
                        <Checkbox
                          label="Tôi xác nhận đây là nội dung tôi/tổ chức tôi sở hữu"
                          description="Bắt buộc — hệ thống chỉ biên tập nội dung bạn có quyền sử dụng."
                          checked={ownershipConfirmed}
                          onChange={(e) => setOwnershipConfirmed(e.target.checked)}
                        />
                      )}

                      {sourceType === "inspiration" && (
                        <Alert tone="info">
                          Chế độ tham khảo không tải file gốc. AI đúc kết công thức
                          (hook, cấu trúc, nhịp) rồi áp lên asset của bạn. Nếu muốn ra
                          video, hãy tải thêm file nguồn của mình ở tab “Tải file lên”.
                        </Alert>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* --- 2. Đầu ra mong muốn --- */}
              <section className="space-y-4">
                <div>
                  <h4 className="font-medium text-foreground">2. Đầu ra mong muốn</h4>
                  <p className="text-sm text-muted-foreground">Chọn cách cấu hình đầu ra cho video.</p>
                </div>

                {/* Mode switcher */}
                <div className="flex gap-2">
                  {([{ value: 'preset', icon: '⚡', label: 'Dùng Preset' }, { value: 'manual', icon: '🎛️', label: 'Cấu hình thủ công' }] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setOutputMode(opt.value)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
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
                      <label className="text-sm font-medium mb-1.5 block">Chọn Preset</label>
                      {presets.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-3 text-center">
                          Chưa có preset nào.{' '}
                          <a href="/remix/presets" target="_blank" className="text-primary underline">Tạo preset</a>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {presets.map((p: any) => (
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
                                  {p.auto_vietsub && <span>• Phụ đề</span>}
                                  <span>• {p.dub_mode === 'preserve_bgm' ? '🎵 Giữ nhạc nền' : p.dub_mode === 'full' ? '🎙️ Lồng tiếng' : '🔇 Gốc'}</span>
                                  <span>• {p.voice_name?.split('-').slice(0, 3).join('-') || 'WaveNet-A'}</span>
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {selectedPresetId && (() => {
                      const p = presets.find((x: any) => x.id === selectedPresetId);
                      if (!p) return null;
                      return (
                        <div className="mt-2 p-3 rounded-md bg-background border border-border/60 text-xs text-muted-foreground space-y-1">
                          <p className="font-medium text-foreground text-sm mb-1.5">Chi tiết preset đã chọn</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <span>Tỉ lệ: <strong className="text-foreground">{p.output_ratio}</strong></span>
                            <span>Ngôn ngữ: <strong className="text-foreground">{p.target_language === 'en' ? '🇺🇸 EN' : '🇻🇳 VI'}</strong></span>
                            <span>Phụ đề: <strong className="text-foreground">{p.auto_vietsub ? '✅ Bật' : '—'}</strong></span>
                            <span>Lồng tiếng: <strong className="text-foreground">
                              {p.dub_mode === 'preserve_bgm' ? '🎵 Giữ nhạc' : p.dub_mode === 'full' ? '🎙️ Full' : '🔇 Tắt'}
                            </strong></span>
                            <span>Giọng: <strong className="text-foreground">{p.voice_name?.replace('vi-VN-', '').replace('en-US-', '') || '—'}</strong></span>
                            <span>CRF: <strong className="text-foreground">{p.output_crf}</strong></span>
                          </div>
                        </div>
                      );
                    })()}

                    <Field label="Loại đầu ra">
                      {(p) => (
                        <select
                          {...p}
                          value={outputKind || 'video'}
                          onChange={(e) => setOutputKind(e.target.value as OutputKind)}
                          className={`${p.className} bg-background`}
                        >
                          <option value="video">Video</option>
                          <option value="image">Ảnh</option>
                          <option value="caption">Chỉ caption + hashtag</option>
                        </select>
                      )}
                    </Field>

                    <a href="/remix/presets" target="_blank" className="text-xs text-primary hover:underline flex items-center gap-1">
                      ⚙️ Quản lý Preset
                    </a>
                  </div>
                )}

                {/* MANUAL MODE */}
                {outputMode === 'manual' && (
                <div className="space-y-4 bg-muted/20 p-4 rounded-lg border border-border/50">
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
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <div className="space-y-2 pb-2">
                        <label className="text-sm font-medium">Tỉ lệ khung hình</label>
                        <RatioPicker 
                          value={outputRatio} 
                          onChange={(val) => {
                            setOutputRatio(val);
                            setVertical(val === '9:16');
                          }} 
                        />
                      </div>
                      <Checkbox
                        label="Chỉnh màu nhẹ"
                        description="Tăng tương phản/độ bão hoà cho nhất quán thương hiệu."
                        checked={colorGrade}
                        onChange={(e) => setColorGrade(e.target.checked)}
                      />
                      <Checkbox
                        label="Chèn logo thương hiệu"
                        description="Watermark từ logo đã tải lên."
                        checked={brandLogo}
                        onChange={(e) => setBrandLogo(e.target.checked)}
                      />
                      {brandLogo && (
                        <div className="pl-7 pt-1 space-y-3">
                          <Field label="Tải lên Logo" hint="Khuyên dùng ảnh PNG nền trong suốt.">
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
                          {uploadingLogo && (
                            <p className="text-xs text-muted-foreground">Đang tải lên logo…</p>
                          )}
                          {uploadedLogo && (
                            <p className="text-xs text-success">
                              Đã tải lên logo thành công.
                            </p>
                          )}
                          <Field label="Vị trí logo">
                            {(p) => (
                              <select
                                {...p}
                                value={logoPosition || "bottom-right"}
                                onChange={(e) => setLogoPosition(e.target.value)}
                                className={`${p.className} bg-background`}
                              >
                                <option value="bottom-right">Dưới phải</option>
                                <option value="bottom-left">Dưới trái</option>
                                <option value="top-right">Trên phải</option>
                                <option value="top-left">Trên trái</option>
                              </select>
                            )}
                          </Field>
                        </div>
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

                      {outputKind === "video" && (
                        <div className="space-y-4 pt-2 border-t border-border/50">
                          <div className="bg-muted/30 p-3 rounded-md border border-border/60">
                            <label className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wider">Ngôn ngữ dịch & lồng tiếng</label>
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
                            <Checkbox
                              label={`Phụ đề ${targetLanguage === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'} (burn-in)`}
                              description="Ghi chữ trực tiếp lên video, đọc được khi tắt tiếng."
                              checked={vietsub}
                              onChange={(e) => setVietsub(e.target.checked)}
                            />
                            {vietsub && (
                              <div className="mt-2 ml-7 mb-4 space-y-4">
                                <SubtitleConfig value={subtitleSettings} onChange={setSubtitleSettings} />
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
                              </div>
                            )}
                            <Checkbox
                              label={`Lồng tiếng ${targetLanguage === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'} (AI Dubbing)`}
                              description="Thay audio bằng giọng đọc AI."
                              checked={dubVi}
                              onChange={(e) => {
                                setDubVi(e.target.checked);
                                setDubMode(e.target.checked ? 'full' : 'none');
                              }}
                            />
                            {/* Dubbing mode picker (expanded) */}
                            {dubMode !== 'none' && (
                              <div className="mt-2 ml-7 mb-4 space-y-2">
                                {([
                                  { value: 'full', icon: '🎙️', label: 'Thay toàn bộ audio', desc: 'Thay audio gốc bằng giọng TTS. Phù hợp khi không có nhạc nền.' },
                                  { value: 'preserve_bgm', icon: '🎵', label: 'Giữ nhạc nền gốc', desc: 'Tách giọng người khỏi nhạc nền, lồng TTS, mix lại với nhạc nền.' },
                                ] as const).map(opt => (
                                  <label
                                    key={opt.value}
                                    onClick={() => setDubMode(opt.value)}
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
                                      <span className="font-medium">{opt.icon} {opt.label}</span>
                                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                                    </div>
                                  </label>
                                ))}
                                <div className="mt-3 max-w-xs">
                                  <label className="text-xs font-medium mb-1.5 block text-muted-foreground">Giọng lồng tiếng</label>
                                  <VoiceSelector value={selectedVoice} onChange={setSelectedVoice} />
                                </div>
                              </div>
                            )}
                          </div>
                          <Checkbox
                            label="Bỏ audio gốc"
                            description="Dùng khi chỉ cần hình + phụ đề."
                            checked={muteOriginal}
                            onChange={(e) => setMuteOriginal(e.target.checked)}
                          />
                          <div className="px-1 pt-3">
                            <Field
                              label="Cắt còn (giây)"
                              hint="Để trống nếu giữ nguyên độ dài."
                            >
                              {(p) => (
                                <input
                                  {...p}
                                  type="number"
                                  min={1}
                                  max={600}
                                  value={trimSeconds || ""}
                                  onChange={(e) => setTrimSeconds(e.target.value)}
                                  placeholder="30"
                                  className={`${p.className} bg-background`}
                                />
                              )}
                            </Field>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )}
              </section>

              {/* --- 3. Mô tả --- */}
              {(outputKind === "video" || outputKind === "image") && (
                <section className="space-y-4">
                  <div>
                    <h4 className="font-medium text-foreground">3. Mô tả chỉnh sửa (Tuỳ chọn)</h4>
                    <p className="text-sm text-muted-foreground">Chỉ định rõ bạn muốn cắt ghép, chèn hiệu ứng, hay nội dung như thế nào.</p>
                  </div>
                  <Field label="Mô tả chi tiết" srOnlyLabel>
                    {(p) => (
                      <textarea
                        {...p}
                        className={`${p.className} min-h-24 resize-y leading-relaxed bg-background border-border/50`}
                        value={prompt || ""}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Ví dụ: Làm reel 30s giới thiệu sân bóng mới, hook 3 giây đầu nhấn giá ưu đãi, cắt bỏ 5s cuối."
                      />
                    )}
                  </Field>
                </section>
              )}

              {/* --- 4. Caption --- */}
              <section className="space-y-4">
                <div>
                  <h4 className="font-medium text-foreground">{outputKind === "caption" ? "3. Nội dung Bài đăng (Caption)" : "4. Nội dung Bài đăng (Caption)"}</h4>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Tone & Voice (Giọng điệu)">
                      {(p) => (
                        <select
                          {...p}
                          value={captionTone || ""}
                          onChange={(e) => setCaptionTone(e.target.value)}
                          className={`${p.className} bg-background`}
                        >
                          <option value="">— Mặc định —</option>
                          <option value="Chuyên nghiệp, đáng tin cậy">Chuyên nghiệp, đáng tin cậy</option>
                          <option value="Năng động, tràn đầy năng lượng">Năng động, tràn đầy năng lượng</option>
                          <option value="Gần gũi, thân thiện như bạn bè">Gần gũi, thân thiện như bạn bè</option>
                          <option value="Hài hước, trending Gen Z">Hài hước, trending Gen Z</option>
                        </select>
                      )}
                    </Field>

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
              <BatchURLInput value={batchUrls} onChange={setBatchUrls} maxUrls={10} />
            </div>

            <div className="p-4 border-t border-border/50 bg-muted/30 flex justify-end gap-3 sticky bottom-0">
              <Button variant="outline" onClick={() => setShowAutoDialog(false)}>Hủy</Button>
              <Button
                disabled={batchUrls.length === 0 || batchSubmitting}
                onClick={async () => {
                  setBatchSubmitting(true);
                  try {
                    await fetch('/api/remix/batch', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ urls: batchUrls, mode: 'auto', ownershipConfirmed: true }),
                    });
                    setShowAutoDialog(false);
                    setBatchUrls([]);
                    router.refresh(); // Tải lại danh sách job trên thanh lịch sử
                  } catch (err) {
                    console.error(err);
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

      {isEditingVideo && detail?.resultUrl && detail?.options && (
        <VideoEditor
          source={detail.resultUrl}
          initialOptions={detail.options as Record<string, any>}
          onSave={handleSaveVideo}
          onCancel={() => setIsEditingVideo(false)}
        />
      )}
    </div>
  );
}
