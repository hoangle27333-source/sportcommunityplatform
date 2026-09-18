import { getSportHubDashboardData } from "@/lib/sport-hub/service";
import { getLarkDashboardData } from "@/lib/lark/client";
import { TrendingPageView } from "@/components/sport-hub/pages/trending-page-view";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending Viral Posts & Reels · SPORT INFLUENCER HUB",
  description:
    "Scouted viral sports reels, engagement analytics, and creator performance on TikTok, Instagram, and Facebook.",
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
  projects: [],
};

export default async function Page() {
  let initialData: any = EMPTY_FALLBACK;

  try {
    initialData = await getLarkDashboardData();
  } catch (larkErr) {
    console.warn("Lark Base load failed, falling back to Supabase:", larkErr);
    try {
      const supabaseData = await getSportHubDashboardData();
      if (supabaseData.kols.length > 0 || supabaseData.communities.length > 0) {
        initialData = supabaseData;
      }
    } catch (supaErr) {
      console.error("Both Lark and Supabase failed:", supaErr);
    }
  }

  return <TrendingPageView initialData={initialData} />;
}
