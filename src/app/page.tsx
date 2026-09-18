import { getSportHubDashboardData } from "@/lib/sport-hub/service";
import { getLarkDashboardData } from "@/lib/lark/client";
import { DashboardView } from "@/components/sport-hub/pages/dashboard-view";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Executive Dashboard · SPORT INFLUENCER HUB",
  description:
    "High-performance CRM, Scouting and 360° panoramic evaluation platform for athletes & sports communities powered by Supabase PostgreSQL.",
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
  projects: [],
  posts: [],
  reports: [],
};

export default async function HomePage() {
  let initialData: any = EMPTY_FALLBACK;

  try {
    // Primary: Load directly from Lark Base (Single Source of Truth)
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

  return <DashboardView initialData={initialData} />;
}
