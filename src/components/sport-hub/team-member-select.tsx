"use client";

import React, { useState, useEffect } from "react";
import { User, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { TeamMember } from "./pages/team-page-view";

export interface TeamMemberSelectProps {
  label: string;
  value: string;
  onChange: (name: string, userId?: string) => void;
  placeholder?: string;
  autoDefaultCurrent?: boolean;
}

export function TeamMemberSelect({
  label,
  value,
  onChange,
  placeholder = "Select team member…",
  autoDefaultCurrent = true,
}: TeamMemberSelectProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadMembers() {
      setLoading(true);
      try {
        const res = await fetch("/api/users");
        const json = await res.json();
        if (json.success && Array.isArray(json.users)) {
          setMembers(json.users);

          // Auto-default to currently logged-in user if no value is set
          if (autoDefaultCurrent && !value) {
            const supabase = createClient();
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user) {
              const matched = json.users.find((m: TeamMember) => m.id === user.id);
              if (matched) {
                onChange(matched.name, matched.id);
              } else if (user.user_metadata?.name) {
                onChange(user.user_metadata.name, user.id);
              }
            }
          }
        }
      } catch {
        // ignore fallback
      } finally {
        setLoading(false);
      }
    }
    loadMembers();
  }, []);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedName = e.target.value;
    const found = members.find((m) => m.name === selectedName);
    onChange(selectedName, found?.id);
  };

  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        {loading && <span className="text-[10px] text-slate-400 font-normal">Loading team…</span>}
      </label>

      <div className="relative">
        <select
          value={value}
          onChange={handleSelectChange}
          className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 appearance-none pr-8 cursor-pointer"
        >
          {placeholder && <option value="">{placeholder}</option>}
          {/* If the current value is not in the loaded members list, show it as an option */}
          {value && !members.some((m) => m.name === value) && (
            <option value={value}>{value} (Current)</option>
          )}
          {members.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name} ({m.role.toUpperCase()})
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
}
