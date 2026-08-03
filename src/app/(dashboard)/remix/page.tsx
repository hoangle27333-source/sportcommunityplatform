import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { RemixStudio } from "./remix-studio";

export const dynamic = "force-dynamic";

/**
 * /remix — Remix Studio (flow auto-generate content).
 *
 * Luồng: chọn nguồn (upload / link của mình / link tham khảo) → chọn đầu ra +
 * option → AI lập kế hoạch & pipeline chạy → xem kết quả → gửi phản hồi để sửa
 * → duyệt thì tạo bài nháp đưa vào calendar.
 *
 * Trang này server-render danh sách job gần đây + campaign để chọn; mọi tương
 * tác (tạo job, poll trạng thái, feedback, duyệt) nằm trong client component.
 */

interface CampaignOption {
  id: string;
  name: string;
}

interface JobRow {
  id: string;
  source_type: string;
  output_kind: string;
  status: string;
  prompt: string | null;
  options: Record<string, any>;
  iteration: number;
  created_at: string;
}

export default async function RemixPage() {
  const db = await createClient();

  // Chạy song song — hai truy vấn độc lập nhau.
  const [campaignsRes, jobsRes] = await Promise.all([
    db
      .from("campaigns")
      .select("id, name")
      .in("status", ["draft", "active"])
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("remix_jobs")
      .select("id, source_type, output_kind, status, prompt, iteration, options, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remix Studio"
        description="Đưa nội dung của bạn (hoặc một link tham khảo) vào đây — AI lập kế hoạch biên tập, hệ thống chạy pipeline, bạn xem và duyệt."
      />
      <RemixStudio
        campaigns={(campaignsRes.data ?? []) as CampaignOption[]}
        initialJobs={(jobsRes.data ?? []) as JobRow[]}
      />
    </div>
  );
}
