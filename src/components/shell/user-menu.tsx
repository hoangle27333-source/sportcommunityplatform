"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "@/components/ui/button";
import type { Role } from "./nav";

/**
 * Topbar account menu: identity, role, sign out.
 *
 * Sign-out clears the Supabase session cookie then hard-refreshes so middleware
 * re-evaluates auth on the next request (a client-side push alone would keep the
 * stale server-rendered shell).
 *
 * Fixes applied (P2):
 *  - Focus trap: when menu opens, first menu item receives focus
 *  - Arrow key navigation within menu items
 *  - Escape closes and returns focus to trigger button
 *  - motion-reduce:animate-none on fade-in-up animation (P3)
 */

const ROLE_LABEL: Record<Role, string> = {
  admin: "Quản trị",
  editor: "Biên tập",
  viewer: "Chỉ xem",
};

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: Role;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Focus management: move focus into menu when opened, back to trigger when closed.
  React.useEffect(() => {
    if (open) {
      // Defer so the DOM has painted the menu before we focus
      const raf = requestAnimationFrame(() => {
        const firstItem = menuRef.current?.querySelector<HTMLElement>(
          '[role="menuitem"]:not([disabled])',
        );
        firstItem?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  // Dismiss on outside click / Escape — the two ways users expect to close a menu.
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        // Return focus to trigger on Escape
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** Arrow key navigation between menu items. */
  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    const current = document.activeElement as HTMLElement;
    const idx = items.indexOf(current);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      // Close menu on Tab so focus doesn't escape into background content
      setOpen(false);
    }
  }

  async function signOut() {
    setLoading(true);
    try {
      await createClient().auth.signOut();
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  const initials = (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-2 rounded pl-1 pr-1.5",
          "transition-colors hover:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-2xs font-semibold text-primary-foreground">
          {initials || "?"}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-32 truncate text-xs font-medium text-foreground">
            {name}
          </span>
          <span className="block text-2xs text-muted-foreground">
            {ROLE_LABEL[role]}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className="animate-fade-in-up motion-reduce:animate-none absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary-muted px-2 py-0.5 text-2xs font-medium text-primary">
              <ShieldCheck className="size-3" aria-hidden="true" />
              {ROLE_LABEL[role]}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={loading}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-sm text-foreground",
              "transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
            )}
          >
            {loading ? (
              <Spinner className="text-muted-foreground" />
            ) : (
              <LogOut className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
            {loading ? "Đang thoát…" : "Đăng xuất"}
          </button>
        </div>
      )}
    </div>
  );
}
