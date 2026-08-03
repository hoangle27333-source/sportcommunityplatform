import { PageHeader } from "@/components/ui/page-header";

export default function DashboardHomePage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Tổng quan"
        description="Nền tảng tự động hoá sản xuất & phân phối nội dung mạng xã hội."
      />
      <p className="max-w-prose text-sm text-muted-foreground">
        Dự án đã sẵn sàng — bước tiếp theo: kết nối Supabase và Meta OAuth.
      </p>
    </div>
  );
}
