"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Check,
  X,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  CheckSquare,
  Square,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

export interface ScoutDiffModalProps {
  isOpen: boolean;
  kol: {
    id: string;
    name: string;
    pendingScoutDiff?: {
      scoutedAt: string;
      changes: Record<string, { current: any; scouted: any }>;
    } | null;
  } | null;
  onClose: () => void;
  onSuccess: (updatedRecord: any) => void;
}

const FIELD_LABELS: Record<string, string> = {
  bio: "Biography & Introduction",
  sports: "Sports & Disciplines",
  avatar_url: "Avatar / Profile Picture",
  profile_url: "Profile Social Link",
};

export function ScoutDiffModal({
  isOpen,
  kol,
  onClose,
  onSuccess,
}: ScoutDiffModalProps) {
  const [submitting, setSubmitting] = useState(false);

  const diffData = kol?.pendingScoutDiff;
  const changes = diffData?.changes || {};
  const diffKeys = Object.keys(changes);

  const [selectedFields, setSelectedFields] = useState<string[]>(() => diffKeys);

  // Sync selected fields if diff keys change
  React.useEffect(() => {
    setSelectedFields(diffKeys);
  }, [kol?.id]);

  if (!isOpen || !kol || diffKeys.length === 0) return null;

  const toggleField = (field: string) => {
    if (selectedFields.includes(field)) {
      setSelectedFields(selectedFields.filter((f) => f !== field));
    } else {
      setSelectedFields([...selectedFields, field]);
    }
  };

  const handleSelectAll = () => {
    setSelectedFields(diffKeys);
  };

  const handleDeselectAll = () => {
    setSelectedFields([]);
  };

  const handleApply = async () => {
    if (selectedFields.length === 0) {
      toast.warning("Please select at least one field to apply, or click Dismiss.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/sport-hub/kol/${kol.id}/diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", fields: selectedFields }),
      });

      const result = await res.json();
      if (result.success) {
        toast.success("Applied selected scout changes successfully!");
        onSuccess(result.record);
        onClose();
      } else {
        toast.error(result.error || "Failed to apply scout changes");
      }
    } catch {
      toast.error("Network error while applying scout diff");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sport-hub/kol/${kol.id}/diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });

      const result = await res.json();
      if (result.success) {
        toast.info("Scout differences dismissed. Existing data retained.");
        onSuccess(result.record);
        onClose();
      } else {
        toast.error(result.error || "Failed to dismiss diff");
      }
    } catch {
      toast.error("Network error while dismissing diff");
    } finally {
      setSubmitting(false);
    }
  };

  const renderValue = (field: string, val: any) => {
    if (val === undefined || val === null || val === "") {
      return <span className="text-slate-400 italic font-normal text-xs">(Empty)</span>;
    }

    if (field === "sports" && Array.isArray(val)) {
      return (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {val.map((s, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60"
            >
              {s}
            </span>
          ))}
        </div>
      );
    }

    if (field === "avatar_url" && typeof val === "string") {
      return (
        <div className="flex items-center space-x-3 mt-1">
          <img
            src={val}
            alt="Avatar"
            className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-sm"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
          <span className="text-xs text-slate-500 truncate max-w-[200px]">
            {val}
          </span>
        </div>
      );
    }

    return (
      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed mt-1 font-medium">
        {String(val)}
      </p>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base leading-tight">
                  Scout Conflict Resolution
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-white/25 rounded-full uppercase tracking-wider">
                  {diffKeys.length} {diffKeys.length === 1 ? "Change" : "Changes"}
                </span>
              </div>
              <p className="text-xs text-amber-100 mt-0.5">
                Target Profile: <span className="font-semibold text-white">{kol.name}</span>
                {diffData?.scoutedAt && (
                  <span className="opacity-90 ml-1">
                    • Scouted {new Date(diffData.scoutedAt).toLocaleString("en-US")}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice banner */}
        <div className="bg-amber-50 border-b border-amber-200/60 px-6 py-3 flex items-start space-x-3 shrink-0">
          <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">Automated Safety Guard:</span> Apify bot detected newer data on social channels. Business contracts, negotiated quotation, and user-edited fields are protected and locked. Select which metadata updates you would like to merge.
          </div>
        </div>

        {/* Quick selection toolbar */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <span className="font-medium">
            Selected: <strong className="text-slate-900">{selectedFields.length}</strong> of {diffKeys.length} fields
          </span>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-blue-600 hover:text-blue-700 font-semibold hover:underline"
            >
              Select All
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="text-slate-500 hover:text-slate-700 hover:underline"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Diff Content List */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {diffKeys.map((field) => {
            const item = changes[field];
            const isSelected = selectedFields.includes(field);

            return (
              <div
                key={field}
                className={`rounded-xl border transition-all duration-150 p-4 ${
                  isSelected
                    ? "border-blue-300 bg-blue-50/20 shadow-sm"
                    : "border-slate-200 bg-slate-50/40 opacity-75"
                }`}
              >
                {/* Field Title & Checkbox */}
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                  <label
                    onClick={() => toggleField(field)}
                    className="flex items-center space-x-2.5 cursor-pointer select-none"
                  >
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center transition ${
                        isSelected
                          ? "bg-blue-600 text-white"
                          : "border border-slate-300 bg-white text-transparent hover:border-slate-400"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                    <span className="font-bold text-sm text-slate-900">
                      {FIELD_LABELS[field] || field}
                    </span>
                  </label>
                  <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                    Key: {field}
                  </span>
                </div>

                {/* Side-by-side comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Current Database Value */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Current Database Value
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                        Retained
                      </span>
                    </div>
                    {renderValue(field, item.current)}
                  </div>

                  {/* Scouted Value */}
                  <div className="p-3 bg-white rounded-lg border border-blue-200 bg-gradient-to-br from-white to-blue-50/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 flex items-center space-x-1">
                        <Sparkles className="w-3 h-3 text-blue-600" />
                        <span>Apify Scouted Value</span>
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-bold">
                        Newest
                      </span>
                    </div>
                    {renderValue(field, item.scouted)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            disabled={submitting}
            onClick={handleDismiss}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/70 rounded-lg transition disabled:opacity-50"
          >
            Dismiss All (Keep Existing)
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || selectedFields.length === 0}
              onClick={handleApply}
              className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-md shadow-blue-500/20 flex items-center space-x-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Applying Changes...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Apply Selected ({selectedFields.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
