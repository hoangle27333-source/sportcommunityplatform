"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { PlatformHeader } from "../platform-header";
import { ProjectsTableView } from "../tabs/projects-table-view";
import { ReportsTableView } from "../tabs/reports-table-view";
import { Kol360Modal } from "../dossier-modals";
import {
  AddProjectModal,
  EditProjectModal,
  DeleteConfirmModal,
  ReportModal,
} from "../action-modals";
import { ProjectDetailModal } from "../project-detail-modal";
import { BookParticipantModal } from "../book-participant-modal";
import { LogPerformanceModal } from "../log-performance-modal";
import { ParticipantEvaluationModal } from "../participant-evaluation-modal";
import { BatchActionBar } from "../batch-action-bar";
import type { DashboardData, KOL, Project, ProjectParticipant } from "../types";

export interface ProjectsPageViewProps {
  initialData: DashboardData;
}

export function ProjectsPageView({ initialData }: ProjectsPageViewProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [defaultProjectName, setDefaultProjectName] = useState("");
  const [reportTargetKol, setReportTargetKol] = useState<any>(null);
  const [selectedKolFor360, setSelectedKolFor360] = useState<KOL | null>(null);

  // Project Command Center & Participant Modals
  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<Project | null>(null);
  const [bookingTargetProject, setBookingTargetProject] = useState<Project | null>(null);
  const [perfTarget, setPerfTarget] = useState<{ project: Project; participant: ProjectParticipant } | null>(null);
  const [evalTarget, setEvalTarget] = useState<{ project: Project; participant: ProjectParticipant } | null>(null);

  // Batch Selection State
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchRescouting, setIsBatchRescouting] = useState(false);

  const handleToggleSelectProject = (id: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllProjects = (ids: string[]) => {
    setSelectedProjectIds(ids);
  };

  const handleClearSelection = () => {
    setSelectedProjectIds([]);
  };

  const handleBatchRescout = async () => {
    if (selectedProjectIds.length === 0) return;
    setIsBatchRescouting(true);
    try {
      const res = await fetch("/api/sport-hub/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "project",
          action: "rescout",
          ids: selectedProjectIds,
        }),
      });
      const result = await res.json().catch(() => null);
      if (result?.success) {
        toast.success(result.message || `Successfully refreshed data for ${selectedProjectIds.length} campaigns!`);
        await handleRefresh();
        setSelectedProjectIds([]);
      } else {
        toast.error(result?.error || "Failed to batch refresh campaign data");
      }
    } catch {
      toast.error("Network error during batch sync");
    } finally {
      setIsBatchRescouting(false);
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedProjectIds.length === 0) return;
    setIsBatchDeleting(true);
    try {
      const res = await fetch("/api/sport-hub/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "project",
          action: "delete",
          ids: selectedProjectIds,
        }),
      });
      const result = await res.json().catch(() => null);
      if (result?.success) {
        toast.success(result.message || `Deleted ${selectedProjectIds.length} campaigns.`);
        await handleRefresh();
        setSelectedProjectIds([]);
      } else {
        toast.error(result?.error || "Failed to batch delete campaigns");
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
        const newData: DashboardData = {
          kpis: result.kpis,
          kols: result.kols,
          communities: result.communities,
          posts: result.posts,
          reports: result.reports,
          projects: result.projects,
        };
        setData(newData);

        // Update active open detail project if any
        if (selectedProjectForDetail) {
          const updatedProj = (result.projects || []).find(
            (p: Project) => p.id === selectedProjectForDetail.id
          );
          if (updatedProj) {
            setSelectedProjectForDetail(updatedProj);
          }
        }

        toast.success("Campaigns & Roster data refreshed!");
      } else {
        toast.error(result?.error || "Error synchronizing data");
      }
    } catch {
      toast.error("Unable to connect to server API");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProject = (updated: Project) => {
    setData((prev) => {
      const nextProjects = (prev.projects || []).map((p) =>
        p.id === updated.id ? { ...p, ...updated } : p
      );
      const nextTotalBudget = nextProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
      return {
        ...prev,
        projects: nextProjects,
        kpis: {
          ...prev.kpis,
          totalProjects: nextProjects.length,
          totalBudget: nextTotalBudget,
        },
      };
    });
    if (selectedProjectForDetail?.id === updated.id) {
      setSelectedProjectForDetail((prev) => (prev ? { ...prev, ...updated } : null));
    }
  };

  const handleDeleteProject = async () => {
    if (!deletingProject) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/sport-hub/record?type=project&id=${deletingProject.id}`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`Deleted campaign "${deletingProject.name}" successfully!`);
        setData((prev) => {
          const nextProjects = (prev.projects || []).filter((p) => p.id !== deletingProject.id);
          const nextTotalBudget = nextProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
          return {
            ...prev,
            projects: nextProjects,
            kpis: {
              ...prev.kpis,
              totalProjects: nextProjects.length,
              totalBudget: nextTotalBudget,
            },
          };
        });
        if (selectedProjectForDetail?.id === deletingProject.id) {
          setSelectedProjectForDetail(null);
        }
        setDeletingProject(null);
      } else {
        toast.error(result.error || "Failed to delete campaign");
      }
    } catch {
      toast.error("Server connection failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenKolByName = (kolName: string) => {
    const clean = (kolName || "").trim().toLowerCase();
    const found = data.kols.find(
      (k) =>
        k.name.toLowerCase() === clean ||
        clean.includes(k.name.toLowerCase()) ||
        k.name.toLowerCase().includes(clean)
    );
    if (found) {
      setSelectedKolFor360(found);
    } else {
      toast.info(`No detailed 360° profile found for "${kolName}"`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* ─── GLOBAL PLATFORM HEADER ─── */}
      <PlatformHeader onRefresh={handleRefresh} loading={loading} />

      {/* ─── MAIN CONTENT ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-10 pb-24">
        {/* Section 1: Active Campaigns & Multi-Brand Projects */}
        <section className="space-y-4">
          <ProjectsTableView
            projects={data.projects || []}
            reports={data.reports || []}
            selectedProjectIds={selectedProjectIds}
            onToggleSelectProject={handleToggleSelectProject}
            onSelectAllProjects={handleSelectAllProjects}
            onClearSelection={handleClearSelection}
            onAddProject={() => setIsAddProjectModalOpen(true)}
            onOpenProjectDetail={(proj) => setSelectedProjectForDetail(proj)}
            onOpenBookParticipant={(proj) => setBookingTargetProject(proj)}
            onEditProject={(proj) => setEditingProject(proj)}
            onDeleteProject={(proj) => setDeletingProject(proj)}
            onOpenReportForProject={(projName) => {
              setDefaultProjectName(projName);
              setReportTargetKol(null);
              setIsReportModalOpen(true);
            }}
            onSelectKol={(kolName) => handleOpenKolByName(kolName)}
            onRefresh={handleRefresh}
            loading={loading}
          />
        </section>

        {/* Section 2: Deliverables Sign-off & Reports Tracker */}
        <section className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Deliverables Sign-offs & Evaluation Records
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Detailed quality scorecards, commitment vs actual KPI rates, and qualitative PM review notes.
              </p>
            </div>
          </div>

          <ReportsTableView
            reports={data.reports || []}
            onOpenNewReport={() => {
              setDefaultProjectName("");
              setReportTargetKol(null);
              setIsReportModalOpen(true);
            }}
            onSelectKol={(kName) => handleOpenKolByName(kName)}
            onRefresh={handleRefresh}
            loading={loading}
          />
        </section>
      </main>

      {/* ─── MODALS ─── */}
      {/* 1. Campaign Command Center Modal */}
      {selectedProjectForDetail && (
        <ProjectDetailModal
          isOpen={!!selectedProjectForDetail}
          project={selectedProjectForDetail}
          kols={data.kols}
          communities={data.communities}
          onClose={() => setSelectedProjectForDetail(null)}
          onRefresh={handleRefresh}
          onOpenBookParticipant={(proj) => setBookingTargetProject(proj)}
          onOpenLogPerformance={(proj, part) => setPerfTarget({ project: proj, participant: part })}
          onOpenEvaluation={(proj, part) => setEvalTarget({ project: proj, participant: part })}
          onSelectKol={handleOpenKolByName}
        />
      )}

      {/* 2. Book Talent / Club Modal */}
      {bookingTargetProject && (
        <BookParticipantModal
          isOpen={!!bookingTargetProject}
          project={bookingTargetProject}
          kols={data.kols}
          communities={data.communities}
          onClose={() => setBookingTargetProject(null)}
          onSuccess={handleRefresh}
        />
      )}

      {/* 3. Log Performance Modal */}
      {perfTarget && (
        <LogPerformanceModal
          isOpen={!!perfTarget}
          project={perfTarget.project}
          participant={perfTarget.participant}
          onClose={() => setPerfTarget(null)}
          onSuccess={handleRefresh}
        />
      )}

      {/* 4. PM Evaluation & Scorecard Modal */}
      {evalTarget && (
        <ParticipantEvaluationModal
          isOpen={!!evalTarget}
          project={evalTarget.project}
          participant={evalTarget.participant}
          onClose={() => setEvalTarget(null)}
          onSuccess={handleRefresh}
        />
      )}

      {/* 5. Create Project Modal */}
      <AddProjectModal
        isOpen={isAddProjectModalOpen}
        onClose={() => setIsAddProjectModalOpen(false)}
        onSuccess={handleRefresh}
      />

      {/* 5B. Edit Project Modal */}
      <EditProjectModal
        isOpen={!!editingProject}
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSuccess={(updated) => {
          handleUpdateProject(updated);
          setEditingProject(null);
        }}
      />

      {/* 5C. Delete Project Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deletingProject}
        itemName={deletingProject?.name || ""}
        itemTitle="Campaign / Project"
        loading={isDeleting}
        onClose={() => setDeletingProject(null)}
        onConfirm={handleDeleteProject}
      />

      {/* 6. Legacy / Generic Report Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        targetKol={reportTargetKol}
        defaultProject={defaultProjectName}
        onClose={() => setIsReportModalOpen(false)}
        onSuccess={handleRefresh}
      />

      {/* 7. KOL 360 Modal */}
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
        />
      )}

      {/* 8. Floating Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedProjectIds.length}
        totalCount={(data.projects || []).length}
        itemTypeLabel="campaigns"
        onSelectAll={() => setSelectedProjectIds((data.projects || []).map((p) => p.id))}
        onClearSelection={handleClearSelection}
        onBatchRescout={handleBatchRescout}
        onBatchDelete={handleConfirmBatchDelete}
        loadingRescout={isBatchRescouting}
        loadingDelete={isBatchDeleting}
        rescoutButtonLabel="Recalculate Metrics"
      />
    </div>
  );
}
