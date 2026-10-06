"use client";

import { ScoutTaskLauncher } from "../scout-task-launcher";
import React, { useState, useEffect, useMemo } from "react";
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
  Zap,
  Crown,
  Activity,
  Plus,
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
import { ExcelUploadModal } from "../excel-upload-modal";
import { t, formatNumber, formatCurrency, formatCompactNumber } from "@/lib/i18n";
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

  useEffect(() => {
    const refresh = () => {
      void handleRefresh();
    };
    window.addEventListener("sport-hub-data-changed", refresh);
    return () => window.removeEventListener("sport-hub-data-changed", refresh);
  }, []);

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
      const p = (k.platform || "Other").trim();
      if (!counts[p]) counts[p] = { count: 0, followers: 0 };
      counts[p].count += 1;
      counts[p].followers += k.followers || 0;
    });

    return Object.entries(counts).sort((a, b) => {
      if (b[1].followers !== a[1].followers) {
        return b[1].followers - a[1].followers;
      }
      return b[1].count - a[1].count;
    });
  }, [data.kols]);

  // Hierarchical Creator Tier Matrix
  const tierMatrix = useMemo(() => {
    const buckets: Record<string, number> = {
      Mega: 0,
      Macro: 0,
      Micro: 0,
      Nano: 0,
      Pending: 0,
    };

    data.kols.forEach((k) => {
      const raw = (k.tier || "").trim().toLowerCase();
      if (raw.includes("mega")) buckets.Mega++;
      else if (raw.includes("macro")) buckets.Macro++;
      else if (raw.includes("micro")) buckets.Micro++;
      else if (raw.includes("nano")) buckets.Nano++;
      else buckets.Pending++;
    });

    const total = data.kols.length || 1;

    return [
      {
        key: "Mega",
        name: "Mega Creators",
        range: "> 1M Followers",
        count: buckets.Mega,
        pct: Math.round((buckets.Mega / total) * 100),
        color: "from-purple-500 to-indigo-600",
        bg: "bg-purple-50/70 border-purple-200/80 text-purple-900",
        dot: "bg-purple-500",
      },
      {
        key: "Macro",
        name: "Macro Creators",
        range: "250K - 1M Followers",
        count: buckets.Macro,
        pct: Math.round((buckets.Macro / total) * 100),
        color: "from-blue-500 to-cyan-600",
        bg: "bg-blue-50/70 border-blue-200/80 text-blue-900",
        dot: "bg-blue-500",
      },
      {
        key: "Micro",
        name: "Micro Influencers",
        range: "50K - 250K Followers",
        count: buckets.Micro,
        pct: Math.round((buckets.Micro / total) * 100),
        color: "from-emerald-500 to-teal-600",
        bg: "bg-emerald-50/70 border-emerald-200/80 text-emerald-900",
        dot: "bg-emerald-500",
      },
      {
        key: "Nano",
        name: "Nano Creators",
        range: "< 50K Followers",
        count: buckets.Nano,
        pct: Math.round((buckets.Nano / total) * 100),
        color: "from-amber-500 to-orange-600",
        bg: "bg-amber-50/70 border-amber-200/80 text-amber-900",
        dot: "bg-amber-500",
      },
      {
        key: "Pending",
        name: "Pending Classification",
        range: "Awaiting Metric Audit",
        count: buckets.Pending,
        pct: Math.round((buckets.Pending / total) * 100),
        color: "from-slate-400 to-slate-600",
        bg: "bg-slate-50 border-slate-200 text-slate-800",
        dot: "bg-slate-400",
      },
    ];
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-7">
        {/* ─── EXECUTIVE COMMAND BAR ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <span>Command Center</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                Live Supabase Sync
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Real-time CRM intelligence across athlete rosters, grassroots communities, and campaign deliverables.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsScoutModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white text-xs font-bold shadow-xs hover:shadow transition flex items-center gap-1.5 cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5 text-amber-200 fill-amber-200" />
              <span>Find Content</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAddKolModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-600" />
              <span>Add Profile</span>
            </button>
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Upload Excel spreadsheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Import</span>
            </button>
          </div>
        </div>

        {/* ─── TOP KPI SUMMARY STRIP ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
          {/* Card 1: Total KOLs */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm transition flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Total KOLs
              </p>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center ring-1 ring-blue-500/20">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                {formatNumber(data.kpis.totalKols)}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
                Verified Athletes
              </p>
            </div>
          </div>

          {/* Card 2: Total Reach */}
          <div
            className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm transition flex flex-col justify-between"
            title={`${formatNumber(data.kpis.totalReach)} combined audience reach`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Total Reach
              </p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center ring-1 ring-emerald-500/20">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none truncate">
                {formatCompactNumber(data.kpis.totalReach)}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
                Audience Network
              </p>
            </div>
          </div>

          {/* Card 3: Avg Partner Score */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm transition flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Partner Score
              </p>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center ring-1 ring-amber-500/20">
                <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                  {data.kpis.avgScore ? Number(data.kpis.avgScore).toFixed(1) : "5.0"}
                </h3>
                <span className="text-xs text-slate-400 font-semibold">/ 5.0</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
                Quality & SLA
              </p>
            </div>
          </div>

          {/* Card 4: Clubs & Groups */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm transition flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Communities
              </p>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center ring-1 ring-purple-500/20">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                {formatNumber(data.kpis.totalCommunities)}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
                Clubs & Groups
              </p>
            </div>
          </div>

          {/* Card 5: Trending Posts */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm transition flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Viral Posts
              </p>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center ring-1 ring-rose-500/20">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                {formatNumber(data.kpis.totalPosts)}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
                Scouted Content
              </p>
            </div>
          </div>

          {/* Card 6: Active Projects */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm transition flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Active Projects
              </p>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center ring-1 ring-indigo-500/20">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                {activeProjectsCount}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
                Campaign Pipelines
              </p>
            </div>
          </div>
        </div>

        {/* ─── OPERATIONAL WORKSPACE HUBS ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KOLs Directory */}
          <div className="group bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition">
                  <Users className="w-5 h-5" />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                  {data.kols.length} profiles
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition">
                Creator Directory
              </h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Filter athletes by sport, audience tier, rate card, and inspect 360° panoramic dossiers.
              </p>
            </div>

            <div className="pt-3.5 mt-3.5 border-t border-slate-100 flex items-center justify-between">
              <Link
                href="/kols"
                className="text-xs font-bold text-blue-600 group-hover:text-blue-700 flex items-center gap-1 group-hover:translate-x-0.5 transition"
              >
                <span>Explore Roster</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setIsAddKolModalOpen(true)}
                className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                title="Add new KOL profile"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Communities */}
          <div className="group bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-purple-400 hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                  {data.communities.length} clubs
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-purple-600 transition">
                Sports Communities
              </h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Grassroots sports clubs, amateur leagues, Facebook groups, and admin contact channels.
              </p>
            </div>

            <div className="pt-3.5 mt-3.5 border-t border-slate-100 flex items-center justify-between">
              <Link
                href="/community"
                className="text-xs font-bold text-purple-600 group-hover:text-purple-700 flex items-center gap-1 group-hover:translate-x-0.5 transition"
              >
                <span>Browse Clubs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setIsAddCommunityModalOpen(true)}
                className="p-1 rounded-md text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition cursor-pointer"
                title="Add new community"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Campaigns */}
          <div className="group bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition">
                  <Briefcase className="w-5 h-5" />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                  {activeProjectsCount} active
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition">
                Campaign Projects
              </h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Track deliverables, contracts, milestone sign-offs, and quality score evaluations.
              </p>
            </div>

            <div className="pt-3.5 mt-3.5 border-t border-slate-100 flex items-center justify-between">
              <Link
                href="/projects"
                className="text-xs font-bold text-indigo-600 group-hover:text-indigo-700 flex items-center gap-1 group-hover:translate-x-0.5 transition"
              >
                <span>Track Pipelines</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setIsAddProjectModalOpen(true)}
                className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                title="Create new project"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Viral Pulse */}
          <div className="group bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-rose-400 hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition">
                  <Flame className="w-5 h-5" />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                  {data.posts.length} reels
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-rose-600 transition">
                Viral Pulse Radar
              </h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Real-time viral sports content scouted from TikTok & Reels with engagement benchmarks.
              </p>
            </div>

            <div className="pt-3.5 mt-3.5 border-t border-slate-100 flex items-center justify-between">
              <Link
                href="/trending"
                className="text-xs font-bold text-rose-600 group-hover:text-rose-700 flex items-center gap-1 group-hover:translate-x-0.5 transition"
              >
                <span>View Viral Feed</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setIsScoutModalOpen(true)}
                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                title="Scout viral content"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ─── ANALYTICS & DISTRIBUTION SUMMARY SECTION ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sports Discipline Distribution */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Award className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Sports Discipline Breakdown
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  Top 6 Categories
                </span>
              </div>

              <div className="space-y-3 pt-4">
                {sportStats.map((item) => {
                  const maxTotal = sportStats[0]?.total || 1;
                  const pct = Math.max(12, Math.round((item.total / maxTotal) * 100));
                  return (
                    <div key={item.sport} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">{t(item.sport)}</span>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                            {item.kols} KOLs
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">
                            {item.communities} Clubs
                          </span>
                          <span className="font-bold text-slate-900 ml-1">
                            {item.total}
                          </span>
                        </div>
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

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Monitored in Roster</span>
              <span className="font-bold text-slate-800">
                {data.kols.length + data.communities.length} Total Entities
              </span>
            </div>
          </div>

          {/* Platform Share */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Activity className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Platform Reach Distribution
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  Audience & Roster
                </span>
              </div>

              <div className="space-y-3 pt-4">
                {platformStats.map(([platform, stat]) => {
                  const totalReachAll = data.kpis.totalReach || 1;
                  const totalKolsCount = data.kols.length || 1;
                  const creatorSharePct = Math.round((stat.count / totalKolsCount) * 100);

                  // Brand color configs
                  let gradient = "from-purple-500 to-indigo-500";
                  let badgeColor = "bg-purple-50 text-purple-700 border-purple-200/60";
                  if (platform.toLowerCase().includes("instagram")) {
                    gradient = "from-rose-500 via-pink-500 to-purple-600";
                    badgeColor = "bg-pink-50 text-pink-700 border-pink-200/60";
                  } else if (platform.toLowerCase().includes("tiktok")) {
                    gradient = "from-slate-700 to-slate-900";
                    badgeColor = "bg-slate-100 text-slate-800 border-slate-200/80";
                  } else if (platform.toLowerCase().includes("facebook")) {
                    gradient = "from-blue-600 to-indigo-600";
                    badgeColor = "bg-blue-50 text-blue-700 border-blue-200/60";
                  } else if (platform.toLowerCase().includes("youtube")) {
                    gradient = "from-red-500 to-rose-600";
                    badgeColor = "bg-rose-50 text-rose-700 border-rose-200/60";
                  }

                  const barWidth = Math.max(12, creatorSharePct);

                  return (
                    <div key={platform} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}`}
                          >
                            {platform}
                          </span>
                          <span className="font-semibold text-slate-600 text-[11px]">
                            {stat.count} KOLs ({creatorSharePct}%)
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-900 text-xs">
                            {stat.followers > 0
                              ? `${formatCompactNumber(stat.followers)} reach`
                              : "Audience Pending"}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className={`bg-gradient-to-r ${gradient} h-full rounded-full transition-all duration-500`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Total Audience Reach</span>
              <span
                className="font-bold text-slate-800"
                title={`${formatNumber(data.kpis.totalReach)} followers`}
              >
                {formatCompactNumber(data.kpis.totalReach)} followers
              </span>
            </div>
          </div>

          {/* Creator Tiers & Campaign Overview */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Crown className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Creator Tier Matrix
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  {data.kols.length} Profiles
                </span>
              </div>

              {/* 4 Primary Tier Cards Grid */}
              <div className="grid grid-cols-2 gap-2.5 pt-3.5">
                {tierMatrix.slice(0, 4).map((tier) => {
                  return (
                    <div
                      key={tier.key}
                      className={`p-3 rounded-xl border ${tier.bg} flex flex-col justify-between transition hover:shadow-xs`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${tier.dot}`} />
                          {tier.name.split(" ")[0]}
                        </span>
                        <span className="text-[10px] font-semibold opacity-75">
                          {tier.pct}%
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between mt-2">
                        <span className="text-xl font-black tracking-tight">
                          {tier.count}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {tier.range}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pending Classification if any */}
              {tierMatrix[4] && tierMatrix[4].count > 0 && (
                <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-600">
                      Pending Classification
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900">
                      {tierMatrix[4].count} profiles
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ({tierMatrix[4].pct}%)
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>Tracked Budget:</span>
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

        {/* ─── TOP CREATORS LEADERBOARD ─── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center ring-1 ring-amber-500/20">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Top Performing Creators Leaderboard
                </h3>
                <p className="text-xs text-slate-500">
                  Ranked by total audience reach, video views, and engagement benchmarks.
                </p>
              </div>
            </div>

            <Link
              href="/kols"
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50/80 hover:bg-blue-100/80 px-3 py-1.5 rounded-lg border border-blue-200/60 transition self-start sm:self-auto"
            >
              <span>Full Directory ({data.kols.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {topCreators.map((kol, idx) => {
              const avatar = kol.avatarUrl || getKolAvatar(kol.name);

              let rankBadge = (
                <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-black">
                  #{idx + 1}
                </span>
              );
              if (idx === 0) {
                rankBadge = (
                  <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center text-xs font-black shadow-2xs">
                    🥇
                  </span>
                );
              } else if (idx === 1) {
                rankBadge = (
                  <span className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 border border-slate-300 flex items-center justify-center text-xs font-black shadow-2xs">
                    🥈
                  </span>
                );
              } else if (idx === 2) {
                rankBadge = (
                  <span className="w-7 h-7 rounded-lg bg-orange-100 text-orange-800 border border-orange-300 flex items-center justify-center text-xs font-black shadow-2xs">
                    🥉
                  </span>
                );
              }

              return (
                <div
                  key={kol.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition-all"
                >
                  <div className="flex items-center space-x-3.5">
                    {rankBadge}
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-100 shrink-0 border border-slate-200/80 ring-2 ring-slate-100">
                      {avatar ? (
                        <img
                          src={avatar}
                          alt={kol.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-slate-500 bg-gradient-to-br from-slate-100 to-slate-200">
                          {kol.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-bold text-slate-900">{kol.name}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                          {kol.platform}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {t(kol.tier)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-slate-500 mt-0.5">
                        <span>{(kol.sport || []).map((s) => t(s)).join(", ") || "General Sports"}</span>
                        <span>·</span>
                        <span>{t(kol.geography) || "Nationwide"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-5 pl-10 sm:pl-0">
                    <div
                      className="text-right"
                      title={`${formatNumber(kol.followers)} followers`}
                    >
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">
                        Followers
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {formatCompactNumber(kol.followers)}
                      </span>
                    </div>

                    <div
                      className="text-right"
                      title={`${formatNumber(kol.avgViews)} avg views`}
                    >
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">
                        Avg Views
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {formatCompactNumber(kol.avgViews)}
                      </span>
                    </div>

                    <div className="text-right hidden md:block">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">
                        ER%
                      </span>
                      <span className="text-sm font-bold text-emerald-600">
                        {kol.er ? `${kol.er}%` : "—"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedKolFor360(kol)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer border border-indigo-200/60 shadow-2xs"
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
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
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
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                          ★ {r.score ? r.score.toFixed(1) : "5.0"} / 5.0
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
                        <p className="text-[11px] text-slate-600 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
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
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Flame className="w-4 h-4 text-rose-500" />
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
                <div className="space-y-2.5">
                  {data.posts.slice(0, 3).map((p) => (
                    <div
                      key={p.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 flex items-center justify-between gap-3 hover:bg-slate-100/70 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800">
                            {p.platform}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
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
                        <div title={`${formatNumber(p.views)} views`}>
                          <span className="text-[10px] text-slate-400 block font-semibold">Views</span>
                          <span className="text-xs font-bold text-slate-900">
                            {p.missingMetrics?.includes("views")
                              ? "Unknown"
                              : formatCompactNumber(p.views)}
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
                <span>Find Content</span>
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
      {isScoutModalOpen && (
        <ScoutTaskLauncher
          context={{ intent: "content", mode: "search", entityType: "kol", source: "/" }}
          onClose={() => setIsScoutModalOpen(false)}
          onSuccess={handleRefresh}
        />
      )}

      {scoutTargetKol && (
        <ScoutTaskLauncher
          context={{
            intent: "content",
            mode: "entity",
            entityType: "kol",
            source: "/",
            ids: [scoutTargetKol.id],
          }}
          entity={scoutTargetKol}
          key={scoutTargetKol.id}
          onClose={() => setScoutTargetKol(null)}
          onSuccess={handleRefresh}
        />
      )}

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
