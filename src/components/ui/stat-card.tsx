import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";
import type { LucideIcon } from "lucide-react";

/**
 * StatCard — redesign v2
 *
 * Rounded-xl card, gradient icon puck (rounded-full), hover shadow lift.
 * KPI values use font-mono for tabular alignment.
 * Delta chip with directional arrow.
 */

const TONE_STYLES = {
  primary:     { puck: "from-primary/20 to-primary/5",     icon: "text-primary" },
  accent:      { puck: "from-accent/20 to-accent/5",       icon: "text-accent" },
  success:     { puck: "from-success/20 to-success/5",     icon: "text-success" },
  warning:     { puck: "from-warning/20 to-warning/5",     icon: "text-warning" },
  destructive: { puck: "from-destructive/20 to-destructive/5", icon: "text-destructive" },
  info:        { puck: "from-info/20 to-info/5",           icon: "text-info" },
};

export type StatTone = keyof typeof TONE_STYLES;

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: StatTone;
  hint?: string;
  delta?: number;
  /** True → positive delta is "good" (green); false → negative is "good" (costs). */
  positiveIsGood?: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  hint,
  delta,
  positiveIsGood = true,
}: StatCardProps) {
  const t = TONE_STYLES[tone];
  const isGood =
    delta === undefined
      ? undefined
      : positiveIsGood
        ? delta >= 0
        : delta <= 0;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-5",
        "shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      {/* Icon puck */}
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full",
          "bg-gradient-to-br",
          t.puck,
        )}
        aria-hidden="true"
      >
        <Icon className={cn("size-5", t.icon)} strokeWidth={1.8} />
      </div>

      {/* Value */}
      <div>
        <p className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular">
          {value}
        </p>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
      </div>

      {/* Delta + hint row */}
      {(delta !== undefined || hint) && (
        <div className="flex items-center gap-2">
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-2xs font-medium",
                isGood
                  ? "bg-success-muted text-success"
                  : "bg-destructive-muted text-destructive",
              )}
            >
              {delta > 0 ? "↑" : "↓"}
              {Math.abs(delta)}%
            </span>
          )}
          {hint && (
            <span className="text-2xs text-muted-foreground">{hint}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatGridSkeleton() {
  return (
    <StatGrid>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
        >
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-6 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </StatGrid>
  );
}
