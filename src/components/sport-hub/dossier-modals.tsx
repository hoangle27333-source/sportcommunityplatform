"use client";

import React, { useMemo, useState } from "react";
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
} from "lucide-react";
import { t, formatNumber, formatCurrency } from "@/lib/i18n";

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
}: Kol360ModalProps) {
  const [postSearch, setPostSearch] = useState("");

  if (!isOpen || !kol) return null;

  const avatar = getKolAvatar(kol.name);

  // Filter viral posts scouted for this KOL
  const kolPosts = useMemo(() => {
    return posts.filter((p) => {
      const matchId = p.kolRecordIds && p.kolRecordIds.includes(kol.id);
      const matchAuthor =
        p.author &&
        (p.author.toLowerCase().includes(kol.name.toLowerCase()) ||
          kol.name.toLowerCase().includes(p.author.toLowerCase()));
      return matchId || matchAuthor;
    });
  }, [posts, kol]);

  // Filtered posts by search keyword inside modal table
  const displayedPosts = useMemo(() => {
    if (!postSearch.trim()) return kolPosts;
    const q = postSearch.trim().toLowerCase();
    return kolPosts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.platform.toLowerCase().includes(q) ||
        (p.viralGrade && p.viralGrade.toLowerCase().includes(q))
    );
  }, [kolPosts, postSearch]);

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
      const matchId = r.kolRecordIds && r.kolRecordIds.includes(kol.id);
      const matchName =
        r.kolName &&
        (r.kolName.toLowerCase().includes(kol.name.toLowerCase()) ||
          kol.name.toLowerCase().includes(r.kolName.toLowerCase()));
      return matchId || matchName;
    });
  }, [reports, kol]);

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
                    alt={kol.name}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-400/50 shadow-md"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-2xl border-2 border-white/20 shadow-md">
                    {kol.name.slice(0, 1).toUpperCase()}
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
                    {t(kol.status)}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                  {kol.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-1">
                  <span className="font-semibold text-indigo-300">{kol.tier}</span>
                  <span>•</span>
                  <span>{kol.platform}</span>
                  <span>•</span>
                  <span className="flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t(kol.geography)}</span>
                  </span>
                  <span>•</span>
                  <span className="text-amber-300 font-bold flex items-center space-x-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{avgScore}/5.0 Score ({kolReports.length} reviews)</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons in Modal Header */}
            <div className="flex items-center space-x-2">
              {kol.pendingScoutDiff &&
                Object.keys(kol.pendingScoutDiff.changes || {}).length > 0 &&
                onOpenDiff && (
                  <button
                    type="button"
                    onClick={() => onOpenDiff(kol)}
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
                  onClick={() => onScoutKolPosts(kol)}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer border border-purple-400/30"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Scout Posts</span>
                </button>
              )}

              {onOpenGrowth && (
                <button
                  type="button"
                  onClick={() => onOpenGrowth(kol)}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition flex items-center space-x-1.5 border border-white/10 cursor-pointer active:scale-95"
                  title="View Historical Metric Snapshots"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Metric History</span>
                </button>
              )}

              {onOpenReport && (
                <button
                  onClick={() => onOpenReport(kol)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer"
                >
                  <Star className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Evaluate</span>
                </button>
              )}

              {onEditKol && (
                <button
                  onClick={() => onEditKol(kol)}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition flex items-center space-x-1.5 border border-white/10 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}

              {kol.profileUrl && kol.profileUrl !== "#" && (
                <a
                  href={kol.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <span>Channel</span>
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

          {/* High-Level Media & Performance KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-white/10 text-xs">
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
          </div>
        </div>

        {/* ─── MODAL SCROLLABLE BODY ─── */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
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
                  {kol.platform}
                </span>
              </div>

              {/* Sports Disciplines */}
              <div>
                <span className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Sports Disciplines:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {kol.sport.map((s, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-100"
                    >
                      🏅 {t(s)}
                    </span>
                  ))}
                </div>
              </div>

              {/* 4-Box Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 block font-medium">Followers</span>
                  <span className="font-extrabold text-sm text-slate-900 mt-0.5 block">
                    {formatNumber(kol.followers)}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 block font-medium">Avg Views</span>
                  <span className="font-extrabold text-sm text-slate-900 mt-0.5 block">
                    {kol.avgViews > 0 ? formatNumber(kol.avgViews) : "—"}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 block font-medium">Audience ER</span>
                  <span className="font-extrabold text-sm text-emerald-600 mt-0.5 block">
                    {kol.er > 0 ? `${kol.er}%` : "—"}
                  </span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 text-center shadow-xs">
                  <span className="text-[10px] text-slate-400 block font-medium">Tier</span>
                  <span className="font-extrabold text-sm text-indigo-600 mt-0.5 block">
                    {kol.tier}
                  </span>
                </div>
              </div>

              {/* Quick Action: Metric History & Growth Trends */}
              {onOpenGrowth && (
                <button
                  type="button"
                  onClick={() => onOpenGrowth(kol)}
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
                <div className="text-xl font-black text-amber-950 mt-1">
                  {kol.quotation > 0
                    ? formatCurrency(kol.quotation)
                    : "Negotiable upon campaign scope"}
                </div>
                <span className="text-[10px] text-amber-700 mt-1 block">
                  Commercial fee for dedicated brand video, review reel, or event attendance.
                </span>
              </div>

              {/* Bio & Intro */}
              {kol.info && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">Bio & Introduction:</span>
                  <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-200">
                    {kol.info}
                  </p>
                </div>
              )}

              {/* Channel Link */}
              {kol.profileUrl && kol.profileUrl !== "#" && (
                <a
                  href={kol.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center space-x-2 transition shadow-sm"
                >
                  <span>Visit Creator Profile</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
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
                      onClick={() => onOpenReport(kol)}
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
                      onClick={() => onOpenReport(kol)}
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

          {/* ─── BOTTOM SECTION: COMPREHENSIVE SCOUTED POSTS SUMMARY TABLE ─── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
            {/* Table Header & Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <Flame className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                    <span>Scouted Viral Posts & Reels Database</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 normal-case">
                      {kolPosts.length} posts
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Aggregated repository of scouted posts, TikTok videos, and Reels for <strong>{kol.name}</strong> with real-time performance metrics
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2.5">
                {onScoutKolPosts && (
                  <button
                    type="button"
                    onClick={() => onScoutKolPosts(kol)}
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
                            <div>
                              <p className="font-bold text-slate-900 leading-snug">
                                {post.title}
                              </p>
                              <span className="text-[10px] text-slate-400">
                                Author: {post.author || kol.name}
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
                  No scouted posts found for {kol.name}.
                </p>
                <p className="text-[11px] text-slate-400">
                  Use automated crawling to scout the latest viral TikTok videos, Reels, and social media posts.
                </p>
                {onScoutKolPosts && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onScoutKolPosts(kol)}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Scout Posts for {kol.name}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
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
}: Community360ModalProps) {
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
                <div className="text-xl font-black text-purple-950 mt-1">
                  {community.pricePerPin > 0
                    ? formatCurrency(community.pricePerPin)
                    : "Negotiable / Free Partnership"}
                </div>
                <span className="text-[10px] text-purple-700 mt-1 block">
                  Secures top announcement slot with high organic visibility for tournament & brand notices.
                </span>
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
                            <p className="font-bold text-slate-900 leading-snug">
                              {post.title}
                            </p>
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
