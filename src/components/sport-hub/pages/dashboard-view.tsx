"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sparkles,
  Star,
  UserPlus,
  Users,
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Eye,
  Heart,
  MessageCircle,
  Briefcase,
  Flame,
  ArrowRight,
  ShieldCheck,
  Award,
  Layers,
  BarChart3,
  Calendar,
  Clock,
  Lock,
} from "lucide-react";
import { PlatformHeader } from "../platform-header";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { Kol360Modal, getKolAvatar } from "../dossier-modals";
import {
  ReportModal,
  AddKolModal,
  AddCommunityModal,
  AddProjectModal,
} from "../action-modals";
import { MarketTrendScoutModal } from "../market-trend-scout-modal";
import { KolPostScoutModal } from "../kol-post-scout-modal";
import { ExcelUploadModal } from "../excel-upload-modal";
import { t, formatNumber, formatCurrency } from "@/lib/i18n";
import type { DashboardData, KOL, Post, Report, Community, Project } from "../types";

export interface DashboardViewProps {
  initialData: DashboardData;
}

export function DashboardView({ initialData }: DashboardViewProps) {
  const { isAdmin } = useCurrentUser();
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [isScoutModalOpen, setIsScoutModalOpen] = useState(false);
  const [scoutTargetKol, setScoutTargetKol] = useState<KOL | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isAddKolModalOpen, setIsAddKolModalOpen] = useState(false);
  const [isAddCommunityModalOpen, setIsAddCommunityModalOpen] = useState(false);
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [reportTargetKol, setReportTargetKol] = useState<any>(null);
  const [defaultProjectName, setDefaultProjectName] = useState("");

  // 360 Panoramic Dossier Modal
  const [selectedKolFor360, setSelectedKolFor360] = useState<KOL | null>(null);

  // Refresh data from Supabase
  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sport-hub/data");
      const result = await res.json().catch(() => null);
      if (result?.success) {
        setData({
          kpis: result.kpis,
          kols: result.kols,
          communities: result.communities,
          posts: result.posts,
          reports: result.reports,
          projects: result.projects,
        });
        toast.success("Platform data refreshed successfully!");
      } else {
        toast.error(result?.error || "Error refreshing data");
      }
    } catch {
      toast.error("Unable to connect to server API");
    } finally {
      setLoading(false);
    }
  };

  // Top 5 Creators Leaderboard
  const topCreators = useMemo(() => {
    return [...data.kols]
      .sort((a, b) => (b.followers || 0) - (a.followers || 0))
      .slice(0, 5);
  }, [data.kols]);

  // Sports Breakdown Analytics
  const sportStats = useMemo(() => {
    const counts: Record<string, { kols: number; communities: number }> = {};
    data.kols.forEach((k) => {
      (k.sport || []).forEach((sp) => {
        const key = sp.trim();
        if (!key) return;
        if (!counts[key]) counts[key] = { kols: 0, communities: 0 };
        counts[key].kols += 1;
      });
    });
    data.communities.forEach((c) => {
      (c.sport || []).forEach((sp) => {
        const key = sp.trim();
        if (!key) return;
        if (!counts[key]) counts[key] = { kols: 0, communities: 0 };
        counts[key].communities += 1;
      });
    });

    return Object.entries(counts)
      .map(([sport, stat]) => ({
        sport,
        total: stat.kols + stat.communities,
        ...stat,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [data.kols, data.communities]);

  // Platform Share Breakdown
  const platformStats = useMemo(() => {
    const counts: Record<string, { count: number; followers: number }> = {};
    data.kols.forEach((k) => {
      const p = k.platform || "Other";
      if (!counts[p]) counts[p] = { count: 0, followers: 0 };
      counts[p].count += 1;
      counts[p].followers += k.followers || 0;
    });
    return Object.entries(counts).sort((a, b) => b[1].followers - a[1].followers);
  }, [data.kols]);

  // Tier Breakdown
  const tierStats = useMemo(() => {
    const counts: Record<string, number> = {};
    data.kols.forEach((k) => {
      const tKey = k.tier || "Other";
      counts[tKey] = (counts[tKey] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [data.kols]);

  // Total Projects & Budget
  const totalBudget = useMemo(() => {
    if (data.kpis.totalBudget) return data.kpis.totalBudget;
    return (data.projects || []).reduce((acc, p) => acc + (p.budget || 0), 0);
  }, [data.kpis, data.projects]);

  const activeProjectsCount = useMemo(() => {
    return data.kpis.totalProjects || (data.projects || []).length || 0;
  }, [data.kpis, data.projects]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* ─── GLOBAL PLATFORM HEADER ─── */}
      <PlatformHeader onRefresh={handleRefresh} loading={loading} />

      {/* ─── MAIN DASHBOARD CONTENT ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* ─── TOP KPI SUMMARY STRIP ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
              👤
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Total KOLs
              </p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {data.kpis.totalKols}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">
              📈
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Total Reach
              </p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {formatNumber(data.kpis.totalReach)}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
              ⭐
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Avg Partner Score
              </p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {data.kpis.avgScore ? Number(data.kpis.avgScore).toFixed(1) : "5.0"}
                <span className="text-xs text-slate-400 font-normal ml-0.5">/5</span>
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl font-bold">
              👥
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Clubs & Groups
              </p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {data.kpis.totalCommunities}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl font-bold">
              🔥
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Trending Posts
              </p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {data.kpis.totalPosts}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-bold">
              💼
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Active Projects
              </p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight">
                {activeProjectsCount}
              </h3>
            </div>
          </div>
        </div>

        {/* ─── QUICK NAVIGATION CARDS (SUB-PAGE SHORTCUTS) ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* KOLs Card */}
          <Link
            href="/kols"
            className="group bg-white p-6 rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-lg transition flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 group-hover:bg-blue-600 group-hover:text-white text-blue-600 flex items-center justify-center transition shadow-xs">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition">
                    KOLs Directory
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                    {data.kols.length} profiles
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Browse athletes & content creators. Filter by sports discipline, tier, reach, rate card, and open 360° dossier.
                </p>
              </div>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600 group-hover:translate-x-1 transition">
              <span>Open KOL Directory</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Communities Card */}
          <Link
            href="/community"
            className="group bg-white p-6 rounded-2xl border border-slate-200 hover:border-purple-500 hover:shadow-lg transition flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-purple-50 group-hover:bg-purple-600 group-hover:text-white text-purple-600 flex items-center justify-center transition shadow-xs">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition">
                    Community & Clubs
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                    {data.communities.length} clubs
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Sports clubs, amateur leagues, and Facebook groups. Direct contact with admins, activity rating, and pin pricing.
                </p>
              </div>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-600 group-hover:translate-x-1 transition">
              <span>Browse Communities</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Campaigns Card */}
          <Link
            href="/projects"
            className="group bg-white p-6 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:shadow-lg transition flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white text-indigo-600 flex items-center justify-center transition shadow-xs">
                <Briefcase className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition">
                    Campaigns & Projects
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                    {activeProjectsCount} active
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Track campaign deliverables, milestone sign-offs, and quality score cards linked directly to creator contracts.
                </p>
              </div>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600 group-hover:translate-x-1 transition">
              <span>Manage Projects</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Trending Card */}
          <Link
            href="/trending"
            className="group bg-white p-6 rounded-2xl border border-slate-200 hover:border-rose-500 hover:shadow-lg transition flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-rose-50 group-hover:bg-rose-600 group-hover:text-white text-rose-600 flex items-center justify-center transition shadow-xs">
                <Flame className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-rose-600 transition">
                    Trending Viral Posts
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                    {data.posts.length} reels
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Real-time viral content scouted across TikTok and Reels. Filter by engagement rate, viral grade, and creator link.
                </p>
              </div>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-rose-600 group-hover:translate-x-1 transition">
              <span>View Trending Feed</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>

        {/* ─── ANALYTICS & DISTRIBUTION SUMMARY SECTION ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sports Discipline Distribution */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                  🏅
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Sports Discipline Breakdown
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                Top Categories
              </span>
            </div>

            <div className="space-y-3 pt-2">
              {sportStats.map((item) => {
                const maxTotal = sportStats[0]?.total || 1;
                const pct = Math.round((item.total / maxTotal) * 100);
                return (
                  <div key={item.sport} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">{t(item.sport)}</span>
                      <span className="text-slate-500">
                        <span className="font-semibold text-blue-600">{item.kols} KOLs</span>
                        {" · "}
                        <span className="text-purple-600">{item.communities} Clubs</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Platform Share */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm">
                  📱
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Platform Reach Distribution
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                Audience Share
              </span>
            </div>

            <div className="space-y-3 pt-2">
              {platformStats.map(([platform, stat]) => {
                const totalReachAll = data.kpis.totalReach || 1;
                const pct = Math.min(100, Math.round((stat.followers / totalReachAll) * 100));
                return (
                  <div key={platform} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">{platform}</span>
                      <span className="text-slate-500">
                        <span className="font-semibold text-slate-800">
                          {formatNumber(stat.followers)} reach
                        </span>
                        {" ("}
                        <span className="text-blue-600 font-bold">{stat.count} KOLs</span>
                        {")"}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Creator Tiers & Campaign Overview */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm">
                  ⭐
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Creator Tier Matrix
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                Total: {data.kols.length}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              {tierStats.map(([tier, count]) => (
                <div
                  key={tier}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between"
                >
                  <span className="text-xs font-semibold text-slate-500">{t(tier)}</span>
                  <div className="flex items-baseline space-x-1.5 mt-1">
                    <span className="text-xl font-black text-slate-900">{count}</span>
                    <span className="text-[10px] text-slate-400">creators</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Total Tracked Budget:</span>
                {isAdmin ? (
                  <span className="font-bold text-emerald-600">
                    {formatCurrency(totalBudget)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-400">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>Admin Only</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── TOP CREATORS LEADERBOARD ─── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Award className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900">
                  Top Performing Creators Leaderboard
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Highest reach athletes and sports influencers with quick 360° panoramic preview.
              </p>
            </div>

            <Link
              href="/kols"
              className="inline-flex items-center space-x-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200"
            >
              <span>View Full Directory ({data.kols.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {topCreators.map((kol, idx) => {
              const avatar = kol.avatarUrl || getKolAvatar(kol.name);
              return (
                <div
                  key={kol.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 px-2 rounded-xl transition"
                >
                  <div className="flex items-center space-x-3.5">
                    <span className="w-6 text-center text-sm font-black text-slate-400">
                      #{idx + 1}
                    </span>
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                      {avatar ? (
                        <img
                          src={avatar}
                          alt={kol.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">
                          {kol.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-bold text-slate-900">{kol.name}</h4>
                        <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                          {kol.platform}
                        </span>
                        <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {t(kol.tier)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                        <span>{(kol.sport || []).map((s) => t(s)).join(", ")}</span>
                        <span>·</span>
                        <span>{t(kol.geography)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-4 pl-9 sm:pl-0">
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block font-medium">Followers</span>
                      <span className="text-sm font-bold text-slate-900">
                        {formatNumber(kol.followers)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-400 block font-medium">Avg Views</span>
                      <span className="text-sm font-bold text-slate-900">
                        {formatNumber(kol.avgViews)}
                      </span>
                    </div>

                    <div className="text-right hidden md:block">
                      <span className="text-xs text-slate-400 block font-medium">ER%</span>
                      <span className="text-sm font-bold text-emerald-600">
                        {kol.er ? `${kol.er}%` : "—"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedKolFor360(kol)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>360° Dossier</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── RECENT DELIVERABLES & VIRAL POSTS SNAPSHOT ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Sign-offs Widget */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                  <h3 className="text-base font-bold text-slate-900">
                    Recent Evaluation Sign-offs
                  </h3>
                </div>
                <Link
                  href="/projects"
                  className="text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  All Reports →
                </Link>
              </div>

              {data.reports && data.reports.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {data.reports.slice(0, 3).map((r) => (
                    <div key={r.id} className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{r.title}</span>
                        <span className="text-xs font-bold text-amber-600">
                          ★ {r.score ? r.score.toFixed(1) : "5.0"}/5.0
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          KOL: <strong className="text-slate-800">{r.kolName}</strong>
                        </span>
                        <span>
                          Project: <strong className="text-slate-800">{r.project}</strong>
                        </span>
                      </div>
                      {r.notes && (
                        <p className="text-[11px] text-slate-600 italic bg-slate-50 p-2 rounded-lg">
                          "{r.notes}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No evaluation reports recorded yet.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setReportTargetKol(null);
                  setDefaultProjectName("");
                  setIsReportModalOpen(true);
                }}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition text-center cursor-pointer"
              >
                + New Deliverable Sign-off
              </button>
            </div>
          </div>

          {/* Top Trending Reels Highlight */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Flame className="w-5 h-5 text-rose-500" />
                  <h3 className="text-base font-bold text-slate-900">
                    Latest Viral Reels Highlights
                  </h3>
                </div>
                <Link
                  href="/trending"
                  className="text-xs font-bold text-rose-600 hover:text-rose-800"
                >
                  View Trending Feed →
                </Link>
              </div>

              {data.posts && data.posts.length > 0 ? (
                <div className="space-y-3">
                  {data.posts.slice(0, 3).map((p) => (
                    <div
                      key={p.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 flex items-center justify-between gap-3 hover:bg-slate-100/70 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800">
                            {p.platform}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                            {t(p.viralGrade)}
                          </span>
                          <span className="text-[11px] font-bold text-slate-700 truncate">
                            {p.author}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-900 mt-1 truncate">
                          {p.title}
                        </p>
                      </div>

                      <div className="text-right shrink-0 flex items-center space-x-3">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Views</span>
                          <span className="text-xs font-bold text-slate-900">
                            {formatNumber(p.views)}
                          </span>
                        </div>
                        {p.postUrl && p.postUrl !== "#" && (
                          <a
                            href={p.postUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 text-slate-500 transition"
                            title="Watch post"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No viral reels scouted yet.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsScoutModalOpen(true)}
                className="flex-1 py-2 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white text-xs font-bold rounded-lg transition text-center flex items-center justify-center space-x-1 cursor-pointer"
              >
                <Flame className="w-3.5 h-3.5 text-amber-200 fill-amber-200" />
                <span>Scout Trends</span>
              </button>
              <Link
                href="/trending"
                className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg transition text-center"
              >
                Browse All ({data.posts.length})
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* ─── MODALS ─── */}
      <MarketTrendScoutModal
        isOpen={isScoutModalOpen}
        onClose={() => setIsScoutModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <KolPostScoutModal
        isOpen={!!scoutTargetKol}
        kol={scoutTargetKol}
        onClose={() => setScoutTargetKol(null)}
        onSuccess={handleRefresh}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        targetKol={reportTargetKol}
        defaultProject={defaultProjectName}
        onClose={() => setIsReportModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <AddKolModal
        isOpen={isAddKolModalOpen}
        onClose={() => setIsAddKolModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <AddCommunityModal
        isOpen={isAddCommunityModalOpen}
        onClose={() => setIsAddCommunityModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <AddProjectModal
        isOpen={isAddProjectModalOpen}
        onClose={() => setIsAddProjectModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <ExcelUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleRefresh}
      />

      {/* 360 Panoramic Dossier Modal */}
      {selectedKolFor360 && (
        <Kol360Modal
          isOpen={!!selectedKolFor360}
          kol={selectedKolFor360}
          posts={data.posts}
          reports={data.reports}
          onClose={() => setSelectedKolFor360(null)}
          onOpenReport={(kol) => {
            setReportTargetKol(kol);
            setIsReportModalOpen(true);
          }}
          onScoutKolPosts={(kol) => setScoutTargetKol(kol)}
        />
      )}
    </div>
  );
}
