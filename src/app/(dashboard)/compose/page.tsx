import { ComposeForm } from "./compose-form";

export const dynamic = "force-dynamic";

/**
 * /compose — "Tạo nội dung" wizard (SPEC §7).
 *
 * Single-page flow: viết brief → AI sinh caption/hashtag/CTA → chọn banner
 * (tuỳ chọn) → chọn kênh đăng → lên lịch hoặc đăng ngay. Toàn bộ logic tương
 * tác (gọi AI, preview, submit) nằm trong client component ComposeForm; trang
 * này chỉ là entry point server-rendered.
 */
export default function ComposePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Tạo nội dung</h1>
        <p className="mt-1 text-sm text-gray-500">
          AI sinh caption, banner, chọn kênh và lên lịch — tất cả trong một
          bước duyệt.
        </p>
      </div>
      <ComposeForm />
    </div>
  );
}
