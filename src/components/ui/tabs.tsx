"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * Tabs — redesign v2, built on Radix UI Tabs.
 *
 * Two variants:
 *  1. `Tabs` — client-side state, animated sliding indicator.
 *  2. `FilterTabs` — URL query string-driven, keyboard navigable.
 *
 * Animated pill indicator uses CSS translate for GPU-composited motion.
 */

// ─── Radix Tabs primitives ─────────────────────────────────────────────────

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { label?: string }
>(({ className, label, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    aria-label={label}
    className={cn(
      "inline-flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 rounded-[8px] px-3 py-1.5",
      "text-xs font-medium whitespace-nowrap",
      "transition-all duration-150 cursor-pointer",
      "text-muted-foreground hover:text-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-card data-[state=active]:text-primary",
      "data-[state=active]:shadow-sm data-[state=active]:font-semibold",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

// ─── FilterTabs ────────────────────────────────────────────────────────────

export interface FilterTab {
  value: string | null;
  label: string;
  count?: number;
}

export function FilterTabs({
  param,
  tabs,
  className,
  label,
}: {
  param: string;
  tabs: FilterTab[];
  className?: string;
  label: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param);
  const listRef = React.useRef<HTMLDivElement>(null);

  function hrefFor(value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(param);
    else next.set(param, value);
    next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
    );
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowRight") { e.preventDefault(); items[(idx + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={cn(
        "scrollbar-thin flex w-full gap-1 overflow-x-auto",
        "rounded-xl border border-border bg-muted/50 p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = (tab.value ?? null) === (current ?? null);
        return (
          <Link
            key={tab.value ?? "__all"}
            href={hrefFor(tab.value)}
            role="tab"
            aria-selected={active}
            scroll={false}
            className={cn(
              "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] px-3",
              "text-xs font-medium transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "bg-card text-primary shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-card/60",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                className={cn(
                  "tabular rounded-md px-1.5 py-0.5 text-2xs",
                  active
                    ? "bg-primary-muted text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ─── LegacyTabs — render-prop pattern for backward-compat ──────────────────

/**
 * LegacyTabs — backwards-compatible render-prop API used by presets/page.tsx
 * and other existing consumers that haven't migrated to the new Radix API yet.
 */
export interface LegacyTabItem {
  value: string;
  label: string;
}

export function LegacyTabs({
  tabs,
  label,
  defaultValue,
  children,
  className,
}: {
  tabs: LegacyTabItem[];
  label?: string;
  defaultValue?: string;
  children: (active: string) => React.ReactNode;
  className?: string;
}) {
  const [active, setActive] = React.useState(defaultValue ?? tabs[0]?.value ?? "");

  return (
    <div className={cn("space-y-0", className)}>
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active === tab.value}
            type="button"
            onClick={() => setActive(tab.value)}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-[8px] px-3",
              "text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active === tab.value
                ? "bg-card text-primary shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-card/60",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{children(active)}</div>
    </div>
  );
}
