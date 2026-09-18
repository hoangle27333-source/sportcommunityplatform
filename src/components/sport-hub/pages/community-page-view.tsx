"use client";

import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import { PlatformHeader } from "../platform-header";
import { CommunityTableView } from "../tabs/community-table-view";
import { Community360Modal } from "../dossier-modals";
import {
  AddCommunityModal,
  EditCommunityModal,
  DeleteConfirmModal,
  ReportModal,
  ScoutModal,
  CommunityPostScoutModal,
} from "../action-modals";
import { ExcelUploadModal } from "../excel-upload-modal";
import { BatchActionBar } from "../batch-action-bar";
import { DiscoveryScoutModal } from "../discovery-scout-modal";
import { formatNumber } from "@/lib/i18n";
import type { DashboardData, Community } from "../types";

export interface CommunityPageViewProps {
  initialData: DashboardData;
}

export function CommunityPageView({ initialData }: CommunityPageViewProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [selectedCommunityFor360, setSelectedCommunityFor360] = useState<Community | null>(null);
  const [editingCommunity, setEditingCommunity] = useState<Community | null>(null);
  const [deletingCommunity, setDeletingCommunity] = useState<Community | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [scoutTargetCommunity, setScoutTargetCommunity] = useState<Community | null>(null);
  const [isScoutModalOpen, setIsScoutModalOpen] = useState(false);
  const [isAddCommunityModalOpen, setIsAddCommunityModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTargetCommunity, setReportTargetCommunity] = useState<Community | null>(null);

  // Batch Selection & Discovery Scout State
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<string[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchRescouting, setIsBatchRescouting] = useState(false);
  const [isDiscoveryScoutOpen, setIsDiscoveryScoutOpen] = useState(false);

  const handleToggleSelectCommunity = (id: string) => {
    setSelectedCommunityIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllCommunities = (ids: string[]) => {
    setSelectedCommunityIds(ids);
  };

  const handleClearSelection = () => {
    setSelectedCommunityIds([]);
  };

  const handleBatchRescout = async () => {
    if (selectedCommunityIds.length === 0) return;
    setIsBatchRescouting(true);
    try {
      const res = await fetch("/api/sport-hub/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "community",
          action: "rescout",
          ids: selectedCommunityIds,
        }),
      });
      const result = await res.json().catch(() => null);
      if (result?.success) {
        toast.success(result.message || `Successfully synced live data for ${selectedCommunityIds.length} communities!`);
        await handleRefresh();
        setSelectedCommunityIds([]);
      } else {
        toast.error(result?.error || "Failed to batch sync community metrics");
      }
    } catch {
      toast.error("Network error during batch sync");
    } finally {
      setIsBatchRescouting(false);
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedCommunityIds.length === 0) return;
    setIsBatchDeleting(true);
    try {
      const res = await fetch("/api/sport-hub/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "community",
          action: "delete",
          ids: selectedCommunityIds,
        }),
      });
      const result = await res.json().catch(() => null);
      if (result?.success) {
        toast.success(result.message || `Deleted ${selectedCommunityIds.length} communities.`);
        await handleRefresh();
        setSelectedCommunityIds([]);
      } else {
        toast.error(result?.error || "Failed to batch delete communities");
      }
    } catch {
      toast.error("Network error during batch deletion");
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sport-hub/data");
      const result = await res.json().catch(() => null);
      if (result?.success) {
        setData({
          kpis: result.kpis,
          kols: result.kols,
          communities: result.communities,
          posts: result.posts,
          reports: result.reports,
          projects: result.projects,
        });
        toast.success("Community data refreshed successfully!");
      } else {
        toast.error(result?.error || "Error refreshing data");
      }
    } catch {
      toast.error("Unable to connect to server API");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCommunity = (updated: any) => {
    toast.success(`Updated details for Community "${updated.name}"!`);
    setData((prev) => {
      const nextCommunities = prev.communities.map((c) =>
        c.id === updated.id ? { ...c, ...updated } : c
      );
      const nextMembers = nextCommunities.reduce((sum, c) => sum + (c.members || 0), 0);
      return {
        ...prev,
        communities: nextCommunities,
        kpis: {
          ...prev.kpis,
          totalCommunityMembers: nextMembers,
        },
      };
    });
    setSelectedCommunityFor360((prev) =>
      prev && prev.id === updated.id ? { ...prev, ...updated } : prev
    );
  };

  const handleDeleteCommunity = async () => {
    if (!deletingCommunity) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/sport-hub/record?table=communities&id=${deletingCommunity.id}`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`Deleted Community "${deletingCommunity.name}" successfully!`);
        setData((prev) => {
          const nextCommunities = prev.communities.filter((c) => c.id !== deletingCommunity.id);
          const nextMembers = nextCommunities.reduce((sum, c) => sum + (c.members || 0), 0);
          return {
            ...prev,
            communities: nextCommunities,
            kpis: {
              ...prev.kpis,
              totalCommunities: nextCommunities.length,
              totalCommunityMembers: nextMembers,
            },
          };
        });
        if (selectedCommunityFor360?.id === deletingCommunity.id) {
          setSelectedCommunityFor360(null);
        }
        setDeletingCommunity(null);
      } else {
        toast.error(result.error || "Failed to delete record");
      }
    } catch {
      toast.error("Server connection failed");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-purple-600 selection:text-white">
      {/* ─── GLOBAL PLATFORM HEADER ─── */}
      <PlatformHeader onRefresh={handleRefresh} loading={loading} />

      {/* ─── MAIN CONTENT ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6 pb-24">
        <CommunityTableView
          communities={data.communities}
          selectedCommunityIds={selectedCommunityIds}
          onToggleSelectCommunity={handleToggleSelectCommunity}
          onSelectAllCommunities={handleSelectAllCommunities}
          onClearSelection={handleClearSelection}
          onAddCommunity={() => setIsAddCommunityModalOpen(true)}
          onSelectCommunity={(comm) => setSelectedCommunityFor360(comm)}
          onUploadExcel={() => setIsUploadModalOpen(true)}
          onRefresh={handleRefresh}
          loading={loading}
          onEditCommunity={(comm) => setEditingCommunity(comm)}
          onDeleteCommunity={(comm) => setDeletingCommunity(comm)}
          onOpenReport={(comm) => {
            setReportTargetCommunity(comm);
            setIsReportModalOpen(true);
          }}
          onScoutCommunity={() => setIsDiscoveryScoutOpen(true)}
          onScoutCommunityPosts={(comm) => setScoutTargetCommunity(comm)}
        />
      </main>

      {/* ─── MODALS ─── */}
      {/* 1. Base 360° Community Dossier Modal */}
      {selectedCommunityFor360 && (
        <Community360Modal
          isOpen={!!selectedCommunityFor360}
          community={selectedCommunityFor360}
          posts={data.posts}
          reports={data.reports}
          onClose={() => setSelectedCommunityFor360(null)}
          onOpenReport={(comm) => {
            setReportTargetCommunity(comm);
            setIsReportModalOpen(true);
          }}
          onEditCommunity={(comm) => setEditingCommunity(comm)}
          onScoutCommunityPosts={(comm) => setScoutTargetCommunity(comm)}
          onDeleteCommunity={(comm) => setDeletingCommunity(comm)}
        />
      )}

      {/* 2. Action & Overlay Modals */}
      <EditCommunityModal
        isOpen={!!editingCommunity}
        community={editingCommunity}
        onClose={() => setEditingCommunity(null)}
        onSuccess={(updated) => {
          handleUpdateCommunity(updated);
          setEditingCommunity(null);
        }}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        targetCommunity={reportTargetCommunity}
        onClose={() => {
          setIsReportModalOpen(false);
          setReportTargetCommunity(null);
        }}
        onSuccess={handleRefresh}
      />

      <CommunityPostScoutModal
        isOpen={!!scoutTargetCommunity}
        community={scoutTargetCommunity}
        onClose={() => setScoutTargetCommunity(null)}
        onSuccess={handleRefresh}
      />

      <ScoutModal
        isOpen={isScoutModalOpen}
        defaultTargetType="Communities & Clubs"
        onClose={() => setIsScoutModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <AddCommunityModal
        isOpen={isAddCommunityModalOpen}
        onClose={() => setIsAddCommunityModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <DeleteConfirmModal
        isOpen={!!deletingCommunity}
        itemName={deletingCommunity?.name || ""}
        itemTitle="Community / Club profile"
        loading={isDeleting}
        onClose={() => setDeletingCommunity(null)}
        onConfirm={handleDeleteCommunity}
      />

      <ExcelUploadModal
        isOpen={isUploadModalOpen}
        defaultType="community"
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleRefresh}
      />

      {/* 3. Floating Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedCommunityIds.length}
        totalCount={data.communities.length}
        itemTypeLabel="communities"
        onSelectAll={() => setSelectedCommunityIds(data.communities.map((c) => c.id))}
        onClearSelection={handleClearSelection}
        onBatchRescout={handleBatchRescout}
        onBatchDelete={handleConfirmBatchDelete}
        loadingRescout={isBatchRescouting}
        loadingDelete={isBatchDeleting}
        rescoutButtonLabel="Sync Live Data"
      />

      {/* 4. Dedicated Discovery Scout Modal */}
      <DiscoveryScoutModal
        isOpen={isDiscoveryScoutOpen}
        onClose={() => setIsDiscoveryScoutOpen(false)}
        defaultTargetType="Communities & Clubs"
        onScoutSuccess={handleRefresh}
      />
    </div>
  );
}
