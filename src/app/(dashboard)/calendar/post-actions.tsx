"use client";

import { useState } from "react";
import { Pencil, Trash, Play, X } from "lucide-react";
import { useRouter } from "next/navigation";

export function PostActions({
  postId,
  status,
  initialCaption,
  initialScheduledAt,
}: {
  postId: string;
  status: string;
  initialCaption: string | null;
  initialScheduledAt: string | null;
}) {
  const router = useRouter();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [caption, setCaption] = useState(initialCaption || "");
  const [scheduledAt, setScheduledAt] = useState(
    initialScheduledAt ? new Date(initialScheduledAt).toISOString().slice(0, 16) : ""
  );

  // For a real app, these would call server actions or API endpoints
  const handleEdit = () => {
    setIsEditModalOpen(true);
  };

  const handleDelete = () => {
    if (confirm("Bạn có chắc muốn xoá bài viết này?")) {
      alert("Đã xoá (chức năng đang hoàn thiện)");
      // await deletePost(postId);
      // router.refresh();
    }
  };

  const handlePublishNow = () => {
    if (confirm("Bạn có chắc muốn đăng bài viết này ngay lập tức?")) {
      alert("Đã gửi yêu cầu đăng bài (chức năng đang hoàn thiện)");
      // await publishNow(postId);
      // router.refresh();
    }
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleEdit}
        title="Chỉnh sửa"
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Pencil className="h-4 w-4" />
      </button>

      {status === "scheduled" && (
        <button
          onClick={handlePublishNow}
          title="Đăng ngay"
          className="rounded p-1 text-info hover:bg-info/10 transition-colors"
        >
          <Play className="h-4 w-4" />
        </button>
      )}

      <button
        onClick={handleDelete}
        title="Xoá"
        className="rounded p-1 text-destructive hover:bg-destructive/10 transition-colors"
      >
        <Trash className="h-4 w-4" />
      </button>
    </div>

      {/* Edit Modal Popup */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card text-card-foreground w-full max-w-lg rounded-lg border border-border shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-lg font-medium">Chỉnh sửa bài đăng</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-1">Nội dung (Caption)</label>
                <textarea
                  className="w-full min-h-32 bg-background border border-border rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Nhập nội dung bài viết..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Media đính kèm</label>
                <div className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-muted-foreground bg-muted/10 hover:bg-muted/30 transition-colors cursor-pointer">
                  <svg className="size-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">Bấm để chọn file thay thế</p>
                  <p className="text-xs mt-1">(Video hoặc Hình ảnh)</p>
                  <input type="file" className="hidden" accept="image/*,video/*" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Thời gian lên lịch</label>
                <input
                  type="datetime-local"
                  className="w-full bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-sm font-medium bg-muted text-muted-foreground rounded hover:bg-muted/80"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  alert("Đã lưu thay đổi (Chức năng đang hoàn thiện)");
                  setIsEditModalOpen(false);
                }}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
