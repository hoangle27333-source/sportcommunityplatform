"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { ScoutTaskLauncher } from "../scout-task-launcher";
import { scoutFetch } from "@/lib/apify/scout-client";

import React, { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { PlatformHeader } from "../platform-header";
import { CommunityTableView } from "../tabs/community-table-view";
import { Community360Modal } from "../dossier-modals";
import {
  AddCommunityModal,
  EditCommunityModal,
  DeleteConfirmModal,
  ReportModal,
} from "../action-modals";
import { ExcelUploadModal } from "../excel-upload-modal";
import { BatchActionBar } from "../batch-action-bar";
import { AddChannelModal, MergeEntityModal } from "../channel-modals";
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
  const query = useSearchParams(); const router = useRouter();
  const resultRecordId = query.get('recordId');
  useEffect(() => {
    if (resultRecordId) setSelectedCommunityFor360(initialData.communities.find(record => record.id === resultRecordId) || null);
  }, [resultRecordId, initialData]);

  const [editingCommunity, setEditingCommunity] = useState<Community | null>(null);
  const [deletingCommunity, setDeletingCommunity] = useState<Community | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [scoutTargetCommunity, setScoutTargetCommunity] = useState<Community | null>(null);
  const [isAddCommunityModalOpen, setIsAddCommunityModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTargetCommunity, setReportTargetCommunity] = useState<Community | null>(null);
  const [channelTargetCommunity, setChannelTargetCommunity] = useState<Community | null>(null);
  const [mergeTargetCommunities, setMergeTargetCommunities] = useState<Community[]>([]);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  // Batch Selection & Find Profiles State
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<string[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchRescouting, setIsBatchRescouting] = useState(false);
  const [isDiscoveryScoutOpen, setIsDiscoveryScoutOpen] = useState(false);

  const handleOpenAddChannel = (comm: Community) => {
    setChannelTargetCommunity(comm);
  };

  const handleOpenMerge = (initialComms?: Community[]) => {
    if (initialComms && initialComms.length > 0) {
      setMergeTargetCommunities(initialComms);
    } else {
      const selected = data.communities.filter((c) => selectedCommunityIds.includes(c.id));
      setMergeTargetCommunities(selected);
    }
    setIsMergeModalOpen(true);
  };

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

  const [refreshOpen, setRefreshOpen] = useState(false);
  const handleBatchRescout = async () => { if (selectedCommunityIds.length) setRefreshOpen(true); };

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
          onAddChannel={handleOpenAddChannel}
          onMergeCommunity={(comm) => handleOpenMerge([comm])}
        />
      </main>

      {refreshOpen && <ScoutTaskLauncher context={{ intent: "refresh", mode: "entity", entityType: "community", ids: selectedCommunityIds, source: "/community" }} subjects={data.communities} onClose={() => setRefreshOpen(false)} onSuccess={handleRefresh} />}
      {/* ─── MODALS ─── */}
      {/* 1. Base 360° Community Dossier Modal */}
      {selectedCommunityFor360 && (
        <Community360Modal
          isOpen={!!selectedCommunityFor360}
          community={selectedCommunityFor360}
          posts={data.posts}
          reports={data.reports}
          onClose={() => { setSelectedCommunityFor360(null); if (resultRecordId) router.replace("/community", { scroll: false }); }}
          onOpenReport={(comm) => {
            setReportTargetCommunity(comm);
            setIsReportModalOpen(true);
          }}
          onEditCommunity={(comm) => setEditingCommunity(comm)}
          onScoutCommunityPosts={(comm) => setScoutTargetCommunity(comm)}
          onDeleteCommunity={(comm) => setDeletingCommunity(comm)}
          onAddChannel={handleOpenAddChannel}
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

      {scoutTargetCommunity && <ScoutTaskLauncher key={scoutTargetCommunity.id} context={{ intent: "content", mode: "entity", entityType: "community", ids: [scoutTargetCommunity.id], source: "/community" }} entity={scoutTargetCommunity} onClose={() => setScoutTargetCommunity(null)} onSuccess={handleRefresh} />}


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
        rescoutRequiresConfirmation={false}
        onBatchRescout={handleBatchRescout}
        onBatchDelete={handleConfirmBatchDelete}
        onBatchMerge={() => handleOpenMerge()}
        mergeButtonLabel="Merge Communities"
        loadingRescout={isBatchRescouting}
        loadingDelete={isBatchDeleting}
        rescoutButtonLabel="Refresh Data"
      />

      {/* 4. Dedicated Find Profiles Modal */}
      {isDiscoveryScoutOpen && <ScoutTaskLauncher key={"profiles"} context={{ intent: "profiles", mode: "search", entityType: "community", source: "/community" }} onClose={() => setIsDiscoveryScoutOpen(false)} onSuccess={handleRefresh} />}

      {/* 5. Add Social Channel Modal */}
      {channelTargetCommunity && (
        <AddChannelModal
          isOpen={!!channelTargetCommunity}
          onClose={() => setChannelTargetCommunity(null)}
          entityType="community"
          entity={channelTargetCommunity}
          onSuccess={handleRefresh}
        />
      )}

      {/* 6. Merge Duplicate Communities Modal */}
      {isMergeModalOpen && (
        <MergeEntityModal
          isOpen={isMergeModalOpen}
          onClose={() => {
            setIsMergeModalOpen(false);
            setMergeTargetCommunities([]);
          }}
          entityType="community"
          initialSelectedEntities={mergeTargetCommunities}
          allEntities={data.communities}
          onSuccess={() => {
            handleRefresh();
            setSelectedCommunityIds([]);
          }}
        />
      )}
    </div>
  );
}
