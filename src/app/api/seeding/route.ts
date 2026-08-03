import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

/**
 * POST /api/seeding — create a seeding job
 * GET  /api/seeding — list seeding jobs (with optional filters)
 */

// ---------------------------------------------------------------------------
// POST — create seeding job
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!["admin", "editor"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    accountId,
    action,
    targetPostUrl,
    targetGroupIds,
    postCaption,
    postMediaUrls,
    commentContent,
    commentMode,
    reactionType,
    shareCaption,
    runAt,
  } = body as {
    accountId?: string;
    action?: string;
    targetPostUrl?: string;
    targetGroupIds?: string[];
    postCaption?: string;
    postMediaUrls?: string[];
    commentContent?: string;
    commentMode?: "manual" | "ai_generate";
    reactionType?: string;
    shareCaption?: string;
    runAt?: string | null;
  };

  if (!accountId || !action) {
    return NextResponse.json({ error: "accountId and action required" }, { status: 400 });
  }

  const validActions = ["post", "comment", "like", "react", "share"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Must be one of: ${validActions.join(", ")}` }, { status: 400 });
  }

  // Verify account is unofficial
  const db = createAdminClient();
  const { data: account } = await db
    .from("social_accounts")
    .select("id, channel_type, session_status, name")
    .eq("id", accountId)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (account.channel_type !== "unofficial") {
    return NextResponse.json({ error: "Account is not unofficial type" }, { status: 400 });
  }
  if (account.session_status !== "active") {
    return NextResponse.json(
      { error: `Account session is not active (status: ${account.session_status}). Please reconnect first.` },
      { status: 422 },
    );
  }

  // Insert seeding job
  const { data: seedingJob, error: insertError } = await db
    .from("seeding_jobs")
    .insert({
      account_id: accountId,
      action,
      target_post_url: targetPostUrl ?? null,
      target_group_ids: targetGroupIds ?? null,
      post_caption: postCaption ?? null,
      post_media_urls: postMediaUrls ?? null,
      comment_content: commentContent ?? null,
      comment_mode: commentMode ?? "manual",
      reaction_type: reactionType ?? "like",
      share_caption: shareCaption ?? null,
      run_at: runAt ?? null,
      status: "pending",
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError || !seedingJob) {
    return NextResponse.json({ error: insertError?.message ?? "Insert failed" }, { status: 500 });
  }

  // Enqueue the job
  const queue = getQueue(QUEUE_NAMES.playwright);
  const delay = runAt
    ? Math.max(0, new Date(runAt).getTime() - Date.now())
    : 0;

  const bullJob = await queue.add(
    "seeding",
    { type: "seeding", seedingJobId: seedingJob.id },
    {
      jobId: `seeding-${seedingJob.id}`,
      delay,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 86400 * 7 },
    },
  );

  // Save bull job ID
  await db
    .from("seeding_jobs")
    .update({ bull_job_id: bullJob.id ?? null })
    .eq("id", seedingJob.id);

  return NextResponse.json({ id: seedingJob.id, bullJobId: bullJob.id }, { status: 201 });
}

// ---------------------------------------------------------------------------
// GET — list seeding jobs
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);

  let query = supabase
    .from("seeding_jobs")
    .select(
      `id, action, target_post_url, comment_content, comment_mode,
       reaction_type, post_caption, run_at, status, result_post_url,
       error, executed_at, created_at,
       social_accounts(id, name, platform, session_status)`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (accountId) query = query.eq("account_id", accountId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ jobs: data ?? [] });
}
