"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  ExternalLink,
  Star,
  UserPlus,
  FileSpreadsheet,
  Eye,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Edit3,
  Trash2,
  LayoutGrid,
  Table2,
  RotateCcw,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { t, formatNumber, formatCurrency } from "@/lib/i18n";

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
  score?: number;
  tags?: string[];
  phone?: string;
  email?: string;
  userLockedFields?: string[];
  pendingScoutDiff?: {
    scoutedAt: string;
    changes: Record<string, { current: any; scouted: any }>;
  } | null;
  lastScoutedAt?: string;
}

export interface KolsTableViewProps {
  kols: KOL[];
  selectedKolIds?: string[];
  onToggleSelectKol?: (kolId: string) => void;
  onSelectAllKols?: (ids: string[]) => void;
  onClearSelection?: () => void;
  onOpenDiscoveryScout?: () => void;
  onSelectKol: (kolId: string) => void;
  onView360?: (kol: KOL) => void;
  onAddKol: () => void;
  onOpenReport: (kol: KOL) => void;
  onUploadExcel: () => void;
  onRefresh: () => void;
  loading: boolean;
  onEditKol?: (kol: KOL) => void;
  onDeleteKol?: (kol: KOL) => void;
  onOpenDiff?: (kol: KOL) => void;
  onOpenGrowth?: (kol: KOL) => void;
  onScoutKol?: (kol: KOL) => void;
}

