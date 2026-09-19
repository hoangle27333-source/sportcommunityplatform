"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { PlatformHeader } from "../platform-header";
import { KolsTableView } from "../tabs/kols-table-view";
import { Kol360Modal } from "../dossier-modals";
import { KolGrowthModal } from "../kol-growth-modal";
import { ScoutDiffModal } from "../scout-diff-modal";
import {
  AddKolModal,
  EditKolModal,
  DeleteConfirmModal,
  ReportModal,
} from "../action-modals";
import { ExcelUploadModal } from "../excel-upload-modal";
import { KolPostScoutModal } from "../kol-post-scout-modal";
import { BatchActionBar } from "../batch-action-bar";
import { DiscoveryScoutModal } from "../discovery-scout-modal";
import { AddChannelModal, MergeEntityModal } from "../channel-modals";
import type { DashboardData, KOL } from "../types";

export interface KolsPageViewProps {
  initialData: DashboardData;
}

export function KolsPageView({ initialData }: KolsPageViewProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [selectedKolFor360, setSelectedKolFor360] = useState<KOL | null>(null);
  const [scoutTargetKol, setScoutTargetKol] = useState<KOL | null>(null);
  const [growthKol, setGrowthKol] = useState<KOL | null>(null);
  const [diffKol, setDiffKol] = useState<KOL | null>(null);
  const [editingKol, setEditingKol] = useState<KOL | null>(null);
  const [deletingKol, setDeletingKol] = useState<KOL | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddKolModalOpen, setIsAddKolModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTargetKol, setReportTargetKol] = useState<any>(null);
  const [channelTargetKol, setChannelTargetKol] = useState<KOL | null>(null);
  const [mergeTargetKols, setMergeTargetKols] = useState<KOL[]>([]);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  // Batch Selection & Discovery Scout State
  const [selectedKolIds, setSelectedKolIds] = useState<string[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchRescouting, setIsBatchRescouting] = useState(false);
  const [isDiscoveryScoutOpen, setIsDiscoveryScoutOpen] = useState(false);

  const handleOpenAddChannel = (kol: KOL) => {
    setChannelTargetKol(kol);
  };

  const handleOpenMerge = (initialKols?: KOL[]) => {
    if (initialKols && initialKols.length > 0) {
      setMergeTargetKols(initialKols);
    } else {
      const selected = data.kols.filter((k) => selectedKolIds.includes(k.id));
      setMergeTargetKols(selected);
    }
    setIsMergeModalOpen(true);
  };

  const handleToggleSelectKol = (id: string) => {
    setSelectedKolIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllKols = (ids: string[]) => {
    setSelectedKolIds(ids);
  };

  const handleClearSelection = () => {
    setSelectedKolIds([]);
  };

  const handleBatchRescout = async () => {
    if (selectedKolIds.length === 0) return;
    setIsBatchRescouting(true);
    try {
      const res = await fetch("/api/sport-hub/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "kol",
          action: "rescout",
          ids: selectedKolIds,
        }),
      });
      const result = await res.json().catch(() => null);
      if (result?.success) {
        toast.success(result.message || `Successfully synced live data for ${selectedKolIds.length} creators!`);
        await handleRefresh();
        setSelectedKolIds([]);
      } else {
        toast.error(result?.error || "Failed to batch sync live metrics");
      }
    } catch {
      toast.error("Network error during batch sync");
    } finally {
      setIsBatchRescouting(false);
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedKolIds.length === 0) return;
    setIsBatchDeleting(true);
    try {
      const res = await fetch("/api/sport-hub/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "kol",
          action: "delete",
          ids: selectedKolIds,
        }),
      });
      const result = await res.json().catch(() => null);
      if (result?.success) {
        toast.success(result.message || `Deleted ${selectedKolIds.length} creators.`);
        await handleRefresh();
        setSelectedKolIds([]);
      } else {
        toast.error(result?.error || "Failed to batch delete creators");
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
        toast.success("KOLs data refreshed successfully!");
      } else {
        toast.error(result?.error || "Error refreshing data");
      }
    } catch {
      toast.error("Unable to connect to server API");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateKol = (updatedKol: any) => {
    toast.success(`Updated details for KOL "${updatedKol.name}"!`);
    setData((prev) => {
      const nextKols = prev.kols.map((k) =>
        k.id === updatedKol.id ? { ...k, ...updatedKol } : k
      );
      const nextReach = nextKols.reduce((sum, k) => sum + (k.followers || 0), 0);
      return {
        ...prev,
        kols: nextKols,
        kpis: {
          ...prev.kpis,
          totalReach: nextReach,
        },
      };
    });
    setSelectedKolFor360((prev) =>
      prev && prev.id === updatedKol.id ? { ...prev, ...updatedKol } : prev
    );
  };

  const handleDeleteKol = async () => {
    if (!deletingKol) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/sport-hub/record?table=kols&id=${deletingKol.id}`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`Deleted KOL "${deletingKol.name}" successfully!`);
        setData((prev) => {
          const nextKols = prev.kols.filter((k) => k.id !== deletingKol.id);
          const nextReach = nextKols.reduce((sum, k) => sum + (k.followers || 0), 0);
          return {
            ...prev,
            kols: nextKols,
            kpis: {
              ...prev.kpis,
              totalKols: nextKols.length,
              totalReach: nextReach,
            },
          };
        });
        if (selectedKolFor360?.id === deletingKol.id) {
          setSelectedKolFor360(null);
        }
        setDeletingKol(null);
      } else {
        toast.error(result.error || "Failed to delete record");
      }
    } catch {
      toast.error("Server connection failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDiffResolved = (updatedRecord: any) => {
    if (!updatedRecord) return;
    setData((prev) => ({
      ...prev,
      kols: prev.kols.map((k) => {
        if (k.id === updatedRecord.id) {
          return {
            ...k,
            name: updatedRecord.name || k.name,
            sport: Array.isArray(updatedRecord.sports) ? updatedRecord.sports : k.sport,
            tier: updatedRecord.tier || k.tier,
            platform: updatedRecord.platform || k.platform,
            geography: updatedRecord.geography || k.geography,
            followers: Number(updatedRecord.followers) || k.followers,
            avgViews: Number(updatedRecord.avg_views) || k.avgViews,
            er: Number(updatedRecord.er) || k.er,
            quotation: Number(updatedRecord.quotation) || k.quotation,
            status: updatedRecord.status || k.status,
            info: updatedRecord.contact_info || k.info,
            bio: updatedRecord.bio || (k as any).bio,
            profileUrl: updatedRecord.profile_url || k.profileUrl,
            avatarUrl: updatedRecord.avatar_url || (k as any).avatarUrl,
            pendingScoutDiff: null,
          };
        }
        return k;
      }),
    }));
    setSelectedKolFor360((prev) =>
      prev && prev.id === updatedRecord.id
        ? {
            ...prev,
            name: updatedRecord.name || prev.name,
            sport: Array.isArray(updatedRecord.sports) ? updatedRecord.sports : prev.sport,
            tier: updatedRecord.tier || prev.tier,
            platform: updatedRecord.platform || prev.platform,
            geography: updatedRecord.geography || prev.geography,
            followers: Number(updatedRecord.followers) || prev.followers,
            avgViews: Number(updatedRecord.avg_views) || prev.avgViews,
            er: Number(updatedRecord.er) || prev.er,
            quotation: Number(updatedRecord.quotation) || prev.quotation,
            status: updatedRecord.status || prev.status,
            info: updatedRecord.contact_info || prev.info,
            bio: updatedRecord.bio || (prev as any).bio,
            profileUrl: updatedRecord.profile_url || prev.profileUrl,
            avatarUrl: updatedRecord.avatar_url || (prev as any).avatarUrl,
            pendingScoutDiff: null,
          }
        : prev
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* ─── GLOBAL PLATFORM HEADER ─── */}
      <PlatformHeader onRefresh={handleRefresh} loading={loading} />

      {/* ─── MAIN CONTENT ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6 pb-24">
        <KolsTableView
          kols={data.kols}
          selectedKolIds={selectedKolIds}
          onToggleSelectKol={handleToggleSelectKol}
          onSelectAllKols={handleSelectAllKols}
          onClearSelection={handleClearSelection}
          onOpenDiscoveryScout={() => setIsDiscoveryScoutOpen(true)}
          onSelectKol={(kolId) => {
            const found = data.kols.find((k) => k.id === kolId);
            if (found) setSelectedKolFor360(found);
          }}
          onView360={(kol) => setSelectedKolFor360(kol)}
          onAddKol={() => setIsAddKolModalOpen(true)}
          onOpenReport={(kol) => {
            setReportTargetKol(kol);
            setIsReportModalOpen(true);
          }}
          onUploadExcel={() => setIsUploadModalOpen(true)}
          onRefresh={handleRefresh}
          loading={loading}
          onEditKol={(kol) => setEditingKol(kol)}
          onDeleteKol={(kol) => setDeletingKol(kol)}
          onOpenDiff={(kol) => setDiffKol(kol)}
          onOpenGrowth={(kol) => setGrowthKol(kol)}
          onScoutKol={(kol) => setScoutTargetKol(kol)}
          onAddChannel={handleOpenAddChannel}
          onMergeKol={(kol) => handleOpenMerge([kol])}
        />
      </main>

      {/* ─── MODALS ─── */}
      {/* 1. Base Full-Screen 360 Dossier Modal */}
      {selectedKolFor360 && (
        <Kol360Modal
          isOpen={!!selectedKolFor360}
          kol={selectedKolFor360}
          posts={data.posts}
          reports={data.reports}
          onClose={() => setSelectedKolFor360(null)}
          onOpenReport={(kol) => {
            setReportTargetKol(kol);
            setIsReportModalOpen(true);
          }}
          onEditKol={(kol) => setEditingKol(kol)}
          onScoutKolPosts={(kol) => setScoutTargetKol(kol)}
          onOpenGrowth={(kol) => setGrowthKol(kol)}
          onOpenDiff={(kol) => setDiffKol(kol)}
          onAddChannel={handleOpenAddChannel}
          onUpdateKol={handleUpdateKol}
        />
      )}

      {/* 2. Action & Overlay Modals (Rendered on top of 360) */}
      <EditKolModal
        isOpen={!!editingKol}
        kol={editingKol}
        onClose={() => setEditingKol(null)}
        onSuccess={(updated) => {
          handleUpdateKol(updated);
          setEditingKol(null);
        }}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        targetKol={reportTargetKol}
        onClose={() => setIsReportModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <KolPostScoutModal
        isOpen={!!scoutTargetKol}
        kol={scoutTargetKol}
        onClose={() => setScoutTargetKol(null)}
        onSuccess={handleRefresh}
      />

      {growthKol && (
        <KolGrowthModal
          isOpen={!!growthKol}
          kol={growthKol}
          onClose={() => setGrowthKol(null)}
        />
      )}

      {diffKol && (
        <ScoutDiffModal
          isOpen={!!diffKol}
          kol={diffKol}
          onClose={() => setDiffKol(null)}
          onSuccess={(updated) => {
            handleDiffResolved(updated);
            setDiffKol(null);
          }}
        />
      )}

      <AddKolModal
        isOpen={isAddKolModalOpen}
        onClose={() => setIsAddKolModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <DeleteConfirmModal
        isOpen={!!deletingKol}
        itemName={deletingKol?.name || ""}
        itemTitle="KOL profile"
        loading={isDeleting}
        onClose={() => setDeletingKol(null)}
        onConfirm={handleDeleteKol}
      />

      <ExcelUploadModal
        isOpen={isUploadModalOpen}
        defaultType="kol"
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleRefresh}
      />

      {/* 3. Floating Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedKolIds.length}
        totalCount={data.kols.length}
        itemTypeLabel="creators"
        onSelectAll={() => setSelectedKolIds(data.kols.map((k) => k.id))}
        onClearSelection={handleClearSelection}
        onBatchRescout={handleBatchRescout}
        onBatchDelete={handleConfirmBatchDelete}
        onBatchMerge={() => handleOpenMerge()}
        mergeButtonLabel="Merge Profiles"
        loadingRescout={isBatchRescouting}
        loadingDelete={isBatchDeleting}
        rescoutButtonLabel="Sync Live Data"
      />

      {/* 4. Dedicated Discovery Scout Modal */}
      <DiscoveryScoutModal
        isOpen={isDiscoveryScoutOpen}
        onClose={() => setIsDiscoveryScoutOpen(false)}
        defaultTargetType="Sports KOLs & Influencers"
        onScoutSuccess={handleRefresh}
      />

      {/* 5. Add Social Channel Modal */}
      {channelTargetKol && (
        <AddChannelModal
          isOpen={!!channelTargetKol}
          onClose={() => setChannelTargetKol(null)}
          entityType="kol"
          entity={channelTargetKol}
          onSuccess={handleRefresh}
        />
      )}

      {/* 6. Merge Duplicate Profiles Modal */}
      {isMergeModalOpen && (
        <MergeEntityModal
          isOpen={isMergeModalOpen}
          onClose={() => {
            setIsMergeModalOpen(false);
            setMergeTargetKols([]);
          }}
          entityType="kol"
          initialSelectedEntities={mergeTargetKols}
          allEntities={data.kols}
          onSuccess={() => {
            handleRefresh();
            setSelectedKolIds([]);
          }}
        />
      )}
    </div>
  );
}
