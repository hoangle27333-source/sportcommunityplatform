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
  pending: "Pending",
  approved: "Approved",
  sent: "Sent",
  skipped: "Skipped",
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
        <h1 className="text-2xl font-bold tracking-tight">Engagement Review</h1>
        <p className="mt-1 text-sm text-gray-500">
          Comments and messages on your official pages. AI suggests responses — human
          reviewers approve before sending (Meta policy compliant).
        </p>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        {pending} item{pending === 1 ? "" : "s"} awaiting review.
      </div>

      <div className="space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-gray-400">
            No engagement items collected yet. Connect Meta webhooks or run
            ingest to pull comments and messages.
          </p>
        )}
        {rows.map((item) => (
          <div key={item.id} className="rounded-lg border border-gray-200 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {item.type === "comment" ? "Comment" : "Direct Message"}
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
              <span className="ml-auto text-xs text-gray-400">
                {new Date(item.created_at).toLocaleString("en-US")}
              </span>
            </div>
            <p className="text-sm text-gray-900">
              {item.message ?? <em className="text-gray-400">(no message content)</em>}
            </p>
            {item.suggested_reply && (
              <div className="mt-2 rounded-md bg-gray-50 p-2">
                <p className="text-xs font-medium text-gray-500">AI Suggested Reply:</p>
                <p className="text-sm text-gray-800">{item.suggested_reply}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
