"use client";

import React, { useState } from "react";
import { X, TrendingUp, Link as LinkIcon, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/lib/i18n";
import type { ProjectParticipant, Project } from "./types";

interface LogPerformanceModalProps {
  isOpen: boolean;
  project: Project | null;
  participant: ProjectParticipant | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function LogPerformanceModal({
  isOpen,
  project,
  participant,
  onClose,
  onSuccess,
}: LogPerformanceModalProps) {
  const [actualViews, setActualViews] = useState<number | "">(
    participant?.actualViews || ""
  );
  const [actualReach, setActualReach] = useState<number | "">(
    participant?.actualReach || ""
  );
  const [actualER, setActualER] = useState<number | "">(
    participant?.actualER || ""
  );
  const [proofUrl, setProofUrl] = useState(participant?.proofUrl || "");
  const [status, setStatus] = useState(participant?.status || "Delivered");
  const [loading, setLoading] = useState(false);

  if (!isOpen || !project || !participant) return null;

  // Calculate live attainment %
  const target = participant.targetViews || participant.targetReach || 0;
  const actual = Number(actualViews) || Number(actualReach) || 0;
  const attainmentRate = target > 0 ? ((actual / target) * 100).toFixed(1) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(
        `/api/sport-hub/project/${project.id}/participants/${participant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actualViews: Number(actualViews) || 0,
            actualReach: Number(actualReach) || 0,
            actualER: Number(actualER) || 0,
            proofUrl,
            status,
          }),
        }
      );

      const json = await res.json();
      if (json.success) {
        toast.success(`Updated performance for ${participant.entityName}!`);
        onSuccess();
        onClose();
      } else {
        toast.error(json.error || "Failed to update performance");
      }
    } catch {
      toast.error("Network error while updating performance");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Log Deliverable Performance
              </h3>
              <p className="text-xs text-slate-300">
                Participant: <span className="text-emerald-300 font-semibold">{participant.entityName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Target Reference Card */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Deliverable & Committed Target
              </p>
              <p className="text-xs font-semibold text-slate-900 mt-0.5">
                {participant.deliverableScope}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-700">
                Target: {formatNumber(participant.targetViews || participant.targetReach || 0)}
              </span>
              {attainmentRate && (
                <div className="mt-0.5">
                  <span
                    className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                      Number(attainmentRate) >= 100
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {attainmentRate}% Achieved
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actual Metrics Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Actual Video Views / Impressions
              </label>
              <input
                type="number"
                min={0}
                placeholder="135000"
                value={actualViews}
                onChange={(e) => setActualViews(e.target.value ? Number(e.target.value) : "")}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Actual Audience Reach
              </label>
              <input
                type="number"
                min={0}
                placeholder="200000"
                value={actualReach}
                onChange={(e) => setActualReach(e.target.value ? Number(e.target.value) : "")}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Actual Engagement Rate (ER %)
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                placeholder="4.8"
                value={actualER}
                onChange={(e) => setActualER(e.target.value ? Number(e.target.value) : "")}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Deliverable Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Confirmed">Confirmed (In Progress)</option>
                <option value="Delivered">Delivered (Pending Sign-off)</option>
                <option value="Signed Off">Signed Off & Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Proof URL */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Live Proof / Post / Reel URL
            </label>
            <div className="relative">
              <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="url"
                placeholder="https://facebook.com/reel/... or https://tiktok.com/..."
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-4 py-2 rounded-xl hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 rounded-xl transition shadow-md shadow-emerald-200 active:scale-95 disabled:opacity-50"
            >
              {loading ? "Saving Performance..." : "Save Deliverable Performance"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
