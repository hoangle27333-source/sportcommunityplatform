"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import {
  DesktopSidebar,
  MobileSidebar,
  useSidebarCollapsed,
} from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "@/components/ui/command-palette";
import type { Role, NavCounts } from "./nav";

/**
 * DashboardShell — redesign v2
 *
 * Manages: desktop sidebar collapsed state, mobile drawer, command palette.
 * Main content area shifts with sidebar width via CSS transition.
 */
export function DashboardShell({
  role,
  name,
  email,
  counts,
  children,
}: {
  role: Role;
  name: string;
  email: string;
  counts: NavCounts;
  children: React.ReactNode;
}) {
  const { collapsed, toggle } = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <DesktopSidebar
        role={role}
        counts={counts}
        collapsed={collapsed}
        onToggle={toggle}
      />

      {/* Mobile drawer */}
      <MobileSidebar
        role={role}
        counts={counts}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* ⌘K Command Palette */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />

      {/* Main area */}
      <div
        className={cn(
          "flex flex-col transition-all duration-200 ease-spring",
          "md:ml-16", // collapsed default matches rail-collapsed
          !collapsed && "md:ml-60",
        )}
      >
        <Topbar
          role={role}
          name={name}
          email={email}
          onMobileMenuOpen={() => setMobileOpen(true)}
          onCommandOpen={() => setCommandOpen(true)}
        />
        <main className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
