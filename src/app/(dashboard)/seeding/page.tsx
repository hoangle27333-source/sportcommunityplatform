"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * /seeding — Unofficial Channel Seeding Dashboard
 *
 * 3 tabs:
 *   Tab 1: Accounts — list unofficial accounts + session status + connect button
 *   Tab 2: Create Job — create post/comment/react/share seeding job
 *   Tab 3: History — past seeding jobs with status
 */

type SessionStatus = "unknown" | "active" | "needs_relogin" | "checkpoint" | "banned";

interface UnofficialAccount {
  id: string;
  name: string;
  platform: string;
  fb_target_type: string | null;
  session_status: SessionStatus;
  last_action_at: string | null;
  session_expires_at: string | null;
}

interface SeedingJob {
  id: string;
  action: string;
  target_post_url: string | null;
  comment_content: string | null;
  post_caption: string | null;
  run_at: string | null;
  status: string;
  result_post_url: string | null;
  error: string | null;
  executed_at: string | null;
  created_at: string;
  social_accounts: { id: string; name: string; session_status: string } | null;
}

const STATUS_BADGE: Record<SessionStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  needs_relogin: "bg-amber-100 text-amber-700",
  checkpoint: "bg-red-100 text-red-700",
  banned: "bg-gray-200 text-gray-600",
  unknown: "bg-gray-100 text-gray-500",
};

const STATUS_ICON: Record<SessionStatus, string> = {
  active: "🟢",
  needs_relogin: "🟡",
  checkpoint: "🔴",
  banned: "⛔",
  unknown: "⚪",
};

const JOB_STATUS_BADGE: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700",
  running: "bg-yellow-100 text-yellow-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
};

