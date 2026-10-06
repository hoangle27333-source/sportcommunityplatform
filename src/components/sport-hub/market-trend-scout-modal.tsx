"use client";

import { useEffect, useState } from "react";
import {
  Hash,
  Search,
  Sparkles,
  Check,
  AlertCircle,
  Link2,
  Info,
} from "lucide-react";
import { scoutFetch } from "@/lib/apify/scout-client";
import { taskRequest } from "@/lib/apify/scout-workspace";
import { ScoutDialogFrame, scoutInputClass } from "./scout-dialog-frame";
import { useScoutCapabilities } from "./use-scout-capabilities";
import { PlatformIcon } from "./platform-icon";

export interface MarketTrendScoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result?: any) => void;
  initialCriteria?: Record<string, any>;
  source?: string;
}

const SUGGESTED_TAGS = [
  "#pickleballvietnam",
  "#marathonsaigon",
  "#badmintonvietnam",
  "#gymfitness",
  "#tennisvietnam",
  "#chaybo",
];

const SUGGESTED_KEYWORDS = [
  "Pickleball Vietnam",
  "Marathon Saigon",
  "Badminton Vietnam",
  "Gym & Fitness",
  "Tennis Vietnam",
  "Running Club",
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
  {
    id: "Instagram",
    label: "Instagram",
    description: "Reels & Posts (Hashtag)",
  },
  {
    id: "TikTok",
    label: "TikTok",
    description: "Videos & Trends (Hashtag or Keyword)",
  },
  {
    id: "Facebook",
    label: "Facebook",
    description: "Reels & Public Posts (Keyword)",
  },
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
  initialCriteria = {},
  source,
}: MarketTrendScoutModalProps) {
  const [searchMode, setSearchMode] = useState<"hashtag" | "keyword">(
    initialCriteria.searchMode || "hashtag"
  );
  const [qualityMode,setQualityMode]=useState<'high-engagement'|'topic'>(initialCriteria.qualityMode || 'high-engagement');
  const [minInteractions,setMinInteractions]=useState(initialCriteria.minInteractions ?? 100);
  const [minViews,setMinViews]=useState(initialCriteria.minViews ?? 10000);
  const [recentDays,setRecentDays]=useState(initialCriteria.recentDays ?? 7);
  const [keyword, setKeyword] = useState<string>(initialCriteria.keyword || "");
  const [sport, setSport] = useState<string[]>(
    initialCriteria.sport
      ? typeof initialCriteria.sport === "string"
        ? [initialCriteria.sport]
        : initialCriteria.sport
      : ["Pickleball"]
  );
  const [geography, setGeography] = useState<string[]>(
    initialCriteria.geography
      ? typeof initialCriteria.geography === "string"
        ? [initialCriteria.geography]
        : initialCriteria.geography
      : ["Toàn quốc"]
  );
  const [customSport, setCustomSport] = useState("");
  const [selected, setSelected] = useState<string[] | null>(
    initialCriteria.platform
      ? typeof initialCriteria.platform === "string"
        ? [initialCriteria.platform]
        : initialCriteria.platform
      : null
  );
  const [limit, setLimit] = useState(initialCriteria.limit || 10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const {
    availability,
    platforms,
    capabilities,
    loading: capabilitiesLoading,
  } = useScoutCapabilities(searchMode);

  const selectedPlatforms = selected || platforms.slice(0, 1);

  // Sync selected platforms when capabilities change or mode changes
  useEffect(() => {
    if (capabilities) {
      setSelected((current) => {
        if (!current) return null;
        const valid = current.filter((p) => availability(p).available);
        return valid.length ? valid : platforms.slice(0, 1);
      });
    }
  }, [searchMode, capabilities]);

  if (!isOpen) return null;

  function toggle(values: string[], value: string) {
    return values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
  }

  function handleSwitchMode(mode: "hashtag" | "keyword") {
    setSearchMode(mode);
    setError("");
    if (mode === "hashtag") {
      setKeyword((prev) =>
        prev.trim() ? (prev.startsWith("#") ? prev : `#${prev}`) : ""
      );
      // Auto select Instagram or TikTok if nothing valid selected
      setSelected((prev) => {
        const next = (prev || []).filter((p) => p !== "Facebook");
        return next.length ? next : ["Instagram"];
      });
    } else {
      setKeyword((prev) => prev.replace(/^#/, ""));
      // Deselect Instagram since Instagram requires hashtag mode
      setSelected((prev) => {
        const next = (prev || []).filter((p) => p !== "Instagram");
        return next.length ? next : ["TikTok"];
      });
    }
  }

  function switchToInstagramHashtag() {
    handleSwitchMode("hashtag");
    setSelected(["Instagram"]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (
        capabilitiesLoading ||
        !selectedPlatforms.length ||
        selectedPlatforms.some((p) => !availability(p).available)
      ) {
        throw new Error("Select at least one available platform.");
      }
      if (
        searchMode === "hashtag" &&
        !/^#?[\p{L}\p{N}_]+$/u.test(keyword.trim())
      ) {
        throw new Error(
          "Enter one hashtag without spaces, such as #pickleballvietnam."
        );
      }
      const sports = sport.map((s) =>
        s === "Other Sports" ? customSport.trim() : s
      );
      if (!sports.length || sports.some((s) => !s)) {
        throw new Error("Select a sport and enter any custom discipline.");
      }

      const request = taskRequest(
        { intent: "content", mode: "search", source },
        {
          keyword: keyword.trim(),
          searchMode,
          qualityMode, minInteractions, minViews, recentDays,
          sport: sports,
          geography,
          platform: selectedPlatforms,
          limit,
        }
      );
      const response = await scoutFetch(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Content collection failed.");
      }
      onSuccess(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScoutDialogFrame
      title="Find Content"
      onClose={onClose}
      description="Find recent sports posts using observed engagement. Matching items are saved and deduplicated; engagement does not prove growth over time."
    >
      <form onSubmit={submit} className="space-y-4">
        {/* ─── 1. SEARCH METHOD SELECTOR (Pill / Tabs) ─── */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Search Method
          </label>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSwitchMode("hashtag")}
              className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                searchMode === "hashtag"
                  ? "bg-white text-indigo-700 shadow-xs border border-slate-200/80"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Hashtag Search</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => handleSwitchMode("keyword")}
              className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                searchMode === "keyword"
                  ? "bg-white text-indigo-700 shadow-xs border border-slate-200/80"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Keyword Search</span>
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {searchMode === "hashtag"
              ? "Search Instagram and TikTok posts by hashtag."
              : "Keyword search scans titles, captions, and descriptions across TikTok and Facebook."}
          </p>
        </div>

        {/* ─── 2. TOPIC OR HASHTAG INPUT ─── */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            {searchMode === "hashtag" ? "Hashtag" : "Topic or Keyword"}{" "}
            <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              {searchMode === "hashtag" ? (
                <Hash className="w-4 h-4" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </div>
            <input
              required
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              disabled={busy}
              className={`${scoutInputClass} pl-9`}
              placeholder={
                searchMode === "hashtag"
                  ? "#pickleballvietnam"
                  : "Pickleball Vietnam"
              }
            />
          </div>

          {/* Quick preset suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[10px] font-semibold text-slate-400">
              Suggestions:
            </span>
            {(searchMode === "hashtag" ? SUGGESTED_TAGS : SUGGESTED_KEYWORDS).map(
              (tag) => (
                <button
                  key={tag}
                  type="button"
                  disabled={busy}
                  onClick={() => setKeyword(tag)}
                  className="rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 transition cursor-pointer"
                >
                  {tag}
                </button>
              )
            )}
          </div>
        </div>

        {/* ─── 3. TARGET PLATFORMS (Unified Multi-Select Cards) ─── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700">
              Target Platforms <span className="text-rose-500">*</span>
            </label>
            <span className="text-[10px] font-semibold text-slate-400">
              {selectedPlatforms.length} selected
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PLATFORM_OPTIONS.map((p) => {
              const cap = availability(p.id);
              const isAvailable = cap.available;
              const isChecked = selectedPlatforms.includes(p.id) && isAvailable;

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (isAvailable && !busy) {
                      setSelected(toggle(selectedPlatforms, p.id));
                    }
                  }}
                  className={`relative p-3 rounded-xl border transition flex flex-col justify-between ${
                    !isAvailable
                      ? "bg-slate-50/70 border-slate-200 opacity-70 cursor-not-allowed"
                      : isChecked
                      ? "bg-indigo-50/70 border-indigo-500 ring-1 ring-indigo-500 cursor-pointer shadow-2xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <PlatformIcon platform={p.id} size="sm" />
                      </div>
                      <span className="text-xs font-bold text-slate-800">
                        {p.label}
                      </span>
                    </div>

                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                        isChecked
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>

                  <p className="mt-2 text-[10px] text-slate-500 leading-tight">
                    {p.description}
                  </p>

                  {!isAvailable && (
                    <div className="mt-2 pt-2 border-t border-slate-200/80">
                      <p className="text-[10px] text-amber-700 flex items-start space-x-1">
                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{cap.reason}</span>
                      </p>
                      {p.id === "Instagram" &&
                        searchMode === "keyword" &&
                        capabilities?.Instagram?.hashtag?.available && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              switchToInstagramHashtag();
                            }}
                            className="mt-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline block cursor-pointer"
                          >
                            Switch to Hashtag mode
                          </button>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── 4. SPORT DISCIPLINES ─── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700">
              Sport Disciplines <span className="text-rose-500">*</span>
            </label>
            <span className="text-[10px] font-semibold text-slate-400">
              {sport.length} selected
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SPORT_OPTIONS.map((s) => {
              const isChecked = sport.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setSport(toggle(sport, s.id))}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1 border cursor-pointer ${
                    isChecked
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-2xs font-semibold"
                      : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                  }`}
                >
                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>

          {sport.includes("Other Sports") && (
            <div className="mt-2 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1">
              <label className="block text-[11px] font-bold text-amber-900">
                Custom Sport Name / Discipline{" "}
                <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={customSport}
                onChange={(e) => setCustomSport(e.target.value)}
                placeholder="e.g. Swimming, Climbing, Yoga, Billiards..."
                className={`${scoutInputClass} text-xs`}
              />
            </div>
          )}
        </div>

        {/* ─── 5. GEOGRAPHIC SCOPE & SAMPLE SIZE ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Geographic Scope
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GEO_OPTIONS.map((g) => {
                const isChecked = geography.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setGeography(toggle(geography, g.id))}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1 border cursor-pointer ${
                      isChecked
                        ? "bg-slate-900 border-slate-900 text-white shadow-2xs font-semibold"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    <span>{g.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Maximum Posts
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={busy}
              className={`${scoutInputClass} text-xs cursor-pointer`}
            >
              <option value={5}>5 posts</option>
              <option value={10}>10 posts</option>
              <option value={20}>20 posts</option>
              <option value={30}>30 posts</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700" htmlFor="content-quality-mode">Content Selection</label>
          <select id="content-quality-mode" value={qualityMode} disabled={busy} onChange={e=>setQualityMode(e.target.value as 'high-engagement'|'topic')} className={scoutInputClass}>
            <option value="high-engagement">High Engagement (Recommended)</option>
            <option value="topic">All Topic Matches</option>
          </select>
          <p className="text-xs text-slate-500">{qualityMode==='high-engagement' ? 'Keep recent posts meeting either threshold. Rank by likes + comments, then views. Return fewer if the bounded search finds too few matches.' : 'Collect relevant posts regardless of engagement. These results are not verified trends.'}</p>
          {qualityMode==='high-engagement' && <details>
            <summary className="cursor-pointer text-sm font-semibold">Advanced: Engagement Criteria</summary>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
              <label className="text-xs">Minimum Likes + Comments<input type="number" min={1} max={1000000} required value={minInteractions} disabled={busy} onChange={e=>setMinInteractions(Number(e.target.value))} className={scoutInputClass}/></label>
              <label className="text-xs">Minimum Views (Alternative)<input type="number" min={1} max={1000000000} required value={minViews} disabled={busy} onChange={e=>setMinViews(Number(e.target.value))} className={scoutInputClass}/></label>
              <div><label className="text-xs" htmlFor="content-recent-days">Published Within</label><select id="content-recent-days" value={recentDays} disabled={busy} onChange={e=>setRecentDays(Number(e.target.value))} className={scoutInputClass}><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Defaults are selection thresholds, not proof of virality. Searches request up to three times the desired count, capped at 60 candidates in total, within provider budgets. Missing metrics stay Unknown.</p>
          </details>}
        </div>

        {/* ─── BIDIRECTIONAL SYNERGY CALLOUT ─── */}
        <div className="p-3 bg-gradient-to-br from-indigo-50/70 to-blue-50/50 rounded-xl border border-indigo-100 text-xs text-indigo-950 flex items-start space-x-2.5">
          <Link2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-indigo-900">
              Bidirectional KOL Matching:
            </span>{" "}
            <span className="text-slate-600 text-[11px]">
              Discovered posts are cross-referenced with your CRM KOLs. Matching
              creators automatically receive new engagement records.
            </span>
          </div>
        </div>

        {/* ─── ERROR BANNER ─── */}
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{error}</p>
              <a
                href="/scout"
                className="underline mt-0.5 block text-red-800 font-medium"
              >
                Open Scout Activity
              </a>
            </div>
          </div>
        )}

        {/* ─── ACTIONS ─── */}
        <div className="pt-2 flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              busy ||
              capabilitiesLoading ||
              !keyword.trim() ||
              !selectedPlatforms.length ||
              !geography.length ||
              !sport.length
            }
            className="px-4 py-2 bg-gradient-to-r from-rose-600 via-orange-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-2 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Collecting…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Find Content</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ScoutDialogFrame>
  );
}
