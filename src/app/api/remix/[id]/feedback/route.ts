import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";

export const dynamic = "force-dynamic";

/**
 * POST /api/remix/:id/feedback — gửi phản hồi để hệ thống sửa lại (§ flow bước 5).
 *   Body: { feedback: string }
 *
 * Job phải đang ở trạng thái `review`. Mỗi lần gửi tạo một vòng (iteration) mới
 * và lưu lịch sử ở remix_revisions để so sánh với bản trước.
 */

const schema = z.object({
  approved: z.boolean().optional(),
  feedback: z.string().min(1).max(2000).optional(),
});

/** Chặn vòng lặp sửa vô hạn — quá số này thì nên làm lại job mới. */
const MAX_ITERATIONS = 5;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, user } = await requireEditor();
    const { id } = await params;
    const body = await req.json();
    const { approved, feedback } = schema.parse(body);

    // Đọc qua client RLS-scoped: editor không thấy job thì không sửa được.
    const { data: job, error } = await db
      .from("remix_jobs")
      .select("id, status, iteration")
      .eq("id", id)
      .single<{ id: string; status: string; iteration: number }>();

    if (error || !job) {
      return NextResponse.json({ error: "Không tìm thấy job." }, { status: 404 });
    }

    if (job.status !== "review") {
      return NextResponse.json(
        {
          error: `Chỉ gửi phản hồi khi job đang chờ xem (hiện: ${job.status}).`,
        },
        { status: 409 },
      );
    }

    if (approved === true) {
      await db.from("remix_jobs").update({ status: "approved" }).eq("id", id);
      return NextResponse.json({ id, status: "approved" });
    }

    if (approved === false && feedback) {
      if (job.iteration >= MAX_ITERATIONS) {
        return NextResponse.json(
          {
            error: `Đã sửa ${job.iteration} lần (tối đa ${MAX_ITERATIONS}). Hãy tạo job mới với mô tả rõ hơn.`,
          },
          { status: 409 },
        );
      }
      
      const { triggerAutoFix } = await import('@/lib/remix/auto-fix');
      
      // Update original job status
      await db.from("remix_jobs").update({ status: "revising" }).eq("id", id);
      
      await triggerAutoFix(db, id, feedback, user.id);
      
      return NextResponse.json({ id, status: "revising", iteration: job.iteration + 1 });
    }

    if (!approved && feedback) {
       // Legacy feedback submission without approved flag
       if (job.iteration >= MAX_ITERATIONS) {
         return NextResponse.json(
           {
             error: `Đã sửa ${job.iteration} lần (tối đa ${MAX_ITERATIONS}). Hãy tạo job mới với mô tả rõ hơn.`,
           },
           { status: 409 },
         );
       }
       const nextIteration = job.iteration + 1;
   
       // Chuyển sang 'revising' ngay để UI phản hồi tức thì và chặn gửi trùng.
       await db.from("remix_jobs").update({ status: "revising" }).eq("id", id);
   
       await enqueue(
         QUEUE_NAMES.remix,
         "revise",
         { kind: "revise", remixJobId: id, feedback },
         { jobId: `remix:${id}:${nextIteration}` },
       );
   
       return NextResponse.json({ id, status: "revising", iteration: nextIteration });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation", issues: e.issues },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: (e as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}