export default function SeedingPage() {
  const [activeTab, setActiveTab] = useState<"accounts" | "create" | "history">("accounts");
  const [accounts, setAccounts] = useState<UnofficialAccount[]>([]);
  const [jobs, setJobs] = useState<SeedingJob[]>([]);
  const [loading, setLoading] = useState(false);

  // Create job form state
  const [form, setForm] = useState({
    accountId: "",
    action: "comment" as "post" | "comment" | "like" | "react" | "share",
    targetPostUrl: "",
    postCaption: "",
    commentContent: "",
    commentMode: "manual" as "manual" | "ai_generate",
    aiBrief: "",
    aiVariants: [] as string[],
    selectedVariant: "",
    reactionType: "like",
    shareCaption: "",
    runAt: "",
    scheduleMode: "now" as "now" | "later",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", platform: "facebook", fbTargetType: "profile" as "page" | "profile" | "group" });
  const [addingAccount, setAddingAccount] = useState(false);

  // Load accounts
  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/channels/unofficial");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Load jobs
  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/seeding?limit=50");
    if (res.ok) {
      const data = await res.json();
      setJobs(data.jobs ?? []);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadJobs();
  }, [loadAccounts, loadJobs]);

  // ── Add new unofficial account ─────────────────────────────────────────────
  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    setAddingAccount(true);
    try {
      const res = await fetch("/api/channels/unofficial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (res.ok) {
        setShowAddModal(false);
        setAddForm({ name: "", platform: "facebook", fbTargetType: "profile" });
        await loadAccounts();
      } else {
        alert(data.error ?? "Lỗi tạo account");
      }
    } finally {
      setAddingAccount(false);
    }
  }

  // ── Connect account ──────────────────────────────────────────────────────
  async function handleConnect(account: UnofficialAccount) {
    setConnectingId(account.id);
    try {
      const res = await fetch("/api/playwright/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, accountName: account.name }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setConnectingId(null);
        alert(`Lỗi khi kích hoạt browser: ${data.error || res.statusText || "Kiểm tra worker đang chạy."}`);
        return;
      }
    } catch (err: any) {
      setConnectingId(null);
      alert(`Lỗi kết nối: ${err.message}`);
      return;
    }

    // Poll status until active or timeout
    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      if (tries > 90) { // 3 min max
        clearInterval(poll);
        setConnectingId(null);
        return;
      }
      const r = await fetch(`/api/playwright/connect/status?accountId=${account.id}`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.status === "active") {
        clearInterval(poll);
        setConnectingId(null);
        await loadAccounts();
      }
    }, 2000);
  }

  // ── Generate AI comment variants ──────────────────────────────────────────
  async function handleGenerateAI() {
    if (!form.aiBrief.trim()) return;
    setGeneratingAI(true);
    try {
      const res = await fetch("/api/seeding/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: form.aiBrief }),
      });
      const data = await res.json();
      if (res.ok) {
        setForm((f) => ({ ...f, aiVariants: data.variants, selectedVariant: data.variants[0] ?? "" }));
      } else {
        alert(data.error ?? "Lỗi AI generate");
      }
    } finally {
      setGeneratingAI(false);
    }
  }

  // ── Submit seeding job ────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitResult(null);

    const commentContent = form.commentMode === "ai_generate"
      ? form.selectedVariant
      : form.commentContent;

    const body = {
      accountId: form.accountId,
      action: form.action,
      targetPostUrl: form.targetPostUrl || undefined,
      postCaption: form.postCaption || undefined,
      commentContent: commentContent || undefined,
      commentMode: form.commentMode,
      reactionType: form.reactionType,
      shareCaption: form.shareCaption || undefined,
      runAt: form.scheduleMode === "later" && form.runAt ? form.runAt : null,
    };

    const res = await fetch("/api/seeding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (res.ok) {
      setSubmitResult({ ok: true, msg: `Job tạo thành công (${form.scheduleMode === "later" ? "đã lên lịch" : "đang thực thi ngay"})` });
      await loadJobs();
    } else {
      setSubmitResult({ ok: false, msg: data.error ?? "Lỗi tạo job" });
    }
    setSubmitting(false);
  }

  const tabBtn = (t: typeof activeTab, label: string, count?: number) => (
    <button
      onClick={() => setActiveTab(t)}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        activeTab === t
          ? "bg-white text-gray-900 shadow-sm"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
          {count}
        </span>
      )}
    </button>
  );

  const needsAction = accounts.filter(
    (a) => a.session_status === "needs_relogin" || a.session_status === "checkpoint",
  ).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Seeding (Unofficial)</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tự động đăng bài, comment, like, share qua browser automation.{" "}
          <span className="text-amber-600 font-medium">⚠ Nội bộ thử nghiệm.</span>
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {tabBtn("accounts", "Accounts", needsAction)}
        {tabBtn("create", "Tạo Job")}
        {tabBtn("history", `Lịch sử (${jobs.length})`)}
      </div>

      {/* ── Tab 1: Accounts ── */}
      {activeTab === "accounts" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {accounts.length} account unofficial đã kết nối.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Thêm account
            </button>
          </div>

          {loading && <p className="text-sm text-gray-400">Đang tải...</p>}

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Loại kênh</th>
                  <th className="px-4 py-2 font-medium">Session</th>
                  <th className="px-4 py-2 font-medium">Hoạt động cuối</th>
                  <th className="px-4 py-2 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      Chưa có account unofficial.{" "}
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="text-indigo-600 underline"
                      >
                        Thêm account ngay
                      </button>
                    </td>
                  </tr>
                )}
                {accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{acc.name}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize">
                      {acc.fb_target_type ?? acc.platform}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[acc.session_status] ?? STATUS_BADGE.unknown
                        }`}
                      >
                        {STATUS_ICON[acc.session_status]} {acc.session_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {acc.last_action_at
                        ? new Date(acc.last_action_at).toLocaleString("vi-VN")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleConnect(acc)}
                        disabled={connectingId === acc.id}
                        className="rounded px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50"
                      >
                        {connectingId === acc.id
                          ? "⏳ Chờ đăng nhập..."
                          : acc.session_status === "active"
                          ? "Kết nối lại"
                          : "Đăng nhập"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {connectingId && (
            <div className="mt-4 rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              🌐 Browser đang mở — đăng nhập Facebook trong cửa sổ Chrome vừa xuất hiện.
              Hệ thống sẽ tự động lưu session sau khi đăng nhập thành công.
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Create Job ── */}
      {activeTab === "create" && (
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
          {submitResult && (
            <div
              className={`rounded-md px-4 py-3 text-sm ${
                submitResult.ok
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {submitResult.msg}
            </div>
          )}

          {/* Account selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account seeder *
            </label>
            <select
              id="seeding-account"
              required
              value={form.accountId}
              onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Chọn account...</option>
              {accounts
                .filter((a) => a.session_status === "active")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {STATUS_ICON[a.session_status]} {a.name} ({a.fb_target_type ?? a.platform})
                  </option>
                ))}
            </select>
            {accounts.filter((a) => a.session_status === "active").length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                Không có account active. Vào tab Accounts để đăng nhập trước.
              </p>
            )}
          </div>

          {/* Action selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Loại hành động *
            </label>
            <div className="flex gap-2 flex-wrap">
              {(["post", "comment", "like", "react", "share"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, action: a }))}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    form.action === a
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"
                  }`}
                >
                  {a === "post" ? "📝 Đăng bài" :
                   a === "comment" ? "💬 Comment" :
                   a === "like" ? "👍 Like" :
                   a === "react" ? "❤️ React" :
                   "🔁 Share"}
                </button>
              ))}
            </div>
          </div>

          {/* Conditional fields */}
          {form.action === "post" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nội dung bài đăng *
              </label>
              <textarea
                required
                rows={4}
                value={form.postCaption}
                onChange={(e) => setForm((f) => ({ ...f, postCaption: e.target.value }))}
                placeholder="Nhập nội dung bài đăng..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {(form.action === "comment" || form.action === "like" || form.action === "react" || form.action === "share") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL bài target *
              </label>
              <input
                type="url"
                required
                value={form.targetPostUrl}
                onChange={(e) => setForm((f) => ({ ...f, targetPostUrl: e.target.value }))}
                placeholder="https://www.facebook.com/..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {form.action === "comment" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chế độ comment
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="commentMode"
                      value="manual"
                      checked={form.commentMode === "manual"}
                      onChange={() => setForm((f) => ({ ...f, commentMode: "manual" }))}
                    />
                    ✍️ Tự soạn
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="commentMode"
                      value="ai_generate"
                      checked={form.commentMode === "ai_generate"}
                      onChange={() => setForm((f) => ({ ...f, commentMode: "ai_generate" }))}
                    />
                    🤖 AI generate
                  </label>
                </div>
              </div>

              {form.commentMode === "manual" ? (
                <div>
                  <textarea
                    required
                    rows={2}
                    value={form.commentContent}
                    onChange={(e) => setForm((f) => ({ ...f, commentContent: e.target.value }))}
                    placeholder="Nội dung comment..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.aiBrief}
                      onChange={(e) => setForm((f) => ({ ...f, aiBrief: e.target.value }))}
                      placeholder="Brief ngắn: 'comment hỏi thăm giá sân, tự nhiên'"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateAI}
                      disabled={generatingAI || !form.aiBrief.trim()}
                      className="px-3 py-2 rounded-md bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                    >
                      {generatingAI ? "⏳..." : "✨ Generate"}
                    </button>
                  </div>
                  {form.aiVariants.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">Chọn 1 biến thể:</p>
                      {form.aiVariants.map((v, i) => (
                        <label
                          key={i}
                          className={`flex gap-2 items-start p-2 rounded-md border cursor-pointer text-sm transition-colors ${
                            form.selectedVariant === v
                              ? "border-indigo-500 bg-indigo-50"
                              : "border-gray-200 hover:border-indigo-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="aiVariant"
                            value={v}
                            checked={form.selectedVariant === v}
                            onChange={() => setForm((f) => ({ ...f, selectedVariant: v }))}
                            className="mt-0.5"
                          />
                          <span>{v}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {form.action === "react" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loại react
              </label>
              <select
                value={form.reactionType}
                onChange={(e) => setForm((f) => ({ ...f, reactionType: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="like">👍 Like</option>
                <option value="love">❤️ Love</option>
                <option value="haha">😆 Haha</option>
                <option value="wow">😮 Wow</option>
                <option value="sad">😢 Sad</option>
                <option value="angry">😡 Angry</option>
              </select>
            </div>
          )}

          {form.action === "share" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Caption khi share (tuỳ chọn)
              </label>
              <input
                type="text"
                value={form.shareCaption}
                onChange={(e) => setForm((f) => ({ ...f, shareCaption: e.target.value }))}
                placeholder="Caption đính kèm khi share..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Schedule */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Thời gian thực thi
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scheduleMode"
                  value="now"
                  checked={form.scheduleMode === "now"}
                  onChange={() => setForm((f) => ({ ...f, scheduleMode: "now" }))}
                />
                ⚡ Thực thi ngay
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scheduleMode"
                  value="later"
                  checked={form.scheduleMode === "later"}
                  onChange={() => setForm((f) => ({ ...f, scheduleMode: "later" }))}
                />
                📅 Lên lịch
              </label>
            </div>
            {form.scheduleMode === "later" && (
              <input
                type="datetime-local"
                required
                value={form.runAt}
                onChange={(e) => setForm((f) => ({ ...f, runAt: e.target.value }))}
                className="mt-2 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? "Đang tạo..." : "Tạo Job"}
          </button>
        </form>
      )}

      {/* ── Tab 3: History ── */}
      {activeTab === "history" && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-gray-500">{jobs.length} job gần đây</p>
            <button
              onClick={loadJobs}
              className="text-xs text-indigo-600 hover:underline"
            >
              Làm mới
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Nội dung</th>
                  <th className="px-4 py-2 font-medium">Lịch</th>
                  <th className="px-4 py-2 font-medium">Trạng thái</th>
                  <th className="px-4 py-2 font-medium">Thực thi lúc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      Chưa có job nào.
                    </td>
                  </tr>
                )}
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="px-4 py-3 text-gray-700">
                      {j.social_accounts?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize">
                        {j.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate text-xs">
                      {j.comment_content ?? j.post_caption ?? j.target_post_url ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {j.run_at
                        ? new Date(j.run_at).toLocaleString("vi-VN")
                        : "Ngay"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          JOB_STATUS_BADGE[j.status] ?? "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {j.status}
                      </span>
                      {j.error && (
                        <p className="mt-0.5 text-xs text-red-500 max-w-xs truncate">
                          {j.error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {j.executed_at
                        ? new Date(j.executed_at).toLocaleString("vi-VN")
                        : "—"}
                      {j.result_post_url && (
                        <a
                          href={j.result_post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 text-indigo-600 hover:underline"
                        >
                          Xem bài
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add Account Modal ── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl shadow-2xl"
            style={{
              background: "hsl(var(--card))",
              color: "hsl(var(--card-foreground))",
              border: "1px solid hsl(var(--border))",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid hsl(var(--border))" }}
            >
              <h3 className="text-base font-semibold">Thêm account unofficial</h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ color: "hsl(var(--muted-foreground))" }}
                className="rounded-md p-1 transition-colors hover:opacity-70"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAccount} className="space-y-4 px-6 py-5">
              {/* Warning banner */}
              <p
                className="text-xs rounded-md px-3 py-2"
                style={{
                  background: "hsl(var(--warning-muted))",
                  color: "hsl(32 60% 25%)",
                  border: "1px solid hsl(var(--warning) / 0.3)",
                }}
              >
                ⚠️ Sau khi thêm, bấm <strong>Đăng nhập</strong> để mở browser và lấy session cookie.
              </p>

              {/* Name */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "hsl(var(--foreground))" }}
                >
                  Tên account / biệt danh *
                </label>
                <input
                  type="text"
                  required
                  placeholder="vd: Seeder Nguyễn Văn A"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none transition-all"
                  style={{
                    background: "hsl(var(--input))",
                    color: "hsl(var(--foreground))",
                    border: "1px solid hsl(var(--border))",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "hsl(var(--primary))")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "hsl(var(--border))")}
                />
              </div>

              {/* Platform */}
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "hsl(var(--foreground))" }}
                >
                  Nền tảng
                </label>
                <select
                  value={addForm.platform}
                  onChange={(e) => setAddForm((f) => ({ ...f, platform: e.target.value }))}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{
                    background: "hsl(var(--input))",
                    color: "hsl(var(--foreground))",
                    border: "1px solid hsl(var(--border))",
                  }}
                >
                  <option value="facebook">Facebook</option>
                </select>
              </div>

              {/* Channel type */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: "hsl(var(--foreground))" }}
                >
                  Loại kênh *
                </label>
                <div className="flex gap-4">
                  {(["page", "profile", "group"] as const).map((t) => (
                    <label
                      key={t}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                      style={{ color: "hsl(var(--foreground))" }}
                    >
                      <input
                        type="radio"
                        name="fbTargetType"
                        value={t}
                        checked={addForm.fbTargetType === t}
                        onChange={() => setAddForm((f) => ({ ...f, fbTargetType: t }))}
                        className="accent-[hsl(var(--primary))]"
                      />
                      {t === "page" ? "📋 Page" : t === "profile" ? "👤 Profile" : "👥 Group"}
                    </label>
                  ))}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70"
                  style={{
                    background: "hsl(var(--muted))",
                    color: "hsl(var(--foreground))",
                    border: "1px solid hsl(var(--border))",
                  }}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={addingAccount}
                  className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    background: "hsl(var(--primary))",
                    color: "hsl(var(--primary-foreground))",
                  }}
                >
                  {addingAccount ? "Đang tạo..." : "Tạo account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
