"use client";

import React, { useState } from "react";
import { X, Star, ShieldCheck, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import type { ProjectParticipant, Project } from "./types";

interface ParticipantEvaluationModalProps {
  isOpen: boolean;
  project: Project | null;
  participant: ProjectParticipant | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ParticipantEvaluationModal({
  isOpen,
  project,
  participant,
  onClose,
  onSuccess,
}: ParticipantEvaluationModalProps) {
  const [score, setScore] = useState<number>(participant?.ratingScore || 5);
  const [attitude, setAttitude] = useState<number>(participant?.attitudeScore || 5);
  const [deadlineStatus, setDeadlineStatus] = useState<string>(
    participant?.deadlineStatus || "On Time"
  );
  const [pmNotes, setPmNotes] = useState<string>(participant?.pmNotes || "");
  const [evaluator, setEvaluator] = useState<string>(
    participant?.evaluator || "Hoàng Lê (PM)"
  );
  const [loading, setLoading] = useState(false);

  if (!isOpen || !project || !participant) return null;

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
            action: "evaluate",
            score,
            attitude,
            deadlineStatus,
            pmNotes,
            evaluator,
            projectName: project.name,
          }),
        }
      );

      const json = await res.json();
      if (json.success) {
        toast.success(`Evaluation signed off for ${participant.entityName}!`);
        onSuccess();
        onClose();
      } else {
        toast.error(json.error || "Failed to submit evaluation");
      }
    } catch {
      toast.error("Network error while submitting evaluation");
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
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold">
              <Star className="w-4 h-4 fill-white" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                PM Evaluation Scorecard & Sign-off
              </h3>
              <p className="text-xs text-slate-300">
                Auditing: <span className="text-amber-300 font-semibold">{participant.entityName}</span>
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
          {/* Summary info */}
          <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-xs text-slate-700 flex items-center justify-between">
            <div>
              <span className="font-bold text-amber-900">Campaign:</span> {project.name}
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              Deliverable: {participant.deliverableScope}
            </div>
          </div>

          {/* Rating 1-5 Stars */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Overall Partner Rating (1 - 5 Stars) *
            </label>
            <div className="flex items-center space-x-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setScore(star)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 transition focus:outline-none"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= score
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-300 hover:text-amber-200"
                    }`}
                  />
                </button>
              ))}
              <span className="text-sm font-black text-amber-600 ml-2">
                {score}.0 / 5.0
              </span>
            </div>
          </div>

          {/* Attitude & Deadline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Attitude & Professionalism (1-5)
              </label>
              <select
                value={attitude}
                onChange={(e) => setAttitude(Number(e.target.value))}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
              >
                <option value={5}>5/5 - Highly Professional & Proactive</option>
                <option value={4}>4/5 - Good & Cooperative</option>
                <option value={3}>3/5 - Acceptable</option>
                <option value={2}>2/5 - Slow Response / Unhelpful</option>
                <option value={1}>1/5 - Poor / Unprofessional</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Timeline & Deadline Adherence
              </label>
              <select
                value={deadlineStatus}
                onChange={(e) => setDeadlineStatus(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
              >
                <option value="Ahead of Schedule">Ahead of Schedule (Early)</option>
                <option value="On Time">On Time (Strictly Compliant)</option>
                <option value="Delayed">Delayed (Need Follow-up)</option>
              </select>
            </div>
          </div>

          {/* Qualitative Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              PM Qualitative Notes & Recommendation for Future Campaigns *
            </label>
            <textarea
              rows={3}
              required
              placeholder="Detailed feedback on work ethic, video quality, proactivity, and recommendations for future campaigns..."
              value={pmNotes}
              onChange={(e) => setPmNotes(e.target.value)}
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 italic"
            />
          </div>

          {/* Evaluator Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Evaluator / Person In Charge (PIC)
            </label>
            <input
              type="text"
              value={evaluator}
              onChange={(e) => setEvaluator(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
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
              className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 px-5 py-2.5 rounded-xl transition shadow-md shadow-amber-200 active:scale-95 disabled:opacity-50"
            >
              {loading ? "Submitting Evaluation..." : "Sign-off & Submit Scorecard"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
