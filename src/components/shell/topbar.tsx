"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { titleFor, type Role } from "./nav";

/**
 * Topbar — redesign v2
 *
 * Glass morphism (bg-card/85 + backdrop-blur), border-b border-border.
 * Left: mobile menu toggle + breadcrumb page title.
 * Right: ⌘K search button + notification bell + user menu (Radix DropdownMenu).
 */

const ROLE_LABEL: Record<Role, string> = {
  admin:  "Quản trị",
  editor: "Biên tập",
  viewer: "Chỉ xem",
};

export function Topbar({
  role,
  name,
  email,
  onMobileMenuOpen,
  onCommandOpen,
}: {
  role: Role;
  name: string;
  email: string;
  onMobileMenuOpen: () => void;
  onCommandOpen: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const pageTitle = titleFor(pathname);
  const [signingOut, setSigningOut] = React.useState(false);

  // ⌘K keyboard shortcut
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onCommandOpen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCommandOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const initials = (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-md">
      {/* Mobile menu toggle */}
      <button
        type="button"
        onClick={onMobileMenuOpen}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[10px] md:hidden",
          "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
        aria-label="Mở menu"
      >
        <Menu className="size-4" aria-hidden="true" />
      </button>

      {/* Page title (breadcrumb) */}
      <div className="flex flex-1 items-center gap-1.5 min-w-0">
        <span className="text-sm font-semibold text-foreground truncate">
          {pageTitle}
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1.5">
        {/* ⌘K search button */}
        <button
          type="button"
          onClick={onCommandOpen}
          className={cn(
            "hidden sm:flex h-8 items-center gap-2 rounded-[10px] border border-border",
            "bg-muted/50 px-3 text-xs text-muted-foreground",
            "hover:bg-muted hover:text-foreground transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
          aria-label="Tìm kiếm (⌘K)"
        >
          <Search className="size-3.5" aria-hidden="true" />
          <span className="hidden lg:block">Tìm kiếm…</span>
          <kbd className="hidden lg:block rounded bg-border px-1 py-0.5 text-2xs font-mono">⌘K</kbd>
        </button>

        {/* Notification bell */}
        <Link
          href="/notifications"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[10px]",
            "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
          aria-label="Thông báo"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </Link>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-8 items-center gap-2 rounded-[10px] pl-1 pr-2",
                "hover:bg-muted transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
              aria-label="Tài khoản"
            >
              {/* Avatar */}
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-2xs font-bold text-white">
                {initials || "?"}
              </span>
              <span className="hidden max-w-28 truncate text-xs font-medium text-foreground sm:block">
                {name || email}
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            {/* User info header */}
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary-muted px-2 py-0.5 text-2xs font-medium text-primary">
                <ShieldCheck className="size-3" aria-hidden="true" />
                {ROLE_LABEL[role]}
              </span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Tài khoản</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/settings">Cài đặt</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {signingOut ? "Đang thoát…" : "Đăng xuất"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
