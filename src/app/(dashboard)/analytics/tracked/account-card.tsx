"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2, User } from "lucide-react";
import { Badge, PlatformBadge, Status } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

interface TrackedAccount {
  id: string;
  platform: string;
  profile_url: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  followers_count: number | null;
  following_count: number | null;
  posts_count: number | null;
  engagement_rate: number | null;
  bio: string | null;
  is_verified: boolean | null;
  label: string;
  status: string;
  error_message: string | null;
  last_scraped_at: string | null;
}

const LABEL_CONFIG: Record<string, { label: string; tone: "warning" | "primary" | "neutral" }> = {
  competitor: { label: "Đối thủ", tone: "warning" },
  own: { label: "Của mình", tone: "primary" },
  reference: { label: "Tham khảo", tone: "neutral" },
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  return `${Math.floor(hrs / 24)} ngày trước`;
}

export function AccountCard({ account }: { account: TrackedAccount }) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(account.status === "scraping");

  const labelCfg = LABEL_CONFIG[account.label] ?? { label: account.label, tone: "neutral" as const };

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await fetch(`/api/tracked-accounts/${account.id}/scrape`, { method: "POST" });
      router.refresh();
    } catch {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {account.avatar_url ? (
            <img
              src={account.avatar_url}
              alt={account.display_name ?? account.username ?? "avatar"}
              className="size-10 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <User className="size-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {account.display_name || account.username || "—"}
              {account.is_verified && (
                <span className="ml-1 text-info" aria-label="Đã xác minh">✓</span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              @{account.username || "unknown"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <PlatformBadge platform={account.platform} />
          <Badge tone={labelCfg.tone}>{labelCfg.label}</Badge>
        </div>
      </div>

      {/* ── Metrics ─────────────────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Người theo dõi</p>
          <p className="mt-0.5 font-semibold tabular text-foreground">
            {account.followers_count != null
              ? account.followers_count.toLocaleString("vi-VN")
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Bài viết</p>
          <p className="mt-0.5 font-semibold tabular text-foreground">
            {account.posts_count != null ? account.posts_count.toLocaleString("vi-VN") : "—"}
          </p>
        </div>
        {account.engagement_rate != null && (
          <div>
            <p className="text-xs text-muted-foreground">Tỷ lệ tương tác</p>
            <p className="mt-0.5 font-semibold text-foreground">
              {Number(account.engagement_rate).toFixed(1)}%
            </p>
          </div>
        )}
        {account.following_count != null && (
          <div>
            <p className="text-xs text-muted-foreground">Đang theo dõi</p>
            <p className="mt-0.5 font-semibold tabular text-foreground">
              {account.following_count.toLocaleString("vi-VN")}
            </p>
          </div>
        )}
      </div>

      {/* ── Bio preview ─────────────────────────────────────────────────────── */}
      {account.bio && (
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{account.bio}</p>
      )}

      {/* ── Error message ────────────────────────────────────────────────────── */}
      {account.status === "error" && account.error_message && (
        <p className="mt-2 rounded-md bg-destructive-muted px-2 py-1 text-xs text-destructive">
          {account.error_message}
        </p>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="mt-auto flex items-center justify-between border-t border-border pt-3 mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Status value={account.status} />
          {account.last_scraped_at && (
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(account.last_scraped_at)}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Cào lại dữ liệu"
          className={cn(
            "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            isRefreshing && "cursor-not-allowed opacity-60",
          )}
        >
          {isRefreshing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          <span className="sr-only">Cào lại</span>
        </button>
      </div>
    </div>
  );
}
