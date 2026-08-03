import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Engagement review queue (SPEC §8) — admin/editor.
 *
 * Lists engagement_items awaiting human review with their AI-suggested reply.
 * Sending/approving happens via the review API (human-in-the-loop). This page
 * is the read view; interactive approve/edit/send is a client enhancement.
 */

interface EngagementRow {
  id: string;
  type: "comment" | "dm";
  message: string | null;
  suggested_reply: string | null;
  status: string;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  sent: "Đã gửi",
  skipped: "Bỏ qua",
};

export default async function EngagementPage() {
  const db = await createClient();

  const { data: items } = await db
    .from("engagement_items")
    .select("id, type, message, suggested_reply, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (items ?? []) as EngagementRow[];
  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Tương tác</h1>
        <p className="mt-1 text-sm text-gray-500">
          Comment / inbox trên chính Page của bạn. AI gợi ý phản hồi — người
          duyệt quyết định gửi (tuân thủ điều khoản Meta).
        </p>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        {pending} mục đang chờ duyệt.
      </div>

      <div className="space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-gray-400">
            Chưa có tương tác nào được thu thập. Kết nối webhook Meta hoặc chạy
            ingest để kéo comment.
          </p>
        )}
        {rows.map((item) => (
          <div key={item.id} className="rounded-lg border border-gray-200 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {item.type === "comment" ? "Comment" : "Inbox"}
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
              <span className="ml-auto text-xs text-gray-400">
                {new Date(item.created_at).toLocaleString("vi-VN")}
              </span>
            </div>
            <p className="text-sm text-gray-900">
              {item.message ?? <em className="text-gray-400">(không có nội dung)</em>}
            </p>
            {item.suggested_reply && (
              <div className="mt-2 rounded-md bg-gray-50 p-2">
                <p className="text-xs font-medium text-gray-500">AI gợi ý:</p>
                <p className="text-sm text-gray-800">{item.suggested_reply}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
