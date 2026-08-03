import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Badge — small inline label. `Status` below maps domain states to tones so a
 * given state always renders the same color everywhere in the app.
 */

const TONES = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-muted text-primary",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  danger: "bg-destructive-muted text-destructive",
  info: "bg-info-muted text-info",
} as const;

export type BadgeTone = keyof typeof TONES;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Render a leading dot — useful for live/queue states in dense tables. */
  dot?: boolean;
}

export function Badge({
  className,
  tone = "neutral",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-current opacity-80"
        />
      )}
      {children}
    </span>
  );
}

/**
 * Single source of truth for domain state → (label, tone).
 *
 * Labels are Vietnamese (NFR6). Covers the post state machine (R5.2), channel
 * token states (R2.6), async job states (R4.6) and engagement review states (R8).
 */
const STATUS_MAP: Record<string, { label: string; tone: BadgeTone }> = {
  // Post lifecycle (R5.2)
  draft: { label: "Nháp", tone: "neutral" },
  generating: { label: "Đang tạo", tone: "info" },
  pending_review: { label: "Chờ duyệt", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "primary" },
  scheduled: { label: "Đã lên lịch", tone: "primary" },
  publishing: { label: "Đang đăng", tone: "info" },
  published: { label: "Đã đăng", tone: "success" },
  partially_published: { label: "Đăng một phần", tone: "warning" },
  failed: { label: "Thất bại", tone: "danger" },
  cancelled: { label: "Đã huỷ", tone: "neutral" },

  // Channel / token health (R2.6)
  active: { label: "Hoạt động", tone: "success" },
  expired: { label: "Token hết hạn", tone: "danger" },
  needs_reauth: { label: "Cần kết nối lại", tone: "danger" },
  revoked: { label: "Đã thu hồi", tone: "neutral" },
  error: { label: "Lỗi", tone: "warning" },

  // Campaigns (campaign_status)
  paused: { label: "Tạm dừng", tone: "warning" },
  archived: { label: "Đã lưu trữ", tone: "neutral" },

  // Async jobs (R4.6)
  queued: { label: "Trong hàng đợi", tone: "neutral" },
  running: { label: "Đang chạy", tone: "info" },
  rendering: { label: "Đang render", tone: "info" },
  succeeded: { label: "Thành công", tone: "success" },
  done: { label: "Hoàn tất", tone: "success" },

  // Remix pipeline (SPEC §7 — remix_status)
  analyzing: { label: "Đang phân tích", tone: "info" },
  processing: { label: "Đang xử lý", tone: "info" },
  review: { label: "Chờ xem lại", tone: "warning" },
  revising: { label: "Đang sửa", tone: "info" },


  // Engagement review (R8.4)
  pending: { label: "Chờ xử lý", tone: "warning" },
  suggested: { label: "Có gợi ý", tone: "info" },
  sent: { label: "Đã gửi", tone: "success" },
  hidden: { label: "Đã ẩn", tone: "neutral" },
  skipped: { label: "Bỏ qua", tone: "neutral" },
};

/** Statuses that represent live work — rendered with a dot for scanability. */
const LIVE = new Set([
  "generating",
  "publishing",
  "running",
  "rendering",
  "queued",
  "analyzing",
  "processing",
  "revising",
]);

export function Status({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) {
    return <span className="text-muted-foreground">—</span>;
  }
  const entry = STATUS_MAP[value] ?? { label: value, tone: "neutral" as const };
  return (
    <Badge tone={entry.tone} dot={LIVE.has(value)} className={className}>
      {entry.label}
    </Badge>
  );
}

/** Platform chip (Facebook / Instagram) — used in channel + target lists. */
export function PlatformBadge({ platform }: { platform: string }) {
  const label = platform === "instagram" ? "Instagram" : "Facebook";
  return (
    <Badge tone={platform === "instagram" ? "danger" : "primary"}>{label}</Badge>
  );
}
