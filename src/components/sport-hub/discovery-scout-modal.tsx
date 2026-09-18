"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Compass,
  Users,
  ShieldCheck,
  X,
  RefreshCw,
  Search,
  Globe,
  Info,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface DiscoveryScoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onScoutSuccess?: () => void;
  defaultTargetType?: "Individual KOLs" | "Communities & Clubs" | "Sports KOLs & Influencers";
}

const PRESET_TOPICS = [
  "Pickleball Vietnam",
  "Marathon Runner HCMC",
  "Hanoi Badminton Club",
  "Tennis Coach Vietnam",
  "Fitness & Gym Creator",
  "Cycling Saigon Club",
];

export function DiscoveryScoutModal({
  isOpen,
  onClose,
  onSuccess,
  onScoutSuccess,
  defaultTargetType = "Individual KOLs",
}: DiscoveryScoutModalProps) {
  const initialType: "Individual KOLs" | "Communities & Clubs" =
    defaultTargetType === "Communities & Clubs" ? "Communities & Clubs" : "Individual KOLs";
  const [targetType, setTargetType] = useState<"Individual KOLs" | "Communities & Clubs">(initialType);
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [limit, setLimit] = useState(5);
  const [geography, setGeography] = useState("Nationwide");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (defaultTargetType) {
      const mapped: "Individual KOLs" | "Communities & Clubs" =
        defaultTargetType === "Communities & Clubs" ? "Communities & Clubs" : "Individual KOLs";
      setTargetType(mapped);
      if (mapped === "Communities & Clubs") {
        setPlatform("Facebook");
      } else {
        setPlatform("Instagram");
      }
    }
  }, [defaultTargetType, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) {
      toast.error("Please enter a search topic or keyword to discover new profiles!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          targetType,
          platform,
          limit,
          geography,
          notes,
          runImmediate: true,
        }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success(
          `Discovery Scout dispatched! Apify is scanning ${platform} for new ${
            targetType === "Individual KOLs" ? "creators" : "communities"
          } matching "${keyword}". Results will sync into your directory.`
        );
        if (onSuccess) onSuccess();
        if (onScoutSuccess) onScoutSuccess();
        onClose();
        setKeyword("");
        setNotes("");
      } else {
        toast.error(result.error || "Failed to trigger discovery scraper");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── MODAL HEADER ─── */}
        <div className="bg-gradient-to-r from-purple-800 via-indigo-800 to-blue-900 text-white px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-amber-300 shadow-inner">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white">
                  Social Discovery Engine
                </span>
                <span className="text-[10px] font-semibold text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded-full">
                  Apify Cloud
                </span>
              </div>
              <h3 className="font-black text-base sm:text-lg leading-tight text-white mt-0.5">
                Discover & Import New Profiles
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── MODAL BODY ─── */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Informational Callout (Prevents User Confusion) */}
          <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-3.5 flex items-start space-x-3 text-xs text-blue-900">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold leading-relaxed">
                Looking to find <strong>brand-new</strong> creators or clubs on social media?
              </p>
              <p className="text-blue-700 mt-0.5 leading-relaxed text-[11px]">
                This crawler searches live social platforms and imports prospective profiles into your database with status <em>"New Scout (Unverified)"</em>.
                (To refresh data for creators already in your table, select them in the table and click <strong>"Sync Live Data"</strong>).
              </p>
            </div>
          </div>

          {/* Target Type Selector Tabs */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              What are you looking to discover?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTargetType("Individual KOLs");
                  setPlatform("Instagram");
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 border cursor-pointer ${
                  targetType === "Individual KOLs"
                    ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-2xs"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Users className="w-4 h-4" />
                <span>New Sports KOLs</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTargetType("Communities & Clubs");
                  setPlatform("Facebook");
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 border cursor-pointer ${
                  targetType === "Communities & Clubs"
                    ? "bg-indigo-50 border-indigo-600 text-indigo-700 shadow-2xs"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>New Clubs & Communities</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Search Keyword */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Search Query / Niche Keyword <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={
                    targetType === "Individual KOLs"
                      ? "e.g. Pickleball Vietnam, Runner Hanoi, Badminton..."
                      : "e.g. Hoi Yeu Chay Bo, Pickleball Sai Gon, CLB Cau Long..."
                  }
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Quick Preset Chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[10px] text-slate-400 font-semibold py-0.5">
                  Popular topics:
                </span>
                {PRESET_TOPICS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setKeyword(preset)}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition font-medium cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform & Limit Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Platform
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="Instagram">Instagram</option>
                  <option value="TikTok">TikTok</option>
                  <option value="Facebook">Facebook</option>
                  <option value="YouTube">YouTube</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Discovery Limit
                </label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value={5}>5 new profiles</option>
                  <option value={10}>10 new profiles</option>
                  <option value={15}>15 new profiles</option>
                  <option value={20}>20 new profiles</option>
                </select>
              </div>
            </div>

            {/* Geography & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Target Geography
                </label>
                <select
                  value={geography}
                  onChange={(e) => setGeography(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="Nationwide">Nationwide (Toàn quốc)</option>
                  <option value="Hanoi">Hanoi (Hà Nội)</option>
                  <option value="Ho Chi Minh City">Ho Chi Minh City (TP.HCM)</option>
                  <option value="Da Nang">Da Nang (Đà Nẵng)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Scout Note / Tag (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Q3 Summer campaign scouting"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 rounded-xl transition shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                )}
                <span>
                  {submitting ? "Dispatching Crawler..." : "Launch Discovery Scout"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
