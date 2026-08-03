import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * KPI card — the metric tile used in the top row of dashboard/analytics pages.
 *
 * Follows the reference layout: label on top, large tabular value, delta chip,
 * and a tinted icon puck on the right. Value uses tabular figures so a row of
 * cards keeps its baseline grid when numbers change.
 */

export interface StatCardProps {
  label: string;
  value: string;
  /** Small qualifier under the value, e.g. "7 ngày qua". */
  hint?: string;
  /** Signed percentage change; omit when there is no comparison period. */
  deltaPct?: number | null;
  /** Whether a positive delta is good. Cost/failure metrics set this false. */
  positiveIsGood?: boolean;
  icon?: LucideIcon;
  /** Tint for the icon puck. Purely decorative — never the only signal. */
  tone?: "primary" | "success" | "warning" | "danger" | "info" | "neutral";
  className?: string;
}

const PUCK: Record<NonNullable<StatCardProps["tone"]>, string> = {
  primary: "bg-primary-muted text-primary",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  danger: "bg-destructive-muted text-destructive",
  info: "bg-info-muted text-info",
  neutral: "bg-muted text-muted-foreground",
};

export function StatCard({
  label,
  value,
  hint,
  deltaPct,
  positiveIsGood = true,
  icon: Icon,
  tone = "primary",
  className,
}: StatCardProps) {
  const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct);
  const flat = hasDelta && Math.abs(deltaPct as number) < 0.05;
  const up = hasDelta && (deltaPct as number) > 0;
  const good = flat ? null : up === positiveIsGood;

  const DeltaIcon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-sm",
        "transition-shadow duration-200 hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded",
              PUCK[tone],
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>

      <p className="mt-2 font-mono text-2xl font-semibold tabular tracking-tight text-foreground">
        {value}
      </p>

      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {hasDelta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              good === null
                ? "text-muted-foreground"
                : good
                  ? "text-success"
                  : "text-destructive",
            )}
          >
            <DeltaIcon className="size-3.5" aria-hidden="true" />
            {flat
              ? "0%"
              : `${up ? "+" : ""}${(deltaPct as number).toFixed(1)}%`}
          </span>
        )}
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

/** Grid wrapper: 1 col mobile → 2 tablet → 4 desktop. */
export function StatGrid({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
      {...props}
    />
  );
}
