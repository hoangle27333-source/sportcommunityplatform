"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import {
  X,
  Sparkles,
  Zap,
  TrendingUp,
  BarChart3,
  ExternalLink,
  Users,
  Eye,
  Activity,
  CheckCircle2,
  Check,
} from "lucide-react";
import { getKolAvatar } from "./dossier-modals";
import { formatNumber } from "@/lib/i18n";
import type { KOL } from "./types";

export interface KolPostScoutModalProps {
  isOpen: boolean;
  kol: KOL | null;
  onClose: () => void;
  onSuccess: (result?: any) => void;
}

const PLATFORM_OPTIONS = [
  { id: "Instagram", label: "Instagram Reels & Posts" },
  { id: "TikTok", label: "TikTok Videos" },
  { id: "Facebook", label: "Facebook Reels" },
];

export function KolPostScoutModal({
  isOpen,
  kol,
  onClose,
  onSuccess,
}: KolPostScoutModalProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    kol?.platform && PLATFORM_OPTIONS.some((p) => kol.platform.includes(p.id))
      ? kol.platform.includes("TikTok")
        ? "TikTok"
        : kol.platform.includes("Facebook")
        ? "Facebook"
        : "Instagram"
      : "Instagram",
  ]);
  const [limit, setLimit] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !kol) return null;

  const avatar = getKolAvatar(kol.name);

  // Toggle Platform Multi-Select
  const togglePlatform = (platId: string) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platId)) {
        if (prev.length === 1) return prev; // Keep at least 1
        return prev.filter((p) => p !== platId);
      } else {
        return [...prev, platId];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one platform to scout!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/scout/kol-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kolId: kol.id,
          platform: selectedPlatforms,
          limit,
        }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success(
          result.message ||
            `Scouted ${result.insertedCount || limit} posts for ${kol.name}!`
        );
        onSuccess(result);
        onClose();
      } else {
        toast.error(result.error || "Failed to scout posts for this creator");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to communicate with Apify server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 text-white px-6 py-4 sm:py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
              <Zap className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white">
                  KOL Post Crawler
                </span>
              </div>
              <h3 className="font-black text-base sm:text-lg leading-tight text-white mt-0.5">
                Scout Posts & Reels for {kol.name}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Creator Info Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex items-center space-x-4">
            <div className="relative shrink-0">
              {avatar ? (
                <img
                  src={avatar}
                  alt={kol.name}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-purple-300 shadow-sm"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xl shadow-sm">
                  {kol.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-bold text-slate-900 truncate">
                  {kol.name}
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 font-semibold">
                  {kol.tier}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {kol.sport?.join(" • ") || "Sports"} • {kol.geography || "Vietnam"}
              </p>
              <div className="flex items-center gap-3 mt-2 text-[11px] font-medium text-slate-600">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-purple-500" />
                  {formatNumber(kol.followers)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3 text-blue-500" />
                  {formatNumber(kol.avgViews)} avg
                </span>
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-emerald-500" />
                  {kol.er}% ER
                </span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ─── MULTI-SELECT PLATFORMS ─── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Target Social Platforms <span className="text-purple-600">*</span>
                </label>
                <span className="text-[10px] font-semibold text-slate-400">
                  {selectedPlatforms.length} selected
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORM_OPTIONS.map((plat) => {
                  const isChecked = selectedPlatforms.includes(plat.id);
                  return (
                    <button
                      key={plat.id}
                      type="button"
                      onClick={() => togglePlatform(plat.id)}
                      disabled={submitting}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 border cursor-pointer ${
                        isChecked
                          ? "bg-purple-50 border-purple-400 text-purple-700 shadow-2xs"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                      }`}
                    >
                      {isChecked ? (
                        <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />
                      )}
                      <span className="truncate">{plat.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Posts Retrieval Limit */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Posts Retrieval Limit
              </label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={submitting}
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value={5}>5 latest posts</option>
                <option value={10}>10 latest posts (Standard)</option>
                <option value={20}>20 latest posts (Comprehensive)</option>
                <option value={30}>30 latest posts (Deep scan)</option>
              </select>
            </div>

            {/* Synergy & Metric Snapshot Banner */}
            <div className="p-3.5 bg-purple-50/70 rounded-2xl border border-purple-200/70 text-xs text-purple-900 space-y-1.5">
              <div className="font-bold flex items-center space-x-1.5 text-purple-800">
                <CheckCircle2 className="w-4 h-4 text-purple-600" />
                <span>Automatic Synergy & Snapshot Logging</span>
              </div>
              <p className="text-[11px] text-purple-700 leading-relaxed">
                Posts crawled will be directly linked to <strong>{kol.name}</strong>, stored in <code className="bg-purple-100 px-1 py-0.5 rounded text-[10px]">scouted_posts</code> with matching <code className="bg-purple-100 px-1 py-0.5 rounded text-[10px]">kol_id</code>, recalculating average views/ER and generating a point-in-time growth snapshot.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md flex items-center space-x-2 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Scouting Apify Cloud...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Start KOL Post Scout</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
