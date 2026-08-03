import { NextResponse, type NextRequest } from "next/server";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveRemixJob, RemixError } from "@/lib/remix/remix-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/remix/:id/approve — duyệt kết quả (§ flow bước cuối).
 *
 * Tạo Post ở trạng thái `draft` kèm media + caption, rồi trỏ job tới post đó.
 * Từ đây người dùng lên lịch bằng PATCH /api/posts/:id/schedule (vào calendar).
 *
 * Ghi bằng service-role vì cần chèn post_media (system-owned bucket) và cập
 * nhật cả hai bảng nhất quán; quyền đã được kiểm ở requireEditor + đọc RLS.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, user } = await requireEditor();
    const { id } = await params;

    // Kiểm tra job hiện diện dưới RLS của người gọi trước khi dùng admin client.
    const { data: visible } = await db
      .from("remix_jobs")
      .select("id")
      .eq("id", id)
      .maybeSingle<{ id: string }>();

    if (!visible) {
      return NextResponse.json({ error: "Không tìm thấy job." }, { status: 404 });
    }

    const result = await approveRemixJob(createAdminClient(), id, user.id);

    return NextResponse.json({
      ...result,
      message:
        "Đã duyệt và tạo bài nháp. Lên lịch ở bước tiếp theo để đưa vào calendar.",
    });
  } catch (e) {
    if (e instanceof AuthError || e instanceof RemixError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: (e as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}
