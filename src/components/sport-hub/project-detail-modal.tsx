"use client";

import React, { useState } from "react";
import {
  X,
  Briefcase,
  Users,
  Sparkles,
  TrendingUp,
  Star,
  Plus,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  Trash2,
  ExternalLink,
  Award,
  DollarSign,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { formatNumber, formatCurrency, t } from "@/lib/i18n";
import type { Project, ProjectParticipant, KOL, Community } from "./types";
import { useCurrentUser } from "@/lib/auth/use-current-user";

interface ProjectDetailModalProps {
  isOpen: boolean;
  project: Project | null;
  kols: KOL[];
  communities: Community[];
  onClose: () => void;
  onRefresh: () => void;
  onOpenBookParticipant: (proj: Project) => void;
  onOpenLogPerformance: (proj: Project, participant: ProjectParticipant) => void;
  onOpenEvaluation: (proj: Project, participant: ProjectParticipant) => void;
  onSelectKol?: (kolName: string) => void;
}

export function ProjectDetailModal({
  isOpen,
  project,
  kols,
  communities,
  onClose,
  onRefresh,
  onOpenBookParticipant,
  onOpenLogPerformance,
  onOpenEvaluation,
  onSelectKol,
}: ProjectDetailModalProps) {
  const { isAdmin } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<"kols" | "communities" | "overview">("kols");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isOpen || !project) return null;

  const participants = project.participants || [];
  const bookedKols = participants.filter((p) => p.entityType === "kol");
  const bookedCommunities = participants.filter((p) => p.entityType === "community");

  // Financial calculations
  const totalBudget = project.budget || 0;
  const totalAllocated = participants.reduce((sum, p) => sum + (p.agreedFee || 0), 0);
  const remainingBudget = totalBudget - totalAllocated;
  const burnPercent = totalBudget > 0 ? Math.min(100, Math.round((totalAllocated / totalBudget) * 100)) : 0;

  // Impact calculations
  const totalViews = participants.reduce((sum, p) => sum + (p.actualViews || 0), 0);
  const totalReach = participants.reduce((sum, p) => sum + (p.actualReach || 0), 0);
  const evaluatedList = participants.filter((p) => p.ratingScore !== undefined);
  const avgPartnerRating =
    evaluatedList.length > 0
      ? (evaluatedList.reduce((sum, p) => sum + (p.ratingScore || 5), 0) / evaluatedList.length).toFixed(1)
      : "5.0";

  const handleDeleteParticipant = async (participant: ProjectParticipant) => {
    if (!confirm(`Are you sure you want to remove "${participant.entityName}" from this project?`)) {
      return;
    }
    setDeletingId(participant.id);
    try {
      const res = await fetch(
        `/api/sport-hub/project/${project.id}/participants/${participant.id}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.success) {
        toast.success(`Removed ${participant.entityName} from project`);
        onRefresh();
      } else {
        toast.error(json.error || "Failed to remove participant");
      }
    } catch {
      toast.error("Network error while removing participant");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* ─── COMMAND CENTER HEADER ─── */}
        <div className="bg-slate-900 text-white p-6 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/30">
                  📋
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Campaign Command Center
                </span>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    project.status.toLowerCase().includes("hoàn thành") ||
                    project.status.toLowerCase().includes("completed")
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  }`}
                >
                  {t(project.status)}
                </span>
              </div>
              <h2 className="text-2xl font-black text-white mt-1.5 tracking-tight">
                {project.name}
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                {project.objective || "Comprehensive sports influencer booking & tournament execution."}
              </p>
            </div>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition self-start sm:self-auto"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Multi-Brand Badges & Metadata */}
          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
                Participating Brands:
              </span>
              {project.brandDetails && project.brandDetails.length > 0 ? (
                project.brandDetails.map((b, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center space-x-1.5 bg-slate-800 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-700 font-medium"
                  >
                    <span className="font-bold text-white">{b.name}</span>
                    <span className="text-[10px] text-blue-300">({b.role})</span>
                    {Boolean(b.contribution && b.contribution > 0) && (
                      <span className="text-[10px] text-emerald-400 font-semibold">
                        · {formatCurrency(b.contribution)}
                      </span>
                    )}
                  </span>
                ))
              ) : project.brands && project.brands.length > 0 ? (
                project.brands.map((brandName, i) => (
                  <span
                    key={i}
                    className="bg-blue-900/60 text-blue-200 px-2.5 py-0.5 rounded-md border border-blue-700 font-semibold text-xs"
                  >
                    {brandName}
                  </span>
                ))
              ) : (
                <span className="text-slate-300 font-semibold">{project.brand || "Sport Booking Hub"}</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-slate-300 text-xs">
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-400">Sport:</span>
                <span className="inline-flex items-center gap-1">
                  {project.sport && project.sport.length > 0 ? (
                    project.sport.map((s, idx) => (
                      <span
                        key={idx}
                        className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px] font-semibold"
                      >
                        {t(s)}
                      </span>
                    ))
                  ) : (
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px] font-semibold">
                      Pickleball
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-400">Region:</span>
                <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded text-[11px] font-semibold">
                  {t(project.region || "Toàn quốc")}
                </span>
              </div>
              <div>
                <span className="text-slate-400">PIC:</span>{" "}
                <span className="font-bold text-white">{project.pic || "PM"}</span>
              </div>
              <div>
                <span className="text-slate-400">Total Talent Booked:</span>{" "}
                <span className="font-bold text-emerald-400">
                  {participants.length} ({bookedKols.length} KOLs, {bookedCommunities.length} Clubs)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── FINANCIAL & IMPACT BAR ─── */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total Campaign Budget
            </p>
            {isAdmin ? (
              <p className="text-base font-black text-slate-900 mt-0.5">
                {formatCurrency(totalBudget)}
              </p>
            ) : (
              <p className="text-sm font-bold text-slate-400 mt-1 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Admin Only</span>
              </p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Allocated Talent Fees
            </p>
            {isAdmin ? (
              <>
                <div className="flex items-baseline space-x-1.5 mt-0.5">
                  <p className="text-base font-black text-emerald-600">
                    {formatCurrency(totalAllocated)}
                  </p>
                  <span className="text-[11px] font-bold text-slate-500">
                    ({burnPercent}%)
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${burnPercent}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm font-bold text-slate-400 mt-1 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Admin Only</span>
              </p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total Views Generated
            </p>
            <p className="text-base font-black text-blue-600 mt-0.5">
              {formatNumber(totalViews)} views
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Avg Partner Score
            </p>
            <div className="flex items-center space-x-1 mt-0.5">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <p className="text-base font-black text-slate-900">
                {avgPartnerRating} / 5.0
              </p>
              <span className="text-[10px] text-slate-400">
                ({evaluatedList.length} signed off)
              </span>
            </div>
          </div>
        </div>

        {/* ─── TABS NAVIGATION ─── */}
        <div className="px-6 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab("kols")}
              className={`py-3.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "kols"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Booked KOLs & Athletes</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 font-black">
                {bookedKols.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("communities")}
              className={`py-3.5 text-xs font-bold border-b-2 transition flex items-center space-x-2 ${
                activeTab === "communities"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Booked Sports Clubs & Communities</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-purple-50 text-purple-700 font-black">
                {bookedCommunities.length}
              </span>
            </button>
          </div>

          <button
            onClick={() => onOpenBookParticipant(project)}
            className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 rounded-xl transition shadow-sm flex items-center space-x-1.5 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Book New Participant</span>
          </button>
        </div>

        {/* ─── TAB CONTENT: ROSTER ─── */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === "kols" && (
            <div className="space-y-3">
              {bookedKols.length > 0 ? (
                bookedKols.map((part) => {
                  const target = part.targetViews || part.targetReach || 0;
                  const actual = part.actualViews || part.actualReach || 0;
                  const attainmentRate = target > 0 ? ((actual / target) * 100).toFixed(1) : null;

                  return (
                    <div
                      key={part.id}
                      className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-blue-300 transition shadow-sm space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Talent Header */}
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-sm">
                            {part.entityName.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4
                                onClick={() => onSelectKol && onSelectKol(part.entityName)}
                                className="font-bold text-sm text-slate-900 hover:text-blue-600 cursor-pointer transition"
                              >
                                {part.entityName}
                              </h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                {part.tierOrPlatform || "KOL"}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  part.status === "Signed Off"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}
                              >
                                {part.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Deliverable: <span className="font-semibold text-slate-800">{part.deliverableScope}</span>
                            </p>
                          </div>
                        </div>

                        {/* Agreed Fee */}
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Commercial Fee
                          </p>
                          {isAdmin ? (
                            <p className="text-sm font-black text-slate-900">
                              {formatCurrency(part.agreedFee)}
                            </p>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                              <Lock className="w-2.5 h-2.5 text-slate-400" />
                              <span>Admin Only</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Performance & Scorecard Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50/70 rounded-xl border border-slate-100 text-xs">
                        {/* Target vs Actual */}
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Performance Attainment
                          </span>
                          <div className="flex items-center space-x-2 mt-0.5">
                            <span className="font-bold text-slate-800">
                              {formatNumber(part.actualViews || 0)} / {formatNumber(part.targetViews || 0)} views
                            </span>
                            {attainmentRate && (
                              <span
                                className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                  Number(attainmentRate) >= 100
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {attainmentRate}%
                              </span>
                            )}
                          </div>
                          {part.proofUrl && (
                            <a
                              href={part.proofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center space-x-1 mt-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>View Live Post / Reel Proof</span>
                            </a>
                          )}
                        </div>

                        {/* PM Rating Scorecard */}
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            PM Quality Scorecard
                          </span>
                          <div className="flex items-center space-x-1.5 mt-0.5">
                            <div className="flex items-center text-amber-500 font-bold">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 mr-1" />
                              <span>{part.ratingScore || 5}.0/5</span>
                            </div>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-600 font-medium">
                              Attitude: {part.attitudeScore || 5}/5
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-emerald-700 font-semibold text-[10px] bg-emerald-50 px-1.5 py-0.2 rounded">
                              {part.deadlineStatus || "On Time"}
                            </span>
                          </div>
                          {part.pmNotes && (
                            <p className="text-[11px] text-slate-600 italic mt-1 line-clamp-1" title={part.pmNotes}>
                              "{part.pmNotes}"
                            </p>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => onOpenLogPerformance(project, part)}
                            className="text-xs bg-white hover:bg-slate-100 text-slate-700 font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 transition flex items-center space-x-1"
                          >
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Log Perf</span>
                          </button>

                          <button
                            onClick={() => onOpenEvaluation(project, part)}
                            className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold px-2.5 py-1.5 rounded-lg border border-amber-200 transition flex items-center space-x-1"
                          >
                            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                            <span>Scorecard</span>
                          </button>

                          <button
                            onClick={() => handleDeleteParticipant(part)}
                            disabled={deletingId === part.id}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                            title="Remove from project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-sm font-semibold text-slate-600">
                    No KOLs booked for this project yet.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Click "+ Book New Participant" to add creators from the directory.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "communities" && (
            <div className="space-y-3">
              {bookedCommunities.length > 0 ? (
                bookedCommunities.map((part) => (
                  <div
                    key={part.id}
                    className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-purple-300 transition shadow-sm space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Community Header */}
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-sm">
                          {part.entityName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-bold text-sm text-slate-900">
                              {part.entityName}
                            </h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                              {part.tierOrPlatform || "Club"}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                part.status === "Signed Off"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {part.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Scope: <span className="font-semibold text-slate-800">{part.deliverableScope}</span>
                          </p>
                        </div>
                      </div>

                      {/* Pin Fee */}
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Agreed Pin Fee
                        </p>
                        {isAdmin ? (
                          <p className="text-sm font-black text-slate-900">
                            {formatCurrency(part.agreedFee)}
                          </p>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                            <Lock className="w-2.5 h-2.5 text-slate-400" />
                            <span>Admin Only</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Performance & Scorecard */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50/70 rounded-xl border border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Reach & Interactions
                        </span>
                        <div className="flex items-center space-x-2 mt-0.5">
                          <span className="font-bold text-slate-800">
                            {formatNumber(part.actualReach || part.targetReach || 0)} members reached
                          </span>
                        </div>
                        {part.proofUrl && (
                          <a
                            href={part.proofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-purple-600 hover:underline flex items-center space-x-1 mt-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>View Pinned Post Proof</span>
                          </a>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          PM Quality Scorecard
                        </span>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <div className="flex items-center text-amber-500 font-bold">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 mr-1" />
                            <span>{part.ratingScore || 5}.0/5</span>
                          </div>
                          <span className="text-slate-300">·</span>
                          <span className="text-emerald-700 font-semibold text-[10px] bg-emerald-50 px-1.5 py-0.2 rounded">
                            {part.deadlineStatus || "On Time"}
                          </span>
                        </div>
                        {part.pmNotes && (
                          <p className="text-[11px] text-slate-600 italic mt-1 line-clamp-1" title={part.pmNotes}>
                            "{part.pmNotes}"
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => onOpenLogPerformance(project, part)}
                          className="text-xs bg-white hover:bg-slate-100 text-slate-700 font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 transition flex items-center space-x-1"
                        >
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Log Perf</span>
                        </button>

                        <button
                          onClick={() => onOpenEvaluation(project, part)}
                          className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold px-2.5 py-1.5 rounded-lg border border-amber-200 transition flex items-center space-x-1"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                          <span>Scorecard</span>
                        </button>

                        <button
                          onClick={() => handleDeleteParticipant(part)}
                          disabled={deletingId === part.id}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                          title="Remove from project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-sm font-semibold text-slate-600">
                    No sports communities booked for this project yet.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Click "+ Book New Participant" to add clubs and groups.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
