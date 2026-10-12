"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";
import type { TeamMember } from "./pages/team-page-view";

export function AddMemberDialog({ onCreated }: { onCreated: (member: TeamMember) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<TeamMember["role"]>("viewer");

  function changeOpen(value: boolean) {
    if (saving) return;
    setOpen(value);
    setName(""); setUsername(""); setPassword(""); setRole("viewer"); setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) { setError("Name is required."); return; }
    if (!username.trim()) { setError("Username is required."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), username: username.trim(), password, role }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) { setError(result.error || "Failed to add member."); return; }
      onCreated(result.user);
      toast.success("Member added successfully.");
      setOpen(false); setName(""); setUsername(""); setPassword(""); setRole("viewer");
    } catch {
      setError("Could not confirm account creation. Refresh the member list before trying again.");
    } finally { setSaving(false); }
  }

  const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30";
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">
          <UserPlus className="h-4 w-4" /> Add Member
        </button>
      </DialogTrigger>
      <DialogContent showClose={!saving} className="max-w-md bg-white text-slate-900 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>Create an account and choose its platform access. Share the login credentials with the member securely.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={saving} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="member-name" className="text-sm font-semibold">Full Name</label>
              <input id="member-name" autoComplete="name" autoFocus required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Enter full name" />
            </div>
            <div className="space-y-1">
              <label htmlFor="member-username" className="text-sm font-semibold">Username</label>
              <input id="member-username" autoComplete="username" required minLength={3} maxLength={50} value={username} onChange={(e) => setUsername(e.target.value)} className={fieldClass} placeholder="e.g. hoangle or alex_nguyen" />
              <p id="member-username-help" className="text-xs text-slate-500">At least 3 characters. The member can log in using this username.</p>
            </div>
            <div className="space-y-1">
              <label htmlFor="member-password" className="text-sm font-semibold">Password</label>
              <input id="member-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="member-password-help" className={fieldClass} placeholder="••••••••" />
              <p id="member-password-help" className="text-xs text-slate-500">At least 8 characters. The member can log in immediately.</p>
            </div>
            <div className="space-y-1">
              <label htmlFor="member-role" className="text-sm font-semibold">Role</label>
              <select id="member-role" value={role} onChange={(e) => setRole(e.target.value as TeamMember["role"])} aria-describedby="member-role-help" className={fieldClass}>
                <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option>
              </select>
              <p id="member-role-help" className="text-xs text-slate-500">{role === "admin" ? "Full access, including team roles and platform settings." : role === "editor" ? "Can scout, edit records, and evaluate." : "Can view platform data without editing."}</p>
            </div>
          </fieldset>
          {error && <p role="alert" className="text-xs font-semibold text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200">{error}</p>}
          <DialogFooter>
            <button type="button" disabled={saving} onClick={() => changeOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Adding Member…" : "Add Member"}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
