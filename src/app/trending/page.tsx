import { getSportHubDashboardData } from "@/lib/sport-hub/service";
import { TrendingPageView } from "@/components/sport-hub/pages/trending-page-view";
import { getServerUserRole, sanitizeFinancialData } from "@/lib/auth/financial-sanitizer";
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
  const { isAdmin } = await getServerUserRole();

  try {
    const supabaseData = await getSportHubDashboardData();
    if (supabaseData) {
      initialData = supabaseData;
    }
  } catch (supaErr) {
    console.error("Failed to load data from Supabase:", supaErr);
  }

  const securedData = sanitizeFinancialData(initialData, isAdmin);

  return <TrendingPageView initialData={securedData} />;
}

