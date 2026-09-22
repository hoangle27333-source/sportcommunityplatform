"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ShieldCheck,
  RefreshCw,
  MessageCircle,
  CheckCircle2,
  BarChart3,
  Briefcase,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import type { AudienceAuditResult } from "@/lib/sport-hub/audience-audit-types";

const TAG_COLORS = ["#2563eb", "#6366f1", "#0d9488", "#0891b2", "#8b5cf6"];

function tagColor(tag: string, index: number): string {
  const key = tag.toLowerCase();
  if (key.includes("sport")) return "#2563eb";
  if (key.includes("daily")) return "#6366f1";
  if (key.includes("travel")) return "#0d9488";
  if (key.includes("transport")) return "#0891b2";
  return TAG_COLORS[index % TAG_COLORS.length];
}

function formatWhen(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AudienceAuditSection({
  endpoint,
  initialAudit,
  subjectName,
  emptyMessage,
}: {
  endpoint: string;
  initialAudit?: AudienceAuditResult | null;
  subjectName: string;
  emptyMessage: string;
}) {
  const [audit, setAudit] = useState<AudienceAuditResult | null>(initialAudit || null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    setAudit(initialAudit || null);
  }, [initialAudit]);

  const run = async () => {
    setIsAuditing(true);
    const toastId = toast.loading(`Auditing audience and sponsored content for ${subjectName}...`);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.data) {
        toast.error(json?.error || `Audit failed (HTTP ${res.status})`, { id: toastId });
        return;
      }
      setAudit(json.data);
      toast.success(json.data.auditSummary || "Audit updated.", { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || "Could not reach the audit service.", { id: toastId });
    } finally {
      setIsAuditing(false);
    }
  };

  if (!audit || audit.totalPostsScanned === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-indigo-600 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-extrabold text-slate-900">
          Audience Authenticity & Sponsored Content
        </h4>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          {audit?.auditSummary || emptyMessage}
        </p>
        <button
          type="button"
          disabled={isAuditing}
          onClick={run}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${isAuditing ? "animate-spin" : ""}`} />
          {isAuditing ? "Auditing..." : "Run Audience Audit"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
              Audience Authenticity & Sponsored Content
            </h3>
            <p className="text-xs text-slate-500">
              {audit.totalPostsScanned} posts · {audit.totalCommentsScanned} comments
              {audit.auditedAt ? ` · ${formatWhen(audit.auditedAt)}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={isAuditing}
          onClick={run}
          className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? "animate-spin" : ""}`} />
          {isAuditing ? "Auditing..." : "Refresh Audit"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3 bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase text-slate-800 flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-indigo-600" />
              Audience Engagement Authenticity
            </h4>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                audit.seedingRiskLevel === "Low"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : audit.seedingRiskLevel === "Moderate"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
            >
              {audit.seedingRiskLevel} Seeding Risk
            </span>
          </div>
          <div className="flex justify-between text-xs font-extrabold">
            <span className="text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {audit.realAudienceRate}% Real Audience
            </span>
            <span className="text-amber-700">{audit.seedingRate}% Seeding / Bot</span>
          </div>
          <div className="h-3 w-full bg-amber-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${audit.realAudienceRate}%` }} />
          </div>
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5 text-blue-600" /> Top 5 Tag Distribution
            </span>
            {(audit.topTagDistribution || []).map((item, idx) => (
              <div key={item.tag}>
                <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                  <span>{item.tag}</span>
                  <span>{item.percentage}%</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${item.percentage}%`, backgroundColor: tagColor(item.tag, idx) }}
                  />
                </div>
              </div>
            ))}
          </div>
          {audit.sampleComments &&
            (audit.sampleComments.organic.length > 0 || audit.sampleComments.seeding.length > 0) && (
              <button
                type="button"
                onClick={() => setShowComments((v) => !v)}
                className="text-[11px] font-bold text-indigo-600 inline-flex items-center gap-1 cursor-pointer"
              >
                {showComments ? "Hide sample comments" : "Inspect sample comments"}
                <ChevronDown className={`w-3.5 h-3.5 ${showComments ? "rotate-180" : ""}`} />
              </button>
            )}
          {showComments && audit.sampleComments && (
            <div className="text-[11px] space-y-2 bg-white border border-slate-200 rounded-xl p-3">
              {audit.sampleComments.organic.map((c, i) => (
                <p key={`o-${i}`} className="border-l-2 border-emerald-400 pl-2 italic text-slate-700">
                  “{c}”
                </p>
              ))}
              {audit.sampleComments.seeding.map((c, i) => (
                <p key={`s-${i}`} className="border-l-2 border-amber-400 pl-2 italic text-slate-600">
                  “{c}”
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 bg-slate-50 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase text-slate-800 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              Commercial Sponsorship Saturation
            </h4>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                audit.commercialSaturation === "Heavy Commercial"
                  ? "bg-purple-50 text-purple-700 border-purple-200"
                  : audit.commercialSaturation === "Balanced"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              {audit.commercialSaturation}
            </span>
          </div>
          <div className="bg-white border-2 border-indigo-200 rounded-xl p-4">
            <span className="text-[11px] font-bold uppercase text-slate-500">Sponsored content</span>
            <div className="text-3xl font-black text-slate-900">{audit.sponsoredContentRate}%</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(audit.bookedCategories || []).map((cat) => (
              <div key={cat.category} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs">
                <div className="font-semibold text-slate-700">{cat.category}</div>
                <div className="font-extrabold text-indigo-600">
                  {cat.percentage}% · {cat.count} posts
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(audit.partnerBrands || []).map((brand) => (
              <span
                key={brand.brand}
                className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs"
              >
                <span className="font-extrabold text-slate-900">{brand.brand}</span>
                {brand.handle && <span className="font-mono text-[10px] text-indigo-600">{brand.handle}</span>}
                <span className="text-[10px] text-slate-500">{brand.postCount} posts</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {audit.auditSummary && (
        <p className="text-xs italic text-slate-700 bg-indigo-50/60 border border-indigo-100 rounded-xl p-3">
          “{audit.auditSummary}”
        </p>
      )}
    </div>
  );
}

export function PostAuditControl({
  postId,
  title,
  initialSponsored,
  initialBrand,
}: {
  postId: string;
  title: string;
  initialSponsored?: boolean;
  initialBrand?: string;
}) {
  const [sponsored, setSponsored] = useState(Boolean(initialSponsored));
  const [brand, setBrand] = useState(initialBrand || "");
  const [risk, setRisk] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const toastId = toast.loading("Auditing this post...");
    try {
      const res = await fetch(`/api/sport-hub/post/${postId}/audience-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.data) {
        toast.error(json?.error || "Post audit failed", { id: toastId });
        return;
      }
      const data = json.data as AudienceAuditResult;
      setSponsored(data.sponsoredContentRate > 0);
      setBrand(data.partnerBrands?.[0]?.brand || "");
      setRisk(data.seedingRiskLevel);
      setSummary(data.auditSummary || "");
      toast.success("Post audit updated.", { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || "Could not reach the audit service.", { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {(sponsored || brand) && (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200"
          title={summary || (brand ? `Sponsored: ${brand}` : "Sponsored")}
        >
          {brand ? `Sponsored: ${brand}` : "Sponsored"}
        </span>
      )}
      {risk && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
          {risk} seeding
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900 text-white disabled:opacity-50 cursor-pointer"
        title={`Audit “${title}”`}
      >
        {busy ? "..." : "Audit"}
      </button>
    </span>
  );
}
