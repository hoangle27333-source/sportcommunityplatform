"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Star,
  UserPlus,
  Users,
  X,
  RefreshCw,
  Send,
  Briefcase,
  Calendar,
  DollarSign,
  Edit3,
  Trash2,
  AlertTriangle,
  History,
  Link as LinkIcon,
  CheckCircle2,
  Film,
  ExternalLink,
  Lock,
} from "lucide-react";

import type { Project } from "./types";
import { TeamMemberSelect } from "./team-member-select";
import { AuditTrailModal } from "./audit-trail-modal";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export { KolPostScoutModal } from "./kol-post-scout-modal";
export { CommunityPostScoutModal } from "./community-post-scout-modal";
export { MarketTrendScoutModal } from "./market-trend-scout-modal";
export { AuditTrailModal } from "./audit-trail-modal";

// ==========================================
// 1. MODAL: AUTO SCOUT CRAWLER (APIFY)
// ==========================================
export interface ScoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultTargetType?: string;
}

export function ScoutModal({
  isOpen,
  onClose,
  onSuccess,
  defaultTargetType,
}: ScoutModalProps) {
  const [keyword, setKeyword] = useState("");
  const [targetType, setTargetType] = useState(
    defaultTargetType || "Individual KOLs"
  );
  const [platform, setPlatform] = useState(
    defaultTargetType?.includes("Communit") ? "Facebook" : "Instagram"
  );
  const [limit, setLimit] = useState(5);
  const [geography, setGeography] = useState("Nationwide");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .single()
            .then(({ data: prof }) => {
              setCurrentUser(prof?.name || user.user_metadata?.name || user.email?.split("@")[0] || "Team Member");
            });
        }
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (defaultTargetType) {
      setTargetType(defaultTargetType);
      if (defaultTargetType.includes("Communit")) {
        setPlatform("Facebook");
      }
    }
  }, [defaultTargetType, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) {
      toast.error("Please enter a search keyword to scout!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
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
        toast.success("Apify scout triggered! Results are syncing directly into Supabase.");
        onSuccess();
        onClose();
        setKeyword("");
        setNotes("");
      } else {
        toast.error(result.error || "Failed to dispatch scout request");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Auto Scout Request (Apify Engine)
              </h3>
              <p className="text-xs text-blue-100 mt-0.5">
                Launch Apify cloud scraper and sync directly into Supabase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Search Keyword <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. pickleball hanoi, tennis saigon, marathon runner..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Tip: Sport discipline + City (e.g.{" "}
              <span className="font-semibold text-slate-600">
                pickleball vietnam
              </span>
              )
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Target Entity
              </label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="Individual KOLs">Individual KOLs</option>
                <option value="Communities & Clubs">Communities & Clubs</option>
                <option value="Viral Posts & Reels">Viral Posts & Reels</option>
                <option value="Athletes / Coaches">Athletes / Coaches</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="Instagram">Instagram</option>
                <option value="Facebook">Facebook</option>
                <option value="Threads">Threads</option>
                <option value="TikTok">TikTok</option>
                <option value="YouTube">YouTube</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Number of Profiles
              </label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value={5}>5 Profiles (Fast)</option>
                <option value={10}>10 Profiles</option>
                <option value={20}>20 Profiles</option>
                <option value={50}>50 Profiles (Deep Scout)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Target Region
              </label>
              <select
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="Nationwide">Nationwide</option>
                <option value="Hanoi">Hanoi</option>
                <option value="Ho Chi Minh City">Ho Chi Minh City</option>
                <option value="Da Nang">Da Nang</option>
                <option value="Northern Region">Northern Region</option>
                <option value="Southern Region">Southern Region</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Additional Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Specific follower criteria, engagement thresholds, or content guidelines..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start space-x-2 text-[11px] text-blue-800">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              The request will trigger <strong>Apify Cloud Actors</strong> directly.
              Extracted profiles, metrics, and viral reels are written into Supabase PostgreSQL in real-time.
            </span>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
            <div className="text-[11px] text-slate-500 font-medium truncate">
              {currentUser ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>Attributed to: <strong className="text-slate-800">{currentUser}</strong></span>
                </span>
              ) : null}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition shadow-md shadow-blue-200 flex items-center space-x-1.5 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Launching Apify...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Launch Apify Scout</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 2. MODAL: PROJECT SIGN-OFF & EVALUATION
// ==========================================
export interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  kolsList?: Array<{ id: string; name: string }>;
  defaultKolName?: string;
  defaultKolId?: string;
  defaultProjectName?: string;
  targetKol?: any;
  targetCommunity?: any;
  defaultProject?: string;
}

