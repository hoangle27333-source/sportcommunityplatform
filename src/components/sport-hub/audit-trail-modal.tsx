"use client";

import React, { useState, useEffect } from "react";
import { X, Clock, History, AlertCircle, RefreshCw, User } from "lucide-react";
import type { AuditLogItem } from "./pages/team-page-view";

export interface AuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: string;
  entityId: string;
  title?: string;
}

export function AuditTrailModal({
  isOpen,
  onClose,
  entity,
  entityId,
  title,
}: AuditTrailModalProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && entityId) {
      fetchLogs();
    }
  }, [isOpen, entity, entityId]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit-log?entity=${entity}&entityId=${entityId}&limit=50`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Change History & Audit Trail</h2>
              {title && (
                <p className="text-[11px] text-slate-500 font-medium truncate max-w-xs">
                  {title}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
              <span>Loading change history…</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No change logs recorded yet for this record.
            </div>
          ) : (
            <div className="relative pl-6 border-l-2 border-slate-200 space-y-6 my-2">
              {logs.map((log) => (
                <div key={log.id} className="relative group">
                  {/* Dot */}
                  <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow-xs" />

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900">{log.actorName}</span>
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded border ${
                          log.action === "create"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : log.action === "update"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        {log.action}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {new Date(log.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {log.detail?.updatedFields && Array.isArray(log.detail.updatedFields) && (
                      <p className="text-[11px] text-slate-600 mt-1 font-medium">
                        Modified: {log.detail.updatedFields.join(", ")}
                      </p>
                    )}

                    {log.detail?.changes && typeof log.detail.changes === "object" && (
                      <div className="mt-1.5 p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] space-y-1 font-mono">
                        {Object.entries(log.detail.changes).map(([k, v]) => (
                          <div key={k} className="text-slate-600 truncate">
                            <span className="font-bold text-slate-700">{k}:</span>{" "}
                            <span>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
