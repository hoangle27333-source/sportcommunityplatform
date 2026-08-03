"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * Segmented filter bar driven by the URL query string.
 *
 * Filters live in the URL (not local state) so a filtered view is shareable and
 * survives a refresh — and so the server component re-renders with the filter
 * applied instead of us shipping the whole dataset to the client.
 *
 * Rendered as links with `role="tab"`, keeping keyboard/middle-click behaviour.
 *
 * Fixes applied (P2/P3):
 *  - FilterTabs: Arrow Left/Right navigate between tabs (ARIA tablist pattern)
 *  - Tabs: aria-label prop added to tablist for screen reader context
 */

export interface FilterTab {
  /** Query value; `null` clears the param (the "all" tab). */
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
  /** Accessible name for the tab strip. */
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
    // Any filter change resets pagination.
    next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  /**
   * Arrow Left/Right moves focus between tabs (ARIA tablist keyboard pattern).
   * We do NOT activate on arrow — URL tabs require explicit activation via Enter/click
   * so the server doesn't re-fetch on every arrow press.
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
    );
    const idx = items.indexOf(document.activeElement as HTMLElement);

    if (e.key === "ArrowRight") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={cn(
        "scrollbar-thin flex w-full gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1",
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
              "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded px-3 text-xs font-medium",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                className={cn(
                  "tabular rounded px-1 text-2xs",
                  active ? "bg-white/20" : "bg-muted text-muted-foreground",
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

/**
 * Client-side tab panels for content that is already loaded (e.g. the compose
 * page's caption variants). Use FilterTabs instead when switching should refetch.
 *
 * Fix (P3): tablist now requires an `aria-label` prop for screen reader context.
 */
export function Tabs({
  tabs,
  defaultValue,
  className,
  children,
  label,
}: {
  tabs: { value: string; label: string }[];
  defaultValue?: string;
  className?: string;
  /** Accessible name for the tab strip — required for screen readers. */
  label: string;
  children: (active: string) => React.ReactNode;
}) {
  const [active, setActive] = React.useState(defaultValue ?? tabs[0]?.value);
  const id = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);

  /** Arrow Left/Right navigate between tabs, Home/End jump to ends. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
    );
    const idx = items.indexOf(document.activeElement as HTMLElement);

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = items[(idx + 1) % items.length];
      next?.focus();
      // Activate on arrow for client-side tabs (no network cost)
      const nextValue = next?.dataset.value;
      if (nextValue) setActive(nextValue);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = items[(idx - 1 + items.length) % items.length];
      prev?.focus();
      const prevValue = prev?.dataset.value;
      if (prevValue) setActive(prevValue);
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
      const firstValue = items[0]?.dataset.value;
      if (firstValue) setActive(firstValue);
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
      const lastValue = items[items.length - 1]?.dataset.value;
      if (lastValue) setActive(lastValue);
    }
  }

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="flex gap-1 border-b border-border"
      >
        {tabs.map((tab) => {
          const on = tab.value === active;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={`${id}-${tab.value}`}
              aria-selected={on}
              aria-controls={`${id}-${tab.value}-panel`}
              data-value={tab.value}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(tab.value)}
              className={cn(
                "-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                on
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${id}-${active}-panel`}
        aria-labelledby={`${id}-${active}`}
        className="pt-4"
      >
        {children(active)}
      </div>
    </div>
  );
}
