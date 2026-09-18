import { getLarkDashboardData } from "@/lib/lark/client";
import { SportHubView } from "@/components/sport-hub/sport-hub-view";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SPORT INFLUENCER HUB · Bảng Điều Khiển & Tra Cứu 360°",
  description:
    "Nền tảng CRM, Tuyển chọn (Scout) và Đánh giá toàn cảnh 360° Vận động viên & Cộng đồng Thể thao kết nối trực tiếp với Lark Base.",
};

const EMPTY_FALLBACK: any = {
  kpis: {
    totalKols: 0,
    totalReach: 0,
    avgScore: 5.0,
    totalCommunities: 0,
    totalCommunityMembers: 0,
    totalPosts: 0,
  },
  kols: [],
  communities: [],
  posts: [],
  reports: [],
};

export default async function HomePage() {
  let initialData: any = EMPTY_FALLBACK;

  try {
    initialData = await getLarkDashboardData();
  } catch (err) {
    console.error("Lỗi khi tải dữ liệu khởi đầu từ Lark Base:", err);
  }

  return <SportHubView initialData={initialData} />;
}
