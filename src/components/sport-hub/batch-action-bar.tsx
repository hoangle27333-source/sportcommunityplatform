"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  RefreshCw,
  Trash2,
  X,
  AlertTriangle,
  Sparkles,
  Coins,
  Zap,
  Info,
} from "lucide-react";

export interface BatchActionBarProps {
  selectedCount: number;
  totalCount?: number;
  itemTypeLabel?: string;
  rescoutButtonLabel?: string;
  onClearSelection: () => void;
  onSelectAll?: () => void;
  onBatchRescout?: () => Promise<void> | void;
  onBatchDelete?: () => Promise<void> | void;
  loadingRescout?: boolean;
  loadingDelete?: boolean;
}

export function BatchActionBar({
  selectedCount,
  totalCount,
  itemTypeLabel = "items",
  rescoutButtonLabel = "Sync Live Data",
  onClearSelection,
  onSelectAll,
  onBatchRescout,
  onBatchDelete,
  loadingRescout = false,
  loadingDelete = false,
}: BatchActionBarProps) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRescoutModalOpen, setIsRescoutModalOpen] = useState(false);

  if (selectedCount === 0) return null;

  const handleDeleteConfirm = async () => {
    if (onBatchDelete) {
      await onBatchDelete();
    }
    setIsDeleteModalOpen(false);
  };

  const handleRescoutConfirm = async () => {
    setIsRescoutModalOpen(false);
    if (onBatchRescout) {
      await onBatchRescout();
    }
  };

  return (
    <>
      {/* ─── FLOATING BATCH ACTION PILL ─── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[92%] sm:w-auto bg-slate-900/95 backdrop-blur-md text-white px-4 sm:px-5 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-5 duration-200">
        {/* Selection Count Badge */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-xs sm:text-sm text-white">
                {selectedCount}
              </span>
              <span className="text-xs text-slate-300">
                {itemTypeLabel} selected
              </span>
            </div>
            {totalCount !== undefined && totalCount > selectedCount && onSelectAll && (
              <button
                type="button"
                onClick={onSelectAll}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold underline block cursor-pointer transition text-left"
              >
                Select all {totalCount}
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Sync Live Data / Re-Scout */}
          {onBatchRescout && (
            <button
              type="button"
              disabled={loadingRescout || loadingDelete}
              onClick={() => setIsRescoutModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              title="Re-scrape & fetch latest live follower counts, views, ER, and post metrics"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  loadingRescout ? "animate-spin text-amber-300" : "text-indigo-200"
                }`}
              />
              <span className="hidden sm:inline">
                {loadingRescout ? "Syncing..." : rescoutButtonLabel}
              </span>
              <span className="sm:hidden">Sync</span>
            </button>
          )}

          {/* Batch Delete */}
          {onBatchDelete && (
            <button
              type="button"
              disabled={loadingRescout || loadingDelete}
              onClick={() => setIsDeleteModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 active:scale-95 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              title={`Delete ${selectedCount} selected ${itemTypeLabel}`}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-200" />
              <span>Delete</span>
            </button>
          )}

          {/* Clear / Dismiss Selection */}
          <button
            type="button"
            onClick={onClearSelection}
            disabled={loadingRescout || loadingDelete}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── BATCH RESCOUT / LIVE SYNC CONFIRMATION MODAL ─── */}
      <BatchRescoutConfirmModal
        isOpen={isRescoutModalOpen}
        count={selectedCount}
        itemTypeLabel={itemTypeLabel}
        loading={loadingRescout}
        onClose={() => setIsRescoutModalOpen(false)}
        onConfirm={handleRescoutConfirm}
      />

      {/* ─── BATCH DELETE CONFIRMATION MODAL ─── */}
      <BatchDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        count={selectedCount}
        itemTypeLabel={itemTypeLabel}
        loading={loadingDelete}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}

export interface BatchDeleteConfirmModalProps {
  isOpen: boolean;
  count: number;
  itemTypeLabel: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function BatchDeleteConfirmModal({
  isOpen,
  count,
  itemTypeLabel,
  loading,
  onClose,
  onConfirm,
}: BatchDeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center border-2 border-rose-100 shadow-inner">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Confirm Batch Deletion
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <strong className="text-rose-600 font-extrabold text-sm">
                {count} {itemTypeLabel}
              </strong>{" "}
              from the system? This action will remove all selected records from Supabase
              database tables. This cannot be undone!
            </p>
          </div>

          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Delete {count} {itemTypeLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface BatchRescoutConfirmModalProps {
  isOpen: boolean;
  count: number;
  itemTypeLabel: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function BatchRescoutConfirmModal({
  isOpen,
  count,
  itemTypeLabel,
  loading,
  onClose,
  onConfirm,
}: BatchRescoutConfirmModalProps) {
  if (!isOpen) return null;

  // Estimate ~$0.04 per profile scrape credit & residential proxy cost
  const estimatedCost = (count * 0.04).toFixed(2);
  const minSeconds = Math.max(5, count * 2);
  const maxSeconds = Math.max(15, count * 6);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-violet-500/10 border-b border-amber-200/50 px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center border border-amber-200 shadow-sm shrink-0">
                <Coins className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Confirm Live Social Sync
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    Paid API Quota
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live crawler execution via Apify & Residential Proxies
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Cost & Duration Estimator Grid */}
          <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-center">
            <div className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Selected
              </span>
              <span className="text-sm font-black text-slate-800">
                {count} {itemTypeLabel}
              </span>
            </div>
            <div className="space-y-0.5 border-x border-slate-200 px-2">
              <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider block">
                Est. API Cost
              </span>
              <span className="text-sm font-black text-amber-600">
                ~${estimatedCost} USD
              </span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Est. Duration
              </span>
              <span className="text-sm font-black text-slate-700">
                ~{minSeconds}-{maxSeconds}s
              </span>
            </div>
          </div>

          {/* Warning Explanation */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 text-xs text-amber-900 space-y-1.5 leading-relaxed">
            <div className="flex items-center space-x-1.5 font-bold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Third-Party Cloud Scraper Action</span>
            </div>
            <p className="text-amber-800 text-[11px] leading-relaxed">
              This action initiates automated web scraping bots on <strong>Apify Cloud</strong> and consumes paid residential proxy bandwidth to crawl live profiles across TikTok, Instagram, and Facebook.
            </p>
          </div>

          {/* Free Refresh Clarification Note */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3.5 text-xs text-indigo-900 flex items-start space-x-2.5 leading-relaxed">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-indigo-800 space-y-0.5">
              <strong className="font-bold text-indigo-950 block">
                Need a free update?
              </strong>
              <span>
                If you only need to reload records already saved in the database or changes recently made by your teammates, please click <strong>Refresh</strong> on the top navigation bar instead. Database refresh is instantaneous and 100% free.
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>Confirm & Sync ({count} {itemTypeLabel})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