export function ReportModal({
  isOpen,
  onClose,
  onSuccess,
  kolsList = [],
  defaultKolName = "",
  defaultKolId = "",
  defaultProjectName = "",
  targetKol,
  targetCommunity,
  defaultProject = "",
}: ReportModalProps) {
  const isCommunity = !!targetCommunity;
  const [kolName, setKolName] = useState(
    defaultKolName || targetKol?.name || targetCommunity?.name || ""
  );
  const [kolRecordId, setKolRecordId] = useState(
    defaultKolId || targetKol?.id || ""
  );
  const [project, setProject] = useState(
    defaultProjectName || defaultProject || "Summer Pickleball Championship 2026"
  );
  const [title, setTitle] = useState("");
  const [score, setScore] = useState(5);
  const [attitude, setAttitude] = useState(5);
  const [deadline, setDeadline] = useState("Ahead of Schedule (Early)");
  const [kpiCommit, setKpiCommit] = useState(100000);
  const [kpiActual, setKpiActual] = useState(125000);
  const [notes, setNotes] = useState("");
  const [evaluator, setEvaluator] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (targetCommunity?.name) {
      setKolName(targetCommunity.name);
      setKolRecordId("");
    } else if (targetKol?.name) {
      setKolName(targetKol.name);
      setKolRecordId(targetKol.id || "");
    }
    if (defaultKolName) setKolName(defaultKolName);
    if (defaultKolId) setKolRecordId(defaultKolId);
    if (defaultProjectName) setProject(defaultProjectName);
  }, [defaultKolName, defaultKolId, defaultProjectName, targetKol, targetCommunity, isOpen]);

  useEffect(() => {
    if (kolName && project) {
      setTitle(
        isCommunity
          ? `Community Evaluation: ${kolName} - ${project}`
          : `Evaluation: ${kolName} - ${project}`
      );
    }
  }, [kolName, project, isCommunity]);

  if (!isOpen) return null;

  const kpiRate =
    kpiCommit > 0 ? Math.round((kpiActual / kpiCommit) * 100) : 100;

  const handleSelectKol = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const found = kolsList.find((k) => k.name === val);
    setKolName(val);
    if (found) {
      setKolRecordId(found.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kolName.trim()) {
      toast.error(
        isCommunity
          ? "Please select or enter Community / Club Name!"
          : "Please select or enter KOL Name!"
      );
      return;
    }
    if (!project.trim()) {
      toast.error("Please enter Project Name!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "report",
          data: {
            title,
            kolName,
            kolRecordId: isCommunity ? null : kolRecordId || null,
            project,
            score,
            attitude,
            deadline,
            kpiCommit,
            kpiActual,
            kpiRate,
            notes,
            evaluator,
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("Project evaluation recorded successfully to Supabase!");
        onSuccess();
        onClose();
        setNotes("");
      } else {
        toast.error(result.error || "Failed to save evaluation");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
              <Star className="w-4 h-4 fill-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isCommunity
                  ? "Campaign Sign-off & Community Evaluation"
                  : "Project Sign-off & KOL Evaluation"}
              </h3>
              <p className="text-xs text-amber-100 mt-0.5">
                {isCommunity
                  ? "Rate community engagement, pinned post delivery & SLA into Supabase"
                  : "Rate collaboration attitude, timeline punctuality & KPI fulfillment into Supabase"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {isCommunity
                  ? "Evaluated Community / Club"
                  : "Evaluated KOL / Partner"}{" "}
                <span className="text-rose-500">*</span>
              </label>
              {isCommunity ? (
                <input
                  type="text"
                  required
                  value={kolName}
                  onChange={(e) => setKolName(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50 font-medium text-slate-900"
                />
              ) : (
                <select
                  value={kolName}
                  onChange={handleSelectKol}
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                >
                  <option value="">-- Select KOL from Directory --</option>
                  {kolsList.map((k) => (
                    <option key={k.id} value={k.name}>
                      {k.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Campaign / Project Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="e.g. Summer Pickleball Championship 2026"
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Evaluation Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            />
          </div>

          {/* Star Ratings */}
          <div className="grid grid-cols-2 gap-4 bg-amber-50/50 p-3.5 rounded-xl border border-amber-100">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Overall Rating ({score} / 5 stars)
              </label>
              <div className="flex items-center space-x-1 mt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setScore(star)}
                    className="p-1 hover:scale-110 transition"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= score
                          ? "fill-amber-500 text-amber-500"
                          : "text-slate-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Attitude Score ({attitude} / 5 stars)
              </label>
              <div className="flex items-center space-x-1 mt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setAttitude(star)}
                    className="p-1 hover:scale-110 transition"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= attitude
                          ? "fill-amber-500 text-amber-500"
                          : "text-slate-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Deadline & KPI */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Delivery Timeline (Deadline)
            </label>
            <select
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            >
              <option value="Ahead of Schedule (Early)">
                Ahead of Schedule (Early)
              </option>
              <option value="On Time">On Time</option>
              <option value="Delayed (Pre-notified)">Delayed (Pre-notified)</option>
              <option value="Severe Deadline Breach">Severe Deadline Breach</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Committed KPI
              </label>
              <input
                type="number"
                value={kpiCommit}
                onChange={(e) => setKpiCommit(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Actual KPI
              </label>
              <input
                type="number"
                value={kpiActual}
                onChange={(e) => setKpiActual(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Attainment Rate (%)
              </label>
              <div
                className={`text-xs px-3 py-2.5 rounded-lg border font-bold flex items-center justify-center ${
                  kpiRate >= 100
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : kpiRate >= 80
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
              >
                {kpiRate}%
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Key Notes & Recommendations for Next Campaigns
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Highly professional, punctual, voluntarily filmed bonus clips. Recommended for tier-1 brand campaigns..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <TeamMemberSelect
            label="Evaluator / PM"
            value={evaluator}
            onChange={(name) => setEvaluator(name)}
            autoDefaultCurrent={true}
          />

          {/* Footer */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg transition shadow-md shadow-amber-200 flex items-center space-x-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Star className="w-3.5 h-3.5 fill-slate-900" />
                  <span>Save Evaluation to Supabase</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 3. MODAL: ADD NEW KOL
// ==========================================
export interface AddKolModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SPORT_OPTIONS = [
  "Pickleball",
  "Tennis",
  "Running",
  "Gym & Fitness",
  "Badminton",
  "Football",
  "Golf",
  "Others",
];

export function AddKolModal({ isOpen, onClose, onSuccess }: AddKolModalProps) {
  const { isAdmin } = useCurrentUser();
  const [name, setName] = useState("");
  const [selectedSports, setSelectedSports] = useState<string[]>(["Pickleball"]);
  const [tier, setTier] = useState("Micro (10k - 50k)");
  const [platform, setPlatform] = useState("Facebook");
  const [geography, setGeography] = useState("Nationwide");
  const [followers, setFollowers] = useState(25000);
  const [avgViews, setAvgViews] = useState(10000);
  const [er, setEr] = useState(4.5);
  const [quotation, setQuotation] = useState(15000000);
  const [status, setStatus] = useState("Active Partnership");
  const [profileUrl, setProfileUrl] = useState("");
  const [contact, setContact] = useState("");
  const [bio, setBio] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // URL Auto-scout state
  const [scoutUrl, setScoutUrl] = useState("");
  const [isScoutingUrl, setIsScoutingUrl] = useState(false);
  const [scoutStatusMsg, setScoutStatusMsg] = useState("");
  const scoutInputRef = React.useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleScoutProfileUrl = async () => {
    const targetUrl = (scoutUrl || scoutInputRef.current?.value || "").trim();
    if (!targetUrl) {
      toast.error("Please enter a profile link to scout (e.g. TikTok, Instagram, Facebook)");
      return;
    }
    setIsScoutingUrl(true);
    setScoutStatusMsg("Scouting social profile & computing creator metrics...");
    try {
      const res = await fetch("/api/sport-hub/scout/inspect-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, type: "kol" }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        if (d.name) setName(d.name);
        if (d.sport && Array.isArray(d.sport) && d.sport.length > 0) setSelectedSports(d.sport);
        if (d.tier) setTier(d.tier);
        if (d.platform) setPlatform(d.platform);
        if (d.geography) setGeography(d.geography);
        if (typeof d.followers === "number") setFollowers(d.followers);
        if (typeof d.avgViews === "number") setAvgViews(d.avgViews);
        if (typeof d.er === "number") setEr(d.er);
        if (typeof d.quotation === "number" && isAdmin) setQuotation(d.quotation);
        if (d.status) setStatus(d.status);
        if (d.contact) setContact(d.contact);
        if (d.bio) setBio(d.bio);
        setProfileUrl(targetUrl);
        setScoutUrl(targetUrl);
        setScoutStatusMsg("Profile inspected & autofilled! Review and adjust details below.");
        toast.success("Profile scouted! Review the details below before submitting.");
      } else {
        toast.error(result.error || "Could not scout profile URL");
        setScoutStatusMsg("");
      }
    } catch {
      toast.error("Failed to connect to scout inspector");
      setScoutStatusMsg("");
    } finally {
      setIsScoutingUrl(false);
    }
  };

  const toggleSport = (sport: string) => {
    if (selectedSports.includes(sport)) {
      if (selectedSports.length > 1) {
        setSelectedSports(selectedSports.filter((s) => s !== sport));
      }
    } else {
      setSelectedSports([...selectedSports, sport]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter KOL Name!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "kol",
          data: {
            name,
            sport: selectedSports,
            tier,
            platform,
            geography,
            followers,
            avgViews,
            er,
            quotation: isAdmin ? quotation : 0,
            status,
            profileUrl,
            contact,
            bio,
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("KOL profile added successfully to Supabase!");
        onSuccess();
        onClose();
        setName("");
        setProfileUrl("");
        setBio("");
        setScoutUrl("");
        setScoutStatusMsg("");
      } else {
        toast.error(result.error || "Failed to create KOL profile");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800 to-indigo-950 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Add New Sports KOL Profile
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Paste link to auto-scout or fill manually directly into Supabase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Quick Auto-fill from URL banner */}
          <div className="p-3.5 bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-slate-50 border border-indigo-100/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-950">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Auto-fill from Social Profile URL</span>
              </div>
              <span className="text-[10px] font-medium text-indigo-600 bg-indigo-100/70 px-2 py-0.5 rounded-full">
                TikTok, Instagram, Facebook, YouTube
              </span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  ref={scoutInputRef}
                  type="url"
                  placeholder="Paste TikTok, Instagram, Facebook or YouTube profile link..."
                  value={scoutUrl}
                  onChange={(e) => setScoutUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleScoutProfileUrl();
                    }
                  }}
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-indigo-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={handleScoutProfileUrl}
                disabled={isScoutingUrl}
                className="px-3.5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition flex items-center space-x-1.5 disabled:opacity-50 shrink-0 shadow-sm shadow-indigo-200"
              >
                {isScoutingUrl ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Scouting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Scout & Fill</span>
                  </>
                )}
              </button>
            </div>
            {scoutStatusMsg && (
              <p className="text-[11px] text-indigo-700 flex items-center space-x-1 font-medium animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{scoutStatusMsg}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              KOL Name / Channel <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Hoang Dang Phan, Hana Giang Anh..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Specialized Sports
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SPORT_OPTIONS.map((sport) => {
                const active = selectedSports.includes(sport);
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => toggleSport(sport)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600 font-semibold"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {sport}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Tier
              </label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="Nano (< 10k)">Nano (&lt; 10k)</option>
                <option value="Micro (10k - 50k)">Micro (10k - 50k)</option>
                <option value="Macro (50k - 200k)">Macro (50k - 200k)</option>
                <option value="Mega (> 200k)">Mega (&gt; 200k)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Primary Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="YouTube">YouTube</option>
                <option value="Threads">Threads</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Region / Location
              </label>
              <select
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="Nationwide">Nationwide</option>
                <option value="Hanoi">Hanoi</option>
                <option value="Ho Chi Minh City">Ho Chi Minh City</option>
                <option value="Da Nang">Da Nang</option>
                <option value="Northern Region">Northern Region</option>
                <option value="Southern Region">Southern Region</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Followers
              </label>
              <input
                type="number"
                value={followers}
                onChange={(e) => setFollowers(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Avg Views
              </label>
              <input
                type="number"
                value={avgViews}
                onChange={(e) => setAvgViews(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ER % (Engagement)
              </label>
              <input
                type="number"
                step="0.1"
                value={er}
                onChange={(e) => setEr(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Quotation Estimate (VND)</span>
                {!isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    <Lock className="w-2.5 h-2.5" /> Admin Only
                  </span>
                )}
              </label>
              {isAdmin ? (
                <input
                  type="number"
                  value={quotation}
                  onChange={(e) => setQuotation(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ) : (
                <div className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 flex items-center gap-2 cursor-not-allowed">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Configured by administrators only</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Partnership Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="Active Partnership">Active Partnership</option>
                <option value="Newly Scouted (Potential)">Newly Scouted (Potential)</option>
                <option value="Contacted">Contacted</option>
                <option value="Paused">Paused</option>
                <option value="Warning / Needs Attention">Warning / Needs Attention</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Profile Link / Social URL
            </label>
            <input
              type="url"
              placeholder="https://facebook.com/..., https://instagram.com/..."
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Hotline / Manager Contact / Booking
            </label>
            <input
              type="text"
              placeholder="Phone, Zalo, or manager contact..."
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Bio / Introduction / Highlights
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Certified fitness coach, freestyle footballer, #pickleball..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-md shadow-indigo-200 flex items-center space-x-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Save KOL to Supabase</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 4. MODAL: ADD NEW COMMUNITY & SPORTS CLUB
// ==========================================
export interface AddCommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const COMMUNITY_SPORTS = [
  "Pickleball",
  "Tennis",
  "Running / Marathon",
  "Gym & Fitness",
  "Badminton",
  "Football",
  "Cycling",
  "Golf",
  "Others",
];

export const COMMUNITY_PURPOSES = [
  "Match Finding & Socializing",
  "Gear & Racket Trading",
  "Amateur Tournaments",
  "Skill & Technique Sharing",
];

export function AddCommunityModal({
  isOpen,
  onClose,
  onSuccess,
}: AddCommunityModalProps) {
  const { isAdmin } = useCurrentUser();
  const [name, setName] = useState("");
  const [selectedSports, setSelectedSports] = useState<string[]>(["Pickleball"]);
  const [geography, setGeography] = useState("Nationwide");
  const [members, setMembers] = useState(10000);
  const [platform, setPlatform] = useState("Facebook Group");
  const [activityLevel, setActivityLevel] = useState(
    "Very Active (> 20 posts/day)"
  );
  const [privacy, setPrivacy] = useState("Public");
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([
    "Match Finding & Socializing",
    "Amateur Tournaments",
  ]);
  const [adminContact, setAdminContact] = useState("");
  const [pricePerPin, setPricePerPin] = useState(2000000);
  const [status, setStatus] = useState("Active Partnership");
  const [groupUrl, setGroupUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // URL Auto-scout state
  const [scoutUrl, setScoutUrl] = useState("");
  const [isScoutingUrl, setIsScoutingUrl] = useState(false);
  const [scoutStatusMsg, setScoutStatusMsg] = useState("");
  const scoutInputRef = React.useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleScoutCommunityUrl = async () => {
    const targetUrl = (scoutUrl || scoutInputRef.current?.value || "").trim();
    if (!targetUrl) {
      toast.error("Please enter a group link to scout (e.g. Facebook Group, Strava Club, Zalo)");
      return;
    }
    setIsScoutingUrl(true);
    setScoutStatusMsg("Scouting group metadata & estimating community engagement...");
    try {
      const res = await fetch("/api/sport-hub/scout/inspect-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, type: "community" }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        if (d.name) setName(d.name);
        if (d.sport && Array.isArray(d.sport) && d.sport.length > 0) setSelectedSports(d.sport);
        if (d.platform) setPlatform(d.platform);
        if (d.geography) setGeography(d.geography);
        if (typeof d.members === "number") setMembers(d.members);
        if (d.activityLevel) setActivityLevel(d.activityLevel);
        if (d.privacy) setPrivacy(d.privacy);
        if (d.purpose && Array.isArray(d.purpose) && d.purpose.length > 0) setSelectedPurposes(d.purpose);
        if (d.adminContact) setAdminContact(d.adminContact);
        if (typeof d.pricePerPin === "number" && isAdmin) setPricePerPin(d.pricePerPin);
        if (d.status) setStatus(d.status);
        setGroupUrl(targetUrl);
        setScoutUrl(targetUrl);
        setScoutStatusMsg("Community inspected & autofilled! Review and adjust details below.");
        toast.success("Community scouted! Review the details below before submitting.");
      } else {
        toast.error(result.error || "Could not scout community URL");
        setScoutStatusMsg("");
      }
    } catch {
      toast.error("Failed to connect to scout inspector");
      setScoutStatusMsg("");
    } finally {
      setIsScoutingUrl(false);
    }
  };

  const toggleSport = (sport: string) => {
    if (selectedSports.includes(sport)) {
      if (selectedSports.length > 1) {
        setSelectedSports(selectedSports.filter((s) => s !== sport));
      }
    } else {
      setSelectedSports([...selectedSports, sport]);
    }
  };

  const togglePurpose = (pur: string) => {
    if (selectedPurposes.includes(pur)) {
      if (selectedPurposes.length > 1) {
        setSelectedPurposes(selectedPurposes.filter((p) => p !== pur));
      }
    } else {
      setSelectedPurposes([...selectedPurposes, pur]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter Community / Club Name!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "community",
          data: {
            name,
            sport: selectedSports,
            geography,
            members,
            platform,
            activityLevel,
            privacy,
            purpose: selectedPurposes,
            adminContact,
            pricePerPin: isAdmin ? pricePerPin : 0,
            status,
            groupUrl,
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("Community / Club added successfully to Supabase!");
        onSuccess();
        onClose();
        setName("");
        setGroupUrl("");
        setAdminContact("");
        setScoutUrl("");
        setScoutStatusMsg("");
      } else {
        toast.error(result.error || "Failed to create community");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-800 to-slate-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Add New Sports Community & Club
              </h3>
              <p className="text-xs text-purple-200 mt-0.5">
                Paste link to auto-scout or fill manually directly into Supabase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Quick Auto-fill from URL banner */}
          <div className="p-3.5 bg-gradient-to-r from-purple-50/80 via-indigo-50/60 to-slate-50 border border-purple-100/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-purple-950">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>Auto-fill from Community / Group URL</span>
              </div>
              <span className="text-[10px] font-medium text-purple-600 bg-purple-100/70 px-2 py-0.5 rounded-full">
                Facebook Group, Strava, Telegram, Zalo
              </span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  ref={scoutInputRef}
                  type="url"
                  placeholder="Paste Facebook Group, Strava Club, or community link..."
                  value={scoutUrl}
                  onChange={(e) => setScoutUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleScoutCommunityUrl();
                    }
                  }}
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-purple-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <button
                type="button"
                onClick={handleScoutCommunityUrl}
                disabled={isScoutingUrl}
                className="px-3.5 py-2 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded-lg transition flex items-center space-x-1.5 disabled:opacity-50 shrink-0 shadow-sm shadow-purple-200"
              >
                {isScoutingUrl ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Scouting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Scout & Fill</span>
                  </>
                )}
              </button>
            </div>
            {scoutStatusMsg && (
              <p className="text-[11px] text-purple-700 flex items-center space-x-1 font-medium animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{scoutStatusMsg}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Community / Group Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Vietnam Pickleball Community, Hanoi Running Club..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Club Sports Discipline
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMUNITY_SPORTS.map((sport) => {
                const active = selectedSports.includes(sport);
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => toggleSport(sport)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${
                      active
                        ? "bg-purple-600 text-white border-purple-600 font-semibold"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {sport}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="Facebook Group">Facebook Group</option>
                <option value="Zalo Community">Zalo Community</option>
                <option value="Strava Club">Strava Club</option>
                <option value="Telegram">Telegram</option>
                <option value="Others">Others</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Region / Location
              </label>
              <select
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="Nationwide">Nationwide</option>
                <option value="Hanoi">Hanoi</option>
                <option value="Ho Chi Minh City">Ho Chi Minh City</option>
                <option value="Da Nang">Da Nang</option>
                <option value="Northern Region">Northern Region</option>
                <option value="Southern Region">Southern Region</option>
                <option value="Others">Others</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Member Count
              </label>
              <input
                type="number"
                value={members}
                onChange={(e) => setMembers(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Activity Level
              </label>
              <select
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="Very Active (> 20 posts/day)">
                  Very Active (&gt; 20 posts/day)
                </option>
                <option value="Moderate (5 - 10 posts/day)">
                  Moderate (5 - 10 posts/day)
                </option>
                <option value="Low Activity (< 1 post/week)">
                  Low Activity (&lt; 1 post/week)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Privacy
              </label>
              <select
                value={privacy}
                onChange={(e) => setPrivacy(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="Public">Public</option>
                <option value="Private">Private</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Operating Purpose of the Group
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMUNITY_PURPOSES.map((pur) => {
                const active = selectedPurposes.includes(pur);
                return (
                  <button
                    key={pur}
                    type="button"
                    onClick={() => togglePurpose(pur)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${
                      active
                        ? "bg-purple-100 text-purple-800 border-purple-300 font-semibold"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {pur}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Group URL
            </label>
            <input
              type="url"
              placeholder="https://facebook.com/groups/..."
              value={groupUrl}
              onChange={(e) => setGroupUrl(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Pin Post Fee / Month (VND)</span>
                {!isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    <Lock className="w-2.5 h-2.5" /> Admin Only
                  </span>
                )}
              </label>
              {isAdmin ? (
                <input
                  type="number"
                  value={pricePerPin}
                  onChange={(e) => setPricePerPin(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              ) : (
                <div className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 flex items-center gap-2 cursor-not-allowed">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Configured by administrators only</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Partnership Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="Active Partnership">Active Partnership</option>
                <option value="Potential">Potential</option>
                <option value="Paused">Paused</option>
                <option value="Warning">Warning</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Admin / Contact Point
            </label>
            <input
              type="text"
              placeholder="e.g. Alex Nguyen (FB Admin: alex.pickleball) - Phone: 0912xxx..."
              value={adminContact}
              onChange={(e) => setAdminContact(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition shadow-md shadow-purple-200 flex items-center space-x-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5" />
                  <span>Save Community to Supabase</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 4B. MODAL: EDIT SPORTS COMMUNITY & CLUB
// ==========================================
export interface EditCommunityModalProps {
  isOpen: boolean;
  community: any | null;
  onClose: () => void;
  onSuccess: (updatedCommunity: any) => void;
}

export function EditCommunityModal({
  isOpen,
  community,
  onClose,
  onSuccess,
}: EditCommunityModalProps) {
  const { isAdmin } = useCurrentUser();
  const [name, setName] = useState("");
  const [selectedSports, setSelectedSports] = useState<string[]>(["Pickleball"]);
  const [geography, setGeography] = useState("Nationwide");
  const [members, setMembers] = useState(10000);
  const [platform, setPlatform] = useState("Facebook Group");
  const [activityLevel, setActivityLevel] = useState(
    "Very Active (> 20 posts/day)"
  );
  const [privacy, setPrivacy] = useState("Public");
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([
    "Match Finding & Socializing",
    "Amateur Tournaments",
  ]);
  const [adminContact, setAdminContact] = useState("");
  const [pricePerPin, setPricePerPin] = useState(2000000);
  const [status, setStatus] = useState("Active Partnership");
  const [groupUrl, setGroupUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (community) {
      setName(community.name || "");
      setSelectedSports(
        community.sport && community.sport.length > 0
          ? community.sport
          : ["Pickleball"]
      );
      setGeography(community.geography || "Nationwide");
      setMembers(community.members || 0);
      setPlatform(community.platform || "Facebook Group");
      setActivityLevel(
        community.activityLevel || "Very Active (> 20 posts/day)"
      );
      setPrivacy(community.privacy || "Public");
      setSelectedPurposes(
        community.purpose && community.purpose.length > 0
          ? community.purpose
          : ["Match Finding & Socializing"]
      );
      setAdminContact(community.adminContact || "");
      setPricePerPin(community.pricePerPin || 0);
      setStatus(community.status || "Active Partnership");
      setGroupUrl(
        community.groupUrl && community.groupUrl !== "#" ? community.groupUrl : ""
      );
    }
  }, [community, isOpen]);

  if (!isOpen || !community) return null;

  const toggleSport = (sport: string) => {
    if (selectedSports.includes(sport)) {
      if (selectedSports.length > 1) {
        setSelectedSports(selectedSports.filter((s) => s !== sport));
      }
    } else {
      setSelectedSports([...selectedSports, sport]);
    }
  };

  const togglePurpose = (pur: string) => {
    if (selectedPurposes.includes(pur)) {
      if (selectedPurposes.length > 1) {
        setSelectedPurposes(selectedPurposes.filter((p) => p !== pur));
      }
    } else {
      setSelectedPurposes([...selectedPurposes, pur]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter Community / Club Name!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/record", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "community",
          id: community.id,
          data: {
            name,
            sport: selectedSports,
            geography,
            members,
            platform,
            activityLevel,
            privacy,
            purpose: selectedPurposes,
            adminContact,
            ...(isAdmin ? { pricePerPin } : {}),
            status,
            groupUrl,
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`Updated community "${name}" successfully!`);
        onSuccess({
          ...community,
          name,
          sport: selectedSports,
          geography,
          members,
          platform,
          activityLevel,
          privacy,
          purpose: selectedPurposes,
          adminContact,
          ...(isAdmin ? { pricePerPin } : {}),
          status,
          groupUrl,
        });
        onClose();
      } else {
        toast.error(result.error || "Failed to update community");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-800 via-indigo-800 to-slate-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Edit Sports Community & Club
              </h3>
              <p className="text-xs text-purple-200 mt-0.5">
                Update parameters, member metrics, admin contact & pin fee in Supabase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Community / Group Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Club Sports Discipline
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                "Pickleball",
                "Tennis",
                "Running / Marathon",
                "Gym & Fitness",
                "Badminton",
                "Football",
                "Cycling",
                "Golf",
              ].map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => toggleSport(sp)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                    selectedSports.includes(sp)
                      ? "bg-purple-50 text-purple-700 border-purple-300 font-bold"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {selectedSports.includes(sp) ? "✓ " : "+ "}
                  {sp}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Primary Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="Facebook Group">Facebook Group</option>
                <option value="Zalo Community">Zalo Community</option>
                <option value="Strava Club">Strava Club</option>
                <option value="Telegram Group">Telegram Group</option>
                <option value="TikTok Community">TikTok Community</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Member Count
              </label>
              <input
                type="number"
                value={members}
                onChange={(e) => setMembers(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Activity Level
              </label>
              <select
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="Very Active (> 20 posts/day)">
                  Very Active (&gt; 20 posts/day)
                </option>
                <option value="Moderate (5-20 posts/day)">
                  Moderate (5-20 posts/day)
                </option>
                <option value="Low Activity (< 5 posts/day)">
                  Low Activity (&lt; 5 posts/day)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Commercial Pinned Post Rate (VND)</span>
                {!isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    <Lock className="w-2.5 h-2.5" /> Admin Only
                  </span>
                )}
              </label>
              {isAdmin ? (
                <input
                  type="number"
                  step="500000"
                  value={pricePerPin}
                  onChange={(e) => setPricePerPin(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              ) : (
                <div className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 flex items-center gap-2 cursor-not-allowed">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Configured by administrators only</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Geography / Region
              </label>
              <select
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="Nationwide">Nationwide</option>
                <option value="Hanoi">Hanoi</option>
                <option value="Ho Chi Minh City">Ho Chi Minh City</option>
                <option value="Da Nang">Da Nang</option>
                <option value="Can Tho">Can Tho</option>
                <option value="Hai Phong">Hai Phong</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Partnership Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="Active Partnership">Active Partnership</option>
                <option value="Potential">Potential</option>
                <option value="New Scout (Unverified)">
                  New Scout (Unverified)
                </option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Operating Activities & Purpose
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                "Match Finding & Socializing",
                "Amateur Tournaments",
                "Gear & Equipment Trading",
                "Skill Coaching & Training",
              ].map((pur) => (
                <button
                  key={pur}
                  type="button"
                  onClick={() => togglePurpose(pur)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                    selectedPurposes.includes(pur)
                      ? "bg-purple-50 text-purple-700 border-purple-300 font-bold"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {selectedPurposes.includes(pur) ? "✓ " : "+ "}
                  {pur}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Official Group / Channel URL
            </label>
            <input
              type="url"
              placeholder="https://facebook.com/groups/..."
              value={groupUrl}
              onChange={(e) => setGroupUrl(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Admin / Contact Point
            </label>
            <input
              type="text"
              placeholder="e.g. Alex Nguyen (FB Admin: alex.pickleball) - Phone: 0912xxx..."
              value={adminContact}
              onChange={(e) => setAdminContact(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span>Audit Trail</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition shadow-md shadow-purple-200 flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Update Community Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {historyOpen && (
        <AuditTrailModal
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          entity="community"
          entityId={community.id}
          title={community.name}
        />
      )}
    </div>
  );
}

// ==========================================
// 5. MODAL: CREATE NEW CAMPAIGN / PROJECT
// ==========================================
export interface AddProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddProjectModal({
  isOpen,
  onClose,
  onSuccess,
}: AddProjectModalProps) {
  const { isAdmin } = useCurrentUser();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("Sport Booking Hub");
  const [budget, setBudget] = useState(100000000);
  const [pic, setPic] = useState("");
  const [sport, setSport] = useState("Pickleball");
  const [region, setRegion] = useState("Toàn quốc");
  const [objective, setObjective] = useState("");
  const [status, setStatus] = useState("Planning");
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter Campaign / Project Name!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "project",
          data: {
            name,
            brand,
            brands: brand.split(",").map((s) => s.trim()).filter(Boolean),
            budget: isAdmin ? budget : 0,
            pic,
            sport: [sport],
            region,
            objective,
            status,
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("Campaign / Project created successfully in Supabase!");
        onSuccess();
        onClose();
        setName("");
        setObjective("");
      } else {
        toast.error(result.error || "Failed to create project");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Create New Campaign & Project
              </h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                Track budget and timeline progress on Table 3 in Supabase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Campaign / Project Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Summer Pickleball Championship 2026..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Participating Brands / Sponsors (comma separated)
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Nike Running VN, Pocari Sweat, Franklin..."
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Target Budget (VND)</span>
                {!isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    <Lock className="w-2.5 h-2.5" /> Admin Only
                  </span>
                )}
              </label>
              {isAdmin ? (
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              ) : (
                <div className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 flex items-center gap-2 cursor-not-allowed">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Configured by administrators only</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TeamMemberSelect
              label="Person in Charge (PIC)"
              value={pic}
              onChange={(name) => setPic(name)}
              autoDefaultCurrent={true}
            />

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Project Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="Planning">Planning</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Settled">Settled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Sport Discipline
              </label>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="Pickleball">Pickleball</option>
                <option value="Chạy bộ">Running / Marathon</option>
                <option value="Bóng đá">Football</option>
                <option value="Cầu lông">Badminton</option>
                <option value="Tennis">Tennis</option>
                <option value="Bóng rổ">Basketball</option>
                <option value="Đạp xe">Cycling</option>
                <option value="Bơi lội">Swimming</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Region / Location
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="Toàn quốc">Nationwide</option>
                <option value="Hà Nội">Hanoi</option>
                <option value="TP. Hồ Chí Minh">Ho Chi Minh City</option>
                <option value="Đà Nẵng">Da Nang</option>
                <option value="Miền Bắc">Northern Region</option>
                <option value="Miền Nam">Southern Region</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Main Campaign Objective
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Recruit 200 competing teams, achieve 500k social reach, 50 UGC video reviews..."
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition shadow-md shadow-emerald-200 flex items-center space-x-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating project...</span>
                </>
              ) : (
                <>
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Save Campaign to Supabase</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 5B. MODAL: EDIT CAMPAIGN / PROJECT
// ==========================================
export interface EditProjectModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onSuccess: (updated: Project) => void;
}

export function EditProjectModal({
  isOpen,
  project,
  onClose,
  onSuccess,
}: EditProjectModalProps) {
  const { isAdmin } = useCurrentUser();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [budget, setBudget] = useState(100000000);
  const [pic, setPic] = useState("");
  const [objective, setObjective] = useState("");
  const [status, setStatus] = useState("Planning");
  const [sport, setSport] = useState("Pickleball");
  const [region, setRegion] = useState("Toàn quốc");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name || "");
      setBrand(
        project.brands && project.brands.length > 0
          ? project.brands.join(", ")
          : project.brand || ""
      );
      setBudget(project.budget || 0);
      setPic(project.pic || "");
      setObjective(project.objective || "");
      setStatus(project.status || "Planning");
      setSport(project.sport && project.sport.length > 0 ? project.sport[0] : "Pickleball");
      setRegion(project.region || "Toàn quốc");
      setStartDate(project.startDate || "");
      setEndDate(project.endDate || "");
    }
  }, [project]);

  if (!isOpen || !project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter Campaign / Project Name!");
      return;
    }

    setSubmitting(true);
    const brandList = brand
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const updatePayload: Record<string, any> = {
      name: name.trim(),
      brand: brandList[0] || brand.trim() || "Sport Booking Hub",
      brands: brandList.length > 0 ? brandList : ["Sport Booking Hub"],
      pic: pic.trim(),
      objective: objective.trim(),
      status,
      sport: [sport],
      region,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };
    if (isAdmin) {
      updatePayload.budget = Number(budget) || 0;
    }

    try {
      const res = await fetch("/api/sport-hub/record", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "project",
          id: project.id,
          data: updatePayload,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("Campaign updated successfully!");
        onSuccess({
          ...project,
          ...updatePayload,
        });
        onClose();
      } else {
        toast.error(result.error || "Failed to update campaign");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Edit Campaign Details</h3>
              <p className="text-[11px] text-slate-500">
                Update sponsorship brands, budget allocation, PIC, and campaign objectives
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Campaign Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Campaign / Project Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Giải Vô Địch Pickleball Mùa Hè 2026"
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Brands & Budget */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Participating Brands (comma-separated)
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Nike Running VN, Garmin Vietnam"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Support multiple sponsors separated by commas
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>Total Campaign Budget (VND)</span>
                {!isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    <Lock className="w-2.5 h-2.5" /> Admin Only
                  </span>
                )}
              </label>
              {isAdmin ? (
                <div className="relative">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="number"
                    min="0"
                    step="1000000"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                  />
                </div>
              ) : (
                <div className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 flex items-center gap-2 cursor-not-allowed">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Configured by administrators only</span>
                </div>
              )}
            </div>
          </div>

          {/* PIC & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TeamMemberSelect
              label="Person in Charge (PIC)"
              value={pic}
              onChange={(name) => setPic(name)}
              autoDefaultCurrent={false}
            />

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Campaign Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
              >
                <option value="Planning">Planning (Lên kế hoạch)</option>
                <option value="In Progress">In Progress (Đang triển khai)</option>
                <option value="Completed">Completed (Đã hoàn thành)</option>
                <option value="Settled">Settled (Đã quyết toán)</option>
              </select>
            </div>
          </div>

          {/* Sport & Region */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Sport Discipline
              </label>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
              >
                <option value="Pickleball">Pickleball</option>
                <option value="Chạy bộ">Running / Marathon</option>
                <option value="Bóng đá">Football</option>
                <option value="Cầu lông">Badminton</option>
                <option value="Tennis">Tennis</option>
                <option value="Bóng rổ">Basketball</option>
                <option value="Đạp xe">Cycling</option>
                <option value="Bơi lội">Swimming</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Region / Location
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
              >
                <option value="Toàn quốc">Nationwide</option>
                <option value="Hà Nội">Hanoi</option>
                <option value="TP. Hồ Chí Minh">Ho Chi Minh City</option>
                <option value="Đà Nẵng">Da Nang</option>
                <option value="Miền Bắc">Northern Region</option>
                <option value="Miền Nam">Southern Region</option>
              </select>
            </div>
          </div>

          {/* Timeline: Start Date & End Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Start Date
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                End Date
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Objectives & Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Main Campaign Objective & Scope
            </label>
            <textarea
              rows={3}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g. Thu hút 200 đội tham gia, phủ sóng 500k lượt tiếp cận trên mạng xã hội..."
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span>Audit Trail</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition shadow-md shadow-amber-200 flex items-center space-x-1.5 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving changes...</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Update Campaign</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {historyOpen && (
        <AuditTrailModal
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          entity="project"
          entityId={project.id}
          title={project.name}
        />
      )}
    </div>
  );
}

// ==========================================
// 6. MODAL: EDIT KOL PROFILE
// ==========================================
export interface EditableKol {
  id: string;
  name: string;
  sport: string[];
  tier: string;
  platform: string;
  geography: string;
  followers: number;
  avgViews: number;
  er: number;
  quotation: number;
  status: string;
  info?: string;
  profileUrl?: string;
}

export interface EditKolModalProps {
  isOpen: boolean;
  kol: EditableKol | null;
  onClose: () => void;
  onSuccess: (updated: EditableKol) => void;
}

export function EditKolModal({
  isOpen,
  kol,
  onClose,
  onSuccess,
}: EditKolModalProps) {
  const { isAdmin } = useCurrentUser();
  const [name, setName] = useState("");
  const [selectedSports, setSelectedSports] = useState<string[]>(["Pickleball"]);
  const [tier, setTier] = useState("Micro (10k - 50k)");
  const [platform, setPlatform] = useState("Facebook");
  const [geography, setGeography] = useState("Nationwide");
  const [followers, setFollowers] = useState(25000);
  const [avgViews, setAvgViews] = useState(10000);
  const [er, setEr] = useState(4.5);
  const [quotation, setQuotation] = useState(15000000);
  const [status, setStatus] = useState("Active Partnership");
  const [profileUrl, setProfileUrl] = useState("");
  const [contact, setContact] = useState("");
  const [bio, setBio] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (kol) {
      setName(kol.name || "");
      setSelectedSports(
        kol.sport && kol.sport.length > 0 ? kol.sport : ["Pickleball"]
      );
      setTier(kol.tier || "Micro (10k - 50k)");
      setPlatform(kol.platform || "Facebook");
      setGeography(kol.geography || "Nationwide");
      setFollowers(kol.followers || 0);
      setAvgViews(kol.avgViews || 0);
      setEr(kol.er || 0);
      setQuotation(kol.quotation || 0);
      setStatus(kol.status || "Active Partnership");
      setProfileUrl(kol.profileUrl && kol.profileUrl !== "#" ? kol.profileUrl : "");
      setContact(kol.info || "");
    }
  }, [kol]);

  if (!isOpen || !kol) return null;

  const toggleSport = (sport: string) => {
    if (selectedSports.includes(sport)) {
      if (selectedSports.length > 1) {
        setSelectedSports(selectedSports.filter((s) => s !== sport));
      }
    } else {
      setSelectedSports([...selectedSports, sport]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter KOL Name!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/record", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "kol",
          id: kol.id,
          data: {
            name,
            sport: selectedSports,
            tier,
            platform,
            geography,
            followers,
            avgViews,
            er,
            ...(isAdmin ? { quotation } : {}),
            status,
            profileUrl,
            contact,
            bio,
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("KOL profile updated successfully on Supabase!");
        onSuccess({
          ...kol,
          name,
          sport: selectedSports,
          tier,
          platform,
          geography,
          followers,
          avgViews,
          er,
          ...(isAdmin ? { quotation } : {}),
          status,
          info: contact || kol.info,
          profileUrl: profileUrl || kol.profileUrl,
        });
        onClose();
      } else {
        toast.error(result.error || "Failed to update KOL profile");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white shadow-inner">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Edit KOL / Athlete Profile
              </h3>
              <p className="text-xs text-indigo-100 mt-0.5">
                Update information and sync directly to Supabase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              KOL Name / Channel <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Hoang Dang Phan, Hana Giang Anh..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Specialized Sports
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SPORT_OPTIONS.map((sport) => {
                const active = selectedSports.includes(sport);
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => toggleSport(sport)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${
                      active
                        ? "bg-blue-600 text-white border-blue-600 font-semibold shadow-sm"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {sport}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Tier
              </label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="Nano (< 10k)">Nano (&lt; 10k)</option>
                <option value="Micro (10k - 50k)">Micro (10k - 50k)</option>
                <option value="Macro (50k - 200k)">Macro (50k - 200k)</option>
                <option value="Mega (> 200k)">Mega (&gt; 200k)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Primary Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="YouTube">YouTube</option>
                <option value="Threads">Threads</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Region / Location
              </label>
              <select
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="Nationwide">Nationwide</option>
                <option value="Hanoi">Hanoi</option>
                <option value="Ho Chi Minh City">Ho Chi Minh City</option>
                <option value="Da Nang">Da Nang</option>
                <option value="Northern Region">Northern Region</option>
                <option value="Southern Region">Southern Region</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Followers
              </label>
              <input
                type="number"
                value={followers}
                onChange={(e) => setFollowers(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Avg Views
              </label>
              <input
                type="number"
                value={avgViews}
                onChange={(e) => setAvgViews(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ER % (Engagement)
              </label>
              <input
                type="number"
                step="0.1"
                value={er}
                onChange={(e) => setEr(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>Quotation Estimate (VND)</span>
                {!isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    <Lock className="w-2.5 h-2.5" /> Admin Only
                  </span>
                )}
              </label>
              {isAdmin ? (
                <input
                  type="number"
                  value={quotation}
                  onChange={(e) => setQuotation(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 flex items-center gap-2 cursor-not-allowed">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Configured by administrators only</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Partnership Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="Active Partnership">Active Partnership</option>
                <option value="Approaching / In Contact">Approaching / In Contact</option>
                <option value="Not Contacted">Not Contacted</option>
                <option value="Paused">Paused</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Profile Link / Social URL
            </label>
            <input
              type="url"
              placeholder="https://instagram.com/... or https://facebook.com/..."
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Contact Info / Manager / Phone
            </label>
            <input
              type="text"
              placeholder="e.g. Phone: 0912.xxx.xxx - Manager: Mrs. Sarah"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span>Audit Trail</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition shadow-md shadow-blue-200 flex items-center space-x-1.5 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving changes...</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Update on Supabase</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {historyOpen && (
        <AuditTrailModal
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          entity="kol"
          entityId={kol.id}
          title={kol.name}
        />
      )}
    </div>
  );
}

// ==========================================
// 7. MODAL: DELETE CONFIRMATION
// ==========================================
export interface DeleteConfirmModalProps {
  isOpen: boolean;
  itemTitle?: string;
  itemName: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  loading?: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  itemTitle = "KOL profile",
  itemName,
  onClose,
  onConfirm,
  loading = false,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden">
        <div className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center border-4 border-rose-100">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-base font-bold text-slate-900">
              Confirm Data Deletion
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Are you sure you want to delete {itemTitle}{" "}
              <strong className="text-rose-600 font-bold">"{itemName}"</strong>{" "}
              from the system? This record will also be permanently removed from
              the corresponding table on Supabase. This action cannot be undone!
            </p>
          </div>

          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition shadow-md shadow-rose-200 flex items-center space-x-1.5 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirm Delete</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 8. MODAL: ADD NEW VIRAL POST
// ==========================================
export interface AddPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddPostModal({ isOpen, onClose, onSuccess }: AddPostModalProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [platform, setPlatform] = useState("TikTok Video");
  const [sport, setSport] = useState("Pickleball");
  const [postUrl, setPostUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [views, setViews] = useState(50000);
  const [likes, setLikes] = useState(2500);
  const [comments, setComments] = useState(120);
  const [er, setEr] = useState(5.2);
  const [viralTier, setViralTier] = useState("High Engagement (10k - 100k views)");
  const [hashtags, setHashtags] = useState("#pickleball #sports");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // URL Auto-scout state
  const [scoutUrl, setScoutUrl] = useState("");
  const [isScoutingUrl, setIsScoutingUrl] = useState(false);
  const [scoutStatusMsg, setScoutStatusMsg] = useState("");
  const scoutInputRef = React.useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleScoutPostUrl = async () => {
    const targetUrl = (scoutUrl || scoutInputRef.current?.value || "").trim();
    if (!targetUrl) {
      toast.error("Please enter a post or video link to scout (e.g. TikTok, Reels, YouTube)");
      return;
    }
    setIsScoutingUrl(true);
    setScoutStatusMsg("Scouting social video metadata & viral engagement metrics...");
    try {
      const res = await fetch("/api/sport-hub/scout/inspect-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, type: "post" }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        if (d.title) setTitle(d.title);
        if (d.author) setAuthor(d.author);
        if (d.platform) setPlatform(d.platform);
        if (d.sport) setSport(d.sport);
        if (typeof d.views === "number") setViews(d.views);
        if (typeof d.likes === "number") setLikes(d.likes);
        if (typeof d.comments === "number") setComments(d.comments);
        if (typeof d.er === "number") setEr(d.er);
        if (d.viralTier) setViralTier(d.viralTier);
        if (d.hashtags) setHashtags(d.hashtags);
        if (d.thumbnailUrl) setThumbnailUrl(d.thumbnailUrl);
        setPostUrl(targetUrl);
        setScoutUrl(targetUrl);
        setScoutStatusMsg("Post inspected & autofilled! Review and adjust details below.");
        toast.success("Post scouted! Review the details below before submitting.");
      } else {
        toast.error(result.error || "Could not scout post URL");
        setScoutStatusMsg("");
      }
    } catch {
      toast.error("Failed to connect to scout inspector");
      setScoutStatusMsg("");
    } finally {
      setIsScoutingUrl(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter post title or caption!");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/sport-hub/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "post",
          data: {
            title,
            author,
            platform,
            sport,
            postUrl,
            thumbnailUrl,
            views,
            likes,
            comments,
            er,
            viralTier,
            hashtags,
            notes,
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("Viral post added successfully to Supabase!");
        onSuccess();
        onClose();
        setTitle("");
        setAuthor("");
        setPostUrl("");
        setThumbnailUrl("");
        setNotes("");
        setScoutUrl("");
        setScoutStatusMsg("");
      } else {
        toast.error(result.error || "Failed to create post record");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-600 via-pink-600 to-indigo-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Track New Viral Sport Post
              </h3>
              <p className="text-xs text-rose-100 mt-0.5">
                Paste video link to auto-scout or fill manually into Supabase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Quick Auto-fill from URL banner */}
          <div className="p-3.5 bg-gradient-to-r from-rose-50/80 via-pink-50/60 to-slate-50 border border-rose-100/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-rose-950">
                <Sparkles className="w-3.5 h-3.5 text-rose-600" />
                <span>Auto-fill from Video / Post URL</span>
              </div>
              <span className="text-[10px] font-medium text-rose-600 bg-rose-100/70 px-2 py-0.5 rounded-full">
                TikTok, Reels, Shorts, Facebook
              </span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  ref={scoutInputRef}
                  type="url"
                  placeholder="Paste TikTok video, Instagram Reel, YouTube Shorts link..."
                  value={scoutUrl}
                  onChange={(e) => setScoutUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleScoutPostUrl();
                    }
                  }}
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-rose-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <button
                type="button"
                onClick={handleScoutPostUrl}
                disabled={isScoutingUrl}
                className="px-3.5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition flex items-center space-x-1.5 disabled:opacity-50 shrink-0 shadow-sm shadow-rose-200"
              >
                {isScoutingUrl ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Scouting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Scout & Fill</span>
                  </>
                )}
              </button>
            </div>
            {scoutStatusMsg && (
              <p className="text-[11px] text-rose-700 flex items-center space-x-1 font-medium animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{scoutStatusMsg}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Post Title / Caption <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Crazy smash technique in tournament finals..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Creator / Channel Name
              </label>
              <input
                type="text"
                placeholder="e.g. Do Kim Phuc, Pickleball Pro..."
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Sport Discipline
              </label>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
              >
                <option value="Pickleball">Pickleball</option>
                <option value="Tennis">Tennis</option>
                <option value="Running">Running</option>
                <option value="Football">Football</option>
                <option value="Badminton">Badminton</option>
                <option value="Gym & Fitness">Gym & Fitness</option>
                <option value="Cycling">Cycling</option>
                <option value="Golf">Golf</option>
                <option value="Others">Others</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
              >
                <option value="TikTok Video">TikTok Video</option>
                <option value="Instagram Reels">Instagram Reels</option>
                <option value="Facebook Reels">Facebook Reels</option>
                <option value="YouTube Shorts">YouTube Shorts</option>
                <option value="Instagram Post">Instagram Post</option>
                <option value="Facebook Post">Facebook Post</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Viral Tier
              </label>
              <select
                value={viralTier}
                onChange={(e) => setViralTier(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
              >
                <option value="Super Viral (> 100k views)">Super Viral (&gt; 100k views)</option>
                <option value="High Engagement (10k - 100k views)">High Engagement (10k - 100k views)</option>
                <option value="Standard">Standard</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Views
              </label>
              <input
                type="number"
                value={views}
                onChange={(e) => setViews(Number(e.target.value))}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Likes
              </label>
              <input
                type="number"
                value={likes}
                onChange={(e) => setLikes(Number(e.target.value))}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Comments
              </label>
              <input
                type="number"
                value={comments}
                onChange={(e) => setComments(Number(e.target.value))}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ER %
              </label>
              <input
                type="number"
                step="0.1"
                value={er}
                onChange={(e) => setEr(Number(e.target.value))}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Post URL / Permalink
            </label>
            <input
              type="url"
              placeholder="https://tiktok.com/@user/video/... or https://instagram.com/reel/..."
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Thumbnail Image URL
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Hashtags
              </label>
              <input
                type="text"
                placeholder="#pickleball #sports #fitness"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Campaign Notes / Insights
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Great video angle for shoes or apparel seeding, high organic shares..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition shadow-md shadow-rose-200 flex items-center space-x-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Film className="w-3.5 h-3.5" />
                  <span>Save Post to Supabase</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


