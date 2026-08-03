"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { UserMenu } from "./user-menu";
import type { NavCounts, Role } from "./nav";

/**
 * Client wrapper that owns the mobile drawer state shared by the topbar trigger
 * and the sidebar. Everything data-dependent (role, counts, identity) is
 * resolved on the server and passed in as plain props.
 *
 * Layout: fixed 240px rail on lg+, content offset by the same token
 * (`lg:pl-rail`) so the rail never overlaps the scroll container.
 */
export function DashboardShell({
  role,
  counts,
  name,
  email,
  children,
}: {
  role: Role;
  counts?: NavCounts;
  name: string;
  email: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const close = React.useCallback(() => setMenuOpen(false), []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={role} counts={counts} open={menuOpen} onClose={close} />

      <div className="flex min-h-screen flex-col lg:pl-rail">
        <Topbar
          onOpenMenu={() => setMenuOpen(true)}
          right={<UserMenu name={name} email={email} role={role} />}
        />
        <main
          id="main"
          className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:px-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
