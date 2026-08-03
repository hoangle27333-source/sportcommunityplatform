"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { titleFor } from "./nav";
import { NotificationBell } from "@/components/shared/notification-bell";

/**
 * Sticky topbar: drawer trigger (mobile), current page title, and the right-hand
 * cluster (theme toggle + whatever the shell passes in, e.g. user menu).
 *
 * Kept thin (56px) so the dense content below gets the vertical room.
 */
export function Topbar({
  onOpenMenu,
  right,
}: {
  onOpenMenu: () => void;
  right?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-4">
      <button
        type="button"
        onClick={onOpenMenu}
        className={cn(
          "grid size-9 shrink-0 cursor-pointer place-items-center rounded",
          "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          "lg:hidden",
        )}
      >
        <Menu className="size-5" aria-hidden="true" />
        <span className="sr-only">Mở menu điều hướng</span>
      </button>

      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {titleFor(pathname)}
      </p>

      <div className="flex shrink-0 items-center gap-1.5">
        <NotificationBell />
        <ThemeToggle />
        {right}
      </div>
    </header>
  );
}

/**
 * Light/dark toggle.
 *
 * Tailwind runs in `darkMode: "class"`, so we flip `.dark` on <html> and persist
 * the choice in localStorage. Initial paint is handled by the inline script in
 * the root layout to avoid a flash of the wrong theme; this component only
 * reads the class that script already applied.
 */
export function ThemeToggle() {
  const [dark, setDark] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private mode / storage disabled — theme just won't persist.
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // Until the effect runs we don't know the theme; the icon is decorative
      // and the label is generic, so there is nothing misleading to announce.
      aria-label={dark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
      className={cn(
        "grid size-9 cursor-pointer place-items-center rounded",
        "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      )}
    >
      {dark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
