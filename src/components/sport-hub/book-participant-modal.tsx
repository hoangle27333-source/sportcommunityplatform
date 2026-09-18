"use client";

import React, { useState } from "react";
import { X, UserPlus, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, formatCurrency } from "@/lib/i18n";
import type { KOL, Community, Project } from "./types";

interface BookParticipantModalProps {
  isOpen: boolean;
  project: Project | null;
  kols: KOL[];
  communities: Community[];
  onClose: () => void;
  onSuccess: () => void;
}

export function BookParticipantModal({
  isOpen,
  project,
  kols,
  communities,
  onClose,
  onSuccess,
}: BookParticipantModalProps) {
  const [entityType, setEntityType] = useState<"kol" | "community">("kol");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [deliverableScope, setDeliverableScope] = useState("");
  const [agreedFee, setAgreedFee] = useState<number | "">("");
  const [targetViews, setTargetViews] = useState<number | "">("");
  const [targetReach, setTargetReach] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  if (!isOpen || !project) return null;

  const handleSelectEntity = (id: string) => {
    setSelectedEntityId(id);
    if (entityType === "kol") {
      const found = kols.find((k) => k.id === id);
      if (found) {
        setAgreedFee(found.quotation || 20000000);
        setTargetViews(found.avgViews || 30000);
        setTargetReach(found.followers || 50000);
        setDeliverableScope("1 Dedicated Reel Video + 2 Stories check-in");
      }
    } else {
      const found = communities.find((c) => c.id === id);
      if (found) {
        setAgreedFee(found.pricePerPin || 8000000);
        setTargetReach(found.members || 30000);
        setTargetViews(Math.round((found.members || 30000) * 0.4));
        setDeliverableScope("Pin campaign announcement for 30 days + 2 cross-shares");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId) {
      toast.error("Please select a KOL or Community to book");
      return;
    }

    setLoading(true);
    try {
      let entityName = "";
      let sport: string[] = [];
      let tierOrPlatform = "";
      let kolId: string | undefined = undefined;
      let communityId: string | undefined = undefined;

      if (entityType === "kol") {
        const found = kols.find((k) => k.id === selectedEntityId);
        if (found) {
          entityName = found.name;
          sport = found.sport;
          tierOrPlatform = `${found.tier} · ${found.platform}`;
          kolId = found.id;
        }
      } else {
        const found = communities.find((c) => c.id === selectedEntityId);
        if (found) {
          entityName = found.name;
          sport = found.sport;
          tierOrPlatform = `${formatNumber(found.members)} members · ${found.platform}`;
          communityId = found.id;
        }
      }

      const payload = {
        projectId: project.id,
        entityType,
        kolId,
        communityId,
        entityName,
        sport,
        tierOrPlatform,
        deliverableScope: deliverableScope || (entityType === "kol" ? "1 Reel Video" : "30-Day Pinned Post"),
        agreedFee: Number(agreedFee) || 0,
        targetViews: Number(targetViews) || 0,
        targetReach: Number(targetReach) || 0,
        status: "Confirmed",
      };

      const res = await fetch(`/api/sport-hub/project/${project.id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        toast.success(`Successfully booked ${entityName} for "${project.name}"!`);
        onSuccess();
        onClose();
      } else {
        toast.error(json.error || "Failed to book participant");
      }
    } catch {
      toast.error("Network error while booking participant");
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
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Book Talent / Community to Campaign
              </h3>
              <p className="text-xs text-slate-300 truncate max-w-sm">
                Project: <span className="text-blue-300 font-semibold">{project.name}</span>
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
          {/* Entity Type Toggle */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Select Booking Entity Type
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setEntityType("kol");
                  setSelectedEntityId("");
                }}
                className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5 ${
                  entityType === "kol"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>KOL / Athlete Profile</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntityType("community");
                  setSelectedEntityId("");
                }}
                className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5 ${
                  entityType === "community"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Sports Community / Club</span>
              </button>
            </div>
          </div>

          {/* Search/Select Entity */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              {entityType === "kol" ? "Choose KOL / Creator *" : "Choose Sports Club / Community *"}
            </label>
            <select
              value={selectedEntityId}
              onChange={(e) => handleSelectEntity(e.target.value)}
              required
              className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="">
                -- Select from active {entityType === "kol" ? "KOLs" : "Communities"} --
              </option>
              {entityType === "kol"
                ? kols.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({k.tier} · {formatNumber(k.followers)} followers · Ref: {formatCurrency(k.quotation)})
                    </option>
                  ))
                : communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({formatNumber(c.members)} members · Pin: {formatCurrency(c.pricePerPin)}/mo)
                    </option>
                  ))}
            </select>
          </div>

          {/* Deliverable Scope */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Deliverable Scope / Contracted Output *
            </label>
            <input
              type="text"
              required
              placeholder={
                entityType === "kol"
                  ? "e.g. 1 Reel Video + 2 Stories check-in at booth"
                  : "e.g. Pin campaign announcement for 30 days + 2 cross-shares"
              }
              value={deliverableScope}
              onChange={(e) => setDeliverableScope(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Commercial Fee & Targets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Agreed Fee (VND) *
              </label>
              <input
                type="number"
                required
                min={0}
                placeholder="25000000"
                value={agreedFee}
                onChange={(e) => setAgreedFee(e.target.value ? Number(e.target.value) : "")}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Target Views
              </label>
              <input
                type="number"
                min={0}
                placeholder="50000"
                value={targetViews}
                onChange={(e) => setTargetViews(e.target.value ? Number(e.target.value) : "")}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Target Reach
              </label>
              <input
                type="number"
                min={0}
                placeholder="80000"
                value={targetReach}
                onChange={(e) => setTargetReach(e.target.value ? Number(e.target.value) : "")}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl transition shadow-md shadow-blue-200 active:scale-95 disabled:opacity-50"
            >
              {loading ? "Confirming Booking..." : "+ Confirm Booking to Campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
