"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Eye, Bot, MessageSquare, Bell } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

interface Notification {
  id: string;
  type: "remix_completed" | "remix_failed" | "approval_needed" | "auto_fix_ready" | "feedback_received";
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function getIcon(type: Notification["type"]) {
  switch (type) {
    case "remix_completed":
      return <CheckCircle2 className="size-5 text-green-500" />;
    case "remix_failed":
      return <XCircle className="size-5 text-red-500" />;
    case "approval_needed":
      return <Eye className="size-5 text-amber-500" />;
    case "auto_fix_ready":
      return <Bot className="size-5 text-blue-500" />;
    case "feedback_received":
      return <MessageSquare className="size-5 text-purple-500" />;
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [tab, setTab] = React.useState<"all" | "unread">("all");
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();

  React.useEffect(() => {
    fetchNotifications();
  }, [tab]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const url = tab === "unread" ? "/api/notifications?unread=true&limit=50" : "/api/notifications?limit=50";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string, link: string | null) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch (e) {
      console.error(e);
    }
    if (link) {
      router.push(link);
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = tab === "unread" ? notifications.filter(n => !n.is_read) : notifications;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex sm:items-center justify-between flex-col sm:flex-row gap-4">
        <PageHeader title="Trung tâm Thông báo" />
        <Button variant="outline" onClick={markAllRead}>
          Đánh dấu tất cả đã đọc
        </Button>
      </div>

      <div className="tab-bar mb-4 self-start">
        <button
          type="button"
          onClick={() => setTab("all")}
          aria-selected={tab === "all"}
          className="tab-item"
        >
          Tất cả
        </button>
        <button
          type="button"
          onClick={() => setTab("unread")}
          aria-selected={tab === "unread"}
          className="tab-item"
        >
          Chưa đọc
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-muted/20 animate-pulse rounded-lg"></div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4 border border-border rounded-lg bg-card/50">
          <Bell className="size-12 opacity-20" />
          <p>Chưa có thông báo nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => markAsRead(n.id, n.link)}
              className={cn(
                "flex w-full items-start gap-4 p-4 text-left transition-colors border border-border rounded-lg shadow-sm hover:shadow-md bg-card",
                !n.is_read && "border-l-4 border-l-primary"
              )}
            >
              <div className="mt-1 shrink-0">{getIcon(n.type)}</div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-4">
                  <p className={cn("text-base", !n.is_read ? "font-semibold" : "font-medium")}>
                    {n.title}
                  </p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap pt-1">
                    {relativeTime(n.created_at)}
                  </span>
                </div>
                {n.body && (
                  <p className="text-sm text-muted-foreground">
                    {n.body}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