export function KolsTableView({
  kols,
  selectedKolIds = [],
  onToggleSelectKol,
  onSelectAllKols,
  onClearSelection,
  onOpenDiscoveryScout,
  onSelectKol,
  onView360,
  onAddKol,
  onOpenReport,
  onUploadExcel,
  onRefresh,
  loading,
  onEditKol,
  onDeleteKol,
  onOpenDiff,
  onOpenGrowth,
  onScoutKol,
}: KolsTableViewProps) {
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [geoFilter, setGeoFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"followers" | "views" | "er" | "price" | "name">("followers");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const hasActiveFilters =
    search.trim() !== "" ||
    sportFilter !== "all" ||
    tierFilter !== "all" ||
    platformFilter !== "all" ||
    geoFilter !== "all" ||
    statusFilter !== "all";

  const handleResetFilters = () => {
    setSearch("");
    setSportFilter("all");
    setTierFilter("all");
    setPlatformFilter("all");
    setGeoFilter("all");
    setStatusFilter("all");
    setSortBy("followers");
    setSortOrder("desc");
  };

  // Filtering
  const filteredKols = useMemo(() => {
    return kols.filter((k) => {
      if (search) {
        const q = search.toLowerCase();
        const matchName = k.name.toLowerCase().includes(q);
        const matchInfo = (k.info || "").toLowerCase().includes(q);
        const matchSport = k.sport.some((s) => s.toLowerCase().includes(q));
        const matchGeo = (k.geography || "").toLowerCase().includes(q);
        const matchPlatform = (k.platform || "").toLowerCase().includes(q);
        if (!matchName && !matchInfo && !matchSport && !matchGeo && !matchPlatform) return false;
      }

      if (sportFilter !== "all" && !k.sport.some((s) => s.toLowerCase() === sportFilter.toLowerCase())) {
        return false;
      }

      if (tierFilter !== "all" && !k.tier.toLowerCase().includes(tierFilter.toLowerCase())) {
        return false;
      }

      if (platformFilter !== "all" && !k.platform.toLowerCase().includes(platformFilter.toLowerCase())) {
        return false;
      }

      if (geoFilter !== "all" && !k.geography.toLowerCase().includes(geoFilter.toLowerCase())) {
        return false;
      }

      if (statusFilter !== "all" && !k.status.toLowerCase().includes(statusFilter.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [kols, search, sportFilter, tierFilter, platformFilter, geoFilter, statusFilter]);

  // Sorting
  const sortedKols = useMemo(() => {
    return [...filteredKols].sort((a, b) => {
      let valA: any = a.followers;
      let valB: any = b.followers;

      if (sortBy === "views") {
        valA = a.avgViews;
        valB = b.avgViews;
      } else if (sortBy === "er") {
        valA = a.er;
        valB = b.er;
      } else if (sortBy === "price") {
        valA = a.quotation;
        valB = b.quotation;
      } else if (sortBy === "name") {
        valA = a.name;
        valB = b.name;
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortOrder === "asc" ? valA - valB : valB - valA;
    });
  }, [filteredKols, sortBy, sortOrder]);

  const totalReach = useMemo(
    () => sortedKols.reduce((sum, k) => sum + (k.followers || 0), 0),
    [sortedKols]
  );

  const avgEr = useMemo(() => {
    if (sortedKols.length === 0) return 0;
    return (sortedKols.reduce((sum, k) => sum + (k.er || 0), 0) / sortedKols.length).toFixed(1);
  }, [sortedKols]);

  const toggleSort = (field: "followers" | "views" | "er" | "price" | "name") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  // Selection state calculations
  const selectAllRef = useRef<HTMLInputElement>(null);
  const isAllSelected =
    sortedKols.length > 0 && sortedKols.every((k) => selectedKolIds.includes(k.id));
  const isIndeterminate =
    sortedKols.length > 0 &&
    sortedKols.some((k) => selectedKolIds.includes(k.id)) &&
    !isAllSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  const handleToggleSelectAll = (e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
    if (isAllSelected) {
      if (onClearSelection) onClearSelection();
      else if (onSelectAllKols) onSelectAllKols([]);
    } else {
      if (onSelectAllKols) {
        onSelectAllKols(sortedKols.map((k) => k.id));
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── HEADER & ACTIONS (SINGLE ROW COMPACT) ─── */}
      <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4 flex-nowrap">
        <div className="flex items-center space-x-3 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-base shrink-0">
            👤
          </span>
          <div className="flex items-center space-x-2.5 min-w-0">
            <h2 className="text-base font-bold text-slate-900 leading-none whitespace-nowrap">
              Sports KOLs Directory
            </h2>
            <span className="bg-indigo-50 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-indigo-200 shrink-0">
              {kols.length} Profiles
            </span>
            <span className="text-slate-300 hidden xl:inline">|</span>
            <span className="text-xs text-slate-400 font-medium truncate hidden xl:inline">
              Live directory managed via Supabase PostgreSQL
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition cursor-pointer ${
                viewMode === "table"
                  ? "bg-white text-indigo-600 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Switch to table view"
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white text-indigo-600 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Switch to grid card view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl transition flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
              <span>Refresh</span>
            </button>
          )}

          {onOpenDiscoveryScout && (
            <button
              type="button"
              onClick={onOpenDiscoveryScout}
              className="text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-3 py-1.5 rounded-xl transition shadow-xs flex items-center space-x-1.5 active:scale-95 cursor-pointer whitespace-nowrap"
              title="Scout & discover new sports creators from social networks"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Discovery Scout</span>
            </button>
          )}

          <button
            onClick={onUploadExcel}
            className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1.5 rounded-xl transition flex items-center space-x-1 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>

          <button
            onClick={onAddKol}
            className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-xl transition shadow-xs shadow-indigo-200 flex items-center space-x-1.5 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add KOL</span>
          </button>
        </div>
      </div>

      {/* ─── SLICERS & FILTERS TOOLBAR ─── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search KOL name, bio, sport, region..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
            />
          </div>

          {/* Sport */}
          <div>
            <select
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Sports</option>
              <option value="Pickleball">Pickleball</option>
              <option value="Tennis">Tennis</option>
              <option value="Running">Running / Marathon</option>
              <option value="Gym & Fitness">Gym & Fitness</option>
              <option value="Badminton">Badminton</option>
              <option value="Football">Football</option>
              <option value="Golf">Golf</option>
              <option value="Others">Others</option>
            </select>
          </div>

          {/* Tier */}
          <div>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Tiers</option>
              <option value="Nano">Nano (&lt; 10k)</option>
              <option value="Micro">Micro (10k - 50k)</option>
              <option value="Macro">Macro (50k - 200k)</option>
              <option value="Mega">Mega (&gt; 200k)</option>
            </select>
          </div>

          {/* Platform */}
          <div>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Platforms</option>
              <option value="Facebook">Facebook</option>
              <option value="Instagram">Instagram</option>
              <option value="TikTok">TikTok</option>
              <option value="YouTube">YouTube</option>
              <option value="Threads">Threads</option>
            </select>
          </div>

          {/* Geography */}
          <div>
            <select
              value={geoFilter}
              onChange={(e) => setGeoFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Regions</option>
              <option value="Toàn quốc">Nationwide</option>
              <option value="Hà Nội">Hanoi (Northern)</option>
              <option value="TP. Hồ Chí Minh">Ho Chi Minh City (Southern)</option>
              <option value="Đà Nẵng">Da Nang (Central)</option>
            </select>
          </div>
        </div>

        {/* Quick summary & Reset bar */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center space-x-3">
            <span>
              Showing <strong>{sortedKols.length}</strong> of {kols.length} creators
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center space-x-1 text-indigo-600 hover:text-indigo-800 font-semibold bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
          <div className="flex items-center space-x-4 font-medium">
            <span>
              Total Reach: <strong className="text-slate-800">{(totalReach / 1000000).toFixed(2)}M</strong>
            </span>
            <span>
              Avg ER: <strong className="text-emerald-600">{avgEr}%</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ─── CONDITIONAL VIEW: TABLE OR GRID ─── */}
      {viewMode === "table" ? (
        /* ─── INTERACTIVE DATA TABLE ─── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-left text-xs border-collapse">
              <colgroup>
                <col className="w-[36px]" />
                <col className="w-[44px]" />
                <col className="w-[230px]" />
                <col className="w-[150px]" />
                <col className="w-[100px]" />
                <col className="w-[95px]" />
                <col className="w-[90px]" />
                <col className="w-[75px]" />
                <col className="w-[120px]" />
                <col className="w-[105px]" />
                <col className="w-[110px]" />
                <col className="w-[140px]" />
              </colgroup>
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th
                    className="py-2.5 px-2 text-center w-[36px] cursor-pointer select-none"
                    onClick={handleToggleSelectAll}
                    title={isAllSelected ? "Deselect all visible creators" : "Select all visible creators"}
                  >
                    {onSelectAllKols && (
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                        title={isAllSelected ? "Deselect all visible creators" : "Select all visible creators"}
                      />
                    )}
                  </th>
                  <th className="py-2.5 px-3 text-center">#</th>
                  <th
                    onClick={() => toggleSort("name")}
                    className="py-2.5 px-3 cursor-pointer hover:text-indigo-600 transition"
                  >
                    <div className="flex items-center space-x-1">
                      <span>KOL / Creator Channel</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Sports</th>
                  <th className="py-2.5 px-3">Platform</th>
                  <th
                    onClick={() => toggleSort("followers")}
                    className="py-2.5 px-3 cursor-pointer hover:text-indigo-600 transition text-right"
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Followers</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort("views")}
                    className="py-2.5 px-3 cursor-pointer hover:text-indigo-600 transition text-right"
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Avg Views</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort("er")}
                    className="py-2.5 px-3 cursor-pointer hover:text-indigo-600 transition text-right"
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>ER (%)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort("price")}
                    className="py-2.5 px-3 cursor-pointer hover:text-indigo-600 transition text-right"
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Rate Card</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Region</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedKols.length > 0 ? (
                  sortedKols.map((kol, idx) => {
                    const isTopTier = kol.tier.includes("Mega") || kol.tier.includes("Macro");
                    return (
                      <tr
                        key={kol.id}
                        className={`transition group h-[52px] ${
                          selectedKolIds.includes(kol.id)
                            ? "bg-indigo-50/80 hover:bg-indigo-100/80"
                            : "hover:bg-indigo-50/30"
                        }`}
                      >
                        <td
                          className="py-2.5 px-2 text-center cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onToggleSelectKol) onToggleSelectKol(kol.id);
                          }}
                        >
                          {onToggleSelectKol && (
                            <input
                              type="checkbox"
                              checked={selectedKolIds.includes(kol.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                onToggleSelectKol(kol.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                              title="Select this creator"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-medium text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-2.5">
                            <div
                              onClick={() => (onView360 ? onView360(kol) : onSelectKol(kol.id))}
                              className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-bold flex items-center justify-center text-xs shadow-2xs shrink-0 cursor-pointer hover:scale-105 transition"
                              title="Click to view 360° Panoramic Dossier"
                            >
                              {kol.name.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                onClick={() => (onView360 ? onView360(kol) : onSelectKol(kol.id))}
                                className="font-bold text-slate-900 hover:text-indigo-600 transition flex items-center space-x-1.5 cursor-pointer hover:underline truncate max-w-[160px]"
                                title="Click to view 360° Panoramic Dossier"
                              >
                                <span className="truncate">{kol.name}</span>
                                {isTopTier && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1 rounded shrink-0">
                                    HOT
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-medium truncate block">
                                {kol.tier}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center space-x-1">
                            {kol.sport.slice(0, 2).map((sp) => (
                              <span
                                key={sp}
                                className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium"
                              >
                                {t(sp)}
                              </span>
                            ))}
                            {kol.sport.length > 2 && (
                              <span
                                className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded font-bold cursor-help"
                                title={kol.sport.slice(2).map((s) => t(s)).join(", ")}
                              >
                                +{kol.sport.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-medium text-slate-700 text-xs">{kol.platform}</span>
                            {kol.profileUrl && kol.profileUrl !== "#" && (
                              <a
                                href={kol.profileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-500 hover:text-blue-700"
                                title="Open creator profile"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatNumber(kol.followers)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 font-medium whitespace-nowrap">
                          {kol.avgViews > 0 ? formatNumber(kol.avgViews) : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span className="font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full text-[10px]">
                            {kol.er}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800 whitespace-nowrap">
                          {formatCurrency(kol.quotation)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                            {t(kol.geography || "Nationwide")}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              kol.status.includes("tích cực") || kol.status.includes("Active")
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : kol.status.includes("Tiềm năng") || kol.status.includes("Potential")
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {t(kol.status)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center space-x-1">
                            {/* Scout Diff Action */}
                            {kol.pendingScoutDiff &&
                              Object.keys(kol.pendingScoutDiff.changes || {}).length > 0 &&
                              onOpenDiff && (
                                <button
                                  type="button"
                                  onClick={() => onOpenDiff(kol)}
                                  className="w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold transition flex items-center justify-center shadow-2xs animate-pulse cursor-pointer"
                                  title="Review Scout Data Changes (Diff)"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                </button>
                              )}

                            {/* View 360 */}
                            <button
                              type="button"
                              onClick={() => (onView360 ? onView360(kol) : onSelectKol(kol.id))}
                              className="w-7 h-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition flex items-center justify-center border border-indigo-200/60 cursor-pointer hover:scale-105 active:scale-95 shadow-2xs"
                              title="View 360° Profile Dossier"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Edit Action */}
                            {onEditKol && (
                              <button
                                type="button"
                                onClick={() => onEditKol(kol)}
                                className="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition flex items-center justify-center border border-amber-200 hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                                title="Edit KOL Profile"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                              </button>
                            )}

                            {/* Delete Action */}
                            {onDeleteKol && (
                              <button
                                type="button"
                                onClick={() => onDeleteKol(kol)}
                                className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition flex items-center justify-center border border-rose-200 hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                                title="Delete KOL from Database"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-400">
                      No creator profiles match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ─── CARD GRID VIEW ─── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedKols.length > 0 ? (
            sortedKols.map((kol) => {
              const isTopTier = kol.tier.includes("Mega") || kol.tier.includes("Macro");
              const isSelected = selectedKolIds.includes(kol.id);
              return (
                <div
                  key={kol.id}
                  className={`bg-white rounded-2xl border shadow-sm p-4 hover:shadow-md transition flex flex-col justify-between group relative ${
                    isSelected
                      ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20"
                      : "border-slate-200"
                  }`}
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        {onToggleSelectKol && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              onToggleSelectKol(kol.id);
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4 shrink-0"
                            title="Select creator"
                          />
                        )}
                        <div
                          onClick={() => (onView360 ? onView360(kol) : onSelectKol(kol.id))}
                          className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-bold flex items-center justify-center text-base shadow-sm cursor-pointer hover:scale-105 transition shrink-0"
                          title="Click to view 360° Panoramic Dossier"
                        >
                          {kol.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <h4
                            onClick={() => (onView360 ? onView360(kol) : onSelectKol(kol.id))}
                            className="font-bold text-slate-900 hover:text-indigo-600 transition flex items-center space-x-1.5 cursor-pointer hover:underline"
                            title="Click to view 360° Panoramic Dossier"
                          >
                            <span>{kol.name}</span>
                            {isTopTier && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 py-0.2 rounded">
                                HOT
                              </span>
                            )}
                          </h4>
                          <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-semibold text-indigo-600">{kol.tier}</span>
                            <span>•</span>
                            <span>{kol.platform}</span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Edit & Delete Icons on Card */}
                      <div className="flex items-center space-x-1">
                        {onEditKol && (
                          <button
                            type="button"
                            onClick={() => onEditKol(kol)}
                            className="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition"
                            title="Edit KOL profile"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteKol && (
                          <button
                            type="button"
                            onClick={() => onDeleteKol(kol)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Delete KOL"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sports Tags */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {kol.sport.map((sp) => (
                        <span
                          key={sp}
                          className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                        >
                          {t(sp)}
                        </span>
                      ))}
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center mb-3">
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">Followers</div>
                        <div className="text-xs font-bold text-slate-900 mt-0.5">
                          {formatNumber(kol.followers)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">Avg Views</div>
                        <div className="text-xs font-bold text-slate-900 mt-0.5">
                          {kol.avgViews > 0 ? formatNumber(kol.avgViews) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">ER (%)</div>
                        <div className="text-xs font-bold text-emerald-600 mt-0.5">
                          {kol.er}%
                        </div>
                      </div>
                    </div>

                    {/* Price & Status */}
                    <div className="flex items-center justify-between text-xs mb-3">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Rate Card</span>
                        <span className="font-bold text-slate-900">
                          {formatCurrency(kol.quotation)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            kol.status.includes("tích cực") || kol.status.includes("Active")
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : kol.status.includes("Tiềm năng") || kol.status.includes("Potential")
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {t(kol.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center space-x-1.5">
                    {/* Scout Diff Available */}
                    {kol.pendingScoutDiff &&
                      Object.keys(kol.pendingScoutDiff.changes || {}).length > 0 &&
                      onOpenDiff && (
                        <button
                          type="button"
                          onClick={() => onOpenDiff(kol)}
                          className="py-1.5 px-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 animate-pulse shadow-xs"
                          title="Review Scout Changes"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Diff</span>
                        </button>
                      )}

                    <button
                      onClick={() => (onView360 ? onView360(kol) : onSelectKol(kol.id))}
                      className="flex-1 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View 360° Dossier</span>
                    </button>

                    {onEditKol && (
                      <button
                        onClick={() => onEditKol(kol)}
                        className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl transition border border-amber-200 cursor-pointer"
                        title="Edit Profile"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onDeleteKol && (
                      <button
                        onClick={() => onDeleteKol(kol)}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition border border-rose-200 cursor-pointer"
                        title="Delete Profile"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              No KOL profiles match the selected filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

