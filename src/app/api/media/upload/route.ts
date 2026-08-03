import { NextResponse, type NextRequest } from "next/server";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadMediaAsset } from "@/lib/storage/media";

export const dynamic = "force-dynamic";
// Upload video cần thời gian; nới giới hạn thực thi.
export const maxDuration = 300;

/**
 * POST /api/media/upload — nhận file người dùng SỞ HỮU và lưu vào storage.
 *
 * Đây là cửa vào hợp lệ của module remix (SPEC §0): nội dung do người dùng tự
 * cung cấp, không tải từ nền tảng bên thứ ba. Nhận multipart/form-data:
 *   file: File (video hoặc ảnh)
 *
 * Trả về media_asset đã tạo để dùng làm source_media_id khi tạo remix job.
 */

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 200 * 1024 * 1024);

const ALLOWED: Record<string, { ext: string; type: "image" | "video" }> = {
  "video/mp4": { ext: "mp4", type: "video" },
  "video/quicktime": { ext: "mov", type: "video" },
  "video/x-matroska": { ext: "mkv", type: "video" },
  "video/webm": { ext: "webm", type: "video" },
  "image/jpeg": { ext: "jpg", type: "image" },
  "image/png": { ext: "png", type: "image" },
  "image/webp": { ext: "webp", type: "image" },
};

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireEditor();

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Thiếu file. Gửi multipart/form-data với field 'file'." },
        { status: 422 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File rỗng." }, { status: 422 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Giới hạn ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB.`,
        },
        { status: 413 },
      );
    }

    const kind = ALLOWED[file.type];
    if (!kind) {
      return NextResponse.json(
        {
          error: `Định dạng không hỗ trợ: ${file.type || "không rõ"}. Hỗ trợ: ${Object.keys(ALLOWED).join(", ")}`,
        },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Storage writes dùng service-role (bucket media là hệ thống quản lý).
    const asset = await uploadMediaAsset(createAdminClient(), {
      buffer,
      contentType: file.type,
      ext: kind.ext,
      type: kind.type,
      generatedBy: "upload",
      createdBy: user.id,
      meta: { originalName: file.name, sizeBytes: file.size },
    });

    return NextResponse.json({ asset }, { status: 201 });
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
