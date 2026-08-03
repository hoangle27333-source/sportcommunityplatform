import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Analytics page (SPEC §6) — all roles (read-only).
 *
 * Shows the latest metric snapshot per published target plus the AI Learning
 * suggestions. Metrics are append-only time-series; we display the most recent
 * capture per target. Full trend charts are a later enhancement.
 */

interface MetricRow {
  post_target_id: string;
  reach: number | null;
  impressions: number | null;
  engagement: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  captured_at: string;
}

interface SuggestionRow {
  id: string;
  type: string;
  content: string;
  rationale: string | null;
}

function num(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("vi-VN");
}

export default async function AnalyticsPage() {
  const db = await createClient();

  // Latest 200 metric snapshots; dedupe to newest per target in-app.
  const { data: metricsRaw } = await db
    .from("metrics")
    .select(
      "post_target_id, reach, impressions, engagement, likes, comments, shares, captured_at",
    )
    .order("captured_at", { ascending: false })
    .limit(200);

  const latestByTarget = new Map<string, MetricRow>();
  for (const m of (metricsRaw ?? []) as MetricRow[]) {
    if (!latestByTarget.has(m.post_target_id)) latestByTarget.set(m.post_target_id, m);
  }
  const metrics = [...latestByTarget.values()];

  const { data: suggestions } = await db
    .from("ai_suggestions")
    .select("id, type, content, rationale")
    .order("created_at", { ascending: false })
    .limit(20);

  const totals = metrics.reduce(
    (acc, m) => {
      acc.reach += m.reach ?? 0;
      acc.engagement += m.engagement ?? 0;
      return acc;
    },
    { reach: 0, engagement: 0 },
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Phân tích</h1>
        <p className="mt-1 text-sm text-gray-500">
          Hiệu suất bài đăng (snapshot mới nhất) và đề xuất từ AI Learning.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Bài có dữ liệu" value={metrics.length.toLocaleString("vi-VN")} />
        <StatCard label="Tổng reach" value={totals.reach.toLocaleString("vi-VN")} />
        <StatCard
          label="Tổng engagement"
          value={totals.engagement.toLocaleString("vi-VN")}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        Đề xuất AI Learning
      </h2>
      <div className="mb-8 space-y-2">
        {(suggestions ?? []).length === 0 && (
          <p className="text-sm text-gray-400">
            Chưa có đề xuất. Chạy phân tích chiến dịch để sinh learnings.
          </p>
        )}
        {((suggestions ?? []) as SuggestionRow[]).map((s) => (
          <div key={s.id} className="rounded-lg border border-gray-200 p-3">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {s.type}
            </span>
            <p className="mt-1 text-sm text-gray-900">{s.content}</p>
            {s.rationale && (
              <p className="mt-1 text-xs text-gray-500">{s.rationale}</p>
            )}
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Bài đăng</h2>
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Reach</th>
              <th className="px-4 py-2 font-medium">Impressions</th>
              <th className="px-4 py-2 font-medium">Engagement</th>
              <th className="px-4 py-2 font-medium">Likes</th>
              <th className="px-4 py-2 font-medium">Comments</th>
              <th className="px-4 py-2 font-medium">Shares</th>
              <th className="px-4 py-2 font-medium">Cập nhật</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {metrics.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Chưa có dữ liệu. Analytics sync chạy mỗi 6 giờ.
                </td>
              </tr>
            )}
            {metrics.map((m) => (
              <tr key={m.post_target_id}>
                <td className="px-4 py-3">{num(m.reach)}</td>
                <td className="px-4 py-3">{num(m.impressions)}</td>
                <td className="px-4 py-3">{num(m.engagement)}</td>
                <td className="px-4 py-3">{num(m.likes)}</td>
                <td className="px-4 py-3">{num(m.comments)}</td>
                <td className="px-4 py-3">{num(m.shares)}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(m.captured_at).toLocaleString("vi-VN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
