import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

/**
 * Badge — redesign v2: Blue + Emerald palette, softer tints, pill shape.
 *
 * Domain-specific helpers (Status, PlatformBadge) are co-located here
 * so consumers can import from a single path.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5",
    "text-2xs font-medium whitespace-nowrap",
    "ring-1 ring-inset",
  ],
  {
    variants: {
      tone: {
        default:     "bg-muted text-foreground ring-border",
        neutral:     "bg-muted text-foreground ring-border",
        primary:     "bg-primary-muted text-primary ring-primary/20",
        accent:      "bg-accent-muted text-accent ring-accent/20",
        success:     "bg-success-muted text-success ring-success/20",
        warning:     "bg-warning-muted text-warning ring-warning/20",
        destructive: "bg-destructive-muted text-destructive ring-destructive/20",
        danger:      "bg-destructive-muted text-destructive ring-destructive/20",
        info:        "bg-info-muted text-info ring-info/20",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full shrink-0",
            tone === "success" && "bg-success",
            tone === "warning" && "bg-warning",
            tone === "destructive" && "bg-destructive",
            tone === "info" && "bg-info",
            tone === "primary" && "bg-primary",
            tone === "accent" && "bg-accent",
            (!tone || tone === "default") && "bg-muted-foreground",
          )}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

/** Domain: maps post/job status values to a tone */
const STATUS_TONE: Record<string, VariantProps<typeof badgeVariants>["tone"]> = {
  draft:       "default",
  scheduled:   "info",
  publishing:  "warning",
  published:   "success",
  active:      "success",
  completed:   "success",
  approved:    "success",
  failed:      "destructive",
  error:       "destructive",
  paused:      "warning",
  pending:     "warning",
  processing:  "warning",
  queued:      "warning",
  archived:    "default",
  skipped:     "default",
  needs_reauth: "destructive",
  sent:        "accent",
};

const STATUS_LABEL: Record<string, string> = {
  draft:       "Nháp",
  scheduled:   "Đã lên lịch",
  publishing:  "Đang đăng",
  published:   "Đã đăng",
  active:      "Đang chạy",
  completed:   "Hoàn thành",
  approved:    "Đã duyệt",
  failed:      "Thất bại",
  error:       "Lỗi",
  paused:      "Tạm dừng",
  pending:     "Chờ duyệt",
  processing:  "Đang xử lý",
  queued:      "Trong hàng",
  archived:    "Lưu trữ",
  skipped:     "Bỏ qua",
  needs_reauth: "Cần đăng nhập lại",
  sent:        "Đã gửi",
};

export function Status({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const tone = STATUS_TONE[value] ?? "default";
  const label = STATUS_LABEL[value] ?? value;
  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}

const PLATFORM_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  facebook:  { label: "Facebook", color: "text-blue-700", bg: "bg-blue-50 ring-blue-200" },
  instagram: { label: "Instagram", color: "text-pink-700", bg: "bg-pink-50 ring-pink-200" },
  youtube:   { label: "YouTube", color: "text-red-700", bg: "bg-red-50 ring-red-200" },
  tiktok:    { label: "TikTok", color: "text-gray-900", bg: "bg-gray-50 ring-gray-200" },
};

export function PlatformBadge({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  const cfg = PLATFORM_CONFIG[platform.toLowerCase()];
  if (!cfg) {
    return (
      <Badge className={className}>{platform}</Badge>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5",
        "text-2xs font-medium ring-1 ring-inset whitespace-nowrap",
        cfg.color,
        cfg.bg,
        className,
      )}
    >
      {cfg.label}
    </span>
  );
}

export { Badge, badgeVariants };
