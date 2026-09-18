"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import {
  X,
  Sparkles,
  Zap,
  Users,
  Eye,
  Activity,
  CheckCircle2,
  Check,
  ShieldCheck,
  Globe,
} from "lucide-react";
import { t, formatNumber } from "@/lib/i18n";
import type { Community } from "./types";

export interface CommunityPostScoutModalProps {
  isOpen: boolean;
  community: Community | null;
  onClose: () => void;
  onSuccess: (result?: any) => void;
}

const PLATFORM_OPTIONS = [
  { id: "Facebook", label: "Facebook Groups & Posts" },
  { id: "Instagram", label: "Instagram Reels & Posts" },
  { id: "TikTok", label: "TikTok Videos" },
];

export function CommunityPostScoutModal({
  isOpen,
  community,
  onClose,
  onSuccess,
}: CommunityPostScoutModalProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    community?.platform && community.platform.includes("Instagram")
      ? "Instagram"
      : community?.platform && community.platform.includes("TikTok")
      ? "TikTok"
      : "Facebook",
  ]);
  const [limit, setLimit] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !community) return null;

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
      const res = await fetch("/api/sport-hub/scout/community-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: community.id,
          platform: selectedPlatforms,
          limit,
        }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success(
          result.message ||
            `Scouted ${result.insertedCount || limit} posts and discussions for ${community.name}!`
        );
        onSuccess(result);
        onClose();
      } else {
        toast.error(result.error || "Failed to scout posts for this community");
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
        <div className="bg-gradient-to-r from-purple-800 via-indigo-700 to-slate-900 text-white px-6 py-4 sm:py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
              <Zap className="w-5 h-5 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white">
                  Community Crawler
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-400/30 text-purple-200 font-semibold">
                  {t(community.activityLevel)}
                </span>
              </div>
              <h3 className="font-black text-base sm:text-lg leading-tight text-white mt-0.5">
                Scout Discussions: {community.name}
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
          {/* Community Info Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold flex items-center justify-center text-2xl shadow-sm shrink-0">
              👥
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-bold text-slate-900 truncate">
                  {community.name}
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 font-semibold">
                  {community.platform}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {community.sport?.map((s) => t(s)).join(" • ") || "Sports"} • {t(community.geography || "Nationwide")}
              </p>
              <div className="flex items-center gap-3 mt-2 text-[11px] font-medium text-slate-600">
                <span className="flex items-center gap-1 font-bold text-purple-700">
                  <Users className="w-3 h-3 text-purple-500" />
                  {formatNumber(community.members)} Members
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <Globe className="w-3 h-3 text-blue-500" />
                  {community.adminContact || "Admin Listed"}
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
                Discussions Retrieval Limit
              </label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={submitting}
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value={5}>5 latest posts</option>
                <option value={10}>10 latest discussions (Standard)</option>
                <option value={20}>20 latest discussions (Comprehensive)</option>
                <option value={30}>30 latest discussions (Deep scan)</option>
              </select>
            </div>

            {/* Synergy & Seeding Context Banner */}
            <div className="p-3.5 bg-purple-50/70 rounded-2xl border border-purple-200/70 text-xs text-purple-900 space-y-1.5">
              <div className="font-bold flex items-center space-x-1.5 text-purple-800">
                <CheckCircle2 className="w-4 h-4 text-purple-600" />
                <span>Community Seeding Context Synergy</span>
              </div>
              <p className="text-[11px] text-purple-700 leading-relaxed">
                Crawled posts and discussion threads will be matched with <strong>{community.name}</strong>, stored in <code className="bg-purple-100 px-1 py-0.5 rounded text-[10px]">scouted_posts</code>, and immediately populated in the Community 360° Dossier feed for campaign monitoring.
              </p>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 transition shadow-md shadow-purple-500/20 flex items-center space-x-2 disabled:opacity-60 active:scale-95 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Scouting Apify Cloud...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Start Discussion Scout</span>
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
