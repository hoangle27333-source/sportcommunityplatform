"use client";

import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  X,
  RefreshCw,
  Users,
  Eye,
  Activity,
  Calendar,
  Sparkles,
} from "lucide-react";
import { formatNumber } from "@/lib/i18n";

export interface MetricSnapshot {
  id: string;
  kol_id: string;
  recorded_at: string;
  followers: number;
  avg_views: number;
  er: number;
}

export interface KolGrowthModalProps {
  isOpen: boolean;
  kol: {
    id: string;
    name: string;
    followers: number;
    avgViews: number;
    er: number;
  } | null;
  onClose: () => void;
}

export function KolGrowthModal({ isOpen, kol, onClose }: KolGrowthModalProps) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<MetricSnapshot[]>([]);

  useEffect(() => {
    if (isOpen && kol?.id) {
      setLoading(true);
      fetch(`/api/sport-hub/kol/${kol.id}/history`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.history)) {
            setHistory(data.history);
          } else {
            setHistory([]);
          }
        })
        .catch(() => setHistory([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, kol?.id]);

  if (!isOpen || !kol) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Growth & Metric History
              </h3>
              <p className="text-xs text-indigo-100 mt-0.5">
                KOL: <span className="font-semibold text-white">{kol.name}</span>
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

        {/* Current Stats summary */}
        <div className="grid grid-cols-3 gap-2 px-6 py-3 bg-slate-50 border-b border-slate-100 text-center shrink-0">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <div className="text-[10px] uppercase font-bold text-slate-500">Current Followers</div>
            <div className="text-sm font-black text-slate-900 mt-0.5">
              {formatNumber(kol.followers)}
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <div className="text-[10px] uppercase font-bold text-slate-500">Avg Views</div>
            <div className="text-sm font-black text-slate-900 mt-0.5">
              {formatNumber(kol.avgViews)}
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <div className="text-[10px] uppercase font-bold text-slate-500">Engagement</div>
            <div className="text-sm font-black text-emerald-600 mt-0.5">
              {kol.er}%
            </div>
          </div>
        </div>

        {/* Timeline body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-xs">Loading growth snapshots...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-1">
              <Sparkles className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <div className="text-sm font-bold text-slate-700">No Historical Snapshots Yet</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Snapshots are automatically recorded every time Apify runs a scout update on this profile.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">
                Recorded Snapshots ({history.length})
              </div>
              {history.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition shadow-xs flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                      #{history.length - idx}
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5 text-xs text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(item.recorded_at).toLocaleString("en-US")}</span>
                      </div>
                      <div className="text-xs font-bold text-slate-900 mt-0.5">
                        {formatNumber(item.followers)} Followers • {formatNumber(item.avg_views)} Views
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ER {item.er}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
