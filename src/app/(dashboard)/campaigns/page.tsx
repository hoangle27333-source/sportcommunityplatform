import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Campaigns page (SPEC §4, §6) — admin/editor.
 *
 * Lists campaigns with status + goal. Each campaign links to its analyze pass
 * (AI Learning, §6) via the API; this MVP view is the entry point.
 */

interface CampaignRow {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  archived: "bg-gray-100 text-gray-400",
};

export default async function CampaignsPage() {
  const db = await createClient();
  const { data } = await db
    .from("campaigns")
    .select("id, name, goal, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as CampaignRow[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Chiến dịch</h1>
        <p className="mt-1 text-sm text-gray-500">
          Quản lý chiến dịch nội dung và chạy phân tích AI Learning.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Tên</th>
              <th className="px-4 py-2 font-medium">Mục tiêu</th>
              <th className="px-4 py-2 font-medium">Trạng thái</th>
              <th className="px-4 py-2 font-medium">Tạo lúc</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Chưa có chiến dịch nào.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="max-w-md px-4 py-3 text-gray-600">
                  <span className="line-clamp-1">{c.goal || "—"}</span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_STYLE[c.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(c.created_at).toLocaleDateString("vi-VN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
