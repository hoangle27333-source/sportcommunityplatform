"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Users,
  Shield,
  ShieldCheck,
  UserCheck,
  Search,
  RefreshCw,
  Calendar,
  Briefcase,
  Award,
  History,
  CheckCircle2,
  Clock,
  ArrowRight,
  Filter,
} from "lucide-react";
import { PlatformHeader } from "../platform-header";
import { ColumnInfoTooltip } from "../column-info-tooltip";
import { createClient } from "@/lib/supabase/client";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  createdAt: string;
  picProjectsCount: number;
  reportsCount: number;
}

export interface AuditLogItem {
  id: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string;
  detail: Record<string, any>;
  createdAt: string;
}

export function TeamPageView() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"members" | "audit">("members");

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const [currentRole, setCurrentRole] = useState<string>("viewer");

  useEffect(() => {
    loadCurrentUserRole();
    fetchData();
  }, []);

  async function loadCurrentUserRole() {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (prof?.role) setCurrentRole(prof.role);
      }
    } catch {
      // ignore
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const [usersRes, auditRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/audit-log?limit=50"),
      ]);

      const usersJson = await usersRes.json();
      if (usersJson.success) {
        setMembers(usersJson.users || []);
      }

      const auditJson = await auditRes.json();
      if (auditJson.success) {
        setAuditLogs(auditJson.logs || []);
      }
    } catch (err: any) {
      toast.error("Failed to load team data: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (currentRole !== "admin") {
      toast.error("Only administrators can change team member roles.");
      return;
    }

    setUpdatingUserId(userId);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Role updated successfully!");
        setMembers((prev) =>
          prev.map((m) => (m.id === userId ? { ...m, role: newRole as any } : m))
        );
      } else {
        toast.error(data.error || "Failed to update role");
      }
    } catch {
      toast.error("Server connection error");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalMembers = members.length;
  const adminCount = members.filter((m) => m.role === "admin").length;
  const editorCount = members.filter((m) => m.role === "editor").length;
  const totalPicAssignments = members.reduce((sum, m) => sum + m.picProjectsCount, 0);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "editor":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "viewer":
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <PlatformHeader onRefresh={fetchData} loading={loading} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page Title & Controls (Strictly Single Line) */}
        <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4 flex-nowrap">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-100/80 text-blue-600 flex items-center justify-center font-bold shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="flex items-center space-x-2.5 min-w-0">
              <h1 className="text-base font-bold text-slate-900 leading-none whitespace-nowrap">
                Team & Access Management
              </h1>
              <span className="bg-blue-50 text-blue-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-blue-200 shrink-0">
                {totalMembers} Members
              </span>
              <span className="text-slate-300 hidden md:inline">|</span>
              <span className="text-xs text-slate-400 font-medium truncate hidden md:inline">
                Role-based access control and platform activity attribution
              </span>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center gap-1.5 p-0.5 bg-slate-100 border border-slate-200 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("members")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === "members"
                  ? "bg-white text-blue-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Members ({totalMembers})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === "audit"
                  ? "bg-white text-blue-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit Trail</span>
            </button>
          </div>
        </div>

        {/* KPI Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Members
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{totalMembers}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Active accounts in system</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Administrators
              </span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{adminCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Full permission & config</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Editors
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{editorCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Can scout, edit & evaluate</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                PIC Assignments
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{totalPicAssignments}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Active projects assigned</p>
          </div>
        </div>

        {activeTab === "members" ? (
          /* Members Table Section */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="button"
                  onClick={fetchData}
                  className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition"
                  title="Refresh list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2 px-4">Member Name</th>
                    <th className="py-2 px-4">Role & Access</th>
                    <th className="py-2 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <span>PIC Projects</span>
                        <ColumnInfoTooltip
                          title="Assigned PIC Campaigns"
                          description="Total active and historical campaigns where this team member is designated as the primary Person in Charge."
                          align="center"
                        />
                      </div>
                    </th>
                    <th className="py-2 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <span>Evaluations</span>
                        <ColumnInfoTooltip
                          title="Completed Evaluations"
                          description="Total official performance and attitude assessment reports authored by this team member."
                          align="center"
                        />
                      </div>
                    </th>
                    <th className="py-2 px-4">Joined Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        No team members found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-50/70 transition h-11">
                        <td className="py-2 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 max-w-[280px]" title={`${member.name} (${member.email})`}>
                            <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-2xs shrink-0">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-bold text-slate-900 truncate text-xs">{member.name}</span>
                            <span className="text-slate-300 shrink-0">·</span>
                            <span className="text-[11px] text-slate-400 truncate">{member.email}</span>
                          </div>
                        </td>

                        <td className="py-2 px-4 whitespace-nowrap">
                          {currentRole === "admin" ? (
                            <select
                              value={member.role}
                              disabled={updatingUserId === member.id}
                              onChange={(e) => handleRoleChange(member.id, e.target.value)}
                              className={`px-2 py-0.5 rounded-lg border text-xs font-bold transition focus:outline-none ${getRoleBadge(
                                member.role
                              )}`}
                            >
                              <option value="admin">Admin</option>
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-block uppercase text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRoleBadge(
                                member.role
                              )}`}
                            >
                              {member.role}
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-4 text-center font-bold text-slate-700 whitespace-nowrap">
                          {member.picProjectsCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]">
                              <Briefcase className="w-3 h-3" />
                              <span>{member.picProjectsCount}</span>
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="py-2 px-4 text-center font-bold text-slate-700 whitespace-nowrap">
                          {member.reportsCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px]">
                              <Award className="w-3 h-3" />
                              <span>{member.reportsCount}</span>
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="py-2 px-4 text-slate-500 font-medium whitespace-nowrap text-xs">
                          {new Date(member.createdAt).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Audit Log Section */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-sm font-bold text-slate-900">System Activity History</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Real-time audit trail of records created, updated, and scout tasks initiated.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchData}
                className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition"
                title="Refresh audit log"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {auditLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No recorded activity yet.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-4 flex items-start gap-3 hover:bg-slate-50/60 transition">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold shrink-0 mt-0.5">
                      <Clock className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs">{log.actorName}</span>
                        {log.actorEmail && (
                          <span className="text-[11px] text-slate-400">({log.actorEmail})</span>
                        )}
                        <span
                          className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded border ${
                            log.action === "create"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : log.action === "update"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : log.action === "delete"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-purple-50 text-purple-700 border-purple-200"
                          }`}
                        >
                          {log.action}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                          {log.entity}
                        </span>
                      </div>

                      {log.detail?.title && (
                        <p className="text-xs font-semibold text-slate-800 mt-1">
                          Target: {log.detail.title}
                        </p>
                      )}

                      {log.detail?.updatedFields && Array.isArray(log.detail.updatedFields) && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Fields modified: {log.detail.updatedFields.join(", ")}
                        </p>
                      )}

                      <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(log.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
