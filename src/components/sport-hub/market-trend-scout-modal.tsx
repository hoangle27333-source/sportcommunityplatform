"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import {
  X,
  Flame,
  Sparkles,
  Hash,
  Link2,
  TrendingUp,
  MapPin,
  Globe,
  CheckCircle2,
  Share2,
  Check,
  Plus,
} from "lucide-react";

export interface MarketTrendScoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result?: any) => void;
}

const SUGGESTED_TAGS = [
  "#pickleballvietnam",
  "#marathonsaigon",
  "#badmintonvietnam",
  "#gymfitness",
  "#tennisvietnam",
  "#chaybo",
];

const SPORT_OPTIONS = [
  { id: "Pickleball", label: "Pickleball" },
  { id: "Tennis", label: "Tennis" },
  { id: "Chạy bộ / Marathon", label: "Running / Marathon" },
  { id: "Cầu lông", label: "Badminton" },
  { id: "Bóng đá", label: "Football" },
  { id: "Gym & Fitness", label: "Gym & Fitness" },
  { id: "Đạp xe", label: "Cycling" },
  { id: "Golf", label: "Golf" },
  { id: "Other Sports", label: "Other Sports" },
];

const PLATFORM_OPTIONS = [
  { id: "Instagram", label: "Instagram Reels & Posts" },
  { id: "TikTok", label: "TikTok Videos" },
  { id: "Facebook", label: "Facebook Reels" },
];

const GEO_OPTIONS = [
  { id: "Toàn quốc", label: "Nationwide" },
  { id: "Hà Nội", label: "Hanoi" },
  { id: "TP. Hồ Chí Minh", label: "Ho Chi Minh City" },
  { id: "Đà Nẵng", label: "Da Nang" },
];

