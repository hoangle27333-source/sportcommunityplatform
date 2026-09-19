import { getSportHubDashboardData } from "@/lib/sport-hub/service";
import { getLarkDashboardData } from "@/lib/lark/client";
import { CommunityPageView } from "@/components/sport-hub/pages/community-page-view";
import { getServerUserRole, sanitizeFinancialData } from "@/lib/auth/financial-sanitizer";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sports Communities & Clubs · SPORT INFLUENCER HUB",
  description:
    "Directory of regional sports groups, pickleball & football clubs, member metrics, admin contacts, and pin pricing.",
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

  const securedData = sanitizeFinancialData(initialData, isAdmin);

  return <CommunityPageView initialData={securedData} />;
}
