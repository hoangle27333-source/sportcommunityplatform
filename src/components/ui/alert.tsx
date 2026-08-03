import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Alert / banner.
 *
 * Tone is carried by icon + text as well as color, so the meaning survives for
 * colorblind users (never color-only signalling).
 *
 * `role` is "alert" for error/warning (interrupts the screen reader) and
 * "status" for info/success (announced politely) — matching how urgent each is.
 */

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { wrap: string; icon: string; Icon: LucideIcon }> = {
  info: {
    wrap: "border-info/30 bg-info-muted text-foreground",
    icon: "text-info",
    Icon: Info,
  },
  success: {
    wrap: "border-success/30 bg-success-muted text-foreground",
    icon: "text-success",
    Icon: CheckCircle2,
  },
  warning: {
    wrap: "border-warning/35 bg-warning-muted text-foreground",
    icon: "text-warning",
    Icon: AlertTriangle,
  },
  danger: {
    wrap: "border-destructive/30 bg-destructive-muted text-foreground",
    icon: "text-destructive",
    Icon: XCircle,
  },
};

// `title` bị Omit vì HTMLAttributes định nghĩa nó là string (tooltip attribute),
// còn ở đây title là nội dung render được (ReactNode).
export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: Tone;
  title?: React.ReactNode;
  /** Trailing action, e.g. a "Reconnect" button. */
  action?: React.ReactNode;
}

export function Alert({
  tone = "info",
  title,
  action,
  className,
  children,
  ...props
}: AlertProps) {
  const t = TONES[tone];
  const urgent = tone === "danger" || tone === "warning";

  return (
    <div
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm",
        t.wrap,
        className,
      )}
      {...props}
    >
      <t.Icon
        className={cn("mt-0.5 size-4 shrink-0", t.icon)}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && (
          <div className={cn("text-muted-foreground", title && "mt-0.5")}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
