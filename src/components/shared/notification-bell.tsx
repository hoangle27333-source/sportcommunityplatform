"use client";

import * as React from "react";
import { Bell, CheckCircle2, XCircle, Eye, Bot, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

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
      return <CheckCircle2 className="size-4 text-green-500" />;
    case "remix_failed":
      return <XCircle className="size-4 text-red-500" />;
    case "approval_needed":
      return <Eye className="size-4 text-amber-500" />;
    case "auto_fix_ready":
      return <Bot className="size-4 text-blue-500" />;
    case "feedback_received":
      return <MessageSquare className="size-4 text-purple-500" />;
  }
}

export function NotificationBell() {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [isOpen, setIsOpen] = React.useState(false);
  const router = useRouter();
  const bellRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {
      // Use warn instead of error to prevent Next.js dev overlay from popping up on network blips
      console.warn("Could not fetch notifications", e);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch (e) {
      console.warn("Could not fetch unread count", e);
    }
  };

  const togglePanel = () => {
    setIsOpen((prev) => {
      if (!prev) fetchNotifications(); // Fetch latest when opening
      return !prev;
    });
  };

  const markAsRead = async (id: string, link: string | null) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch (e) {
      console.warn("Could not mark as read", e);
    }

    setIsOpen(false);
    if (link) {
      router.push(link);
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      });
    } catch (e) {
      console.warn("Could not mark all as read", e);
    }
  };

  return (
    <div className="relative" ref={bellRef}>
      <button
        type="button"
        onClick={togglePanel}
        className={cn(
          "relative grid size-9 cursor-pointer place-items-center rounded",
          "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        )}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-32px)] rounded-md border border-border bg-card text-card-foreground shadow-lg z-50 overflow-hidden flex flex-col max-h-[480px]">
          <div className="flex items-center justify-between border-b border-border p-3">
            <h3 className="font-semibold text-sm">Thông báo</h3>
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline font-medium"
            >
              Đánh dấu tất cả đã đọc
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground space-y-3">
                <Bell className="size-8 opacity-20" />
                <p className="text-sm">Chưa có thông báo nào</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markAsRead(n.id, n.link)}
                    className={cn(
                      "flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50",
                      !n.is_read
                        ? "border-l-2 border-primary bg-primary/5"
                        : "border-l-2 border-transparent"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p
                        className={cn(
                          "text-sm",
                          !n.is_read ? "font-semibold" : "font-medium"
                        )}
                      >
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground font-medium">
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              className="w-full text-sm"
              onClick={() => {
                setIsOpen(false);
                router.push("/notifications");
              }}
            >
              Xem tất cả
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
