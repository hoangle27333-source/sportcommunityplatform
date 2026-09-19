"use client";

import React, { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  X,
  Sparkles,
  Link2,
  CheckCircle2,
  AlertTriangle,
  GitMerge,
  Layers,
  ArrowRight,
  TrendingUp,
  Eye,
  Users,
  ShieldCheck,
  Search,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";
import { PlatformIcon, getPlatformBadgeStyle } from "./platform-icon";
import { getKolChannels, getCommunityChannels, getPlatformConfig } from "@/lib/sport-hub/kol-channels";
import { formatNumber, formatCurrency, t } from "@/lib/i18n";
import type { KOL, Community, KOLChannel, CommunityChannel } from "./types";

// ============================================================================
// 1. ADD CHANNEL MODAL
// ============================================================================

export interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: "kol" | "community";
  entity: KOL | Community | null;
  onSuccess: () => void;
}

export function AddChannelModal({
  isOpen,
  onClose,
  entityType,
  entity,
  onSuccess,
}: AddChannelModalProps) {
  const [scoutUrl, setScoutUrl] = useState("");
  const [isScouting, setIsScouting] = useState(false);
  const [platform, setPlatform] = useState("TikTok");
  const [handle, setHandle] = useState("");
  const [url, setUrl] = useState("");
  const [followers, setFollowers] = useState<number | string>("");
  const [avgViews, setAvgViews] = useState<number | string>("");
  const [er, setEr] = useState<number | string>("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setScoutUrl("");
      setPlatform(entityType === "kol" ? "TikTok" : "Facebook Group");
      setHandle("");
      setUrl("");
      setFollowers("");
      setAvgViews("");
      setEr("");
      setIsPrimary(false);
    }
  }, [isOpen, entityType]);

  if (!isOpen || !entity) return null;

  const currentAudience =
    entityType === "kol"
      ? (entity as KOL).followers || 0
      : (entity as Community).members || 0;

  const newReach = Number(followers) || 0;
  const projectedTotalReach = currentAudience + newReach;

  // Auto-scout channel info from link
  const handleScoutUrl = async () => {
    const trimmed = scoutUrl.trim();
    if (!trimmed) {
      toast.error("Please enter a valid channel profile link");
      return;
    }

    setIsScouting(true);
    try {
      const res = await fetch("/api/sport-hub/scout/inspect-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          type: entityType === "kol" ? "kol" : "community",
        }),
      });
      const data = await res.json();

      if (data.success && data.scouted) {
        const s = data.scouted;
        if (s.platform) setPlatform(s.platform);
        if (s.handle) setHandle(s.handle);
        else if (s.name) setHandle(s.name);
        setUrl(trimmed);
        if (s.followers) setFollowers(s.followers);
        if (s.members) setFollowers(s.members);
        if (s.avgViews) setAvgViews(s.avgViews);
        if (s.er) setEr(s.er);

        toast.success(`Scouted ${s.platform || "channel"} details successfully!`);
      } else {
        toast.error(data.error || "Unable to inspect URL automatically. Please fill manually.");
        setUrl(trimmed);
      }
    } catch {
      toast.error("Network error during URL inspection. Please enter channel details manually.");
      setUrl(trimmed);
    } finally {
      setIsScouting(false);
    }
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Channel URL is required");
      return;
    }

    setIsSaving(true);
    try {
      const channelPayload: any = {
        platform,
        handle: handle.trim() || entity.name,
        name: handle.trim() || entity.name,
        url: url.trim(),
        followers: Number(followers) || 0,
        members: Number(followers) || 0,
        avgViews: Number(avgViews) || 0,
        er: Number(er) || 0,
        isPrimary,
        status: "Active",
      };

      const res = await fetch("/api/sport-hub/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId: entity.id,
          entityName: entity.name,
          channel: channelPayload,
        }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success(result.message || `Added ${platform} channel to ${entity.name}!`);
        onSuccess();
        onClose();
      } else {
        toast.error(result.error || "Failed to add channel");
      }
    } catch {
      toast.error("Network error while saving channel");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Add Social Channel
              </h3>
              <p className="text-xs text-slate-500">
                Attach an additional platform to{" "}
                <span className="font-semibold text-indigo-600">{entity.name}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {/* URL Auto-Scout Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50/80 to-purple-50/80 border border-indigo-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-900 flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Auto-Fill from Channel URL</span>
              </span>
              <span className="text-[10px] text-indigo-500 font-medium">
                TikTok · YouTube · FB · IG · Strava · Zalo
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="url"
                  value={scoutUrl}
                  onChange={(e) => setScoutUrl(e.target.value)}
                  placeholder={
                    entityType === "kol"
                      ? "https://youtube.com/@channel or https://tiktok.com/@..."
                      : "https://facebook.com/groups/... or https://strava.com/clubs/..."
                  }
                  className="w-full pl-9 pr-3 py-2 bg-white rounded-lg border border-indigo-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                type="button"
                disabled={isScouting}
                onClick={handleScoutUrl}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold rounded-lg transition flex items-center space-x-1.5 shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
              >
                {isScouting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Scouting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Inspect</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <form id="add-channel-form" onSubmit={handleSaveChannel} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Platform Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Platform
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="TikTok">TikTok</option>
                  <option value="YouTube">YouTube</option>
                  <option value="Facebook">Facebook (Fanpage / Profile)</option>
                  <option value="Facebook Group">Facebook Group</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Threads">Threads</option>
                  <option value="Strava Club">Strava Club</option>
                  <option value="Zalo Group">Zalo Group</option>
                  <option value="Telegram">Telegram</option>
                  <option value="Web">Website / Blog</option>
                </select>
              </div>

              {/* Handle / Channel Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Handle / Channel Title
                </label>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@username or Channel Name"
                  className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Direct Channel URL */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Channel URL <span className="text-rose-500">*</span>
              </label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {entityType === "kol" ? "Followers" : "Members"}
                </label>
                <input
                  type="number"
                  min={0}
                  value={followers}
                  onChange={(e) => setFollowers(e.target.value ? Number(e.target.value) : "")}
                  placeholder="e.g. 50000"
                  className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {entityType === "kol" && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Avg Views / Post
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={avgViews}
                    onChange={(e) => setAvgViews(e.target.value ? Number(e.target.value) : "")}
                    placeholder="e.g. 15000"
                    className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Engagement Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={er}
                  onChange={(e) => setEr(e.target.value ? Number(e.target.value) : "")}
                  placeholder="e.g. 4.5"
                  className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Primary Channel Checkbox */}
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="isPrimary"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
              />
              <label htmlFor="isPrimary" className="text-xs text-slate-700 font-medium cursor-pointer">
                Set as Primary Channel (default platform link on cards and tables)
              </label>
            </div>

            {/* Live Impact Preview */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-slate-700">Projected Total Audience:</span>
              </div>
              <div className="flex items-center space-x-2 font-bold">
                <span className="text-slate-400 line-through">{formatNumber(currentAudience)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-indigo-600 text-sm">{formatNumber(projectedTotalReach)}</span>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                  +{formatNumber(newReach)}
                </span>
              </div>
            </div>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end space-x-2.5 px-6 py-3.5 border-t border-slate-200 bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-channel-form"
            disabled={isSaving}
            className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-xl shadow-xs transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Save Channel</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. MERGE ENTITY MODAL (FOR KOLS & COMMUNITIES)
// ============================================================================

export interface MergeEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: "kol" | "community";
  initialSelectedEntities: (KOL | Community)[];
  allEntities: (KOL | Community)[];
  onSuccess: () => void;
}

export function MergeEntityModal({
  isOpen,
  onClose,
  entityType,
  initialSelectedEntities,
  allEntities,
  onSuccess,
}: MergeEntityModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string>("");
  const [masterName, setMasterName] = useState<string>("");
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [primaryGeo, setPrimaryGeo] = useState<string>("");
  const [primaryContact, setPrimaryContact] = useState<string>("");
  const [primaryBio, setPrimaryBio] = useState<string>("");
  const [primaryQuotation, setPrimaryQuotation] = useState<number>(0);
  const [searchPicker, setSearchPicker] = useState<string>("");
  const [isMerging, setIsMerging] = useState(false);

  // Initialize selection
  useEffect(() => {
    if (isOpen) {
      const ids = initialSelectedEntities.map((e) => e.id);
      setSelectedIds(ids);
      const master = initialSelectedEntities[0];
      if (master) {
        setPrimaryId(master.id);
        setMasterName(master.name);
        // Combine sports
        const combinedSports = Array.from(
          new Set(initialSelectedEntities.flatMap((e) => e.sport || []))
        );
        setSelectedSports(combinedSports);
        setPrimaryGeo(master.geography || "Toàn quốc");
        setPrimaryContact((master as any).info || (master as any).adminContact || "");
        setPrimaryBio((master as any).bio || "");
        setPrimaryQuotation((master as any).quotation || (master as any).pricePerPin || 0);
      }
    }
  }, [isOpen, initialSelectedEntities]);

  // Candidates resolution
  const candidates = useMemo(() => {
    return allEntities.filter((e) => selectedIds.includes(e.id));
  }, [allEntities, selectedIds]);

  const primaryCandidate = useMemo(() => {
    return candidates.find((c) => c.id === primaryId) || candidates[0];
  }, [candidates, primaryId]);

  const secondaryCandidates = useMemo(() => {
    return candidates.filter((c) => c.id !== primaryId);
  }, [candidates, primaryId]);

  // Consolidated channels
  const consolidatedChannels = useMemo(() => {
    const rawChannels: any[] = [];
    for (const cand of candidates) {
      const chs =
        entityType === "kol"
          ? getKolChannels(cand as KOL)
          : getCommunityChannels(cand as Community);
      rawChannels.push(...chs);
    }

    // Deduplicate channels by platform + handle/url
    const seen = new Set<string>();
    const deduplicated: any[] = [];

    for (const ch of rawChannels) {
      const key = `${ch.platform.toLowerCase()}_${(ch.url || ch.handle || "").toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push({ ...ch });
      }
    }

    // Ensure at least 1 primary channel
    if (deduplicated.length > 0 && !deduplicated.some((c) => c.isPrimary)) {
      deduplicated[0].isPrimary = true;
    }

    return deduplicated;
  }, [candidates, entityType]);

  // Aggregated preview
  const totalReach = useMemo(() => {
    return consolidatedChannels.reduce(
      (sum, ch) => sum + (Number(ch.followers) || Number(ch.members) || 0),
      0
    );
  }, [consolidatedChannels]);

  const totalAvgViews = useMemo(() => {
    return consolidatedChannels.reduce((sum, ch) => sum + (Number(ch.avgViews) || 0), 0);
  }, [consolidatedChannels]);

  const blendedEr = useMemo(() => {
    if (totalReach === 0) return 0;
    const weightedSum = consolidatedChannels.reduce(
      (sum, ch) => sum + (Number(ch.er) || 0) * (Number(ch.followers) || 0),
      0
    );
    return +(weightedSum / totalReach).toFixed(1);
  }, [consolidatedChannels, totalReach]);

  // Available candidates to add from search
  const unselectedEntities = useMemo(() => {
    const q = searchPicker.toLowerCase().trim();
    return allEntities
      .filter((e) => !selectedIds.includes(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || (e.platform || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [allEntities, selectedIds, searchPicker]);

  if (!isOpen) return null;

  const handleAddCandidate = (entityToAdd: KOL | Community) => {
    setSelectedIds((prev) => [...prev, entityToAdd.id]);
    setSearchPicker("");
    // Union sports
    setSelectedSports((prev) => Array.from(new Set([...prev, ...(entityToAdd.sport || [])])));
  };

  const handleRemoveCandidate = (idToRemove: string) => {
    if (selectedIds.length <= 2) {
      toast.error("At least 2 profiles are required to perform a merge");
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => id !== idToRemove));
    if (primaryId === idToRemove) {
      const nextMaster = candidates.find((c) => c.id !== idToRemove);
      if (nextMaster) {
        setPrimaryId(nextMaster.id);
        setMasterName(nextMaster.name);
      }
    }
  };

  const handleConfirmMerge = async () => {
    if (!primaryId) {
      toast.error("Please select a Master Profile to keep");
      return;
    }
    if (secondaryCandidates.length === 0) {
      toast.error("Please select at least one duplicate profile to merge");
      return;
    }

    setIsMerging(true);
    try {
      const payload = {
        type: entityType,
        primaryId,
        secondaryIds: secondaryCandidates.map((c) => c.id),
        mergedFields: {
          name: masterName.trim(),
          sports: selectedSports,
          geography: primaryGeo,
          info: primaryContact,
          adminContact: primaryContact,
          bio: primaryBio,
          quotation: primaryQuotation,
          pricePerPin: primaryQuotation,
        },
        consolidatedChannels,
      };

      const res = await fetch("/api/sport-hub/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (result.success) {
        toast.success(
          result.message || `Merged profiles into ${masterName} with ${consolidatedChannels.length} channels!`
        );
        onSuccess();
        onClose();
      } else {
        toast.error(result.error || "Failed to merge profiles");
      }
    } catch {
      toast.error("Network error during profile merge");
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-xs">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Merge Duplicate Profiles — {entityType === "kol" ? "KOL Creator" : "Community Group"}
              </h3>
              <p className="text-xs text-slate-500">
                Consolidate cross-platform duplicate records into a single multi-channel profile.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
          {/* 1. Candidate Comparison & Master Selector */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center space-x-1.5">
                <span>1. Select Profiles to Merge & Designate Master Profile</span>
              </h4>
              <span className="text-[11px] text-slate-500">
                {candidates.length} profiles selected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {candidates.map((cand) => {
                const isMaster = cand.id === primaryId;
                const candReach =
                  entityType === "kol"
                    ? (cand as KOL).followers || 0
                    : (cand as Community).members || 0;

                return (
                  <div
                    key={cand.id}
                    onClick={() => {
                      setPrimaryId(cand.id);
                      setMasterName(cand.name);
                    }}
                    className={`relative p-3.5 rounded-xl border transition cursor-pointer ${
                      isMaster
                        ? "bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-500/20 shadow-xs"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isMaster ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"
                          }`}
                        >
                          {isMaster && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-900 text-xs">{cand.name}</span>
                            {isMaster && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-indigo-600 text-white">
                                Master (Keep)
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block">{cand.platform}</span>
                        </div>
                      </div>

                      {candidates.length > 2 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveCandidate(cand.id);
                          }}
                          className="text-slate-300 hover:text-rose-500 p-1 rounded transition cursor-pointer"
                          title="Remove candidate"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        {entityType === "kol" ? "Audience" : "Members"}:{" "}
                        <strong className="text-slate-800">{formatNumber(candReach)}</strong>
                      </span>
                      {entityType === "kol" && (cand as KOL).er > 0 && (
                        <span className="font-bold text-emerald-600">{(cand as KOL).er}% ER</span>
                      )}
                      <span className="text-slate-400 text-[10px]">ID: {cand.id.slice(0, 8)}...</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* If fewer than 2 candidates or user wants to add another */}
            {candidates.length < 2 && (
              <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Please select a second profile below to merge with this record.</span>
              </div>
            )}

            {/* Search and add duplicate profile */}
            <div className="mt-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchPicker}
                  onChange={(e) => setSearchPicker(e.target.value)}
                  placeholder={`Search other ${entityType === "kol" ? "KOLs" : "Communities"} to add as merge candidate...`}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {searchPicker && unselectedEntities.length > 0 && (
                <div className="mt-1.5 max-h-36 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-md divide-y divide-slate-100">
                  {unselectedEntities.map((e) => (
                    <div
                      key={e.id}
                      onClick={() => handleAddCandidate(e)}
                      className="px-3 py-2 flex items-center justify-between hover:bg-indigo-50/50 cursor-pointer transition"
                    >
                      <div>
                        <span className="font-bold text-slate-900 text-xs">{e.name}</span>
                        <span className="text-[10px] text-slate-400 ml-2">({e.platform})</span>
                      </div>
                      <span className="text-xs font-semibold text-indigo-600 flex items-center space-x-1">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 2. Resolve Master Fields */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2.5">
              2. Field Conflict Resolution
            </h4>

            <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              {/* Master Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Master Profile Name
                </label>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setMasterName(c.name)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        masterName === c.name
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={masterName}
                  onChange={(e) => setMasterName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white rounded-lg border border-slate-300 text-xs text-slate-900 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Sports Tags */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Combined Sport Disciplines
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set(candidates.flatMap((c) => c.sport || []))).map((s) => {
                    const isSelected = selectedSports.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSelectedSports((prev) =>
                            prev.includes(s) ? prev.filter((item) => item !== s) : [...prev, s]
                          );
                        }}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                          isSelected
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-600 border-slate-200"
                        }`}
                      >
                        {t(s)} {isSelected && "✓"}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Consolidated Multi-Channel Footprint */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>3. Consolidated Multi-Channel Footprint ({consolidatedChannels.length} Channels)</span>
              </h4>
              <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                {entityType === "kol" ? "Omni-channel" : "Multi-channel"}
              </span>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-2xs">
              {consolidatedChannels.map((ch, idx) => {
                const style = getPlatformBadgeStyle(ch.platform);
                return (
                  <div key={idx} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg ${style.lightBg} ${style.lightText} flex items-center justify-center border border-slate-200 shrink-0`}
                      >
                        <PlatformIcon platform={ch.platform} className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-slate-900 text-xs">{ch.platform}</span>
                          {ch.isPrimary && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                              Primary
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 truncate block max-w-xs">
                          {ch.handle || ch.name || ch.url}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 shrink-0 text-right">
                      <div>
                        <span className="text-slate-400 text-[10px] block">
                          {entityType === "kol" ? "Followers" : "Members"}
                        </span>
                        <span className="font-extrabold text-slate-900 text-xs">
                          {formatNumber(Number(ch.followers) || Number(ch.members) || 0)}
                        </span>
                      </div>
                      {entityType === "kol" && ch.er > 0 && (
                        <div>
                          <span className="text-slate-400 text-[10px] block">ER</span>
                          <span className="font-bold text-emerald-600 text-xs">{ch.er}%</span>
                        </div>
                      )}
                      {ch.url && ch.url !== "#" && (
                        <a
                          href={ch.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Live Impact & Blast Radius Migration Summary */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50/90 to-purple-50/90 border border-indigo-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950 flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Aggregated Reach & Migration Blast Radius</span>
              </span>
              <span className="text-[10px] font-semibold text-slate-500">Atomic Safe Merge</span>
            </div>

            {/* KPI preview */}
            <div className="grid grid-cols-3 gap-2 text-center bg-white/90 p-3 rounded-xl border border-indigo-100 shadow-2xs">
              <div>
                <span className="text-slate-400 text-[10px] block uppercase font-medium">Combined Reach</span>
                <span className="text-sm font-extrabold text-slate-900">{formatNumber(totalReach)}</span>
              </div>
              <div className="border-x border-slate-100">
                <span className="text-slate-400 text-[10px] block uppercase font-medium">
                  {entityType === "kol" ? "Combined Views" : "Total Channels"}
                </span>
                <span className="text-sm font-extrabold text-slate-900">
                  {entityType === "kol" ? formatNumber(totalAvgViews) : consolidatedChannels.length}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block uppercase font-medium">
                  {entityType === "kol" ? "Blended ER" : "Status"}
                </span>
                <span className="text-sm font-extrabold text-emerald-600">
                  {entityType === "kol" ? `${blendedEr}%` : "Unified"}
                </span>
              </div>
            </div>

            {/* Foreign reference migration notes */}
            <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside">
              <li>
                Historical viral posts and content feeds authored by secondary profiles will be re-attributed to{" "}
                <strong>{masterName}</strong>.
              </li>
              <li>
                Campaign bookings, project participants, and evaluation reports will be migrated seamlessly to the master record.
              </li>
              <li>
                Duplicate record(s) (<strong>{secondaryCandidates.map((c) => c.name).join(", ")}</strong>) will be removed from the directory and recorded in the audit log.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2.5 px-6 py-3.5 border-t border-slate-200 bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isMerging || candidates.length < 2}
            onClick={handleConfirmMerge}
            className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 active:scale-95 rounded-xl shadow-xs transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isMerging ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Merging Profiles...</span>
              </>
            ) : (
              <>
                <GitMerge className="w-4 h-4" />
                <span>Confirm & Merge Profiles</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
