"use client";

import React, { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import {
  X,
  Star,
  Users,
  Award,
  TrendingUp,
  MapPin,
  CheckCircle2,
  ExternalLink,
  Eye,
  Share2,
  Copy,
  MessageCircle,
  Clock,
  Flame,
  ShieldCheck,
  DollarSign,
  Briefcase,
  Edit3,
  Plus,
  Radio,
  Sparkles,
  Heart,
  FileText,
  Video,
  BarChart3,
  Search,
  Layers,
  Lock,
  Trash2,
  SlidersHorizontal,
  Save,
  Link2,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  PieChart,
} from "lucide-react";
import { t, formatNumber, formatCurrency } from "@/lib/i18n";
import {
  getKolAggregates,
  getCommunityAggregates,
  getPlatformConfig,
  getKolChannels,
} from "@/lib/sport-hub/kol-channels";
import { getTagColor } from "@/lib/sport-hub/kol-audience-audit";
import { PlatformIcon, getPlatformBadgeStyle } from "./platform-icon";
import { AudienceAuditSection, PostAuditControl } from "./audience-audit-panel";
import { cleanAuditSummary } from "@/lib/sport-hub/audience-audit-types";
import { KOLChannel, CommunityChannel, KolAudienceAudit } from "./types";
import { useCurrentUser } from "@/lib/auth/use-current-user";

// Shared avatar dictionary for Vietnamese sports KOLs
export const KOL_AVATARS: Record<string, string> = {
  "Đỗ Kim Phúc": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=150&auto=format&fit=crop&q=80",
  "Hoàng Đăng Phan": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "Hana Giang Anh": "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
  "Dean Nguyen": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "Vợt tập Pickleball": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "Tango Pickleball": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "hocvienhup": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
  "Học Viện HUP Pickleball": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
  "ATA PICKLEBALL HANOI": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
  "ATA Pickleball Hà Nội": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
  "Hanoi Union Pickleball": "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80",
  "Nguyễn Văn A": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80",
  "Trần Thị B": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "Lê Hoàng C": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
};

export function getKolAvatar(name: string): string | null {
  for (const [key, url] of Object.entries(KOL_AVATARS)) {
    if (
      name.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(name.toLowerCase())
    ) {
      return url;
    }
  }
  return null;
}

export function formatAuditTimestamp(isoString?: string): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

export interface KOL {
  id: string;
  name: string;
  sport: string[];
  tier: string;
  platform: string;
  geography: string;
  followers: number;
  avgViews: number;
  er: number;
  quotation: number;
  status: string;
  info: string;
  profileUrl: string;
  channels?: KOLChannel[];
  audienceAudit?: KolAudienceAudit;
  pendingScoutDiff?: {
    scoutedAt: string;
    changes: Record<string, { current: any; scouted: any }>;
  } | null;
}

export interface Post {
  id: string;
  title: string;
  author: string;
  kolRecordIds: string[];
  platform: string;
  likes: number;
  comments: number;
  views: number;
  er: number;
  postUrl: string;
  viralGrade: string;
  status: string;
  isSponsored?: boolean;
  sponsorBrand?: string;
  sponsorCategory?: string;
}

export interface Report {
  id: string;
  title: string;
  kolName: string;
  kolRecordIds: string[];
  project: string;
  score: number;
  attitude: number;
  deadline: string;
  kpiCommit: number;
  kpiActual: number;
  kpiRate: number;
  notes: string;
  evaluator: string;
}

export interface Community {
  id: string;
  name: string;
  sport: string[];
  geography: string;
  members: number;
  platform: string;
  groupUrl: string;
  activityLevel: string;
  adminContact: string;
  pricePerPin: number;
  status: string;
}

// ==========================================
// 1. MODAL: 360° KOL PANORAMIC DOSSIER POPUP
// ==========================================
export interface Kol360ModalProps {
  isOpen: boolean;
  kol: KOL | null;
  posts: Post[];
  reports: Report[];
  onClose: () => void;
  onOpenReport?: (kol: KOL) => void;
  onEditKol?: (kol: KOL) => void;
  onScoutKolPosts?: (kol: KOL) => void;
  onOpenGrowth?: (kol: KOL) => void;
  onOpenDiff?: (kol: KOL) => void;
  onAddChannel?: (kol: KOL) => void;
  onUpdateKol?: (updatedKol: any) => void;
}

export function Kol360Modal({
  isOpen,
  kol,
  posts,
  reports,
  onClose,
  onOpenReport,
  onEditKol,
  onScoutKolPosts,
  onOpenGrowth,
  onOpenDiff,
  onAddChannel,
  onUpdateKol,
}: Kol360ModalProps) {
  const { isAdmin } = useCurrentUser();
  const [postSearch, setPostSearch] = useState("");
  const [selectedChannelPlatform, setSelectedChannelPlatform] = useState<string>("all");

  // Local synced copy of KOL for instant in-dossier updates
  const [currentKol, setCurrentKol] = useState<KOL | null>(kol);
  useEffect(() => {
    if (kol) setCurrentKol(kol);
  }, [kol]);

  // Audience Authenticity & Commercial Sponsorship Audit State
  const [audienceAudit, setAudienceAudit] = useState<KolAudienceAudit | null>(() =>
    kol?.audienceAudit || null
  );
  const [isAuditing, setIsAuditing] = useState(false);
  const [showSampleComments, setShowSampleComments] = useState(false);
  const [localPosts, setLocalPosts] = useState<Post[]>([]);

  useEffect(() => {
    if (kol) {
      setAudienceAudit(kol.audienceAudit || null);
    }
  }, [kol]);

  useEffect(() => {
    setLocalPosts([]);
  }, [currentKol?.id]);

  const handleRunLiveAudit = async (options?: { forceScout?: boolean }) => {
    if (!currentKol) return;
    setIsAuditing(true);
    const toastId = toast.loading(`Initiating audit for ${currentKol.name}...`);
    try {
      // Step 1: Automatically trigger Apify Scraper if KOL has 0 posts or forceScout is requested
      const shouldScout = options?.forceScout || kolPosts.length === 0;

      if (shouldScout) {
        toast.loading(
          `No scouted posts found for ${currentKol.name}. Launching Apify scraper...`,
          { id: toastId }
        );

        // Determine platform from channel footprint or profile
        const platform = currentKol.platform
          ? currentKol.platform.includes("TikTok")
            ? "TikTok"
            : currentKol.platform.includes("Facebook")
            ? "Facebook"
            : "Instagram"
          : "Instagram";

        const scoutRes = await fetch("/api/sport-hub/scout/kol-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kolId: currentKol.id,
            platform: [platform],
            limit: 10,
          }),
        });

        const scoutJson = await scoutRes.json().catch(() => null);
        if (scoutRes.ok && scoutJson?.success && Array.isArray(scoutJson.posts) && scoutJson.posts.length > 0) {
          const mappedPosts: Post[] = scoutJson.posts.map((p: any) => ({
            id: p.id || `scouted-${Date.now()}-${Math.random()}`,
            title: p.title || `Post by ${currentKol.name}`,
            author: p.author || currentKol.name,
            kolRecordIds: [currentKol.id],
            platform: p.platform || platform,
            likes: Number(p.likes) || 0,
            comments: Number(p.comments) || 0,
            views: Number(p.views) || 0,
            er: Number(p.er) || 0,
            postUrl: p.post_url || p.postUrl || "#",
            viralGrade: p.viral_tier || p.viralGrade || "Tiêu chuẩn",
            status: "Scouted",
            isSponsored: Boolean(p.is_sponsored),
            sponsorBrand: p.sponsor_brand,
          }));

          setLocalPosts((prev) => {
            const existingIds = new Set(prev.map((x) => x.id));
            const newOnes = mappedPosts.filter((x) => !existingIds.has(x.id));
            return [...prev, ...newOnes];
          });

          toast.loading(
            `Apify scouted ${scoutJson.insertedCount || mappedPosts.length} posts! Analyzing audience authenticity & sponsored content...`,
            { id: toastId }
          );
        } else {
          toast.loading(
            `Scout completed. Running audience authenticity audit...`,
            { id: toastId }
          );
        }
      } else {
        toast.loading(
          `Auditing audience authenticity & sponsored content for ${currentKol.name}...`,
          { id: toastId }
        );
      }

      // Step 2: Run Audience Authenticity & Sponsored Content Audit
      const res = await fetch(`/api/sport-hub/kol/${currentKol.id}/audience-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.data) {
        toast.error(json?.error || `Audience audit failed (HTTP ${res.status})`, {
          id: toastId,
        });
        return;
      }

      setAudienceAudit(json.data);
      setCurrentKol((prev) => (prev ? { ...prev, audienceAudit: json.data } : null));
      toast.success(
        json.data.auditSummary ||
          `Audience audit complete for ${currentKol.name} (${json.data.totalPostsScanned} posts analyzed)!`,
        { id: toastId }
      );
    } catch (err: any) {
      toast.error(err?.message || "Could not complete audience audit pipeline.", {
        id: toastId,
      });
    } finally {
      setIsAuditing(false);
    }
  };

  // In-Dossier Channel & Specs Studio Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editChannels, setEditChannels] = useState<KOLChannel[]>([]);
  const [editSpecs, setEditSpecs] = useState<{
    name: string;
    tier: string;
    geography: string;
    status: string;
    quotation: number;
    sport: string[];
    info: string;
    bio: string;
  }>({
    name: "",
    tier: "Micro (10k - 50k)",
    geography: "Nationwide",
    status: "Active Partnership",
    quotation: 0,
    sport: ["Pickleball"],
    info: "",
    bio: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [scoutUrlInput, setScoutUrlInput] = useState("");
  const [isInspecting, setIsInspecting] = useState(false);

  const startEditing = () => {
    if (!currentKol) return;
    const chs = getKolChannels(currentKol);
    setEditChannels(chs.map((c) => ({ ...c })));
    setEditSpecs({
      name: currentKol.name || "",
      tier: currentKol.tier || "Micro (10k - 50k)",
      geography: currentKol.geography || "Nationwide",
      status: currentKol.status || "Active Partnership",
      quotation: currentKol.quotation || 0,
      sport:
        currentKol.sport && currentKol.sport.length > 0
          ? [...currentKol.sport]
          : ["Pickleball"],
      info: currentKol.info || "",
      bio: (currentKol as any).bio || "",
    });
    setScoutUrlInput("");
    setIsEditing(true);
  };

  const liveAggregates = useMemo(() => {
    const totalFollowers = editChannels.reduce(
      (sum, ch) => sum + (Number(ch.followers) || 0),
      0
    );
    const totalAvgViews = editChannels.reduce(
      (sum, ch) => sum + (Number(ch.avgViews) || 0),
      0
    );
    let blendedEr = 0;
    if (totalFollowers > 0) {
      const weightedSum = editChannels.reduce(
        (sum, ch) => sum + (Number(ch.er) || 0) * (Number(ch.followers) || 0),
        0
      );
      blendedEr = +(weightedSum / totalFollowers).toFixed(1);
    }
    return {
      totalFollowers,
      totalAvgViews,
      blendedEr,
      channelCount: editChannels.length,
    };
  }, [editChannels]);

  const handleAddChannelRow = () => {
    const newChan: KOLChannel = {
      platform: "TikTok",
      handle: "",
      url: "",
      followers: 0,
      avgViews: 0,
      er: 0,
      isPrimary: editChannels.length === 0,
    };
    setEditChannels((prev) => [...prev, newChan]);
  };

  const handleDeleteChannelRow = (index: number) => {
    if (editChannels.length <= 1) {
      toast.error("At least one social channel must remain for this creator.");
      return;
    }
    setEditChannels((prev) => {
      const wasPrimary = prev[index]?.isPrimary;
      const next = prev.filter((_, idx) => idx !== index);
      if (wasPrimary && next.length > 0) {
        next[0].isPrimary = true;
      }
      return next;
    });
  };

  const handleUpdateChannelField = (
    index: number,
    field: keyof KOLChannel,
    value: any
  ) => {
    setEditChannels((prev) =>
      prev.map((ch, idx) => {
        if (idx !== index) return ch;
        return {
          ...ch,
          [field]:
            field === "followers" || field === "avgViews" || field === "er"
              ? value === ""
                ? ""
                : Number(value)
              : value,
        };
      })
    );
  };

  const handleSetPrimaryChannel = (index: number) => {
    setEditChannels((prev) =>
      prev.map((ch, idx) => ({
        ...ch,
        isPrimary: idx === index,
      }))
    );
  };

  const handleAutoInspectUrl = async () => {
    const trimmed = scoutUrlInput.trim();
    if (!trimmed) {
      toast.error("Please enter a valid social profile URL to inspect");
      return;
    }

    setIsInspecting(true);
    try {
      const res = await fetch("/api/sport-hub/scout/inspect-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, type: "kol" }),
      });
      const data = await res.json();
      if (data.success && data.scouted) {
        const s = data.scouted;
        const newCh: KOLChannel = {
          platform: s.platform || "TikTok",
          handle: s.handle || s.name || "",
          url: trimmed,
          followers: Number(s.followers) || 0,
          avgViews: Number(s.avgViews) || 0,
          er: Number(s.er) || 0,
          isPrimary: editChannels.length === 0,
        };

        const exists = editChannels.findIndex(
          (c) => c.platform.toLowerCase() === newCh.platform.toLowerCase()
        );
        if (exists >= 0) {
          setEditChannels((prev) => {
            const next = [...prev];
            next[exists] = { ...next[exists], ...newCh };
            return next;
          });
          toast.success(`Updated existing ${newCh.platform} channel from URL!`);
        } else {
          setEditChannels((prev) => [...prev, newCh]);
          toast.success(`Auto-detected and added ${newCh.platform} channel!`);
        }
        setScoutUrlInput("");
      } else {
        toast.error(
          data.error || "Unable to inspect URL automatically. Adding blank row."
        );
        setEditChannels((prev) => [
          ...prev,
          {
            platform: "TikTok",
            handle: "",
            url: trimmed,
            followers: 0,
            avgViews: 0,
            er: 0,
            isPrimary: prev.length === 0,
          },
        ]);
        setScoutUrlInput("");
      }
    } catch {
      toast.error("Network error during inspection. Added URL to a new channel row.");
      setEditChannels((prev) => [
        ...prev,
        {
          platform: "TikTok",
          handle: "",
          url: trimmed,
          followers: 0,
          avgViews: 0,
          er: 0,
          isPrimary: prev.length === 0,
        },
      ]);
      setScoutUrlInput("");
    } finally {
      setIsInspecting(false);
    }
  };

  const handleSaveAll = async () => {
    if (!currentKol) return;
    if (!editSpecs.name.trim()) {
      toast.error("Creator name cannot be empty");
      return;
    }
    if (editChannels.length === 0) {
      toast.error("At least one channel is required");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/sport-hub/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "kol",
          entityId: currentKol.id,
          entityName: currentKol.name,
          channels: editChannels,
          specs: {
            name: editSpecs.name.trim(),
            tier: editSpecs.tier,
            geography: editSpecs.geography,
            status: editSpecs.status,
            quotation: editSpecs.quotation,
            sport: editSpecs.sport,
            info: editSpecs.info,
            bio: editSpecs.bio,
          },
        }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success(`Updated channels and specs for ${editSpecs.name.trim()}!`);
        const primaryChan =
          editChannels.find((c) => c.isPrimary) || editChannels[0];
        const updatedKolData: KOL = {
          ...currentKol,
          name: editSpecs.name.trim(),
          tier: editSpecs.tier,
          geography: editSpecs.geography,
          status: editSpecs.status,
          quotation: Number(editSpecs.quotation) || 0,
          sport: editSpecs.sport,
          info: editSpecs.info,
          channels: editChannels,
          followers: liveAggregates.totalFollowers,
          avgViews: liveAggregates.totalAvgViews,
          er: liveAggregates.blendedEr,
          platform:
            editChannels.length > 1
              ? "Omni-channel"
              : primaryChan?.platform || currentKol.platform,
          profileUrl: primaryChan?.url || currentKol.profileUrl,
        };

        setCurrentKol(updatedKolData);
        onUpdateKol?.(updatedKolData);
        setIsEditing(false);
      } else {
        toast.error(result.error || "Failed to update channels");
      }
    } catch {
      toast.error("Network error while saving changes");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !currentKol) return null;

  const avatar = getKolAvatar(currentKol.name);
  const aggregates = useMemo(() => getKolAggregates(currentKol), [currentKol]);

  // Filter viral posts scouted for this KOL (including newly scouted posts in this session)
  const kolPosts = useMemo(() => {
    const parentMatches = posts.filter((p) => {
      const matchId = p.kolRecordIds && p.kolRecordIds.includes(currentKol.id);
      const matchAuthor =
        p.author &&
        (p.author.toLowerCase().includes(currentKol.name.toLowerCase()) ||
          currentKol.name.toLowerCase().includes(p.author.toLowerCase()));
      return matchId || matchAuthor;
    });

    const parentIds = new Set(parentMatches.map((p) => p.id));
    const extraLocal = localPosts.filter((p) => !parentIds.has(p.id));
    return [...parentMatches, ...extraLocal];
  }, [posts, localPosts, currentKol]);

  // Filtered posts by search keyword inside modal table
  const displayedPosts = useMemo(() => {
    let list = kolPosts;
    if (selectedChannelPlatform !== "all") {
      list = list.filter((p) =>
        p.platform.toLowerCase().includes(selectedChannelPlatform.toLowerCase())
      );
    }
    if (!postSearch.trim()) return list;
    const q = postSearch.trim().toLowerCase();
    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.platform.toLowerCase().includes(q) ||
        (p.viralGrade && p.viralGrade.toLowerCase().includes(q))
    );
  }, [kolPosts, selectedChannelPlatform, postSearch]);

  // Aggregated Media Metrics for this KOL
  const totalPostViews = useMemo(
    () => kolPosts.reduce((acc, curr) => acc + (curr.views || 0), 0),
    [kolPosts]
  );
  const totalPostLikes = useMemo(
    () => kolPosts.reduce((acc, curr) => acc + (curr.likes || 0), 0),
    [kolPosts]
  );
  const totalPostComments = useMemo(
    () => kolPosts.reduce((acc, curr) => acc + (curr.comments || 0), 0),
    [kolPosts]
  );
  const avgPostEr = useMemo(() => {
    if (kolPosts.length === 0) return 0;
    const sum = kolPosts.reduce((acc, curr) => acc + (curr.er || 0), 0);
    return +(sum / kolPosts.length).toFixed(1);
  }, [kolPosts]);

  // Filter evaluation reports for this KOL
  const kolReports = useMemo(() => {
    return reports.filter((r) => {
      const matchId = r.kolRecordIds && r.kolRecordIds.includes(currentKol.id);
      const matchName =
        r.kolName &&
        (r.kolName.toLowerCase().includes(currentKol.name.toLowerCase()) ||
          currentKol.name.toLowerCase().includes(r.kolName.toLowerCase()));
      return matchId || matchName;
    });
  }, [reports, currentKol]);

  // Calculate average evaluation score
  const avgScore =
    kolReports.length > 0
      ? (
          kolReports.reduce((acc, curr) => acc + (curr.score || 0), 0) /
          kolReports.length
        ).toFixed(1)
      : "5.0";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── MODAL HEADER BANNER ─── */}
        <div className="relative bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Creator Identity */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={currentKol.name}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-400/50 shadow-md"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-2xl border-2 border-white/20 shadow-md">
                    {currentKol.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full" />
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                    360° Panoramic Dossier
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-400/30">
                    {t(currentKol.status)}
                  </span>
                  {isEditing && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/30 text-purple-200 font-bold border border-purple-400/40 animate-pulse">
                      Studio Edit Mode
                    </span>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                  {currentKol.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-1">
                  <span className="font-semibold text-indigo-300">{currentKol.tier}</span>
                  <span>•</span>
                  <span className="flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t(currentKol.geography)}</span>
                  </span>
                  <span>•</span>
                  <span className="text-amber-300 font-bold flex items-center space-x-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{avgScore}/5.0 Score ({kolReports.length} reviews)</span>
                  </span>
                </div>

                {/* Connected Channel Handles / Chips */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1">Channels:</span>
                  {aggregates.channels.map((ch, idx) => (
                    <a
                      key={idx}
                      href={ch.url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/15 transition group shadow-2xs"
                      title={`Open ${ch.platform} channel (${formatNumber(ch.followers)} followers)`}
                    >
                      <PlatformIcon platform={ch.platform} size="xs" />
                      <span>{ch.platform}</span>
                      <span className="text-[10px] text-slate-300 font-mono">
                        ({formatNumber(ch.followers)})
                      </span>
                      {ch.url && ch.url !== "#" && (
                        <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                      )}
                    </a>
                  ))}
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/30 text-indigo-200 text-[10px] font-bold border border-indigo-400/30 ml-0.5">
                    {aggregates.channelCount} {aggregates.channelCount === 1 ? "Channel" : "Channels"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons in Modal Header */}
            <div className="flex flex-wrap items-center gap-2">
              {currentKol.pendingScoutDiff &&
                Object.keys(currentKol.pendingScoutDiff.changes || {}).length > 0 &&
                onOpenDiff && (
                  <button
                    type="button"
                    onClick={() => onOpenDiff(currentKol)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer animate-pulse"
                    title="Review Scout Data Changes (Diff)"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
                    <span>Review Diff</span>
                  </button>
                )}

              {onScoutKolPosts && (
                <button
                  type="button"
                  onClick={() => onScoutKolPosts(currentKol)}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer border border-purple-400/30"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Scout Posts</span>
                </button>
              )}

              {/* Run Audience Audit Header Action */}
              <button
                type="button"
                disabled={isAuditing}
                onClick={() => handleRunLiveAudit()}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center space-x-1.5 border border-white/15 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Run Audience Authenticity & Sponsored Content Audit"
              >
                <ShieldCheck className={`w-3.5 h-3.5 text-indigo-300 ${isAuditing ? "animate-spin" : ""}`} />
                <span>{isAuditing ? "Auditing..." : "Run Audience Audit"}</span>
              </button>

              {onOpenGrowth && (
                <button
                  type="button"
                  onClick={() => onOpenGrowth(currentKol)}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition flex items-center space-x-1.5 border border-white/10 cursor-pointer active:scale-95"
                  title="View Historical Metric Snapshots"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Metric History</span>
                </button>
              )}

              {onOpenReport && (
                <button
                  onClick={() => onOpenReport(currentKol)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Evaluate</span>
                </button>
              )}

              {/* In-Dossier Channels & Specs Studio Toggle */}
              <button
                type="button"
                onClick={startEditing}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer ${
                  isEditing
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white ring-2 ring-purple-400"
                    : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                }`}
                title="Edit Channel Links, Audience Numbers & Commercial Specs"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-300" />
                <span>{isEditing ? "Editing Studio" : "Edit Channels & Specs"}</span>
              </button>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition border border-white/10 cursor-pointer"
                title="Close Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* High-Level Media & Performance KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 mt-4 pt-4 border-t border-white/10 text-xs">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300">Scouted Posts</span>
              <span className="font-black text-white text-sm">{kolPosts.length} posts</span>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300">Total Views</span>
              <span className="font-black text-indigo-300 text-sm">{formatNumber(totalPostViews)}</span>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300">Total Likes</span>
              <span className="font-black text-rose-300 text-sm">{formatNumber(totalPostLikes)}</span>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300">Avg Post ER</span>
              <span className="font-black text-emerald-300 text-sm">{avgPostEr}%</span>
            </div>
            {audienceAudit ? (
              <>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-300">Real Audience</span>
                  <span className="font-black text-emerald-300 text-sm">
                    {audienceAudit.totalCommentsScanned > 0 ? `${audienceAudit.realAudienceRate}%` : "—"}
                  </span>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-300">Sponsored Rate</span>
                  <span className="font-black text-indigo-300 text-sm">{audienceAudit.sponsoredContentRate}%</span>
                </div>
              </>
            ) : (
              <>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-300">Real Audience</span>
                  <span className="font-bold text-slate-400 text-xs">—</span>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-300">Sponsored Rate</span>
                  <span className="font-bold text-slate-400 text-xs">—</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── MODAL SCROLLABLE BODY ─── */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {isEditing ? (
            /* ─── IN-DOSSIER CHANNELS & SPECS EDITING STUDIO ─── */
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Editor Header Banner */}
              <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 rounded-2xl p-5 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white border border-white/20 shadow-inner">
                    <SlidersHorizontal className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-indigo-100">
                        In-Dossier Studio Editor
                      </span>
                      <span className="text-xs text-indigo-200 font-medium">
                        Live metric recalculation & direct sync to Supabase
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-white mt-0.5">
                      Manage Channels & Commercial Profile for {currentKol.name}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveAll}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition flex items-center space-x-1.5 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Live Cross-Platform Impact Summary Strip */}
              <div className="bg-slate-900 rounded-2xl p-4 text-white border border-indigo-900/50 flex flex-wrap items-center justify-between gap-3 shadow-md">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                      Live Recomputed Portfolio
                    </span>
                    <span className="text-xs font-extrabold text-white">
                      {liveAggregates.channelCount} {liveAggregates.channelCount === 1 ? "Channel" : "Connected Channels"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-4 bg-white/10 px-4 py-2 rounded-xl border border-white/10 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Total Combined Reach</span>
                    <span className="font-extrabold text-white text-sm">{formatNumber(liveAggregates.totalFollowers)}</span>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div>
                    <span className="text-slate-400 text-[10px] block">Combined Avg Views</span>
                    <span className="font-extrabold text-indigo-200 text-sm">
                      {liveAggregates.totalAvgViews > 0 ? formatNumber(liveAggregates.totalAvgViews) : "—"}
                    </span>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div>
                    <span className="text-slate-400 text-[10px] block">Blended ER</span>
                    <span className="font-extrabold text-emerald-300 text-sm">
                      {liveAggregates.blendedEr > 0 ? `${liveAggregates.blendedEr}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 1: Connected Social Channels (Table / Cards) */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                      <span>Connected Social Media Channels</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 normal-case">
                        {editChannels.length} platforms
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Edit channel links, handles, follower counts, avg views, and engagement rates for each platform.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddChannelRow}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-xs cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Channel Row</span>
                  </button>
                </div>

                {/* Auto-Scout Channel Link Helper */}
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-indigo-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-800">Quick Auto-Fill from Channel Link:</span>
                  </div>
                  <div className="flex items-center space-x-2 flex-1 max-w-xl">
                    <div className="relative flex-1">
                      <Link2 className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="url"
                        value={scoutUrlInput}
                        onChange={(e) => setScoutUrlInput(e.target.value)}
                        placeholder="Paste TikTok, YouTube, Facebook, or Instagram profile link..."
                        className="w-full pl-8 pr-3 py-1.5 bg-white rounded-lg border border-indigo-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isInspecting}
                      onClick={handleAutoInspectUrl}
                      className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs transition flex items-center space-x-1 shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {isInspecting ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Inspecting...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          <span>Inspect Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Channel Rows */}
                <div className="space-y-3">
                  {editChannels.map((ch, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border transition space-y-3 ${
                        ch.isPrimary
                          ? "bg-indigo-50/40 border-indigo-300 shadow-xs"
                          : "bg-slate-50/70 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <PlatformIcon platform={ch.platform} size="sm" />
                          <span className="text-xs font-extrabold text-slate-900">
                            Channel #{idx + 1}: {ch.platform}
                          </span>
                          {ch.isPrimary ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center space-x-1">
                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                              <span>Primary Flagship</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryChannel(idx)}
                              className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-slate-600 hover:bg-amber-50 hover:text-amber-800 border border-slate-200 hover:border-amber-300 transition cursor-pointer"
                            >
                              Set as Primary
                            </button>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          {ch.url && ch.url !== "#" && (
                            <a
                              href={ch.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg bg-white hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200 transition"
                              title="Open link in new tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteChannelRow(idx)}
                            className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition cursor-pointer"
                            title="Delete this channel"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
                        {/* Platform Selector */}
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Platform
                          </label>
                          <select
                            value={ch.platform}
                            onChange={(e) => handleUpdateChannelField(idx, "platform", e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="TikTok">TikTok</option>
                            <option value="YouTube">YouTube</option>
                            <option value="Facebook">Facebook (Profile/Page)</option>
                            <option value="Facebook Group">Facebook Group</option>
                            <option value="Instagram">Instagram</option>
                            <option value="Threads">Threads</option>
                            <option value="Strava Club">Strava Club</option>
                            <option value="Zalo Group">Zalo Group</option>
                            <option value="Telegram">Telegram</option>
                            <option value="Website">Website / Blog</option>
                          </select>
                        </div>

                        {/* Handle */}
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Handle / Username
                          </label>
                          <input
                            type="text"
                            value={ch.handle}
                            onChange={(e) => handleUpdateChannelField(idx, "handle", e.target.value)}
                            placeholder="@handle"
                            className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-slate-800 font-mono text-xs focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        {/* Channel URL */}
                        <div className="lg:col-span-2">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Channel URL Link
                          </label>
                          <input
                            type="url"
                            value={ch.url}
                            onChange={(e) => handleUpdateChannelField(idx, "url", e.target.value)}
                            placeholder="https://..."
                            className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500 font-mono truncate"
                          />
                        </div>

                        {/* Followers */}
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Followers
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={ch.followers}
                            onChange={(e) => handleUpdateChannelField(idx, "followers", e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        {/* Avg Views & ER Row */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              Avg Views
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={ch.avgViews}
                              onChange={(e) => handleUpdateChannelField(idx, "avgViews", e.target.value)}
                              className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-300 text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              ER (%)
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              max={100}
                              value={ch.er}
                              onChange={(e) => handleUpdateChannelField(idx, "er", e.target.value)}
                              className="w-full px-2 py-1.5 bg-white rounded-lg border border-slate-300 text-emerald-700 font-bold focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Creator Specs & Commercial Details */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="pb-3 border-b border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                    <Briefcase className="w-4 h-4 text-indigo-600" />
                    <span>Creator Specs & Commercial Profile</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    General categorization, market coverage, and commercial booking rate card.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  {/* Creator Name */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      KOL / Creator Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editSpecs.name}
                      onChange={(e) => setEditSpecs({ ...editSpecs, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-300 font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Tier */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Creator Tier
                    </label>
                    <select
                      value={editSpecs.tier}
                      onChange={(e) => setEditSpecs({ ...editSpecs, tier: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-300 text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Mega (> 200k)">Mega (&gt; 200k)</option>
                      <option value="Macro (100k - 200k)">Macro (100k - 200k)</option>
                      <option value="Mid-tier (50k - 100k)">Mid-tier (50k - 100k)</option>
                      <option value="Micro (10k - 50k)">Micro (10k - 50k)</option>
                      <option value="Nano (< 10k)">Nano (&lt; 10k)</option>
                    </select>
                  </div>

                  {/* Geography */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Geographic Region
                    </label>
                    <select
                      value={editSpecs.geography}
                      onChange={(e) => setEditSpecs({ ...editSpecs, geography: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-300 text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Nationwide">Nationwide (Toàn quốc)</option>
                      <option value="Hanoi">Hanoi (Hà Nội)</option>
                      <option value="Ho Chi Minh City">Ho Chi Minh City (TP.HCM)</option>
                      <option value="Da Nang">Da Nang (Đà Nẵng)</option>
                      <option value="Northern Vietnam">Northern Vietnam (Miền Bắc)</option>
                      <option value="Southern Vietnam">Southern Vietnam (Miền Nam)</option>
                    </select>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Partnership Status
                    </label>
                    <select
                      value={editSpecs.status}
                      onChange={(e) => setEditSpecs({ ...editSpecs, status: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-300 text-slate-900 font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Active Partnership">Active Partnership</option>
                      <option value="Potential">Potential</option>
                      <option value="New Scout (Unverified)">New Scout (Unverified)</option>
                      <option value="In Negotiation">In Negotiation</option>
                      <option value="Paused">Paused</option>
                    </select>
                  </div>
                </div>

                {/* Commercial Rate Card */}
                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center space-x-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-amber-700" />
                      <span>Commercial Booking Fee (Quotation)</span>
                    </span>
                    {isAdmin ? (
                      <span className="text-[10px] font-bold bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded">
                        Administrator Editable
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded flex items-center space-x-1">
                        <Lock className="w-3 h-3" />
                        <span>Admin Locked</span>
                      </span>
                    )}
                  </div>

                  {isAdmin ? (
                    <div className="space-y-1">
                      <div className="relative max-w-sm">
                        <input
                          type="number"
                          min={0}
                          step={500000}
                          value={editSpecs.quotation}
                          onChange={(e) =>
                            setEditSpecs({
                              ...editSpecs,
                              quotation: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full px-3 py-2 bg-white rounded-lg border border-amber-300 text-amber-950 font-black text-base focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                      <span className="text-[10px] text-amber-800 block">
                        Current display value: {formatCurrency(editSpecs.quotation)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm font-bold text-amber-950">
                      {formatCurrency(editSpecs.quotation)} (Restricted to Administrators)
                    </div>
                  )}
                </div>

                {/* Sports Disciplines */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1.5">
                    Sports Disciplines (Click to toggle)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Football",
                      "Pickleball",
                      "Running",
                      "Badminton",
                      "Cycling",
                      "Basketball",
                      "Tennis",
                      "Fitness",
                    ].map((sportName) => {
                      const isSelected = editSpecs.sport.includes(sportName);
                      return (
                        <button
                          key={sportName}
                          type="button"
                          onClick={() => {
                            setEditSpecs({
                              ...editSpecs,
                              sport: isSelected
                                ? editSpecs.sport.filter((s: string) => s !== sportName)
                                : [...editSpecs.sport, sportName],
                            });
                          }}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                            isSelected
                              ? "bg-indigo-600 text-white shadow-xs"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          <span>🏅 {sportName}</span>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bio / Description */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Creator Bio & Notes
                  </label>
                  <textarea
                    rows={3}
                    value={editSpecs.info}
                    onChange={(e) => setEditSpecs({ ...editSpecs, info: e.target.value })}
                    placeholder="Brief intro, playing style, campaign highlights, agency contact..."
                    className="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-300 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Bottom Sticky Action Controls */}
              <div className="sticky bottom-0 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-xl flex items-center justify-between gap-4">
                <div className="text-xs text-slate-500">
                  Saving updates all connected channels, recalculates audience aggregates, and syncs to Supabase.
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveAll}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ─── OMNI-CHANNEL FOOTPRINT & CHANNEL BREAKDOWN MATRIX ─── */}
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-indigo-900/50 space-y-4">
            {/* Section Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center space-x-2">
                    <span>Omni-Channel Footprint & Channel Matrix</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 normal-case">
                      {aggregates.channelCount} {aggregates.channelCount === 1 ? "channel" : "connected channels"}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Individual platform metrics vs. cross-channel aggregated totals
                  </p>
                </div>
              </div>

              {/* Aggregated Cross-Platform Totals Pill */}
              <div className="flex items-center space-x-3 bg-white/10 backdrop-blur-sm px-3.5 py-1.5 rounded-xl border border-white/10 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Total Reach</span>
                  <span className="font-extrabold text-white">{formatNumber(aggregates.totalFollowers)}</span>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div>
                  <span className="text-slate-400 text-[10px] block">Combined Views</span>
                  <span className="font-extrabold text-indigo-200">
                    {aggregates.totalAvgViews > 0 ? formatNumber(aggregates.totalAvgViews) : "—"}
                  </span>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div>
                  <span className="text-slate-400 text-[10px] block">Blended ER</span>
                  <span className="font-extrabold text-emerald-300">
                    {aggregates.blendedEr > 0 ? `${aggregates.blendedEr}%` : "—"}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={startEditing}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95 cursor-pointer"
                  title="Manage and edit connected channels & metrics"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Edit Channels & Metrics</span>
                </button>
                {onAddChannel && (
                  <button
                    type="button"
                    onClick={() => onAddChannel(currentKol)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition flex items-center space-x-1 cursor-pointer"
                    title="Quick attach channel"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Quick Add</span>
                  </button>
                )}
              </div>
            </div>

            {/* Audience Share Stacked Distribution Bar */}
            {aggregates.channels.length > 1 && (
              <div className="space-y-2 bg-white/5 p-3.5 rounded-xl border border-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300 text-[11px]">
                    Cross-Platform Audience Share Distribution:
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    100% = {formatNumber(aggregates.totalFollowers)} Combined Audience
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                  {aggregates.channels.map((ch, idx) => {
                    const cfg = getPlatformConfig(ch.platform);
                    const pct = aggregates.totalFollowers > 0
                      ? Math.round((ch.followers / aggregates.totalFollowers) * 100)
                      : 0;
                    return (
                      <div
                        key={idx}
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: cfg.brandColor }}
                        className="h-full transition-all relative group"
                        title={`${ch.platform}: ${formatNumber(ch.followers)} (${pct}%)`}
                      />
                    );
                  })}
                </div>

                {/* Legend items */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs">
                  {aggregates.channels.map((ch, idx) => {
                    const cfg = getPlatformConfig(ch.platform);
                    const pct = aggregates.totalFollowers > 0
                      ? ((ch.followers / aggregates.totalFollowers) * 100).toFixed(1)
                      : "0";
                    return (
                      <div key={idx} className="flex items-center space-x-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cfg.brandColor }}
                        />
                        <span className="font-medium text-slate-300">{ch.platform}:</span>
                        <span className="font-bold text-white">{formatNumber(ch.followers)}</span>
                        <span className="text-[10px] text-slate-400">({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Individual Channel Comparison Cards Grid */}
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 ${
                aggregates.channels.length >= 4
                  ? "lg:grid-cols-4"
                  : aggregates.channels.length === 3
                  ? "lg:grid-cols-3"
                  : "lg:grid-cols-2"
              } gap-3`}
            >
              {aggregates.channels.map((ch, idx) => {
                const sharePct = aggregates.totalFollowers > 0
                  ? ((ch.followers / aggregates.totalFollowers) * 100).toFixed(1)
                  : "0";
                const isSelected =
                  selectedChannelPlatform.toLowerCase() === ch.platform.toLowerCase();

                return (
                  <div
                    key={idx}
                    className={`bg-white rounded-xl p-3.5 text-slate-900 border transition shadow-sm flex flex-col justify-between ${
                      isSelected
                        ? "ring-2 ring-purple-500 border-purple-500"
                        : "border-slate-200 hover:border-indigo-300"
                    }`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <PlatformIcon platform={ch.platform} size="sm" />
                          <span className="font-black text-sm text-slate-900">{ch.platform}</span>
                          {ch.isPrimary && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                              Primary
                            </span>
                          )}
                        </div>
                        {ch.url && ch.url !== "#" && (
                          <a
                            href={ch.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition"
                            title={`Visit ${ch.platform} Profile`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      {/* Handle */}
                      <p className="text-xs text-slate-500 truncate font-mono mt-1.5" title={ch.handle}>
                        {ch.handle.startsWith("@") ? ch.handle : `@${ch.handle}`}
                      </p>

                      {/* Metric Triplet */}
                      <div className="mt-3 space-y-2 pt-2.5 border-t border-slate-100 text-xs">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[11px] text-slate-400 font-medium">Followers</span>
                          <div className="text-right">
                            <span className="text-sm font-black text-slate-900">
                              {formatNumber(ch.followers)}
                            </span>
                            <span className="text-[10px] text-indigo-600 font-semibold block">
                              {sharePct}% share
                            </span>
                          </div>
                        </div>

                        <div className="flex items-baseline justify-between">
                          <span className="text-[11px] text-slate-400 font-medium">Avg Views</span>
                          <span className="text-xs font-bold text-slate-800">
                            {ch.avgViews > 0 ? formatNumber(ch.avgViews) : "—"}
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                          <span className="text-[11px] text-slate-400 font-medium">Audience ER</span>
                          <span className="text-xs font-black text-emerald-600">
                            {ch.er > 0 ? `${ch.er}%` : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Filter Posts Trigger Button */}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedChannelPlatform(
                          isSelected ? "all" : ch.platform.toLowerCase()
                        )
                      }
                      className={`mt-3 w-full py-1.5 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer ${
                        isSelected
                          ? "bg-purple-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-700"
                      }`}
                    >
                      <span>{isSelected ? `Showing ${ch.platform} Posts` : `View ${ch.platform} Posts`}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* UPPER SECTION: 2-COLUMN GRID (SPECS & RATE CARD + PM REVIEWS) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* PANEL 1: CREATOR SPECS & COMMERCIAL RATE CARD */}
            <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                  <span>CREATOR SPECS & COMMERCIAL RATE CARD</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                  {currentKol.tier}
                </span>
              </div>

              {/* Sports Disciplines */}
              <div>
                <span className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Sports Disciplines:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {currentKol.sport.map((s, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-100"
                    >
                      🏅 {t(s)}
                    </span>
                  ))}
                </div>
              </div>

              {/* 4-Box Creator Specs & Classification Grid (Non-redundant) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 block font-medium">
                    Creator Tier
                  </span>
                  <span className="font-extrabold text-sm text-indigo-600 mt-0.5 block">
                    {currentKol.tier}
                  </span>
                  <span className="text-[9px] text-slate-400 font-medium block">Classification</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 block font-medium">
                    Primary Flagship
                  </span>
                  <span className="font-extrabold text-sm text-slate-900 mt-0.5 flex items-center justify-center space-x-1">
                    <PlatformIcon
                      platform={aggregates.primaryChannel?.platform || currentKol.platform}
                      size="xs"
                    />
                    <span>{aggregates.primaryChannel?.platform || currentKol.platform}</span>
                  </span>
                  <span
                    className="text-[9px] text-indigo-600 font-mono truncate block max-w-[110px] mx-auto mt-0.5"
                    title={aggregates.primaryChannel?.handle}
                  >
                    {aggregates.primaryChannel?.handle || "Flagship Channel"}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 block font-medium">
                    Geographic Region
                  </span>
                  <span className="font-extrabold text-sm text-slate-900 mt-0.5 block">
                    {t(currentKol.geography)}
                  </span>
                  <span className="text-[9px] text-slate-400 font-medium block">Target Market</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 block font-medium">
                    Partnership Status
                  </span>
                  <span className="font-extrabold text-xs text-emerald-600 mt-0.5 block truncate">
                    {t(currentKol.status)}
                  </span>
                  <span className="text-[9px] text-emerald-500 font-medium block">CRM Pipeline</span>
                </div>
              </div>

              {/* Quick Action: Metric History & Growth Trends */}
              {onOpenGrowth && (
                <button
                  type="button"
                  onClick={() => onOpenGrowth(currentKol)}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition border border-indigo-200/60 cursor-pointer active:scale-[0.99]"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                  <span>View Metric History & Growth Trends</span>
                </button>
              )}

              {/* Reference Rate Card */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50/60 p-4 rounded-xl border border-amber-200">
                <span className="text-[11px] font-semibold text-amber-900 uppercase block tracking-wider">
                  Reference Rate Card (Commercial Booking Rates)
                </span>
                {isAdmin ? (
                  <>
                    <div className="text-xl font-black text-amber-950 mt-1">
                      {currentKol.quotation > 0
                        ? formatCurrency(currentKol.quotation)
                        : "Negotiable upon campaign scope"}
                    </div>
                    <span className="text-[10px] text-amber-700 mt-1 block">
                      Commercial fee for dedicated brand video, review reel, or event attendance.
                    </span>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold text-amber-900/80 mt-1.5 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-amber-700" />
                      <span>Restricted to Administrators</span>
                    </div>
                    <span className="text-[10px] text-amber-700 mt-1 block">
                      Quotation rate cards and commercial fees are visible only to platform administrators.
                    </span>
                  </>
                )}
              </div>

              {/* Bio & Intro */}
              {currentKol.info && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">Bio & Introduction:</span>
                  <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-200">
                    {currentKol.info}
                  </p>
                </div>
              )}
            </div>

            {/* PANEL 2: PM REVIEWS & PROJECT AUDIT HISTORY */}
            <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    PM REVIEWS & CAMPAIGN AUDIT
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                    {kolReports.length} reports
                  </span>
                  {onOpenReport && (
                    <button
                      onClick={() => onOpenReport(currentKol)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Review</span>
                    </button>
                  )}
                </div>
              </div>

              {kolReports.length > 0 ? (
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {kolReports.map((r) => (
                    <div
                      key={r.id}
                      className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5 hover:border-amber-300 hover:shadow-sm transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 leading-tight">
                            {r.project || r.title}
                          </h4>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Reviewer:{" "}
                            <span className="font-semibold text-slate-700">
                              {r.evaluator || "PM Lead"}
                            </span>
                          </p>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-extrabold text-xs border border-amber-200 shrink-0">
                          ⭐ {r.score}/5
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Attitude</span>
                          <span className="font-bold text-slate-800">{r.attitude}/5 ⭐</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Timeline</span>
                          <span className="font-semibold text-emerald-700">{t(r.deadline)}</span>
                        </div>
                        {r.kpiRate > 0 && (
                          <div className="col-span-2 pt-1 border-t border-slate-200/60 flex items-center justify-between">
                            <span className="text-[10px] text-slate-500">KPI Attainment:</span>
                            <span className="font-extrabold text-indigo-600">{r.kpiRate}%</span>
                          </div>
                        )}
                      </div>

                      {r.notes && (
                        <div className="p-2 bg-amber-50/60 rounded-lg border border-amber-100">
                          <span className="text-[10px] font-bold text-amber-800 block uppercase">
                            PM Qualitative Notes:
                          </span>
                          <p className="text-xs text-slate-800 italic mt-0.5 leading-relaxed">
                            "{r.notes}"
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-2">
                  <Award className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-medium text-slate-600">
                    No evaluation history found for this KOL.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Submit a review after each campaign to build a comprehensive 360° record.
                  </p>
                  {onOpenReport && (
                    <button
                      onClick={() => onOpenReport(currentKol)}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 transition shadow-xs cursor-pointer mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Write First Evaluation</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ─── AUDIENCE AUTHENTICITY & COMMERCIAL SPONSORSHIP AUDIT ─── */}
          {audienceAudit && audienceAudit.totalPostsScanned > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5">
              {/* Section Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
                        Audience Authenticity & Commercial Sponsorship Audit
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                        AI NLP Scanner
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Comment topic clustering, seeding vs organic detection, and brand collaboration saturation
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-400 mr-1">
                    Audited {audienceAudit.totalPostsScanned} posts & {audienceAudit.totalCommentsScanned} comments
                  </span>
                  <button
                    type="button"
                    disabled={isAuditing}
                    onClick={() => handleRunLiveAudit()}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                    title="Re-run audit on existing scouted posts"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-amber-300 ${isAuditing ? "animate-spin" : ""}`} />
                    <span>{isAuditing ? "Auditing..." : "Refresh Audit"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isAuditing}
                    onClick={() => handleRunLiveAudit({ forceScout: true })}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center space-x-1.5 border border-indigo-200 shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
                    title="Scout fresh posts via Apify and re-run audit"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Scout via Apify & Re-Audit</span>
                  </button>
                </div>
              </div>

              {/* Main 2-Column Audit Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* COLUMN 1: AUDIENCE QUALITY & COMMENT TOPIC DISTRIBUTION */}
                <div className="space-y-4 bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <MessageCircle className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Audience Engagement Authenticity
                      </h4>
                    </div>
                    {audienceAudit.totalCommentsScanned > 0 ? (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          audienceAudit.seedingRiskLevel === "Low"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : audienceAudit.seedingRiskLevel === "Moderate"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        {audienceAudit.seedingRiskLevel} Seeding Risk
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold border bg-slate-100 text-slate-600 border-slate-200">
                        No comment sample
                      </span>
                    )}
                  </div>

                  {/* Dual Metric Split */}
                  <div className="space-y-2">
                    {audienceAudit.totalCommentsScanned > 0 ? (
                      <>
                        <div className="flex items-center justify-between text-xs font-extrabold">
                          <span className="text-emerald-700 flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{audienceAudit.realAudienceRate}% Real Audience</span>
                          </span>
                          <span className="text-amber-700">
                            {audienceAudit.seedingRate}% Seeding / Bot
                          </span>
                        </div>
                        <div className="h-3 w-full bg-amber-200 rounded-full overflow-hidden flex shadow-inner">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${audienceAudit.realAudienceRate}%` }}
                            title={`Organic Audience: ${audienceAudit.realAudienceRate}%`}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          Evaluated from technical sports inquiries, sentence naturalness, and bot-comment heuristics.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Comment text was not included with these posts, so real-audience and seeding rates were not scored.
                      </p>
                    )}
                  </div>

                  {/* Top 5 Tag Distribution (Comments & Content Topics) */}
                  <div className="space-y-2.5 pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Top 5 Tag Distribution</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        Audience comment & content topics
                      </span>
                    </div>

                    <div className="space-y-2">
                      {audienceAudit.topTagDistribution.map((item, idx) => {
                        const barColor = item.color || getTagColor(item.tag, idx);
                        return (
                          <div key={item.tag} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-700 text-[11px] truncate max-w-[220px]">
                                {item.tag}
                              </span>
                              <span className="font-extrabold text-slate-900 text-xs">
                                {item.percentage}%
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${item.percentage}%`,
                                  backgroundColor: barColor,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sample Comments Drilldown Toggle */}
                  {audienceAudit.sampleComments && (
                    <div className="pt-2 border-t border-slate-200/60">
                      <button
                        type="button"
                        onClick={() => setShowSampleComments(!showSampleComments)}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer transition"
                      >
                        <span>
                          {showSampleComments
                            ? "Hide Sample Audit Comments"
                            : "Inspect Sample Comments & Seeding Signals"}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${
                            showSampleComments ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {showSampleComments && (
                        <div className="mt-2.5 space-y-2.5 text-xs bg-white p-3 rounded-xl border border-slate-200 animate-in fade-in duration-150">
                          <div>
                            <span className="text-[10px] font-bold uppercase text-emerald-700 block mb-1">
                              ✓ Organic Audience Discussions:
                            </span>
                            <ul className="space-y-1 text-slate-700 italic text-[11px]">
                              {audienceAudit.sampleComments.organic.map((c, i) => (
                                <li key={i} className="pl-2 border-l-2 border-emerald-400">
                                  &ldquo;{c}&rdquo;
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="pt-2 border-t border-slate-100">
                            <span className="text-[10px] font-bold uppercase text-amber-700 block mb-1">
                              ⚠ Flagged Seeding / Bot Signals:
                            </span>
                            <ul className="space-y-1 text-slate-600 italic text-[11px]">
                              {audienceAudit.sampleComments.seeding.map((c, i) => (
                                <li key={i} className="pl-2 border-l-2 border-amber-400">
                                  &ldquo;{c}&rdquo;
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* COLUMN 2: COMMERCIAL SATURATION & BRAND BOOKING PORTFOLIO */}
                <div className="space-y-4 bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Briefcase className="w-4 h-4 text-indigo-600" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          Commercial Sponsorship Saturation
                        </h4>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          audienceAudit.commercialSaturation === "Heavy Commercial"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : audienceAudit.commercialSaturation === "Balanced"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {audienceAudit.commercialSaturation}
                      </span>
                    </div>

                    {/* Prominent % Sponsored Content Card (Benchmark Style with Highlight Ring) */}
                    <div className="bg-gradient-to-br from-white to-indigo-50/50 p-4 rounded-xl border-2 border-indigo-300/80 shadow-sm flex items-center justify-between gap-4">
                      <div>
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                          The percentage of sponsored content
                        </span>
                        <div className="flex items-baseline space-x-2 mt-1">
                          <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                            {audienceAudit.sponsoredContentRate}%
                          </span>
                          <span className="text-xs font-bold text-indigo-600">
                            sponsored by brands
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                          Scanned via Vietnam Advertising Law disclosure tags (#ad, #quangcao, #duoctaitro) and platform Branded Content tools.
                        </p>
                      </div>

                      {/* Circular visual badge */}
                      <div className="w-16 h-16 rounded-full border-4 border-indigo-600/30 flex items-center justify-center shrink-0 bg-white shadow-xs">
                        <span className="text-xs font-black text-indigo-700 text-center leading-tight">
                          {audienceAudit.sponsoredContentRate > 60
                            ? "Heavy"
                            : audienceAudit.sponsoredContentRate > 30
                            ? "Balanced"
                            : "Low"}
                        </span>
                      </div>
                    </div>

                    {/* Booked Categories (Ngành Hàng Được Book) */}
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <span className="text-xs font-bold text-slate-800 block">
                        Top Booked Categories (Brand Industries):
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {audienceAudit.bookedCategories.map((cat) => (
                          <div
                            key={cat.category}
                            className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between text-xs"
                          >
                            <span className="font-semibold text-slate-700 truncate mr-1">
                              {cat.category}
                            </span>
                            <div className="text-right shrink-0">
                              <span className="font-extrabold text-indigo-600">
                                {cat.percentage}%
                              </span>
                              {cat.count !== undefined && cat.count > 0 && (
                                <span className="text-[10px] text-slate-400 block font-normal">
                                  {cat.count} {cat.count === 1 ? "post" : "posts"}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Detected Brand Collaborations (Thương hiệu đã book) */}
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <span className="text-xs font-bold text-slate-800 block">
                        Detected Brand Partners & Collaborations:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {audienceAudit.partnerBrands.map((brand) => (
                          <div
                            key={brand.brand}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs text-xs hover:border-indigo-300 transition"
                          >
                            <span className="font-extrabold text-slate-900">{brand.brand}</span>
                            {brand.handle && (
                              <span className="font-mono text-[10px] text-indigo-600">
                                {brand.handle}
                              </span>
                            )}
                            {brand.industry && (
                              <span className="text-[10px] text-slate-400 hidden sm:inline">
                                • {brand.industry}
                              </span>
                            )}
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                              {brand.postCount} {brand.postCount === 1 ? "post" : "posts"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Audit Summary & Timestamp Prose Card (Under Panels) */}
              <div className="p-4 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 rounded-xl border border-indigo-100/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1 max-w-3xl">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="font-extrabold uppercase text-[10px] text-indigo-900 tracking-wider">
                      AI Audit Summary & Synthesis:
                    </span>
                    {audienceAudit.auditedAt && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        • Audited {formatAuditTimestamp(audienceAudit.auditedAt)}
                      </span>
                    )}
                  </div>
                  {audienceAudit.auditSummary && (
                    <p className="text-slate-800 italic leading-relaxed text-xs">
                      &ldquo;{cleanAuditSummary(audienceAudit.auditSummary, audienceAudit.totalCommentsScanned)}&rdquo;
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isAuditing}
                  onClick={() => handleRunLiveAudit()}
                  className="shrink-0 px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-200 shadow-2xs flex items-center space-x-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Force re-run live audit"
                >
                  <RefreshCw className={`w-3 h-3 text-indigo-600 ${isAuditing ? "animate-spin" : ""}`} />
                  <span>{isAuditing ? "Auditing..." : "Refresh Audit"}</span>
                </button>
              </div>
            </div>
          ) : audienceAudit && audienceAudit.totalPostsScanned === 0 ? (
            /* ─── EMPTY AUDIT WITH ZERO POSTS ─── */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Zero Posts Found for Audience Audit
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  {audienceAudit.auditSummary ||
                    "No posts or comments were available during the audit scan. Scout posts for this creator to generate comment sentiment, authenticity, and brand saturation insights."}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isAuditing}
                  onClick={() => handleRunLiveAudit({ forceScout: true })}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer active:scale-95 flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${isAuditing ? "animate-spin" : ""}`} />
                  <span>{isAuditing ? "Scouting & Auditing..." : `Scout via Apify & Re-Audit`}</span>
                </button>
                <button
                  type="button"
                  disabled={isAuditing}
                  onClick={() => handleRunLiveAudit()}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer active:scale-95 flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? "animate-spin" : ""}`} />
                  <span>{isAuditing ? "Auditing..." : "Re-run Audit Only"}</span>
                </button>
              </div>
            </div>
          ) : (
            /* ─── EMPTY STATE: NO AUDIT RUN YET ─── */
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 shadow-2xs p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-indigo-600 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Audience Authenticity & Commercial Sponsorship Audit
                </h4>
                {kolPosts.length === 0 ? (
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                    No scouted posts found yet. Clicking &ldquo;Run Apify Scout &amp; Audit&rdquo; will automatically scrape the creator&apos;s latest social posts via Apify and evaluate audience authenticity.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                    Audience authenticity and sponsored content have not been audited yet. Analyze comment sentiments, seeding risk, and brand sponsorship ratios across {kolPosts.length} scouted posts.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isAuditing}
                  onClick={() => handleRunLiveAudit({ forceScout: kolPosts.length === 0 })}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer active:scale-95 flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${isAuditing ? "animate-spin" : ""}`} />
                  <span>
                    {isAuditing
                      ? "Auditing via Apify..."
                      : kolPosts.length === 0
                      ? "Run Apify Scout & Audit"
                      : "Run Audience Audit"}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ─── BOTTOM SECTION: COMPREHENSIVE SCOUTED POSTS SUMMARY TABLE ─── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
            {/* Table Header & Controls */}
            <div className="space-y-3 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                    <Flame className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                      <span>Scouted Viral Posts & Reels Database</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 normal-case">
                        {selectedChannelPlatform !== "all"
                          ? `${displayedPosts.length} of ${kolPosts.length} posts`
                          : `${kolPosts.length} posts`}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Aggregated repository of scouted posts, TikTok videos, and Reels for <strong>{currentKol.name}</strong> with real-time performance metrics
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2.5">
                  {onScoutKolPosts && (
                    <button
                      type="button"
                      onClick={() => onScoutKolPosts(currentKol)}
                      className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 hover:text-purple-800 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 border border-purple-200 cursor-pointer active:scale-95 shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>Scout KOL Posts</span>
                    </button>
                  )}

                  {/* Quick Search in Posts */}
                  {kolPosts.length > 0 && (
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Search posts, platforms..."
                        value={postSearch}
                        onChange={(e) => setPostSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Channel Filter Tabs */}
              {aggregates.channels.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1">Filter by Channel:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedChannelPlatform("all")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      selectedChannelPlatform === "all"
                        ? "bg-purple-600 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    All Channels ({kolPosts.length})
                  </button>
                  {aggregates.channels.map((ch) => {
                    const count = kolPosts.filter((p) =>
                      p.platform.toLowerCase().includes(ch.platform.toLowerCase())
                    ).length;
                    const isSelected =
                      selectedChannelPlatform.toLowerCase() === ch.platform.toLowerCase();
                    return (
                      <button
                        key={ch.platform}
                        type="button"
                        onClick={() =>
                          setSelectedChannelPlatform(isSelected ? "all" : ch.platform.toLowerCase())
                        }
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          isSelected
                            ? "bg-purple-600 text-white shadow-2xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        <PlatformIcon platform={ch.platform} size="xs" />
                        <span>{ch.platform}</span>
                        <span className="text-[10px] opacity-75">({count})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Posts Data Table */}
            {displayedPosts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">#</th>
                      <th className="py-3 px-4 min-w-[280px]">Post / Reel Title & Content Hook</th>
                      <th className="py-3 px-3 text-center">Platform</th>
                      <th className="py-3 px-3 text-right">Views</th>
                      <th className="py-3 px-3 text-right">Likes</th>
                      <th className="py-3 px-3 text-right">Comments</th>
                      <th className="py-3 px-3 text-center">ER %</th>
                      <th className="py-3 px-3 text-center">Viral Grade</th>
                      <th className="py-3 px-3 text-center min-w-[100px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedPosts.map((post, idx) => (
                      <tr key={post.id} className="hover:bg-purple-50/30 transition group">
                        <td className="py-3 px-3 text-center font-medium text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-start space-x-2">
                            <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs shrink-0 mt-0.5 group-hover:bg-purple-100 group-hover:text-purple-700 transition">
                              🎬
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center space-x-1.5 flex-wrap">
                                <p className="font-bold text-slate-900 leading-snug">
                                  {post.title}
                                </p>
                                {(post.isSponsored ||
                                  post.sponsorBrand ||
                                  (post.title &&
                                    (post.title.toLowerCase().includes("@garmin") ||
                                      post.title.toLowerCase().includes("@nike") ||
                                      post.title.toLowerCase().includes("#ad") ||
                                      post.title.toLowerCase().includes("#quangcao") ||
                                      post.title.toLowerCase().includes("#duoctaitro")))) && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {post.sponsorBrand ? `Sponsored: ${post.sponsorBrand}` : "Sponsored"}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                Author: {post.author || currentKol.name}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                            {post.platform}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                          {post.views > 0 ? (
                            <span className="flex items-center justify-end space-x-1">
                              <Eye className="w-3 h-3 text-slate-400" />
                              <span>{formatNumber(post.views)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                          {post.likes > 0 ? (
                            <span className="flex items-center justify-end space-x-1">
                              <Heart className="w-3 h-3 text-rose-400" />
                              <span>{formatNumber(post.likes)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                          {post.comments > 0 ? (
                            <span className="flex items-center justify-end space-x-1">
                              <MessageCircle className="w-3 h-3 text-slate-400" />
                              <span>{formatNumber(post.comments)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {post.er}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center space-x-1">
                            <Flame className="w-3 h-3 text-rose-500" />
                            <span>{t(post.viralGrade)}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {post.postUrl && post.postUrl !== "#" ? (
                            <a
                              href={post.postUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white font-bold text-[11px] transition shadow-2xs"
                            >
                              <span>Watch Post</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-2">
                <Flame className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-medium text-slate-600">
                  No scouted posts found for {currentKol.name}.
                </p>
                <p className="text-[11px] text-slate-400">
                  Use automated crawling to scout the latest viral TikTok videos, Reels, and social media posts.
                </p>
                {onScoutKolPosts && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onScoutKolPosts(currentKol)}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Scout Posts for {currentKol.name}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. MODAL: 360° COMMUNITY & CLUB DOSSIER POPUP
// ==========================================
// 2. MODAL: 360° COMMUNITY & CLUB DOSSIER POPUP
// ==========================================
export interface Community360ModalProps {
  isOpen: boolean;
  community: Community | null;
  posts?: Post[];
  reports?: Report[];
  onClose: () => void;
  onOpenReport?: (community: Community) => void;
  onEditCommunity?: (community: Community) => void;
  onScoutCommunityPosts?: (community: Community) => void;
  onDeleteCommunity?: (community: Community) => void;
  onAddChannel?: (community: Community) => void;
}

export function Community360Modal({
  isOpen,
  community,
  posts = [],
  reports = [],
  onClose,
  onOpenReport,
  onEditCommunity,
  onScoutCommunityPosts,
  onDeleteCommunity,
  onAddChannel,
}: Community360ModalProps) {
  const { isAdmin } = useCurrentUser();
  const [postSearch, setPostSearch] = useState("");

  // Filter evaluation reports for this community
  const communityReports = useMemo(() => {
    if (!reports || !community) return [];
    return reports.filter((r) => {
      const matchName =
        r.kolName &&
        (r.kolName.toLowerCase().includes(community.name.toLowerCase()) ||
          community.name.toLowerCase().includes(r.kolName.toLowerCase()));
      const matchId =
        r.kolRecordIds && r.kolRecordIds.includes(community.id);
      return matchName || matchId;
    });
  }, [reports, community]);

  const avgScore = useMemo(() => {
    return communityReports.length > 0
      ? (
          communityReports.reduce((acc, curr) => acc + (curr.score || 0), 0) /
          communityReports.length
        ).toFixed(1)
      : "5.0";
  }, [communityReports]);

  if (!isOpen || !community) return null;

  const commAggregates = useMemo(() => getCommunityAggregates(community), [community]);

  // Filter posts related to this community's sports or author
  const relatedPosts = useMemo(() => {
    return posts.filter((p) => {
      const matchSport = community.sport.some(
        (sp) =>
          p.title.toLowerCase().includes(sp.toLowerCase()) ||
          sp.toLowerCase().includes(p.title.toLowerCase())
      );
      const matchName =
        p.author &&
        (p.author.toLowerCase().includes(community.name.toLowerCase()) ||
          community.name.toLowerCase().includes(p.author.toLowerCase()));
      return matchSport || matchName;
    });
  }, [posts, community]);

  // Filtered posts by search keyword inside modal table
  const displayedPosts = useMemo(() => {
    if (!postSearch.trim()) return relatedPosts;
    const q = postSearch.trim().toLowerCase();
    return relatedPosts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.platform.toLowerCase().includes(q) ||
        (p.viralGrade && p.viralGrade.toLowerCase().includes(q))
    );
  }, [relatedPosts, postSearch]);

  // Aggregated Media Metrics for Community
  const totalPostViews = useMemo(
    () => relatedPosts.reduce((acc, curr) => acc + (curr.views || 0), 0),
    [relatedPosts]
  );
  const totalPostLikes = useMemo(
    () => relatedPosts.reduce((acc, curr) => acc + (curr.likes || 0), 0),
    [relatedPosts]
  );
  const totalPostComments = useMemo(
    () => relatedPosts.reduce((acc, curr) => acc + (curr.comments || 0), 0),
    [relatedPosts]
  );
  const avgPostEr = useMemo(() => {
    if (relatedPosts.length === 0) return 0;
    const sum = relatedPosts.reduce((acc, curr) => acc + (curr.er || 0), 0);
    return +(sum / relatedPosts.length).toFixed(1);
  }, [relatedPosts]);

  const handleCopyLink = () => {
    if (community.groupUrl && community.groupUrl !== "#") {
      navigator.clipboard.writeText(community.groupUrl);
      toast.success("Community link copied to clipboard!");
    } else {
      toast.info("Community URL is pending update.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── MODAL HEADER BANNER ─── */}
        <div className="relative bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 px-6 py-5 text-white shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold flex items-center justify-center text-3xl border-2 border-purple-400/40 shadow-lg shrink-0">
                👥
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30">
                    360° Community Dossier
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-400/30">
                    {t(community.activityLevel)}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                  {community.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-1">
                  <span className="font-semibold text-purple-300">{community.platform}</span>
                  <span>•</span>
                  <span className="flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t(community.geography)}</span>
                  </span>
                  <span>•</span>
                  <span className="text-emerald-300 font-bold">
                    {formatNumber(community.members)} Active Members
                  </span>
                  <span>•</span>
                  <span className="text-amber-300 font-bold flex items-center space-x-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{avgScore}/5.0 Score ({communityReports.length} reviews)</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center space-x-2">
              {onScoutCommunityPosts && (
                <button
                  type="button"
                  onClick={() => onScoutCommunityPosts(community)}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer border border-purple-400/30"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Scout Discussions</span>
                </button>
              )}

              {onOpenReport && (
                <button
                  type="button"
                  onClick={() => onOpenReport(community)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Evaluate</span>
                </button>
              )}

              {onEditCommunity && (
                <button
                  type="button"
                  onClick={() => onEditCommunity(community)}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition flex items-center space-x-1.5 border border-white/10 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}

              <button
                onClick={handleCopyLink}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition flex items-center space-x-1.5 border border-white/10 cursor-pointer"
                title="Copy Link"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>

              {community.groupUrl && community.groupUrl !== "#" && (
                <a
                  href={community.groupUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Visit Club</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition border border-white/10 cursor-pointer"
                title="Close Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* High-Level Community KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-white/10 text-xs">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300">Total Members</span>
              <span className="font-black text-white text-sm">{formatNumber(community.members)}</span>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300">Related Posts</span>
              <span className="font-black text-purple-300 text-sm">{relatedPosts.length} posts</span>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300">Total Media Reach</span>
              <span className="font-black text-indigo-300 text-sm">{formatNumber(totalPostViews)}</span>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 flex items-center justify-between">
              <span className="text-slate-300">Discussion ER</span>
              <span className="font-black text-emerald-300 text-sm">{avgPostEr}%</span>
            </div>
          </div>
        </div>

        {/* ─── MODAL SCROLLABLE BODY ─── */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* ─── MULTI-CHANNEL SOCIAL FOOTPRINT & PLATFORM HUBS ─── */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 text-white shadow-xl border border-indigo-500/20 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center space-x-2">
                    <span>Multi-Channel Social Footprint</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/30 text-purple-200 border border-purple-400/30 normal-case">
                      {commAggregates.channelCount} {commAggregates.channelCount === 1 ? "channel" : "connected channels"}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Official sports community platforms across Facebook, Strava, and Zalo
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-3 bg-white/10 backdrop-blur-sm px-3.5 py-1.5 rounded-xl border border-white/10 text-xs">
                  <span className="text-slate-400 text-[10px] block">Total Combined Reach</span>
                  <span className="font-extrabold text-white">{formatNumber(commAggregates.totalMembers)} members</span>
                </div>

                {onAddChannel && (
                  <button
                    type="button"
                    onClick={() => onAddChannel(community)}
                    className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95 cursor-pointer"
                    title="Attach another platform channel to this community"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Channel</span>
                  </button>
                )}
              </div>
            </div>

            {/* Channels Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {commAggregates.channels.map((ch, idx) => {
                const style = getPlatformBadgeStyle(ch.platform);
                return (
                  <div
                    key={idx}
                    className="p-3 bg-white/5 rounded-xl border border-white/10 hover:border-purple-400/40 transition flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className={`w-7 h-7 rounded-lg ${style.bg} text-white flex items-center justify-center shrink-0`}>
                        <PlatformIcon platform={ch.platform} className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-xs text-white">{ch.platform}</span>
                          {ch.isPrimary && (
                            <span className="px-1 py-0.2 rounded text-[8px] font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                              Primary
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 truncate block max-w-[130px]">
                          {ch.name || community.name}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-extrabold text-xs text-white block">
                        {formatNumber(ch.members)}
                      </span>
                      {ch.url && ch.url !== "#" ? (
                        <a
                          href={ch.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-purple-300 hover:text-white flex items-center justify-end space-x-0.5 hover:underline"
                        >
                          <span>Link</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-500">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* UPPER SECTION: 2-COLUMN GRID (COMMUNITY SPECS + ADMINISTRATION & TERMS) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* PANEL 1: COMMUNITY SPECS & COMMERCIAL PRICING */}
            <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                  <Users className="w-3.5 h-3.5 text-purple-600" />
                  <span>COMMUNITY SPECS & COMMERCIAL ADVERTISING</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                  {community.platform}
                </span>
              </div>

              {/* Sports Disciplines */}
              <div>
                <span className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Sports Disciplines:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {community.sport.map((s, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 text-xs font-semibold border border-purple-100"
                    >
                      🏅 {t(s)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Members & Activity Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 block font-medium">
                    Total Community Members
                  </span>
                  <span className="font-black text-base text-slate-900 mt-0.5 block">
                    {formatNumber(community.members)}
                  </span>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 block font-medium">
                    Activity Level
                  </span>
                  <span className="font-bold text-xs text-emerald-700 mt-0.5 block">
                    {t(community.activityLevel)}
                  </span>
                </div>
              </div>

              {/* Pinned Post Fee */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50/60 p-4 rounded-xl border border-purple-200">
                <span className="text-[11px] font-semibold text-purple-900 uppercase block tracking-wider">
                  Pinned Post Fee / Month (Commercial Pin Rate)
                </span>
                {isAdmin ? (
                  <>
                    <div className="text-xl font-black text-purple-950 mt-1">
                      {community.pricePerPin > 0
                        ? formatCurrency(community.pricePerPin)
                        : "Negotiable / Free Partnership"}
                    </div>
                    <span className="text-[10px] text-purple-700 mt-1 block">
                      Secures top announcement slot with high organic visibility for tournament & brand notices.
                    </span>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold text-purple-900/80 mt-1.5 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-purple-700" />
                      <span>Restricted to Administrators</span>
                    </div>
                    <span className="text-[10px] text-purple-700 mt-1 block">
                      Community booking and pin fee terms are visible only to platform administrators.
                    </span>
                  </>
                )}
              </div>

              {/* Operating Activities */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-600 block">
                  Group Operations & Member Activities:
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center space-x-1.5 text-slate-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Match Finding</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center space-x-1.5 text-slate-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Gear Trading</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center space-x-1.5 text-slate-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Tournaments</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-center space-x-1.5 text-slate-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Skill Coaching</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PANEL 2: ADMINISTRATION & VERIFIED PARAMETERS */}
            <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ADMINISTRATION & VERIFIED PARAMETERS</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {t(community.status || "Active Partnership")}
                </span>
              </div>

              {/* Admin Contact Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-base shadow-xs">
                    👑
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      Group Administrator / PIC
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      {community.adminContact || "Admin Contact Pending"}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Contact administrator directly to negotiate tournament sponsorships, pinned posts, or interactive minigames.
                </p>
              </div>

              {/* Direct Channel Access */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-600 block">
                  Official Community Channel:
                </span>
                {community.groupUrl && community.groupUrl !== "#" ? (
                  <a
                    href={community.groupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center justify-center space-x-2 transition shadow-sm"
                  >
                    <span>Open Community on {community.platform}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-500 text-center">
                    Community URL pending update
                  </div>
                )}
              </div>

              {/* Partnership Quality Checklist */}
              <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2">
                <span className="text-[11px] font-bold text-emerald-900 uppercase block">
                  Verified Partnership Quality Parameters
                </span>
                <ul className="text-xs text-emerald-800 space-y-1.5">
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Member demographic: Amateur athletes & active weekly players</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Automated moderation & anti-spam filter enabled</span>
                  </li>
                  <li className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Estimated organic post reach: ~25% - 40%</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* ─── PERFORMANCE EVALUATIONS & AUDIT DOSSIER ─── */}
          <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                  ⭐
                </div>
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  CAMPAIGN EVALUATION & PM AUDIT TRAIL
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                  {communityReports.length} reviews
                </span>
                {onOpenReport && (
                  <button
                    type="button"
                    onClick={() => onOpenReport(community)}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Evaluate</span>
                  </button>
                )}
              </div>
            </div>

            {communityReports.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-1">
                {communityReports.map((r) => (
                  <div
                    key={r.id}
                    className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5 hover:border-amber-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 leading-tight">
                          {r.project || r.title}
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Reviewer:{" "}
                          <span className="font-semibold text-slate-700">
                            {r.evaluator || "PM Lead"}
                          </span>
                        </p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-extrabold text-xs border border-amber-200 shrink-0">
                        ⭐ {r.score}/5
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Responsiveness</span>
                        <span className="font-bold text-slate-800">{r.attitude}/5 ⭐</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Delivery Timeline</span>
                        <span className="font-semibold text-emerald-700">{t(r.deadline)}</span>
                      </div>
                      {r.kpiRate > 0 && (
                        <div className="col-span-2 pt-1 border-t border-slate-200/60 flex items-center justify-between">
                          <span className="text-[10px] text-slate-500">KPI Attainment:</span>
                          <span className="font-extrabold text-indigo-600">{r.kpiRate}%</span>
                        </div>
                      )}
                    </div>

                    {r.notes && (
                      <div className="p-2 bg-amber-50/60 rounded-lg border border-amber-100">
                        <span className="text-[10px] font-bold text-amber-800 block uppercase">
                          PM Qualitative Feedback:
                        </span>
                        <p className="text-xs text-slate-800 italic mt-0.5 leading-relaxed">
                          "{r.notes}"
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl p-6 text-center space-y-2">
                <Award className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-medium text-slate-600">
                  No evaluation history recorded yet for this community.
                </p>
                <p className="text-[11px] text-slate-400">
                  Submit campaign performance ratings to build an audit history for future seeding partnerships.
                </p>
                {onOpenReport && (
                  <button
                    type="button"
                    onClick={() => onOpenReport(community)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400 transition shadow-xs cursor-pointer mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Log First Evaluation</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <AudienceAuditSection
            endpoint={`/api/sport-hub/community/${community.id}/audience-audit`}
            initialAudit={(community as { audienceAudit?: any }).audienceAudit || null}
            subjectName={community.name}
            emptyMessage="No audience audit for this community yet. Run an audit to score discussion authenticity, seeding risk, and sponsored posts in this club."
          />

          {/* ─── BOTTOM SECTION: COMPREHENSIVE COMMUNITY POSTS & SEEDING TABLE ─── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
            {/* Table Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <MessageCircle className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                    <span>Community Posts & Seeding Context Database</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 normal-case">
                      {relatedPosts.length} posts
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Aggregated repository of posts, experiences, and sports discussion videos related to <strong>{community.name}</strong>
                  </p>
                </div>
              </div>

              {/* Quick Search in Posts */}
              {relatedPosts.length > 0 && (
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search posts, topics..."
                    value={postSearch}
                    onChange={(e) => setPostSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  />
                </div>
              )}
            </div>

            {/* Posts Data Table */}
            {displayedPosts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">#</th>
                      <th className="py-3 px-4 min-w-[280px]">Post / Discussion Topic</th>
                      <th className="py-3 px-3">Author / Source</th>
                      <th className="py-3 px-3 text-center">Platform</th>
                      <th className="py-3 px-3 text-right">Views</th>
                      <th className="py-3 px-3 text-right">Likes</th>
                      <th className="py-3 px-3 text-right">Comments</th>
                      <th className="py-3 px-3 text-center">ER %</th>
                      <th className="py-3 px-3 text-center">Viral Grade</th>
                      <th className="py-3 px-3 text-center min-w-[100px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedPosts.map((post, idx) => (
                      <tr key={post.id} className="hover:bg-purple-50/30 transition group">
                        <td className="py-3 px-3 text-center font-medium text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-start space-x-2">
                            <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs shrink-0 mt-0.5 group-hover:bg-purple-100 group-hover:text-purple-700 transition">
                              💬
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 leading-snug">{post.title}</p>
                              <PostAuditControl
                                postId={post.id}
                                title={post.title}
                                initialSponsored={post.isSponsored}
                                initialBrand={post.sponsorBrand}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-700 whitespace-nowrap">
                          {post.author || "Community Member"}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                            {post.platform}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                          {post.views > 0 ? (
                            <span className="flex items-center justify-end space-x-1">
                              <Eye className="w-3 h-3 text-slate-400" />
                              <span>{formatNumber(post.views)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                          {post.likes > 0 ? (
                            <span className="flex items-center justify-end space-x-1">
                              <Heart className="w-3 h-3 text-rose-400" />
                              <span>{formatNumber(post.likes)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                          {post.comments > 0 ? (
                            <span className="flex items-center justify-end space-x-1">
                              <MessageCircle className="w-3 h-3 text-slate-400" />
                              <span>{formatNumber(post.comments)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {post.er}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center space-x-1">
                            <Flame className="w-3 h-3 text-rose-500" />
                            <span>{t(post.viralGrade)}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {post.postUrl && post.postUrl !== "#" ? (
                            <a
                              href={post.postUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white font-bold text-[11px] transition shadow-2xs"
                            >
                              <span>Open Link</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-2">
                <MessageCircle className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-medium text-slate-600">
                  No posts or discussions found for {community.name}.
                </p>
                <p className="text-[11px] text-slate-400">
                  Related discussions and videos will appear here automatically upon scraping new data.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
