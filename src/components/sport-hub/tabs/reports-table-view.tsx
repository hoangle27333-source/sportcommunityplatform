"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Star,
  Award,
  TrendingUp,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Plus,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { t, formatNumber } from "@/lib/i18n";

interface Report {
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

interface ReportsTableViewProps {
  reports: Report[];
  onOpenNewReport: () => void;
  onSelectKol?: (kolName: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

export function ReportsTableView({
  reports,
  onOpenNewReport,
  onSelectKol,
  onRefresh,
  loading,
}: ReportsTableViewProps) {
  const [search, setSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"score" | "kpiRate">("score");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filter
  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        const matchTitle = r.title.toLowerCase().includes(q);
        const matchKol = r.kolName.toLowerCase().includes(q);
        const matchProj = r.project.toLowerCase().includes(q);
        const matchNotes = (r.notes || "").toLowerCase().includes(q);
        const matchEval = (r.evaluator || "").toLowerCase().includes(q);
        if (!matchTitle && !matchKol && !matchProj && !matchNotes && !matchEval) return false;
      }

      if (scoreFilter !== "all") {
        if (Math.floor(r.score) !== Number(scoreFilter)) return false;
      }

      if (deadlineFilter !== "all") {
        const d = (r.deadline || "").toLowerCase();
        if (deadlineFilter === "ahead" && !(d.includes("trước") || d.includes("ahead") || d.includes("early"))) return false;
        if (deadlineFilter === "ontime" && !(d.includes("đúng") || d.includes("on time"))) return false;
        if (deadlineFilter === "delayed" && !(d.includes("trễ") || d.includes("vi phạm") || d.includes("delayed") || d.includes("breach") || d.includes("late"))) return false;
      }

      return true;
    });
  }, [reports, search, scoreFilter, deadlineFilter]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "score") {
        return sortOrder === "asc" ? a.score - b.score : b.score - a.score;
      }
      return sortOrder === "asc" ? a.kpiRate - b.kpiRate : b.kpiRate - a.kpiRate;
    });
  }, [filtered, sortBy, sortOrder]);

  const avgScore = useMemo(() => {
    if (reports.length === 0) return 5.0;
    return (reports.reduce((sum, r) => sum + (r.score || 5), 0) / reports.length).toFixed(1);
  }, [reports]);

  const avgKpiRate = useMemo(() => {
    if (reports.length === 0) return 100;
    return Math.round(reports.reduce((sum, r) => sum + (r.kpiRate || 100), 0) / reports.length);
  }, [reports]);

  const toggleSort = (field: "score" | "kpiRate") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── HEADER & ACTIONS (SINGLE ROW COMPACT) ─── */}
      <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4 flex-nowrap">
        <div className="flex items-center space-x-3 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-base shrink-0">
            ⭐
          </span>
          <div className="flex items-center space-x-2.5 min-w-0">
            <h2 className="text-base font-bold text-slate-900 leading-none whitespace-nowrap">
              Evaluation History & PM Reviews
            </h2>
            <span className="bg-amber-50 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
              {reports.length} Reviews
            </span>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="text-xs text-slate-400 font-medium truncate hidden sm:inline">
              Evaluation history managed via Supabase PostgreSQL
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-600" : ""}`} />
              <span>Refresh</span>
            </button>
          )}

          <button
            onClick={onOpenNewReport}
            className="text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 px-3.5 py-1.5 rounded-xl transition shadow-xs shadow-amber-200 flex items-center space-x-1.5 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <Star className="w-3.5 h-3.5 fill-slate-900" />
            <span>Write New Review</span>
          </button>
        </div>
      </div>

      {/* ─── METRIC CARDS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
            ⭐
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Avg. Partner Rating</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">
              {avgScore} <span className="text-sm font-semibold text-slate-400">/ 5.0</span>
            </h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">
            📈
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Avg. KPI Fulfillment Rate</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-0.5">
              {avgKpiRate}%
            </h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
            📝
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Total Evaluation Reports</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">
              {reports.length} Records
            </h3>
          </div>
        </div>
      </div>

      {/* ─── SLICERS ─── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by KOL, project, reviewer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50/50"
            />
          </div>

          <div>
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Ratings</option>
              <option value="5">5 Stars (Excellent)</option>
              <option value="4">4 Stars (Good)</option>
              <option value="3">3 Stars (Average)</option>
            </select>
          </div>

          <div>
            <select
              value={deadlineFilter}
              onChange={(e) => setDeadlineFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Schedules (Deadline)</option>
              <option value="ahead">Ahead of Schedule</option>
              <option value="ontime">On Time</option>
              <option value="delayed">Delayed</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── REPORTS TABLE ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs border-collapse">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[220px]" />
              <col className="w-[140px]" />
              <col className="w-[105px]" />
              <col className="w-[80px]" />
              <col className="w-[120px]" />
              <col className="w-[140px]" />
              <col className="w-[100px]" />
              <col className="w-[200px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3 text-center">#</th>
                <th className="py-2.5 px-3">Title & Project</th>
                <th className="py-2.5 px-3">KOL / Partner</th>
                <th
                  onClick={() => toggleSort("score")}
                  className="py-2.5 px-3 cursor-pointer hover:text-amber-600 transition"
                >
                  <div className="flex items-center space-x-1">
                    <span>Overall Rating</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-3">Attitude</th>
                <th className="py-2.5 px-3">Schedule (Deadline)</th>
                <th className="py-2.5 px-3">KPI Committed / Actual</th>
                <th
                  onClick={() => toggleSort("kpiRate")}
                  className="py-2.5 px-3 cursor-pointer hover:text-amber-600 transition text-right"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Fulfillment Rate</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-3">PM Notes & Feedback</th>
                <th className="py-2.5 px-3">Reviewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length > 0 ? (
                sorted.map((r, idx) => {
                  const dLower = (r.deadline || "").toLowerCase();
                  const isGoodSchedule =
                    dLower.includes("trước") ||
                    dLower.includes("đúng") ||
                    dLower.includes("ahead") ||
                    dLower.includes("on time");

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-amber-50/30 transition group h-[52px]"
                    >
                      <td className="py-2.5 px-3 text-center font-medium text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 group-hover:text-amber-700 transition truncate max-w-[200px]" title={r.title}>
                          {r.title}
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium truncate block max-w-[200px]" title={r.project}>
                          {r.project}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          onClick={() => onSelectKol?.(r.kolName)}
                          className="font-bold text-slate-900 hover:text-amber-600 text-left transition truncate max-w-[130px] block cursor-pointer"
                          title={r.kolName}
                        >
                          {r.kolName}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center bg-amber-50 text-amber-800 font-bold px-1.5 py-0.5 rounded text-[10px] space-x-1 border border-amber-200">
                          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                          <span>{r.score} / 5</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-slate-700 font-semibold text-xs">
                          {r.attitude} / 5
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isGoodSchedule
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : "bg-rose-50 text-rose-700 border border-rose-100"
                          }`}
                        >
                          {t(r.deadline)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap text-xs">
                        {r.kpiCommit > 0 ? `${formatNumber(r.kpiCommit)} / ${formatNumber(r.kpiActual)}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                            r.kpiRate >= 100
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {r.kpiRate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-[11px] whitespace-nowrap">
                        <div className="truncate max-w-[190px] italic" title={r.notes || "No notes"}>
                          "{r.notes || "No notes"}"
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap text-xs">
                        {r.evaluator || "PM"}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    No evaluation reports found.
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
