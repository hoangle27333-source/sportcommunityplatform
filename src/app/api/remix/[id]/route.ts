import { NextResponse, type NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * Hình dạng hàng trả về. Khai báo tường minh để `maybeSingle<T>()` có type —
 * nếu không, Supabase suy ra union với GenericStringError và mọi field đều lỗi.
 */
interface RemixJobDetail {
  id: string;
  source_type: string;
  source_url: string | null;
  source_media_id: string | null;
  output_kind: string;
  prompt: string | null;
  options: Record<string, unknown>;
  status: string;
  plan: Record<string, unknown>;
  result_media_id: string | null;
  result_caption: string | null;
  result_hashtags: string[] | null;
  error: string | null;
  iteration: number;
  campaign_id: string | null;
  post_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/remix/:id — chi tiết một job + lịch sử các vòng sửa.
 *
 * UI poll endpoint này khi job đang chạy (queued/analyzing/processing) để cập
 * nhật trạng thái, và đọc lịch sử revisions để so sánh các bản.
 * Mọi user đã đăng nhập đều đọc được (RLS quyết định phạm vi hàng).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireUser();
    const { id } = await params;

    const { data: job, error } = await db
      .from("remix_jobs")
      .select(
        "id, source_type, source_url, source_media_id, output_kind, prompt, options, " +
          "status, plan, result_media_id, result_caption, result_hashtags, error, " +
          "iteration, campaign_id, post_id, approved_at, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle<RemixJobDetail>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: "Không tìm thấy job." }, { status: 404 });
    }

    // URL công khai của media kết quả để hiển thị preview.
    let resultUrl: string | null = null;
    if (job.result_media_id) {
      const { data: media } = await db
        .from("media_assets")
        .select("url")
        .eq("id", job.result_media_id)
        .maybeSingle<{ url: string }>();
      resultUrl = media?.url ?? null;
    }

    const { data: revisions } = await db
      .from("remix_revisions")
      .select("id, iteration, feedback, result_caption, result_media_id, created_at")
      .eq("remix_job_id", id)
      .order("iteration", { ascending: true });

    return NextResponse.json({
      job: { ...job, resultUrl },
      revisions: revisions ?? [],
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: (e as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/remix/:id — cập nhật một số trường của job (ví dụ result_media_id khi sửa ảnh bằng tay).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireUser();
    const { id } = await params;
    const body = await req.json();

    const updates: Record<string, any> = {};
    if (body.result_media_id !== undefined) {
      updates.result_media_id = body.result_media_id;
    }
    if (body.result_caption !== undefined) {
      updates.result_caption = body.result_caption;
    }
    if (body.title !== undefined || body.options !== undefined) {
      const { data: job } = await db
        .from("remix_jobs")
        .select("options")
        .eq("id", id)
        .single();
      const currentOptions = (job?.options as Record<string, any>) || {};
      updates.options = { ...currentOptions, ...(body.options || {}) };
      if (body.title !== undefined) updates.options.title = body.title;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true });
    }

    const { error } = await db
      .from("remix_jobs")
      .update(updates)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: (e as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/remix/:id — xoá một job (nếu chưa hoàn thành hoặc bị lỗi, hoặc bạn muốn dọn dẹp)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireUser();
    const { id } = await params;

    const { error } = await db
      .from("remix_jobs")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: (e as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}
