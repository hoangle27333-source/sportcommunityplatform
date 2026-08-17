import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

/**
 * Alert — redesign v2
 *
 * Rounded-xl, softer background tints from new Blue+Emerald palette.
 * Icon slot accepts any ReactNode (use Phosphor or Lucide icons).
 * Supports live region announcements for screen readers.
 */
const alertVariants = cva(
  [
    "flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm",
    "transition-colors duration-150",
  ],
  {
    variants: {
      tone: {
        info:        "border-info/20 bg-info-muted text-foreground",
        success:     "border-success/20 bg-success-muted text-foreground",
        warning:     "border-warning/20 bg-warning-muted text-foreground",
        destructive: "border-destructive/20 bg-destructive-muted text-foreground",
        danger:      "border-destructive/20 bg-destructive-muted text-foreground",
        neutral:     "border-border bg-muted text-foreground",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

const ICON_COLOR: Record<string, string> = {
  info:        "text-info",
  success:     "text-success",
  warning:     "text-warning",
  destructive: "text-destructive",
  danger:      "text-destructive",
  neutral:     "text-muted-foreground",
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: React.ReactNode;
  title?: string;
  /** Urgent alerts announce immediately (assertive); others politely. */
  urgent?: boolean;
}

export function Alert({
  className,
  tone = "info",
  icon,
  title,
  urgent,
  children,
  ...props
}: AlertProps) {
  return (
    <div
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      {icon && (
        <span
          className={cn("mt-0.5 shrink-0", ICON_COLOR[tone ?? "info"])}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-semibold text-foreground mb-0.5">{title}</p>
        )}
        <div className="text-sm text-foreground/80">{children}</div>
      </div>
    </div>
  );
}
