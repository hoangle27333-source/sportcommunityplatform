"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  ALARM_BADGES,
  isActive,
  visibleGroups,
  type NavCounts,
  type Role,
} from "./nav";

/**
 * Dark navigation rail (Haulix reference): fixed 240px column on desktop, and
 * an off-canvas drawer under lg.
 *
 * The rail is a client component because active state depends on the current
 * pathname; role + badge counts are resolved on the server and passed down.
 */

export interface SidebarProps {
  role: Role;
  counts?: NavCounts;
  /** Drawer state, owned by the shell so the topbar trigger can toggle it. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ role, counts, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const groups = visibleGroups(role);

  // Close the drawer on route change — otherwise it stays over the new page.
  React.useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open so content underneath
  // doesn't scroll. Cleaned up on close or unmount.
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Escape closes the drawer (keyboard parity with the backdrop click).
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — mobile only, and only while the drawer is open. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-30 bg-nav/60 backdrop-blur-sm transition-opacity duration-200 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-rail flex-col bg-nav text-nav-foreground",
          "transition-transform duration-200 ease-out lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Điều hướng chính"
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-nav-border px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded bg-primary text-primary-foreground">
            <Radio className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-sm font-semibold text-white">
              Content Hub
            </span>
            <span className="block truncate text-2xs text-nav-muted">
              Automation Platform
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 grid size-9 cursor-pointer place-items-center rounded text-nav-muted transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Đóng menu</span>
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-nav-muted">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const count = item.badgeKey ? counts?.[item.badgeKey] : undefined;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex h-10 items-center gap-2.5 rounded px-3 text-sm transition-colors duration-150",
                          active
                            ? "bg-nav-active text-nav-active-foreground font-medium"
                            : "text-nav-foreground hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "size-4 shrink-0",
                            active ? "opacity-100" : "opacity-70 group-hover:opacity-100",
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {typeof count === "number" && count > 0 && (
                          <span
                            className={cn(
                              "tabular rounded-full px-1.5 py-0.5 text-2xs font-semibold",
                              item.badgeKey && ALARM_BADGES.includes(item.badgeKey)
                                ? "bg-destructive text-destructive-foreground"
                                : active
                                  ? "bg-white/25 text-white"
                                  : "bg-accent text-accent-foreground",
                            )}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-nav-border px-4 py-3">
          <p className="text-2xs text-nav-muted">
            Chỉ dùng Meta Graph API chính thức. Mọi phản hồi đều qua người duyệt.
          </p>
        </div>
      </aside>
    </>
  );
}
