import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";
import type { LucideIcon } from "lucide-react";

/**
 * EmptyState — redesign v2
 *
 * Rounded-xl dashed border, centered content, icon slot + action.
 * Icon area uses gradient background circle.
 * icon prop accepts either a ReactNode or a LucideIcon component.
 */

export interface EmptyStateProps {
  icon?: React.ReactNode | LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  // LucideIcon components are ForwardRef objects (typeof === "object"), not plain functions.
  // We render them if they're not already a valid React element.
  const iconNode = React.isValidElement(icon)
    ? icon
    : icon != null
      ? React.createElement(icon as LucideIcon, { className: "size-6", "aria-hidden": true })
      : null;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl",
        "border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center",
        className,
      )}
    >
      {iconNode && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5">
          <span className="text-primary" aria-hidden="true">
            {iconNode}
          </span>
        </div>
      )}
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && (
        <Button
          variant="primary"
          size="sm"
          onClick={action.onClick}
          asChild={!!action.href}
        >
          {action.href ? (
            <a href={action.href}>{action.label}</a>
          ) : (
            action.label
          )}
        </Button>
      )}
    </div>
  );
}
