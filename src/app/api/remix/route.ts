import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, requireEditor, AuthError } from "@/lib/auth/require-user";
import { enqueue, QUEUE_NAMES } from "@/lib/queue";

export const dynamic = "force-dynamic";

/**
 * /api/remix — Content Remix jobs (flow: nguồn → AI plan → edit → review).
 *
 *   GET   ?status=...  danh sách job (mọi user đã đăng nhập; RLS lọc hàng)
 *   POST              tạo job mới + đẩy vào queue (editor+)
 *
 * Ranh giới tuân thủ (SPEC §0): chỉ nhận nguồn là nội dung NGƯỜI DÙNG SỞ HỮU.
 *   - upload      : asset đã upload lên storage của mình
 *   - own_link    : link nội dung của mình, PHẢI tick ownershipConfirmed
 *   - inspiration : link tham khảo — chỉ phân tích ý tưởng, KHÔNG tải media
 */

const optionsSchema = z
  .object({
    vietsub: z.boolean().optional(),
    dubVi: z.boolean().optional(),
    dubMode: z.enum(['none', 'full', 'preserve_bgm']).optional(),
    bgVolume: z.number().optional(),
    vertical: z.boolean().optional(),
    trimSeconds: z.number().min(1).max(600).optional(),
    trimStart: z.number().min(0).max(36_000).optional(),
    brandLogo: z.boolean().optional(),
    logoMediaId: z.string().uuid().optional(),
    logoPosition: z
      .enum(["top-left", "top-right", "bottom-left", "bottom-right"])
      .optional(),
    colorGrade: z.boolean().optional(),
    muteOriginal: z.boolean().optional(),
    captionPrompt: z.string().max(2000).optional(),
    captionTone: z.string().max(100).optional(),
    imageTranslate: z.enum(["overlay", "regenerate"]).optional(),
    textOverlay: z.string().max(2000).optional(),
    voiceName: z.string().max(100).optional(),
    blurOriginalSub: z.boolean().optional(),
    subFont: z.string().max(100).optional(),
    subFontSize: z.number().int().min(10).max(72).optional(),
    subColor: z.string().max(20).optional(),
    subBgColor: z.string().max(20).optional(),
    subBold: z.boolean().optional(),
    subItalic: z.boolean().optional(),
    subOutline: z.number().int().min(0).max(5).optional(),
    subBorderStyle: z.number().int().min(0).max(4).optional(),
    subPosition: z.enum(['top', 'bottom']).optional(),
    autoDetectSubtitleRegion: z.boolean().optional(),
    blurRegion: z.object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    }).optional(),
    subtitleConfig: z.object({
      font: z.string().optional(),
      size: z.number().optional(),
      color: z.string().optional(),
      bgColor: z.string().optional(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      outline: z.number().optional(),
      borderStyle: z.number().optional(),
      position: z.enum(['top', 'bottom', 'auto']).optional(),
    }).optional(),
    targetLanguage: z.enum(['vi', 'en']).optional(),
    outputRatio: z.enum(['9:16', '16:9', '1:1', '4:5', 'original']).optional(),
    outputCrf: z.number().int().min(15).max(32).optional(),
    introEnabled: z.boolean().optional(),
    introMediaId: z.string().uuid().optional(),
    outroEnabled: z.boolean().optional(),
    outroMediaId: z.string().uuid().optional(),
    regenerateOnly: z.boolean().optional(),
    editedScript: z.string().max(50000).optional(),
  })
  .default({});

const createSchema = z
  .object({
    sourceType: z.enum(["upload", "own_link", "inspiration"]),
    sourceUrl: z.string().url().optional(),
    sourceMediaId: z.string().uuid().optional(),
    /** Xác nhận quyền sử dụng — bắt buộc với own_link. */
    ownershipConfirmed: z.boolean().default(false),
    outputKind: z.enum(["video", "image", "caption"]),
    prompt: z.string().max(4000).optional(),
    options: optionsSchema,
    presetId: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
  })
  // Chặn ngay ở tầng API, trước cả CHECK constraint của DB, để trả lỗi rõ ràng.
  .refine(
    (v) => v.sourceType !== "upload" || Boolean(v.sourceMediaId),
    { message: "Nguồn 'upload' cần sourceMediaId.", path: ["sourceMediaId"] },
  )
  .refine(
    (v) => v.sourceType !== "own_link" || (Boolean(v.sourceUrl) && v.ownershipConfirmed),
    {
      message:
        "Nguồn 'own_link' cần sourceUrl và bạn phải xác nhận đây là nội dung mình sở hữu.",
      path: ["ownershipConfirmed"],
    },
  )
  .refine(
    (v) => v.sourceType !== "inspiration" || Boolean(v.sourceUrl),
    { message: "Nguồn 'inspiration' cần sourceUrl.", path: ["sourceUrl"] },
  );

export async function GET(req: NextRequest) {
  try {
    const { db } = await requireUser();
    const status = req.nextUrl.searchParams.get("status");

    let query = db
      .from("remix_jobs")
      .select(
        "id, source_type, source_url, output_kind, prompt, options, status, plan, " +
          "result_media_id, result_caption, result_hashtags, error, iteration, " +
          "post_id, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ jobs: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = createSchema.parse(await req.json());

    const { data: job, error } = await db
      .from("remix_jobs")
      .insert({
        source_type: body.sourceType,
        source_url: body.sourceUrl ?? null,
        source_media_id: body.sourceMediaId ?? null,
        ownership_confirmed: body.ownershipConfirmed,
        output_kind: body.outputKind,
        prompt: body.prompt ?? null,
        options: body.options,
        preset_id: body.presetId ?? null,
        campaign_id: body.campaignId ?? null,
        status: "queued",
        created_by: user.id,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !job) {
      return NextResponse.json(
        { error: error?.message ?? "Tạo job thất bại." },
        { status: 500 },
      );
    }

    // jobId cố định theo remix job + vòng 0 → bấm 2 lần không tạo 2 lần chạy.
    await enqueue(
      QUEUE_NAMES.remix,
      "run",
      { kind: "run", remixJobId: job.id },
      { jobId: `remix:${job.id}:0` },
    );

    return NextResponse.json({ id: job.id, status: "queued" }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
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
