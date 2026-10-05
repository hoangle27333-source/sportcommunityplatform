"use client";
import { useEffect, useState } from "react";
import { scoutFetch } from "@/lib/apify/scout-client";
import { taskRequest } from "@/lib/apify/scout-workspace";
import { ScoutDialogFrame, scoutInputClass, scoutButtonClass } from "./scout-dialog-frame";
import { useScoutCapabilities } from "./use-scout-capabilities";
export interface MarketTrendScoutModalProps {
  isOpen: boolean; onClose: () => void; onSuccess: (result?: any) => void;
  initialCriteria?: Record<string, any>; source?: string;
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

export function MarketTrendScoutModal({ isOpen, onClose, onSuccess, initialCriteria = {}, source }: MarketTrendScoutModalProps) {
  const [searchMode, setSearchMode] = useState<"hashtag" | "keyword">(initialCriteria.searchMode || "hashtag");
  const [keyword, setKeyword] = useState(initialCriteria.keyword || "");
  const [sport, setSport] = useState<string[]>(initialCriteria.sport ? typeof initialCriteria.sport === "string" ? [initialCriteria.sport] : initialCriteria.sport : ["Pickleball"]);
  const [geography, setGeography] = useState<string[]>(initialCriteria.geography ? typeof initialCriteria.geography === "string" ? [initialCriteria.geography] : initialCriteria.geography : ["Toàn quốc"]);
  const [customSport, setCustomSport] = useState("");
  const [selected, setSelected] = useState<string[] | null>(initialCriteria.platform ? typeof initialCriteria.platform === "string" ? [initialCriteria.platform] : initialCriteria.platform : null);
  const [limit, setLimit] = useState(initialCriteria.limit || 10);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const { availability, platforms } = useScoutCapabilities(searchMode);
  const selectedPlatforms = selected || platforms.slice(0, 1);
  useEffect(() => { setSelected(current => current ? current.filter(p => availability(p).available) : null); }, [searchMode, platforms.join(",")]);
  if (!isOpen) return null;
  function toggle(values: string[], value: string) { return values.includes(value) ? values.filter(v => v !== value) : [...values, value]; }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const sports = sport.map(s => s === "Other Sports" ? customSport.trim() : s);
      if (!sports.length || sports.some(s => !s)) throw new Error("Select a sport and enter any custom discipline.");
      const request = taskRequest({ intent: "content", mode: "search", source }, { keyword: keyword.trim(), searchMode, sport: sports, geography, platform: selectedPlatforms, limit });
      const response = await scoutFetch(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.body) });
      const result = await response.json(); if (!result.success) throw new Error(result.error || "Content collection failed."); onSuccess(result);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <ScoutDialogFrame title="Find Content" onClose={onClose} description="Find public posts by topic. Matching posts are saved to Trending Posts; existing records are deduplicated.">
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-semibold">Search by<select className={`${scoutInputClass} mt-1`} value={searchMode} onChange={e => setSearchMode(e.target.value as "hashtag" | "keyword")} disabled={busy}><option value="hashtag">Hashtag</option><option value="keyword">Keyword</option></select></label>
      <label className="block text-sm font-semibold">{searchMode === "hashtag" ? "Hashtag" : "Topic or keyword"}<input required value={keyword} onChange={e => setKeyword(e.target.value)} disabled={busy} className={`${scoutInputClass} mt-1`} placeholder={searchMode === "hashtag" ? "#pickleballvietnam" : "Pickleball Vietnam"} /></label>
      {searchMode === "hashtag" && <div className="flex flex-wrap gap-2">{SUGGESTED_TAGS.map(tag => <button key={tag} type="button" disabled={busy} onClick={() => setKeyword(tag)} className="rounded-full bg-slate-100 px-2 py-1 text-xs">{tag}</button>)}</div>}
      <fieldset><legend className="mb-2 text-sm font-semibold">Platforms</legend><div className="space-y-2">{PLATFORM_OPTIONS.map(p => <label key={p.id} className="block rounded-lg border p-2 text-sm"><span className="flex items-center gap-2"><input type="checkbox" checked={selectedPlatforms.includes(p.id)} disabled={busy || !availability(p.id).available} onChange={() => setSelected(toggle(selectedPlatforms, p.id))} />{p.id}</span>{!availability(p.id).available && <span className="block mt-1 text-xs text-amber-800">{availability(p.id).reason}</span>}</label>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-semibold">Sports</legend><div className="flex flex-wrap gap-2">{SPORT_OPTIONS.map(s => <label key={s.id} className="flex items-center gap-1 rounded-lg border p-2 text-xs"><input type="checkbox" checked={sport.includes(s.id)} disabled={busy} onChange={() => setSport(toggle(sport, s.id))} />{s.label}</label>)}</div></fieldset>
      {sport.includes("Other Sports") && <label className="block text-sm">Custom discipline<input required value={customSport} onChange={e => setCustomSport(e.target.value)} className={`${scoutInputClass} mt-1`} /></label>}
      <fieldset><legend className="mb-2 text-sm font-semibold">Geographic scope</legend><div className="flex flex-wrap gap-2">{GEO_OPTIONS.map(g => <label key={g.id} className="flex items-center gap-1 rounded-lg border p-2 text-xs"><input type="checkbox" checked={geography.includes(g.id)} disabled={busy} onChange={() => setGeography(toggle(geography, g.id))} />{g.label}</label>)}</div></fieldset>
      <details><summary className="cursor-pointer text-sm font-semibold">Advanced</summary><label className="mt-3 block text-sm">Maximum posts<select value={limit} onChange={e => setLimit(Number(e.target.value))} className={`${scoutInputClass} mt-1`}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option></select></label></details>
      {error && <p role="alert" className="text-sm text-red-700">{error} <a href="/scout" className="underline">Open Activity</a></p>}
      <button disabled={busy || !keyword.trim() || !selectedPlatforms.length || !geography.length || !sport.length} className={scoutButtonClass}>{busy ? "Collecting…" : "Find Content"}</button>
    </form>
  </ScoutDialogFrame>;
}
