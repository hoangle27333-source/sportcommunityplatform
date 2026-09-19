"use client";

import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Flame,
  Search,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  TrendingUp,
  Sparkles,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  UserCheck,
  Award,
  Table2,
  LayoutGrid,
  Film,
  Plus,
} from "lucide-react";
import { PlatformHeader } from "../platform-header";
import { MarketTrendScoutModal } from "../market-trend-scout-modal";
import { KolPostScoutModal } from "../kol-post-scout-modal";
import { Kol360Modal, Community360Modal } from "../dossier-modals";
import { AddPostModal } from "../action-modals";
import { t, formatNumber } from "@/lib/i18n";
import type { DashboardData, Post, KOL, Community } from "../types";

export interface TrendingPageViewProps {
  initialData: DashboardData;
}

export function TrendingPageView({ initialData }: TrendingPageViewProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);

  // Filter & View state
  const [search, setSearch] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [sortBy, setSortBy] = useState<"views" | "er" | "likes" | "comments" | "title" | "author">("views");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  const toggleSort = (col: "views" | "er" | "likes" | "comments" | "title" | "author") => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setSortOrder(col === "title" || col === "author" ? "asc" : "desc");
    }
  };

  // Modals state
  const [isScoutModalOpen, setIsScoutModalOpen] = useState(false);
  const [isAddPostModalOpen, setIsAddPostModalOpen] = useState(false);
  const [scoutTargetKol, setScoutTargetKol] = useState<KOL | null>(null);
  const [selectedKolFor360, setSelectedKolFor360] = useState<KOL | null>(null);
  const [selectedCommunityFor360, setSelectedCommunityFor360] = useState<Community | null>(null);

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
        toast.success("Trending posts refreshed successfully!");
      } else {
        toast.error(result?.error || "Error refreshing data");
      }
    } catch {
      toast.error("Unable to connect to server API");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen360ForAuthor = (authorName: string, kolRecordIds?: string[]) => {
    const clean = (authorName || "").trim().toLowerCase();
    const rawClean = clean.replace(/@[\w.]+/g, "").replace(/[()]/g, "").trim();

    // 1. Try finding in KOLs by ID
    if (kolRecordIds && kolRecordIds.length > 0) {
      const byId = data.kols.find((k) => kolRecordIds.includes(k.id));
      if (byId) {
        setSelectedKolFor360(byId);
        return;
      }
    }

    // 2. Try finding in KOLs by Name
    const foundKol = data.kols.find(
      (k) =>
        k.name.toLowerCase() === clean ||
        clean.includes(k.name.toLowerCase()) ||
        k.name.toLowerCase().includes(clean) ||
        (rawClean && (k.name.toLowerCase().includes(rawClean) || rawClean.includes(k.name.toLowerCase())))
    );
    if (foundKol) {
      setSelectedKolFor360(foundKol);
      return;
    }

    // 3. Try finding in Communities
    const foundComm = data.communities.find(
      (c) =>
        c.name.toLowerCase() === clean ||
        clean.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(clean) ||
        (rawClean && (c.name.toLowerCase().includes(rawClean) || rawClean.includes(c.name.toLowerCase())))
    );
    if (foundComm) {
      setSelectedCommunityFor360(foundComm);
      return;
    }

    toast.info(`No detailed 360° dossier found for "${authorName}"`);
  };

  // KPIs
  const totalViews = useMemo(() => {
    return data.posts.reduce((sum, p) => sum + (p.views || 0), 0);
  }, [data.posts]);

  const avgEr = useMemo(() => {
    if (data.posts.length === 0) return 0;
    const sum = data.posts.reduce((acc, p) => acc + (p.er || 0), 0);
    return (sum / data.posts.length).toFixed(1);
  }, [data.posts]);

  const superViralCount = useMemo(() => {
    return data.posts.filter((p) => {
      const g = (p.viralGrade || "").toLowerCase();
      return g.includes("siêu") || g.includes("super") || g.includes("cao") || g.includes("high");
    }).length;
  }, [data.posts]);

  // Unique Platforms and Grades
  const platforms = useMemo(() => {
    const set = new Set<string>();
    data.posts.forEach((p) => {
      if (p.platform) set.add(p.platform.trim());
    });
    return Array.from(set);
  }, [data.posts]);

  const grades = useMemo(() => {
    const set = new Set<string>();
    data.posts.forEach((p) => {
      if (p.viralGrade) set.add(p.viralGrade.trim());
    });
    return Array.from(set);
  }, [data.posts]);

  // Filtered & Sorted Posts
  const filteredPosts = useMemo(() => {
    return data.posts
      .filter((p) => {
        const matchSearch =
          !search ||
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.author.toLowerCase().includes(search.toLowerCase());
        const matchPlatform =
          selectedPlatform === "all" ||
          p.platform.toLowerCase() === selectedPlatform.toLowerCase();
        const matchGrade =
          selectedGrade === "all" ||
          p.viralGrade.toLowerCase() === selectedGrade.toLowerCase();

        return matchSearch && matchPlatform && matchGrade;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === "views") diff = (b.views || 0) - (a.views || 0);
        else if (sortBy === "er") diff = (b.er || 0) - (a.er || 0);
        else if (sortBy === "likes") diff = (b.likes || 0) - (a.likes || 0);
        else if (sortBy === "comments") diff = (b.comments || 0) - (a.comments || 0);
        else if (sortBy === "title") diff = a.title.localeCompare(b.title);
        else if (sortBy === "author") diff = a.author.localeCompare(b.author);
        return sortOrder === "desc" ? diff : -diff;
      });
  }, [data.posts, search, selectedPlatform, selectedGrade, sortBy, sortOrder]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* ─── GLOBAL PLATFORM HEADER ─── */}
      <PlatformHeader onRefresh={handleRefresh} loading={loading} />

      {/* ─── MAIN CONTENT ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {/* Page Title & Actions (Strictly Single Line) */}
        <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4 flex-nowrap">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <div className="flex items-center space-x-2.5 min-w-0">
              <h1 className="text-base font-bold text-slate-900 leading-none whitespace-nowrap">
                Trending Viral Posts & Reels
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 shrink-0">
                {data.posts.length} Posts
              </span>
              <span className="text-slate-300 hidden md:inline">|</span>
              <span className="text-xs text-slate-400 font-medium truncate hidden md:inline">
                Real-time viral content scouted across TikTok, Facebook Reels, and Instagram
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsAddPostModalOpen(true)}
              className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Viral Post</span>
            </button>
            <button
              type="button"
              onClick={() => setIsScoutModalOpen(true)}
              className="px-3.5 py-1.5 bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Flame className="w-3.5 h-3.5 text-amber-200 fill-amber-200" />
              <span>Scout Market Trends</span>
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Scouted Content
            </span>
            <span className="text-2xl font-black text-slate-900 block mt-1">
              {data.posts.length}
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Viral Views
            </span>
            <span className="text-2xl font-black text-slate-900 block mt-1">
              {formatNumber(totalViews)}
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Average Engagement (ER%)
            </span>
            <span className="text-2xl font-black text-emerald-600 block mt-1">
              {avgEr}%
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Super Viral Posts
            </span>
            <span className="text-2xl font-black text-rose-600 block mt-1">
              {superViralCount}
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Filter & Sort Viral Content
              </h3>
              <span className="text-xs text-slate-400">
                ({filteredPosts.length} matching posts)
              </span>
            </div>

            <div className="flex items-center space-x-3">
              {/* View Switcher: Table / Grid */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
                    viewMode === "table"
                      ? "bg-white text-blue-600 shadow-2xs font-extrabold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  title="Table View"
                >
                  <Table2 className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
                    viewMode === "grid"
                      ? "bg-white text-blue-600 shadow-2xs font-extrabold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </button>
              </div>

              {(search || selectedPlatform !== "all" || selectedGrade !== "all" || sortBy !== "views" || sortOrder !== "desc") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSelectedPlatform("all");
                    setSelectedGrade("all");
                    setSortBy("views");
                    setSortOrder("desc");
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer font-semibold bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search caption, creator name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:border-blue-500 focus:outline-none transition"
              />
            </div>

            {/* Platform Filter */}
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Platforms ({data.posts.length})</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            {/* Viral Grade Filter */}
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Viral Grades</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {t(g)}
                </option>
              ))}
            </select>

            {/* Sort Order */}
            <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [col, ord] = e.target.value.split("-");
                  setSortBy(col as any);
                  setSortOrder(ord as any);
                }}
                className="w-full py-2 bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="views-desc">Sort: Most Views</option>
                <option value="views-asc">Sort: Least Views</option>
                <option value="er-desc">Sort: Highest ER%</option>
                <option value="er-asc">Sort: Lowest ER%</option>
                <option value="likes-desc">Sort: Most Likes</option>
                <option value="likes-asc">Sort: Least Likes</option>
                <option value="comments-desc">Sort: Most Comments</option>
                <option value="comments-asc">Sort: Least Comments</option>
                <option value="title-asc">Sort: Title (A-Z)</option>
                <option value="author-asc">Sort: Creator (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Viral Posts Feed Area */}
        {filteredPosts.length > 0 ? (
          viewMode === "table" ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2 px-2 text-center w-[40px]">#</th>
                      <th
                        onClick={() => toggleSort("title")}
                        className="py-2 px-3 min-w-[240px] cursor-pointer hover:text-blue-600 transition select-none"
                      >
                        <div className="flex items-center space-x-1">
                          <span>Post / Reel Title & Content Hook</span>
                          {sortBy === "title" ? (
                            sortOrder === "desc" ? (
                              <ArrowDown className="w-3 h-3 text-blue-600" />
                            ) : (
                              <ArrowUp className="w-3 h-3 text-blue-600" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => toggleSort("author")}
                        className="py-2 px-3 min-w-[150px] cursor-pointer hover:text-blue-600 transition select-none"
                      >
                        <div className="flex items-center space-x-1">
                          <span>Author / Creator</span>
                          {sortBy === "author" ? (
                            sortOrder === "desc" ? (
                              <ArrowDown className="w-3 h-3 text-blue-600" />
                            ) : (
                              <ArrowUp className="w-3 h-3 text-blue-600" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                          )}
                        </div>
                      </th>
                      <th className="py-2 px-2 text-center min-w-[95px]">Platform</th>
                      <th
                        onClick={() => toggleSort("views")}
                        className="py-2 px-2 text-right min-w-[90px] cursor-pointer hover:text-blue-600 transition select-none"
                      >
                        <div className="flex items-center justify-end space-x-1">
                          <span>Views</span>
                          {sortBy === "views" ? (
                            sortOrder === "desc" ? (
                              <ArrowDown className="w-3 h-3 text-blue-600" />
                            ) : (
                              <ArrowUp className="w-3 h-3 text-blue-600" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => toggleSort("likes")}
                        className="py-2 px-2 text-right min-w-[80px] cursor-pointer hover:text-blue-600 transition select-none"
                      >
                        <div className="flex items-center justify-end space-x-1">
                          <span>Likes</span>
                          {sortBy === "likes" ? (
                            sortOrder === "desc" ? (
                              <ArrowDown className="w-3 h-3 text-blue-600" />
                            ) : (
                              <ArrowUp className="w-3 h-3 text-blue-600" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => toggleSort("comments")}
                        className="py-2 px-2 text-right min-w-[80px] cursor-pointer hover:text-blue-600 transition select-none"
                      >
                        <div className="flex items-center justify-end space-x-1">
                          <span>Comments</span>
                          {sortBy === "comments" ? (
                            sortOrder === "desc" ? (
                              <ArrowDown className="w-3 h-3 text-blue-600" />
                            ) : (
                              <ArrowUp className="w-3 h-3 text-blue-600" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => toggleSort("er")}
                        className="py-2 px-2 text-center min-w-[70px] cursor-pointer hover:text-blue-600 transition select-none"
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span>ER %</span>
                          {sortBy === "er" ? (
                            sortOrder === "desc" ? (
                              <ArrowDown className="w-3 h-3 text-blue-600" />
                            ) : (
                              <ArrowUp className="w-3 h-3 text-blue-600" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                          )}
                        </div>
                      </th>
                      <th className="py-2 px-2 text-center min-w-[125px]">Viral Grade</th>
                      <th className="py-2 px-3 text-center min-w-[85px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPosts.map((p, idx) => {
                      const isSuperViral =
                        (p.viralGrade || "").toLowerCase().includes("siêu") ||
                        (p.viralGrade || "").toLowerCase().includes("super");
                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-blue-50/30 transition group h-11"
                        >
                          <td className="py-2 px-2 text-center font-medium text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="flex items-center space-x-2 max-w-[280px]">
                              <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 group-hover:bg-blue-50 group-hover:text-blue-600 transition">
                                <Film className="w-3 h-3" />
                              </div>
                              <span
                                className="font-bold text-slate-900 group-hover:text-blue-600 transition truncate text-xs"
                                title={p.title}
                              >
                                {p.title}
                              </span>
                              {p.postUrl && p.postUrl !== "#" ? (
                                <a
                                  href={p.postUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-400 hover:text-blue-600 shrink-0 transition"
                                  title="Watch original source"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="flex items-center space-x-2 max-w-[170px]">
                              <div
                                onClick={() => handleOpen360ForAuthor(p.author, p.kolRecordIds)}
                                className="w-6 h-6 rounded-md bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-2xs shrink-0 cursor-pointer hover:scale-105 transition"
                                title="Open 360° Profile Dossier"
                              >
                                {(p.author || "?").slice(0, 1).toUpperCase()}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpen360ForAuthor(p.author, p.kolRecordIds)}
                                className="font-bold text-slate-900 hover:text-blue-600 transition text-xs block text-left cursor-pointer hover:underline truncate"
                                title={`${p.author} (Open 360° Dossier)`}
                              >
                                {p.author}
                              </button>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              {p.platform}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right whitespace-nowrap">
                            <span className="inline-flex items-center space-x-1 font-extrabold text-slate-900 text-xs">
                              <Eye className="w-3 h-3 text-slate-400" />
                              <span>{formatNumber(p.views || 0)}</span>
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right whitespace-nowrap">
                            <span className="inline-flex items-center space-x-1 font-semibold text-slate-700 text-xs">
                              <Heart className="w-3 h-3 text-rose-400" />
                              <span>{formatNumber(p.likes || 0)}</span>
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right whitespace-nowrap">
                            <span className="inline-flex items-center space-x-1 font-semibold text-slate-700 text-xs">
                              <MessageCircle className="w-3 h-3 text-slate-400" />
                              <span>{formatNumber(p.comments || 0)}</span>
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {p.er}%
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center whitespace-nowrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center space-x-1 whitespace-nowrap ${
                                isSuperViral
                                  ? "bg-rose-100 text-rose-700 border border-rose-200 animate-pulse"
                                  : "bg-amber-50 text-amber-800 border border-amber-200"
                              }`}
                            >
                              <Flame className="w-3 h-3 text-rose-500" />
                              <span>{t(p.viralGrade)}</span>
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center space-x-1">
                              {/* 360 Dossier Action (Icon-only) */}
                              <button
                                type="button"
                                onClick={() => handleOpen360ForAuthor(p.author, p.kolRecordIds)}
                                className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 flex items-center justify-center transition hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                                title="View 360° Profile Dossier"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Watch Post Action (Icon-only) */}
                              {p.postUrl && p.postUrl !== "#" ? (
                                <a
                                  href={p.postUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="w-7 h-7 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/60 flex items-center justify-center transition hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                                  title="Open Original Post Reel"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              ) : (
                                <div
                                  className="w-7 h-7 rounded-lg bg-slate-100 text-slate-300 flex items-center justify-center cursor-not-allowed"
                                  title="No external link provided"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPosts.map((p) => {
                const isSuperViral =
                  (p.viralGrade || "").toLowerCase().includes("siêu") ||
                  (p.viralGrade || "").toLowerCase().includes("super");
                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-blue-400 hover:shadow-md transition flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Badges & Platform */}
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          {p.platform}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center space-x-1 ${
                            isSuperViral
                              ? "bg-rose-100 text-rose-700 border border-rose-200 animate-pulse"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          <Flame className="w-3 h-3" />
                          <span>{t(p.viralGrade)}</span>
                        </span>
                      </div>

                      {/* Content Caption (Preserve Original Vietnamese Language!) */}
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                          {p.title}
                        </h3>
                      </div>

                      {/* Author & 360 link */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center space-x-1.5 text-xs text-slate-600 min-w-0">
                          <span className="text-slate-400 shrink-0">Author:</span>
                          <button
                            type="button"
                            onClick={() => handleOpen360ForAuthor(p.author, p.kolRecordIds)}
                            className="font-bold text-slate-900 hover:text-blue-600 underline decoration-slate-300 hover:decoration-blue-500 transition cursor-pointer truncate"
                            title="Open 360° Panoramic Dossier"
                          >
                            {p.author}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpen360ForAuthor(p.author, p.kolRecordIds)}
                          className="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 flex items-center justify-center transition hover:scale-105 active:scale-95 shadow-2xs cursor-pointer shrink-0"
                          title="View 360° Profile Dossier"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Metrics 4-Col Box */}
                      <div className="grid grid-cols-4 gap-2 p-3 bg-slate-50 rounded-xl text-center text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Views</span>
                          <span className="font-bold text-slate-900">
                            {p.views > 1000 ? `${(p.views / 1000).toFixed(0)}k` : p.views}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Likes</span>
                          <span className="font-bold text-slate-900">
                            {p.likes > 1000 ? `${(p.likes / 1000).toFixed(0)}k` : p.likes}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Comments</span>
                          <span className="font-bold text-slate-900">{p.comments || 0}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">ER%</span>
                          <span className="font-black text-emerald-600">{p.er}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Open Link Button (Icon-only) */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpen360ForAuthor(p.author, p.kolRecordIds)}
                        className="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 flex items-center justify-center transition hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                        title="View 360° Profile Dossier"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {p.postUrl && p.postUrl !== "#" ? (
                        <a
                          href={p.postUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="w-8 h-8 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/60 flex items-center justify-center transition hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                          title="Open Original Post Reel"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <div
                          className="w-8 h-8 rounded-xl bg-slate-100 text-slate-300 flex items-center justify-center cursor-not-allowed"
                          title="No external link provided"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <Flame className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">
              No matching viral posts found
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your search criteria or trigger the Auto Scout bot to discover new viral sports content.
            </p>
          </div>
        )}
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

      {selectedKolFor360 && (
        <Kol360Modal
          isOpen={!!selectedKolFor360}
          kol={selectedKolFor360}
          posts={data.posts.filter((p) =>
            p.kolRecordIds?.includes(selectedKolFor360.id) ||
            p.author?.toLowerCase().includes(selectedKolFor360.name.toLowerCase())
          )}
          reports={data.reports.filter((r) =>
            r.kolRecordIds?.includes(selectedKolFor360.id) ||
            r.kolName?.toLowerCase().includes(selectedKolFor360.name.toLowerCase())
          )}
          onClose={() => setSelectedKolFor360(null)}
          onScoutKolPosts={(kol) => setScoutTargetKol(kol)}
        />
      )}

      {selectedCommunityFor360 && (
        <Community360Modal
          isOpen={!!selectedCommunityFor360}
          community={selectedCommunityFor360}
          posts={data.posts.filter((p) =>
            p.author?.toLowerCase().includes(selectedCommunityFor360.name.toLowerCase()) ||
            selectedCommunityFor360.name.toLowerCase().includes(p.author?.toLowerCase())
          )}
          onClose={() => setSelectedCommunityFor360(null)}
        />
      )}

      {isAddPostModalOpen && (
        <AddPostModal
          isOpen={isAddPostModalOpen}
          onClose={() => setIsAddPostModalOpen(false)}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  );
}
