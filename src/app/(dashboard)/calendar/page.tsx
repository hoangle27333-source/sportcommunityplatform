import { createClient } from "@/lib/supabase/server";
import { PostActions } from "./post-actions";

export const dynamic = "force-dynamic";

/**
 * Calendar page (SPEC §5) — all roles (read-only for viewer).
 *
 * Lists posts grouped by status with their scheduled/published times and target
 * count. This is the MVP list view; a full month grid can layer on later.
 */

interface PostRow {
  id: string;
  status: string;
  caption: string | null;
  primary_platform: string;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-info/10 text-info",
  publishing: "bg-warning/10 text-warning",
  published: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString("vi-VN") : "—";
}

export default async function CalendarPage() {
  const db = await createClient();
  const { data: posts } = await db
    .from("posts")
    .select(
      "id, status, caption, primary_platform, scheduled_at, published_at, created_at",
    )
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(200);

  const rows = (posts ?? []) as PostRow[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Lịch đăng</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bài viết theo trạng thái và thời gian đăng.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Nội dung</th>
              <th className="px-4 py-2 font-medium">Nền tảng chính</th>
              <th className="px-4 py-2 font-medium">Trạng thái</th>
              <th className="px-4 py-2 font-medium">Lên lịch</th>
              <th className="px-4 py-2 font-medium">Đã đăng</th>
              <th className="px-4 py-2 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Chưa có bài viết nào.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="group">
                <td className="max-w-md px-4 py-3">
                  <span className="line-clamp-2 text-foreground">
                    {p.caption?.trim() || (
                      <span className="text-muted-foreground">(chưa có caption)</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {p.primary_platform}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLE[p.status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmt(p.scheduled_at)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmt(p.published_at)}</td>
                <td className="px-4 py-3 text-right">
                  <PostActions 
                    postId={p.id} 
                    status={p.status} 
                    initialCaption={p.caption} 
                    initialScheduledAt={p.scheduled_at} 
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
