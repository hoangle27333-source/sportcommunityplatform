"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { visibleGroups, isActive, ALARM_BADGES, type Role, type NavCounts } from "./nav";

/**
 * Sidebar — redesign v2: Transparent/white collapsible sidebar.
 *
 * Desktop: Fixed rail (15rem expanded ↔ 4rem icon-only), smooth width transition.
 * - Collapsed: icons only + Radix Tooltips with labels.
 * - Expanded: icon + label + badge count.
 * - Collapse toggle at bottom.
 * - State persisted to localStorage.
 *
 * Mobile: Off-canvas overlay drawer (Vaul in DashboardShell).
 * This component renders only the static desktop rail on md+.
 */

const STORAGE_KEY = "sidebar-collapsed";

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggle = React.useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

export function DesktopSidebar({
  role,
  counts,
  collapsed,
  onToggle,
}: {
  role: Role;
  counts: NavCounts;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const groups = visibleGroups(role);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden md:flex flex-col",
          "border-r border-border bg-card/95 backdrop-blur-sm",
          "transition-all duration-200 ease-spring",
          collapsed ? "w-16" : "w-60",
        )}
        aria-label="Sidebar navigation"
      >
        {/* Logo */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-border px-3",
            collapsed ? "justify-center" : "gap-2.5",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a8 8 0 0 0-5 2 8 8 0 0 0-5-2H2Z"/>
            </svg>
          </span>
          {!collapsed && (
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              Content Hub
            </span>
          )}
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-thin">
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <p className="mb-1 px-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5 px-2">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const count =
                    item.badgeKey != null ? (counts[item.badgeKey] ?? 0) : 0;
                  const isAlarm =
                    item.badgeKey != null &&
                    ALARM_BADGES.includes(item.badgeKey) &&
                    count > 0;

                  const navLink = (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex h-9 items-center gap-2.5 rounded-[10px] px-2.5",
                        "text-sm font-medium transition-all duration-150",
                        active
                          ? "bg-primary-muted text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        collapsed && "justify-center px-0 w-10 mx-auto",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                        )}
                        aria-hidden="true"
                      />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {count > 0 && (
                            <span
                              className={cn(
                                "ml-auto tabular rounded-full px-1.5 py-0.5 text-2xs font-semibold",
                                isAlarm
                                  ? "bg-destructive text-destructive-foreground"
                                  : "bg-primary-muted text-primary",
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );

                  if (collapsed) {
                    return (
                      <li key={item.href}>
                        <Tooltip>
                          <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                          <TooltipContent side="right">
                            {item.label}
                            {count > 0 && ` (${count})`}
                          </TooltipContent>
                        </Tooltip>
                      </li>
                    );
                  }
                  return <li key={item.href}>{navLink}</li>;
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-border p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggle}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5",
                  "text-xs font-medium text-muted-foreground",
                  "hover:bg-muted hover:text-foreground transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  collapsed && "justify-center",
                )}
                aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
              >
                {collapsed ? (
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <>
                    <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
                    <span>Thu gọn</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">Mở rộng sidebar</TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}

// ─── Mobile Drawer Sidebar ──────────────────────────────────────────────────

export function MobileSidebar({
  role,
  counts,
  open,
  onClose,
}: {
  role: Role;
  counts: NavCounts;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const groups = visibleGroups(role);

  // Body scroll lock
  React.useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Close on route change
  React.useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col md:hidden",
          "border-r border-border bg-card shadow-lg",
          "transition-transform duration-200 ease-spring",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Mobile navigation"
        aria-hidden={!open}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a8 8 0 0 0-5 2 8 8 0 0 0-5-2H2Z"/>
            </svg>
          </span>
          <span className="text-sm font-semibold text-foreground">Content Hub</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="mb-1 px-4 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                {group.label}
              </p>
              <ul className="space-y-0.5 px-2">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const count = item.badgeKey != null ? (counts[item.badgeKey] ?? 0) : 0;
                  const isAlarm = item.badgeKey != null && ALARM_BADGES.includes(item.badgeKey) && count > 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-10 items-center gap-2.5 rounded-[10px] px-3",
                          "text-sm font-medium transition-colors duration-150",
                          active
                            ? "bg-primary-muted text-primary font-semibold"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <item.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {count > 0 && (
                          <span className={cn("tabular rounded-full px-1.5 py-0.5 text-2xs font-semibold", isAlarm ? "bg-destructive text-destructive-foreground" : "bg-primary-muted text-primary")}>
                            {count}
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
      </aside>
    </>
  );
}
