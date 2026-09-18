"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  Briefcase,
  Star,
  TrendingUp,
  DollarSign,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Plus,
  Users,
  Sparkles,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
  Edit3,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { t, formatNumber, formatCurrency } from "@/lib/i18n";
import type { Project, ProjectParticipant, Report } from "../types";

interface ProjectsTableViewProps {
  projects: Project[];
  reports: Report[];
  onAddProject: () => void;
  onOpenReportForProject: (projectName: string) => void;
  onOpenProjectDetail: (project: Project) => void;
  onOpenBookParticipant: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  onDeleteProject?: (project: Project) => void;
  onSelectKol?: (kolName: string) => void;
  onRefresh: () => void;
  loading: boolean;
  selectedProjectIds?: string[];
  onToggleSelectProject?: (id: string) => void;
  onSelectAllProjects?: (ids: string[]) => void;
  onClearSelection?: () => void;
}

export function ProjectsTableView({
  projects,
  reports,
  onAddProject,
  onOpenReportForProject,
  onOpenProjectDetail,
  onOpenBookParticipant,
  onEditProject,
  onDeleteProject,
  onSelectKol,
  onRefresh,
  loading,
  selectedProjectIds = [],
  onToggleSelectProject,
  onSelectAllProjects,
  onClearSelection,
}: ProjectsTableViewProps) {

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"budget" | "name">("budget");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filter
  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchBrand = (p.brand || "").toLowerCase().includes(q);
        const matchPic = (p.pic || "").toLowerCase().includes(q);
        const matchObj = (p.objective || "").toLowerCase().includes(q);
        if (!matchName && !matchBrand && !matchPic && !matchObj) return false;
      }

      if (statusFilter !== "all") {
        const s = p.status.toLowerCase();
        if (statusFilter === "completed" && !(s.includes("hoàn thành") || s.includes("completed"))) return false;
        if (statusFilter === "progress" && !(s.includes("triển khai") || s.includes("thực hiện") || s.includes("progress"))) return false;
        if (statusFilter === "planning" && !(s.includes("kế hoạch") || s.includes("planning"))) return false;
      }

      return true;
    });
  }, [projects, search, statusFilter]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "budget") {
        return sortOrder === "asc" ? a.budget - b.budget : b.budget - a.budget;
      }
      return sortOrder === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });
  }, [filtered, sortBy, sortOrder]);

  const totalBudget = useMemo(
    () => projects.reduce((sum, p) => sum + (p.budget || 0), 0),
    [projects]
  );

  const completedCount = useMemo(
    () => projects.filter((p) => p.status.toLowerCase().includes("hoàn thành") || p.status.toLowerCase().includes("completed")).length,
    [projects]
  );

  const activeCount = useMemo(
    () => projects.filter((p) => p.status.toLowerCase().includes("triển khai") || p.status.toLowerCase().includes("thực hiện") || p.status.toLowerCase().includes("progress")).length,
    [projects]
  );

  const toggleSort = (field: "budget" | "name") => {
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
    sorted.length > 0 && sorted.every((p) => selectedProjectIds.includes(p.id));
  const isIndeterminate =
    sorted.length > 0 &&
    sorted.some((p) => selectedProjectIds.includes(p.id)) &&
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
      else if (onSelectAllProjects) onSelectAllProjects([]);
    } else {
      if (onSelectAllProjects) {
        onSelectAllProjects(sorted.map((p) => p.id));
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── HEADER & ACTIONS (SINGLE ROW COMPACT) ─── */}
      <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4 flex-nowrap">
        <div className="flex items-center space-x-3 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-base shrink-0">
            📋
          </span>
          <div className="flex items-center space-x-2.5 min-w-0">
            <h2 className="text-base font-bold text-slate-900 leading-none whitespace-nowrap">
              Campaigns & Projects
            </h2>
            <span className="bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
              {projects.length} Campaigns
            </span>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="text-xs text-slate-400 font-medium truncate hidden sm:inline">
              Multi-brand campaigns, budgets, and booked rosters
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-600" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={onAddProject}
            className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 rounded-xl transition shadow-xs shadow-emerald-200 flex items-center space-x-1.5 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Campaign</span>
          </button>
        </div>
      </div>

      {/* ─── METRIC CARDS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">
            💰
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Total Project Budget</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">
              {formatCurrency(totalBudget)}
            </h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
            ⚡
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">In Progress</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">
              {activeCount} Active Campaigns
            </h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl font-bold">
            🏁
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Completed & Signed Off</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">
              {completedCount} Completed
            </h3>
          </div>
        </div>
      </div>

      {/* ─── SLICERS ─── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search campaign name, brand, person in charge..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="progress">In Progress</option>
              <option value="planning">Planning</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── PROJECTS TABLE ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <colgroup>
              <col className="w-[36px]" />
              <col className="w-[36px]" />
              <col className="w-[240px]" />
              <col className="w-[180px]" />
              <col className="w-[160px]" />
              <col className="w-[160px]" />
              <col className="w-[130px]" />
              <col className="w-[105px]" />
              <col className="w-[225px]" />
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th
                  className="py-2.5 px-3 text-center w-[36px] cursor-pointer select-none"
                  onClick={handleToggleSelectAll}
                  title={isAllSelected ? "Deselect all visible campaigns" : "Select all visible campaigns"}
                >
                  {onSelectAllProjects && (
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                      title={isAllSelected ? "Deselect all visible campaigns" : "Select all visible campaigns"}
                    />
                  )}
                </th>
                <th className="py-2.5 px-3 text-center">#</th>
                <th
                  onClick={() => toggleSort("name")}
                  className="py-2.5 px-3 cursor-pointer hover:text-emerald-700 transition"
                >
                  <div className="flex items-center space-x-1">
                    <span>Campaign Name</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-3">Participating Brands</th>
                <th
                  onClick={() => toggleSort("budget")}
                  className="py-2.5 px-3 cursor-pointer hover:text-emerald-700 transition text-right"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Budget & Spend</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-3">Booked Roster</th>
                <th className="py-2.5 px-3">PIC</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length > 0 ? (
                sorted.map((proj, idx) => {
                  const isSelected = selectedProjectIds.includes(proj.id);
                  const parts = proj.participants || [];
                  const kolsCount = parts.filter((p) => p.entityType === "kol").length;
                  const commsCount = parts.filter((p) => p.entityType === "community").length;
                  const allocated = proj.allocatedBudget || parts.reduce((s, p) => s + (p.agreedFee || 0), 0);
                  const burnRate = proj.budget > 0 ? Math.min(100, Math.round((allocated / proj.budget) * 100)) : 0;

                  return (
                    <tr
                      key={proj.id}
                      onClick={() => onOpenProjectDetail(proj)}
                      className={`hover:bg-emerald-50/40 transition group h-[52px] cursor-pointer ${
                        isSelected ? "bg-emerald-50/60" : ""
                      }`}
                    >
                      <td
                        className="py-2.5 px-3 text-center cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onToggleSelectProject) onToggleSelectProject(proj.id);
                        }}
                      >
                        {onToggleSelectProject && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelectProject(proj.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                            title="Select campaign"
                          />
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium text-slate-400">
                        {idx + 1}
                      </td>

                      {/* Campaign Name */}
                      <td className="py-2.5 px-3">
                        <div
                          onClick={() => onOpenProjectDetail(proj)}
                          className="flex items-center space-x-2.5 cursor-pointer max-w-[260px]"
                          title={`${proj.name} — ${proj.objective || ""}`}
                        >
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shrink-0 group-hover:scale-105 transition">
                            📋
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 group-hover:text-emerald-600 transition truncate flex items-center space-x-1">
                              <span className="truncate">{proj.name}</span>
                              <ChevronRight className="w-3 h-3 text-slate-400 shrink-0 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition" />
                            </div>
                            <p className="text-[10px] text-slate-400 truncate">
                              {proj.objective || "Sports influencer campaign"}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Participating Brands */}
                      <td className="py-2.5 px-3">
                        {proj.brandDetails && proj.brandDetails.length > 0 ? (
                          <div className="flex items-center space-x-1.5 whitespace-nowrap">
                            <span
                              className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 truncate max-w-[140px]"
                              title={`${proj.brandDetails[0].name} (${proj.brandDetails[0].role}) ${proj.brandDetails[0].contribution ? `· ${formatCurrency(proj.brandDetails[0].contribution)}` : ""}`}
                            >
                              {proj.brandDetails[0].name}
                            </span>
                            {proj.brandDetails.length > 1 && (
                              <span
                                className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 cursor-help"
                                title={proj.brandDetails.slice(1).map(b => `${b.name} (${b.role})`).join(", ")}
                              >
                                +{proj.brandDetails.length - 1} brands
                              </span>
                            )}
                          </div>
                        ) : proj.brands && proj.brands.length > 0 ? (
                          <div className="flex items-center space-x-1.5 whitespace-nowrap">
                            <span
                              className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[140px]"
                              title={proj.brands[0]}
                            >
                              {proj.brands[0]}
                            </span>
                            {proj.brands.length > 1 && (
                              <span
                                className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 cursor-help"
                                title={proj.brands.slice(1).join(", ")}
                              >
                                +{proj.brands.length - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-700 text-xs truncate max-w-[150px] inline-block">
                            {proj.brand || "Sport Booking Hub"}
                          </span>
                        )}
                      </td>

                      {/* Budget & Spend */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-xs leading-none">
                          {formatCurrency(proj.budget)}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center justify-end space-x-1 mt-1">
                          <span>Alloc:</span>
                          <span className="font-semibold text-emerald-600">{formatCurrency(allocated)}</span>
                          <span className="text-slate-400">({burnRate}%)</span>
                        </div>
                        <div className="w-20 ml-auto bg-slate-100 h-1 rounded-full mt-1 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${burnRate}%` }}
                          />
                        </div>
                      </td>

                      {/* Booked Roster */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>{kolsCount} KOLs</span>
                          </span>
                          <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                            <Users className="w-2.5 h-2.5" />
                            <span>{commsCount} Clubs</span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenBookParticipant(proj);
                            }}
                            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Book talent or club into this project"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* PIC */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="text-slate-700 font-medium text-xs truncate max-w-[125px]" title={proj.pic || "—"}>
                          {proj.pic || "—"}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            proj.status.toLowerCase().includes("hoàn thành") || proj.status.toLowerCase().includes("completed")
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : proj.status.toLowerCase().includes("triển khai") || proj.status.toLowerCase().includes("progress")
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {t(proj.status)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProjectDetail(proj);
                            }}
                            className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg font-bold transition flex items-center space-x-1 shadow-2xs active:scale-95 cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            <span>Command Center</span>
                          </button>

                          {/* Quick Edit Action */}
                          {onEditProject && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditProject(proj);
                              }}
                              className="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition flex items-center justify-center border border-amber-200 hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                              title="Edit Campaign Details"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                            </button>
                          )}

                          {/* Quick Delete Action */}
                          {onDeleteProject && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteProject(proj);
                              }}
                              className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition flex items-center justify-center border border-rose-200 hover:scale-105 active:scale-95 shadow-2xs cursor-pointer"
                              title="Delete Campaign"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenReportForProject(proj.name);
                            }}
                            className="p-1 text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition cursor-pointer"
                            title="Write PM Sign-off Report"
                          >
                            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No matching campaigns found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
