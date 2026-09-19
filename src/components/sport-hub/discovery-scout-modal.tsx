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
  Info,
  CheckCircle2,
  ExternalLink,
  ArrowLeft,
  UserPlus,
  UserCheck,
  CheckSquare,
  Square,
  AlertCircle,
  Eye,
  Heart,
  MessageSquare,
} from "lucide-react";
import { formatNumber } from "@/lib/i18n";

export interface DiscoveryCandidate {
  username: string;
  name: string;
  bio: string;
  url: string;
  followers: number;
  avgViews: number;
  likes: number;
  comments: number;
  er: number;
  avatarUrl?: string;
  isExisting: boolean;
  existingId?: string;
  posts?: {
    caption: string;
    url: string;
    views: number;
    likes: number;
    comments: number;
  }[];
}

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
  // Step state: 1 = Search Configuration & Preview, 2 = Candidate Review & Confirmation
  const [step, setStep] = useState<1 | 2>(1);

  // Form Inputs
  const initialType: "Individual KOLs" | "Communities & Clubs" =
    defaultTargetType === "Communities & Clubs" ? "Communities & Clubs" : "Individual KOLs";
  const [targetType, setTargetType] = useState<"Individual KOLs" | "Communities & Clubs">(initialType);
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [limit, setLimit] = useState(5);
  const [geography, setGeography] = useState("Nationwide");
  const [notes, setNotes] = useState("");

  // Loading States
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);

  // Step 2 Candidates State
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [effectiveQuery, setEffectiveQuery] = useState("");
  const [modifierApplied, setModifierApplied] = useState<string | undefined>();
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());

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

  // Reset modal state on close
  const handleClose = () => {
    if (searching || importing) return;
    setStep(1);
    setCandidates([]);
    setSelectedUsernames(new Set());
    setModifierApplied(undefined);
    onClose();
  };

  if (!isOpen) return null;

  // ─── STEP 1: PREVIEW CANDIDATES (NO DB COMMIT) ───
  const handleSearchPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword) {
      toast.error("Please enter a search topic or keyword to discover candidate profiles!");
      return;
    }

    setSearching(true);
    try {
      const res = await fetch("/api/sport-hub/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          keyword: cleanKeyword,
          targetType,
          platform,
          limit,
          geography,
          notes,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Failed to search candidate profiles from Apify");
        return;
      }

      const fetchedCandidates: DiscoveryCandidate[] = result.candidates || [];
      if (fetchedCandidates.length === 0) {
        toast.info(
          `No profiles found on ${platform} matching "${cleanKeyword}". Try another keyword or platform.`
        );
        return;
      }

      setCandidates(fetchedCandidates);
      setEffectiveQuery(result.effectiveQuery || cleanKeyword);
      setModifierApplied(result.modifierApplied);

      // By default: preselect all new candidate profiles.
      // If all are already in CRM, preselect all so user can refresh them.
      const newProfiles = fetchedCandidates.filter((c) => !c.isExisting);
      if (newProfiles.length > 0) {
        setSelectedUsernames(new Set(newProfiles.map((c) => c.username)));
      } else {
        setSelectedUsernames(new Set(fetchedCandidates.map((c) => c.username)));
      }

      setStep(2);
      toast.success(
        `Found ${fetchedCandidates.length} candidate profiles (${result.newCount ?? newProfiles.length} new). Please review and select profiles to import.`
      );
    } catch (err: any) {
      console.error("Discovery Preview Error:", err);
      toast.error("Server connection error during candidate discovery");
    } finally {
      setSearching(false);
    }
  };

  // ─── STEP 2: CONFIRM & INGEST SELECTED CANDIDATES ───
  const handleConfirmImport = async () => {
    const selected = candidates.filter((c) => selectedUsernames.has(c.username));
    if (selected.length === 0) {
      toast.error("Please select at least one candidate profile to import!");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/sport-hub/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          candidates: selected,
          targetType,
          platform,
          geography,
          keyword: effectiveQuery || keyword.trim(),
          notes,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Failed to import selected candidate profiles");
        return;
      }

      toast.success(
        result.summary ||
          `Successfully imported ${selected.length} profile(s) into database!`
      );

      if (onSuccess) onSuccess();
      if (onScoutSuccess) onScoutSuccess();
      handleClose();
    } catch (err: any) {
      console.error("Discovery Confirm Error:", err);
      toast.error("Server connection error during profile import");
    } finally {
      setImporting(false);
    }
  };

  // Toggle single candidate selection
  const toggleCandidate = (username: string) => {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  };

  // Quick Selection Helpers
  const selectAll = () => {
    setSelectedUsernames(new Set(candidates.map((c) => c.username)));
  };

  const deselectAll = () => {
    setSelectedUsernames(new Set());
  };

  const selectNewOnly = () => {
    setSelectedUsernames(
      new Set(candidates.filter((c) => !c.isExisting).map((c) => c.username))
    );
  };

  const newCandidatesCount = candidates.filter((c) => !c.isExisting).length;
  const existingCandidatesCount = candidates.filter((c) => c.isExisting).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className={`bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 ${
          step === 1 ? "max-w-xl" : "max-w-2xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── MODAL HEADER ─── */}
        <div className="bg-gradient-to-r from-purple-800 via-indigo-800 to-blue-900 text-white px-6 py-4 sm:py-5 flex items-center justify-between shrink-0">
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
                  Step {step} of 2
                </span>
              </div>
              <h3 className="font-black text-base sm:text-lg leading-tight text-white mt-0.5">
                {step === 1 ? "Discover New Profiles" : "Review & Select Candidates"}
              </h3>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={searching || importing}
            className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── STEP PROGRESS BAR ─── */}
        <div className="bg-slate-50 border-b border-slate-100 px-6 py-2.5 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                if (!searching && !importing && step === 2) setStep(1);
              }}
              disabled={searching || importing || step === 1}
              className={`flex items-center space-x-1.5 font-bold transition ${
                step === 1
                  ? "text-indigo-600"
                  : "text-slate-600 hover:text-indigo-600 cursor-pointer"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 1
                    ? "bg-indigo-600 text-white"
                    : "bg-emerald-500 text-white"
                }`}
              >
                {step === 2 ? "✓" : "1"}
              </div>
              <span>1. Search Criteria</span>
            </button>

            <span className="text-slate-300 font-bold">/</span>

            <div
              className={`flex items-center space-x-1.5 font-bold ${
                step === 2 ? "text-indigo-600" : "text-slate-400"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 2
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                2
              </div>
              <span>2. Review Candidates ({candidates.length})</span>
            </div>
          </div>

          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={importing}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1 cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Edit Criteria</span>
            </button>
          )}
        </div>

        {/* ─── STEP 1 BODY: SEARCH FORM ─── */}
        {step === 1 && (
          <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
            {/* Informational Callout */}
            <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-3.5 flex items-start space-x-3 text-xs text-blue-900">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold leading-relaxed">
                  2-Step Discovery Protocol: <strong>Preview before Import</strong>
                </p>
                <p className="text-blue-700 mt-0.5 leading-relaxed text-[11px]">
                  Step 1 queries live social media to retrieve candidate profile names and links. You can then review accounts, inspect their live profile links, and decide exactly which ones to add into your database.
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

            <form onSubmit={handleSearchPreview} className="space-y-4 pt-1">
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
                    <option value={5}>5 candidate profiles</option>
                    <option value={10}>10 candidate profiles</option>
                    <option value={15}>15 candidate profiles</option>
                    <option value={20}>20 candidate profiles</option>
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

              {/* Progress Indicator when Searching */}
              {searching && (
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3.5 flex items-center space-x-3 text-xs text-purple-900 animate-pulse">
                  <RefreshCw className="w-5 h-5 text-purple-600 animate-spin shrink-0" />
                  <div>
                    <p className="font-bold">Discovering Candidate Profiles...</p>
                    <p className="text-[11px] text-purple-700 mt-0.5 leading-relaxed">
                      Crawling live {platform} profiles for &ldquo;{keyword}&rdquo;, extracting profile links and cross-checking with existing CRM records.
                    </p>
                  </div>
                </div>
              )}

              {/* Modal Step 1 Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  disabled={searching}
                  onClick={handleClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={searching}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 rounded-xl transition shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {searching ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5 text-amber-300" />
                  )}
                  <span>
                    {searching ? "Finding Candidate Profiles..." : "Find Candidate Profiles (Step 1)"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── STEP 2 BODY: CANDIDATE REVIEW & SELECTION LIST ─── */}
        {step === 2 && (
          <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 flex flex-col">
            {/* Top Discovery Summary Banner */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-800">
                  Topic: &ldquo;{effectiveQuery || keyword}&rdquo;
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-semibold">
                  {platform}
                </span>
                {modifierApplied && (
                  <span
                    title="Sub-niche modifier applied to find unindexed profiles outside existing CRM records"
                    className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold border border-amber-200"
                  >
                    + Sub-niche: {modifierApplied}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2 text-xs font-semibold">
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {newCandidatesCount} New
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {existingCandidatesCount} In CRM
                </span>
              </div>
            </div>

            {/* Selection Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 py-0.5">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                >
                  Select All ({candidates.length})
                </button>
                {newCandidatesCount > 0 && (
                  <button
                    type="button"
                    onClick={selectNewOnly}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] transition cursor-pointer"
                  >
                    Select New Only ({newCandidatesCount})
                  </button>
                )}
                <button
                  type="button"
                  onClick={deselectAll}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 font-semibold text-[11px] transition cursor-pointer"
                >
                  Deselect All
                </button>
              </div>

              <div className="text-xs font-bold text-slate-700">
                Selected:{" "}
                <span className="text-indigo-600 font-black">
                  {selectedUsernames.size}
                </span>{" "}
                of {candidates.length} profiles
              </div>
            </div>

            {/* Candidate Cards Scrollable List */}
            <div className="space-y-2.5 overflow-y-auto max-h-[48vh] pr-1 flex-1">
              {candidates.map((candidate) => {
                const isSelected = selectedUsernames.has(candidate.username);
                return (
                  <div
                    key={candidate.username}
                    onClick={() => toggleCandidate(candidate.username)}
                    className={`rounded-2xl border p-3.5 sm:p-4 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50/20 shadow-xs ring-1 ring-indigo-500/20"
                        : "border-slate-200 bg-white hover:border-slate-300 opacity-90"
                    }`}
                  >
                    {/* Left: Checkbox + Avatar + Profile Info */}
                    <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCandidate(candidate.username);
                        }}
                        className="mt-1 text-indigo-600 hover:text-indigo-700 transition shrink-0 cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-indigo-600" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-300" />
                        )}
                      </button>

                      {/* Avatar */}
                      <div className="shrink-0">
                        {candidate.avatarUrl ? (
                          <img
                            src={candidate.avatarUrl}
                            alt={candidate.name}
                            className="w-11 h-11 rounded-full object-cover border border-slate-200"
                            onError={(e) => {
                              // Hide broken image and fallback to initials
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-black flex items-center justify-center text-sm shadow-inner">
                            {(candidate.name || candidate.username).charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Name, Handle, Status & Bio */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="font-extrabold text-sm text-slate-900 truncate">
                            {candidate.name}
                          </h4>
                          <span className="text-xs text-slate-500 font-mono">
                            @{candidate.username}
                          </span>

                          {/* Status Badge */}
                          {candidate.isExisting ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <UserCheck className="w-3 h-3" />
                              <span>Already in CRM</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <UserPlus className="w-3 h-3" />
                              <span>New Candidate</span>
                            </span>
                          )}
                        </div>

                        {/* Clickable Profile Link */}
                        <div className="mt-1">
                          <a
                            href={candidate.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                            title={`Open live profile on ${platform}`}
                          >
                            <span className="truncate max-w-[280px] sm:max-w-md">
                              {candidate.url}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </a>
                        </div>

                        {/* Bio snippet */}
                        {candidate.bio && (
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                            {candidate.bio}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Metrics Chips */}
                    <div className="flex sm:flex-col items-end sm:items-end justify-between sm:justify-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 gap-1">
                      <div className="flex items-center space-x-1.5 text-xs font-extrabold text-slate-800">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatNumber(candidate.followers)}</span>
                        <span className="text-[10px] text-slate-500 font-normal">followers</span>
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-semibold">
                        <span className="text-indigo-600 font-bold">
                          {candidate.er.toFixed(1)}% ER
                        </span>
                        {candidate.avgViews > 0 && (
                          <span>• {formatNumber(candidate.avgViews)} avg</span>
                        )}
                      </div>
                      {candidate.posts && candidate.posts.length > 0 && (
                        <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-medium">
                          {candidate.posts.length} posts ready
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Importing Progress Banner */}
            {importing && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex items-center space-x-3 text-xs text-indigo-900 animate-pulse shrink-0">
                <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
                <div>
                  <p className="font-bold">Ingesting Selected Profiles into Database...</p>
                  <p className="text-[11px] text-indigo-700 mt-0.5 leading-relaxed">
                    Saving records, deduplicating with existing CRM data, recording metric snapshots, and linking viral sample posts.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2 Bottom Action Bar */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <button
                type="button"
                disabled={importing}
                onClick={() => setStep(1)}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Search</span>
              </button>

              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  disabled={importing}
                  onClick={handleClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedUsernames.size === 0 || importing}
                  onClick={handleConfirmImport}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 rounded-xl transition shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                  )}
                  <span>
                    {importing
                      ? "Importing to CRM..."
                      : `Confirm & Import Selected (${selectedUsernames.size})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