export function MarketTrendScoutModal({
  isOpen,
  onClose,
  onSuccess,
}: MarketTrendScoutModalProps) {
  const [keyword, setKeyword] = useState("");
  const [selectedSports, setSelectedSports] = useState<string[]>(["Pickleball"]);
  const [customSport, setCustomSport] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["Instagram"]);
  const [selectedGeos, setSelectedGeos] = useState<string[]>(["Toàn quốc"]);
  const [limit, setLimit] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  // Toggle Sport Multi-Select
  const toggleSport = (sportId: string) => {
    setSelectedSports((prev) => {
      if (prev.includes(sportId)) {
        if (prev.length === 1) return prev; // Keep at least 1
        return prev.filter((s) => s !== sportId);
      } else {
        return [...prev, sportId];
      }
    });
  };

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

  // Toggle Geo Multi-Select
  const toggleGeo = (geoId: string) => {
    setSelectedGeos((prev) => {
      if (prev.includes(geoId)) {
        if (prev.length === 1) return prev; // Keep at least 1
        return prev.filter((g) => g !== geoId);
      } else {
        return [...prev, geoId];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) {
      toast.error("Please enter a search keyword or hashtag!");
      return;
    }

    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one target platform!");
      return;
    }

    if (selectedSports.length === 0) {
      toast.error("Please select at least one sport discipline!");
      return;
    }

    // Build final sports array (replacing 'Other Sports' with custom sport text if entered)
    const finalSports: string[] = [];
    for (const s of selectedSports) {
      if (s === "Other Sports") {
        if (customSport.trim()) {
          finalSports.push(customSport.trim());
        } else {
          finalSports.push("Khác");
        }
      } else {
        finalSports.push(s);
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/scout/market-trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          sport: finalSports,
          platform: selectedPlatforms,
          limit,
          geography: selectedGeos,
        }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success(
          result.message ||
            `Scouted ${result.totalScouted} posts across ${selectedPlatforms.join(", ")}!`
        );
        onSuccess(result);
        onClose();
        setKeyword("");
        setCustomSport("");
      } else {
        toast.error(result.error || "Failed to scout market trends");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to communicate with Apify crawler");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 text-white px-6 py-4 sm:py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
              <Flame className="w-5 h-5 text-amber-200 fill-amber-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white">
                  Market Trend Intelligence
                </span>
              </div>
              <h3 className="font-black text-base sm:text-lg leading-tight text-white mt-0.5">
                Scout Market Trends & Hashtags
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

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Keyword / Hashtag */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Market Keyword or Hashtag <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                placeholder="e.g. pickleballvietnam, marathon saigon, gym workout..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                disabled={submitting}
                className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
              />
            </div>

            {/* Suggested Hashtag Chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] font-semibold text-slate-400 py-0.5">
                Quick tags:
              </span>
              {SUGGESTED_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setKeyword(tag)}
                  disabled={submitting}
                  className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 transition cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* ─── MULTI-SELECT PLATFORMS ─── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Target Social Platforms <span className="text-rose-500">*</span>
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
                        ? "bg-rose-50 border-rose-400 text-rose-700 shadow-2xs"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                    }`}
                  >
                    {isChecked ? (
                      <Check className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />
                    )}
                    <span className="truncate">{plat.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── MULTI-SELECT SPORT DISCIPLINES + CUSTOM "OTHER" FILL ─── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Sport Disciplines <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] font-semibold text-slate-400">
                {selectedSports.length} selected
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SPORT_OPTIONS.map((sp) => {
                const isChecked = selectedSports.includes(sp.id);
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => toggleSport(sp.id)}
                    disabled={submitting}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition flex items-center space-x-1 border cursor-pointer ${
                      isChecked
                        ? "bg-rose-500 border-rose-600 text-white shadow-2xs"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 text-white shrink-0" />}
                    <span>{sp.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Custom Sport Input when "Other Sports" is active */}
            {selectedSports.includes("Other Sports") && (
              <div className="mt-2.5 p-3 bg-amber-50/80 border border-amber-200/90 rounded-2xl space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <label className="block text-[11px] font-bold text-amber-900">
                  Custom Sport Name / Discipline <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={customSport}
                    onChange={(e) => setCustomSport(e.target.value)}
                    placeholder="e.g. Bơi lội, Leo núi, Yoga, Thể thao điện tử, Billiards..."
                    className="w-full text-xs px-3 py-2 bg-white border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium placeholder:text-slate-400"
                  />
                </div>
                <p className="text-[10px] text-amber-700">
                  This custom discipline will be tagged to scouted posts and filter matching creators.
                </p>
              </div>
            )}
          </div>

          {/* ─── MULTI-SELECT GEOGRAPHY & SAMPLE SIZE ─── */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Geographic Scope
                </label>
                <span className="text-[10px] font-semibold text-slate-400">
                  {selectedGeos.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {GEO_OPTIONS.map((geo) => {
                  const isChecked = selectedGeos.includes(geo.id);
                  return (
                    <button
                      key={geo.id}
                      type="button"
                      onClick={() => toggleGeo(geo.id)}
                      disabled={submitting}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition flex items-center space-x-1 border cursor-pointer ${
                        isChecked
                          ? "bg-slate-900 border-slate-900 text-white shadow-2xs"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 text-white shrink-0" />}
                      <span>{geo.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Sample Size
              </label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={submitting}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
              >
                <option value={5}>5 trending posts</option>
                <option value={10}>10 trending posts (Standard)</option>
                <option value={20}>20 trending posts (Broad scan)</option>
                <option value={30}>30 trending posts (Deep scan)</option>
              </select>
            </div>
          </div>

          {/* Bidirectional Synergy Notice */}
          <div className="p-3 bg-gradient-to-br from-rose-50 to-orange-50 rounded-2xl border border-rose-200/80 text-xs text-rose-900 space-y-1">
            <div className="font-bold flex items-center space-x-1.5 text-rose-800">
              <Link2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Bidirectional Creator Synergy</span>
            </div>
            <p className="text-[11px] text-rose-700 leading-relaxed">
              When market trends are scraped, our engine automatically matches author names and handles against registered KOLs in your CRM. Any matching post is instantly cross-linked into that creator&apos;s 360° dossier!
            </p>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end space-x-3 shrink-0">
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
              className="px-5 py-2.5 bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl shadow-md flex items-center space-x-2 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Scanning Market Cloud...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Scout Market Trends</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
