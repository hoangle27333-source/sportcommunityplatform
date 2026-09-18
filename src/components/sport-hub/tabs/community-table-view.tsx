"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  ExternalLink,
  Users,
  FileSpreadsheet,
  ShieldCheck,
  ArrowUpDown,
  Eye,
  Table2,
  LayoutGrid,
  RotateCcw,
  Sparkles,
  Star,
  Edit3,
  Trash2,
  Globe,
  RefreshCw,
} from "lucide-react";
import { t, formatNumber, formatCurrency } from "@/lib/i18n";
import type { Community } from "../types";

export interface CommunityTableViewProps {
  communities: Community[];
  selectedCommunityIds?: string[];
  onToggleSelectCommunity?: (communityId: string) => void;
  onSelectAllCommunities?: (ids: string[]) => void;
  onClearSelection?: () => void;
  onAddCommunity: () => void;
  onSelectCommunity?: (community: Community) => void;
  onUploadExcel: () => void;
  onRefresh: () => void;
  loading: boolean;
  onEditCommunity?: (community: Community) => void;
  onDeleteCommunity?: (community: Community) => void;
  onOpenReport?: (community: Community) => void;
  onScoutCommunity?: () => void;
  onScoutCommunityPosts?: (community: Community) => void;
}

export function CommunityTableView({
  communities,
  selectedCommunityIds = [],
  onToggleSelectCommunity,
  onSelectAllCommunities,
  onClearSelection,
  onAddCommunity,
  onSelectCommunity,
  onUploadExcel,
  onRefresh,
  loading,
  onEditCommunity,
  onDeleteCommunity,
  onOpenReport,
  onScoutCommunity,
  onScoutCommunityPosts,
}: CommunityTableViewProps) {
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [geoFilter, setGeoFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"members" | "price" | "name">("members");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const hasActiveFilters =
    search.trim() !== "" ||
    sportFilter !== "all" ||
    platformFilter !== "all" ||
    activityFilter !== "all" ||
    geoFilter !== "all";

  const handleResetFilters = () => {
    setSearch("");
    setSportFilter("all");
    setPlatformFilter("all");
    setActivityFilter("all");
    setGeoFilter("all");
    setSortBy("members");
    setSortOrder("desc");
  };

  // Filtering
  const filtered = useMemo(() => {
    return communities.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchAdmin = (c.adminContact || "").toLowerCase().includes(q);
        const matchSport = c.sport.some((s) => s.toLowerCase().includes(q));
        const matchGeo = (c.geography || "").toLowerCase().includes(q);
        const matchPlatform = (c.platform || "").toLowerCase().includes(q);
        if (!matchName && !matchAdmin && !matchSport && !matchGeo && !matchPlatform) return false;
      }

      if (sportFilter !== "all" && !c.sport.some((s) => s.toLowerCase() === sportFilter.toLowerCase())) {
        return false;
      }

      if (platformFilter !== "all" && !c.platform.toLowerCase().includes(platformFilter.toLowerCase())) {
        return false;
      }

      if (activityFilter !== "all" && !c.activityLevel.toLowerCase().includes(activityFilter.toLowerCase())) {
        return false;
      }

      if (geoFilter !== "all" && !c.geography.toLowerCase().includes(geoFilter.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [communities, search, sportFilter, platformFilter, activityFilter, geoFilter]);

  // Sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA: any = a.members;
      let valB: any = b.members;

      if (sortBy === "price") {
        valA = a.pricePerPin;
        valB = b.pricePerPin;
      } else if (sortBy === "name") {
        valA = a.name;
        valB = b.name;
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortOrder === "asc" ? valA - valB : valB - valA;
    });
  }, [filtered, sortBy, sortOrder]);

  const totalMembers = useMemo(
    () => sorted.reduce((sum, c) => sum + (c.members || 0), 0),
    [sorted]
  );

  const toggleSort = (field: "members" | "price" | "name") => {
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
    sorted.length > 0 && sorted.every((c) => selectedCommunityIds.includes(c.id));
  const isIndeterminate =
    sorted.length > 0 &&
    sorted.some((c) => selectedCommunityIds.includes(c.id)) &&
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
      else if (onSelectAllCommunities) onSelectAllCommunities([]);
    } else {
      if (onSelectAllCommunities) {
        onSelectAllCommunities(sorted.map((c) => c.id));
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── HEADER & ACTIONS (SINGLE ROW COMPACT) ─── */}
      <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4 flex-nowrap">
        <div className="flex items-center space-x-3 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-base shrink-0">
            👥
          </span>
          <div className="flex items-center space-x-2.5 min-w-0">
            <h2 className="text-base font-bold text-slate-900 leading-none whitespace-nowrap">
              Community & Clubs Network
            </h2>
            <span className="bg-purple-50 text-purple-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-purple-200 shrink-0">
              {communities.length} Groups
            </span>
            <span className="text-slate-300 hidden xl:inline">|</span>
            <span className="text-xs text-slate-400 font-medium truncate hidden xl:inline">
              Sports groups & clubs managed via Supabase PostgreSQL
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                viewMode === "table"
                  ? "bg-white text-purple-700 shadow-xs"
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
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white text-purple-700 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
          </div>

          {/* Auto Scout Discovery Button */}
          {onScoutCommunity && (
            <button
              onClick={onScoutCommunity}
              className="text-xs font-bold text-white bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-600 hover:from-purple-600 hover:to-indigo-500 px-3 py-1.5 rounded-xl transition shadow-xs shadow-purple-500/20 flex items-center space-x-1.5 active:scale-95 cursor-pointer whitespace-nowrap"
              title="Launch AI & Apify Scout for Communities"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Discovery Scout</span>
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl transition flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-purple-600" : ""}`} />
              <span>Refresh</span>
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
            onClick={onAddCommunity}
            className="text-xs font-bold text-white bg-purple-700 hover:bg-purple-600 px-3.5 py-1.5 rounded-xl transition shadow-xs shadow-purple-200 flex items-center space-x-1.5 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Add Group</span>
          </button>
        </div>
      </div>

      {/* ─── SLICERS & FILTERS TOOLBAR ─── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search group name, admin contact, sport..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-50/50"
            />
          </div>

          {/* Sport */}
          <div>
            <select
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Sports</option>
              <option value="Pickleball">Pickleball</option>
              <option value="Tennis">Tennis</option>
              <option value="Chạy bộ">Running / Marathon</option>
              <option value="Gym & Fitness">Gym & Fitness</option>
              <option value="Cầu lông">Badminton</option>
              <option value="Bóng đá">Football</option>
              <option value="Đạp xe">Cycling</option>
            </select>
          </div>

          {/* Platform */}
          <div>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Platforms</option>
              <option value="Facebook">Facebook Group</option>
              <option value="Zalo">Zalo Community</option>
              <option value="Strava">Strava Club</option>
              <option value="Telegram">Telegram</option>
            </select>
          </div>

          {/* Activity */}
          <div>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              className="w-full text-xs px-2.5 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Activity Levels</option>
              <option value="sôi động">Very Active</option>
              <option value="Trung bình">Moderate</option>
              <option value="Kém">Low Activity</option>
            </select>
          </div>
        </div>

        {/* Quick summary bar & Reset */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center space-x-3">
            <span>
              Showing <strong>{sorted.length}</strong> / {communities.length} groups
            </span>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
          <div className="flex items-center space-x-4 font-medium">
            <span>
              Total Network Members: <strong className="text-purple-700 font-bold">{formatNumber(totalMembers)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ─── MAIN VIEW: TABLE OR CARD GRID ─── */}
      {viewMode === "table" ? (
        /* ─── DATA TABLE ─── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs border-collapse">
              <colgroup>
                <col className="w-[36px]" />
                <col className="w-[44px]" />
                <col className="w-[230px]" />
                <col className="w-[140px]" />
                <col className="w-[95px]" />
                <col className="w-[95px]" />
                <col className="w-[110px]" />
                <col className="w-[115px]" />
                <col className="w-[95px]" />
                <col className="w-[110px]" />
                <col className="w-[95px]" />
                <col className="w-[150px]" />
              </colgroup>
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th
                    className="py-2.5 px-2 text-center w-[36px] cursor-pointer select-none"
                    onClick={handleToggleSelectAll}
                    title={isAllSelected ? "Deselect all visible clubs" : "Select all visible clubs"}
                  >
                    {onSelectAllCommunities && (
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4"
                        title={isAllSelected ? "Deselect all visible clubs" : "Select all visible clubs"}
                      />
                    )}
                  </th>
                  <th className="py-2.5 px-3 text-center">#</th>
                  <th
                    onClick={() => toggleSort("name")}
                    className="py-2.5 px-3 cursor-pointer hover:text-purple-700 transition"
                  >
                    <div className="flex items-center space-x-1">
                      <span>Group / Club Name</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Sports</th>
                  <th className="py-2.5 px-3">Platform</th>
                  <th
                    onClick={() => toggleSort("members")}
                    className="py-2.5 px-3 cursor-pointer hover:text-purple-700 transition text-right"
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Members</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Activity Level</th>
                  <th
                    onClick={() => toggleSort("price")}
                    className="py-2.5 px-3 cursor-pointer hover:text-purple-700 transition text-right"
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>Pinned Post Fee</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Region</th>
                  <th className="py-2.5 px-3">Admin / Contact</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.length > 0 ? (
                  sorted.map((comm, idx) => {
                    return (
                      <tr
                        key={comm.id}
                        className={`transition group h-[52px] ${
                          selectedCommunityIds.includes(comm.id)
                            ? "bg-purple-50/80 hover:bg-purple-100/80"
                            : "hover:bg-purple-50/30"
                        }`}
                      >
                        <td
                          className="py-2.5 px-2 text-center cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onToggleSelectCommunity) onToggleSelectCommunity(comm.id);
                          }}
                        >
                          {onToggleSelectCommunity && (
                            <input
                              type="checkbox"
                              checked={selectedCommunityIds.includes(comm.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                onToggleSelectCommunity(comm.id);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4"
                              title="Select this community"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-medium text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-2.5">
                            <div
                              onClick={() => onSelectCommunity && onSelectCommunity(comm)}
                              className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-2xs shrink-0 cursor-pointer hover:scale-105 transition"
                              title="Click to view 360° Community Dossier"
                            >
                              👥
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                onClick={() => onSelectCommunity && onSelectCommunity(comm)}
                                className="font-bold text-slate-900 hover:text-purple-700 transition cursor-pointer hover:underline flex items-center space-x-1.5 truncate max-w-[170px]"
                                title="Click to view 360° Community Dossier"
                              >
                                <span className="truncate">{comm.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 truncate block">
                                {t(comm.geography || "Nationwide")}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center space-x-1">
                            {comm.sport.slice(0, 2).map((sp) => (
                              <span
                                key={sp}
                                className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium"
                              >
                                {t(sp)}
                              </span>
                            ))}
                            {comm.sport.length > 2 && (
                              <span
                                className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded font-bold cursor-help"
                                title={comm.sport.slice(2).map((s) => t(s)).join(", ")}
                              >
                                +{comm.sport.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {comm.platform}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatNumber(comm.members)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            {t(comm.activityLevel)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800 whitespace-nowrap">
                          {formatCurrency(comm.pricePerPin)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          <span className="text-[11px]">{t(comm.geography)}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 text-[11px] whitespace-nowrap">
                          <div className="truncate max-w-[115px]" title={comm.adminContact || "—"}>
                            {comm.adminContact || "—"}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              comm.status.includes("tích cực") || comm.status.includes("Active")
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {t(comm.status)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center space-x-1">
                            {/* View 360 */}
                            {onSelectCommunity && (
                              <button
                                type="button"
                                onClick={() => onSelectCommunity(comm)}
                                className="w-7 h-7 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 transition flex items-center justify-center border border-purple-200/60 cursor-pointer hover:scale-105 active:scale-95 shadow-2xs"
                                title="View 360° Community Dossier"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Scout Discussions */}
                            {onScoutCommunityPosts && (
                              <button
                                type="button"
                                onClick={() => onScoutCommunityPosts(comm)}
                                className="w-7 h-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition flex items-center justify-center border border-indigo-200 hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                                title="Scout Discussions & Posts"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                              </button>
                            )}

                            {/* Evaluate / Report */}
                            {onOpenReport && (
                              <button
                                type="button"
                                onClick={() => onOpenReport(comm)}
                                className="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition flex items-center justify-center border border-amber-200 hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                                title="Evaluate Campaign Performance"
                              >
                                <Star className="w-3.5 h-3.5 text-amber-600" />
                              </button>
                            )}

                            {/* Edit Group */}
                            {onEditCommunity && (
                              <button
                                type="button"
                                onClick={() => onEditCommunity(comm)}
                                className="w-7 h-7 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 transition flex items-center justify-center border border-purple-200 hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                                title="Edit Community Details"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-purple-600" />
                              </button>
                            )}

                            {/* Delete Group */}
                            {onDeleteCommunity && (
                              <button
                                type="button"
                                onClick={() => onDeleteCommunity(comm)}
                                className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition flex items-center justify-center border border-rose-200 hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                                title="Delete Community from Database"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              </button>
                            )}

                            {/* Group URL link */}
                            {comm.groupUrl && comm.groupUrl !== "#" ? (
                              <a
                                href={comm.groupUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="w-7 h-7 rounded-lg text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 transition inline-flex items-center justify-center border border-blue-200/60 hover:scale-105 active:scale-95 shadow-2xs"
                                title="Open Community Link"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-400">
                      No matching sports communities found.
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
          {sorted.length > 0 ? (
            sorted.map((comm) => {
              const isSelected = selectedCommunityIds.includes(comm.id);
              return (
                <div
                  key={comm.id}
                  className={`bg-white rounded-2xl border shadow-sm p-4 hover:shadow-md transition flex flex-col justify-between group relative ${
                    isSelected
                      ? "border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/20"
                      : "border-slate-200"
                  }`}
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        {onToggleSelectCommunity && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              onToggleSelectCommunity(comm.id);
                            }}
                            className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4 shrink-0"
                            title="Select community"
                          />
                        )}
                        <div
                          onClick={() => onSelectCommunity && onSelectCommunity(comm)}
                          className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xl shadow-sm cursor-pointer hover:scale-105 transition shrink-0"
                          title="Click to view 360° Community Dossier"
                        >
                          👥
                        </div>
                        <div className="min-w-0">
                          <h4
                            onClick={() => onSelectCommunity && onSelectCommunity(comm)}
                            className="font-bold text-slate-900 hover:text-purple-700 transition flex items-center space-x-1.5 cursor-pointer hover:underline truncate max-w-[170px]"
                            title="Click to view 360° Community Dossier"
                          >
                            <span className="truncate">{comm.name}</span>
                          </h4>
                          <div className="flex items-center space-x-1.5 text-[11px] text-slate-500 mt-0.5 truncate">
                            <span className="font-semibold text-purple-600">{comm.platform}</span>
                            <span>•</span>
                            <span>{t(comm.geography)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Icons */}
                      <div className="flex items-center space-x-1">
                        {onEditCommunity && (
                          <button
                            type="button"
                            onClick={() => onEditCommunity(comm)}
                            className="p-1 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition cursor-pointer"
                            title="Edit community profile"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteCommunity && (
                          <button
                            type="button"
                            onClick={() => onDeleteCommunity(comm)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete community"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sports Tags */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {comm.sport.map((sp) => (
                        <span
                          key={sp}
                          className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                        >
                          {t(sp)}
                        </span>
                      ))}
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl text-center mb-3">
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">Total Members</div>
                        <div className="text-xs font-bold text-slate-900 mt-0.5">
                          {formatNumber(comm.members)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">Activity Level</div>
                        <div className="text-xs font-bold text-emerald-700 mt-0.5 truncate">
                          {t(comm.activityLevel)}
                        </div>
                      </div>
                    </div>

                    {/* Price & Status */}
                    <div className="flex items-center justify-between text-xs mb-3">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Pinned Post Fee</span>
                        <span className="font-bold text-slate-900">
                          {formatCurrency(comm.pricePerPin)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            comm.status.includes("tích cực") || comm.status.includes("Active")
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {t(comm.status)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center space-x-1.5">
                    {onScoutCommunityPosts && (
                      <button
                        type="button"
                        onClick={() => onScoutCommunityPosts(comm)}
                        className="py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                        title="Scout Discussions"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="hidden sm:inline">Scout</span>
                      </button>
                    )}

                    {onOpenReport && (
                      <button
                        type="button"
                        onClick={() => onOpenReport(comm)}
                        className="py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer"
                        title="Evaluate Campaign Performance"
                      >
                        <Star className="w-3.5 h-3.5 text-amber-600" />
                      </button>
                    )}

                    <button
                      onClick={() => onSelectCommunity && onSelectCommunity(comm)}
                      className="flex-1 py-1.5 px-3 bg-purple-50 hover:bg-purple-700 hover:text-white text-purple-700 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>360° Dossier</span>
                    </button>

                    {comm.groupUrl && comm.groupUrl !== "#" && (
                      <a
                        href={comm.groupUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl transition border border-slate-200"
                        title="Visit Link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              No sports communities match the selected filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
