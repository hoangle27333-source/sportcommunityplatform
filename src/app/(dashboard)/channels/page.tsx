import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Channels page (SPEC §5, R2.x) — admin only.
 *
 * Lists connected Facebook Pages / IG Business accounts (official, via Meta OAuth)
 * AND unofficial browser-automation accounts (Playwright-based seeding).
 * Accounts in needs_reauth/expired surface a red banner (R2.6).
 */

interface AccountRow {
  id: string;
  platform: "facebook" | "instagram";
  name: string;
  external_id: string;
  status: string;
  token_expires_at: string | null;
  channel_type: string;
  session_status: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expired: "bg-red-100 text-red-700",
  needs_reauth: "bg-red-100 text-red-700",
  revoked: "bg-gray-200 text-gray-600",
  error: "bg-amber-100 text-amber-700",
};

const SESSION_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  needs_relogin: "bg-amber-100 text-amber-700",
  checkpoint: "bg-red-100 text-red-700",
  banned: "bg-gray-200 text-gray-500",
  unknown: "bg-gray-100 text-gray-500",
};

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const db = await createClient();
  const { data: accounts } = await db
    .from("social_accounts")
    .select(
      "id, platform, name, external_id, status, token_expires_at, channel_type, session_status",
    )
    .order("created_at", { ascending: false });

  const rows = (accounts ?? []) as AccountRow[];
  const officialRows = rows.filter((r) => r.channel_type !== "unofficial");
  const unofficialRows = rows.filter((r) => r.channel_type === "unofficial");

  const needsReauth = officialRows.filter(
    (r) => r.status === "needs_reauth" || r.status === "expired",
  );

  return (
    <div className="space-y-10">
      {/* ── Official Channels ── */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kênh</h1>
            <p className="mt-1 text-sm text-gray-500">
              Facebook Page &amp; Instagram Business đã kết nối qua Meta OAuth.
            </p>
          </div>
          <a
            href="/api/meta/connect"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Kết nối kênh chính thức
          </a>
        </div>

        {sp.connected && (
          <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
            Đã kết nối {sp.connected} kênh.
          </div>
        )}
        {sp.error && (
          <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            Kết nối thất bại: {sp.error}
          </div>
        )}
        {needsReauth.length > 0 && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {needsReauth.length} kênh cần kết nối lại (token hết hạn/thu hồi). Bài đã
            lên lịch sẽ được giữ lại thay vì báo lỗi.
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Tên</th>
                <th className="px-4 py-2 font-medium">Nền tảng</th>
                <th className="px-4 py-2 font-medium">External ID</th>
                <th className="px-4 py-2 font-medium">Trạng thái</th>
                <th className="px-4 py-2 font-medium">Token hết hạn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {officialRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Chưa có kênh nào. Bấm &quot;Kết nối kênh chính thức&quot; để bắt đầu.
                  </td>
                </tr>
              )}
              {officialRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 capitalize text-gray-600">{r.platform}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {r.external_id}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLE[r.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.token_expires_at
                      ? new Date(r.token_expires_at).toLocaleDateString("vi-VN")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Unofficial Channels (Playwright) ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Kênh Unofficial{" "}
              <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 font-normal">
                Browser Automation
              </span>
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Kết nối qua Playwright — đăng nhập thủ công 1 lần, hệ thống lưu session.
              Dùng cho seeding nội bộ.
            </p>
          </div>
          <a
            href="/seeding"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Quản lý Seeding →
          </a>
        </div>

        <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          ⚠️ <strong>Chỉ dùng nội bộ thử nghiệm.</strong> Browser automation vi phạm Facebook
          ToS. Rủi ro tài khoản bị checkpoint hoặc khóa. Để thêm/quản lý account, vào{" "}
          <a href="/seeding" className="underline font-medium">
            trang Seeding
          </a>
          .
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Tên</th>
                <th className="px-4 py-2 font-medium">Loại</th>
                <th className="px-4 py-2 font-medium">Session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {unofficialRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                    Chưa có account unofficial. Vào{" "}
                    <a href="/seeding" className="text-indigo-600 underline">
                      trang Seeding
                    </a>{" "}
                    để kết nối.
                  </td>
                </tr>
              )}
              {unofficialRows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{r.platform}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        SESSION_STYLE[r.session_status ?? "unknown"] ??
                        "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {r.session_status ?? "unknown"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
