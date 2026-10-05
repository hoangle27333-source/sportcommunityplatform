import { getSportHubDashboardData } from "@/lib/sport-hub/service";
import { DashboardView } from "@/components/sport-hub/pages/dashboard-view";
import { getServerUserRole, sanitizeFinancialData } from "@/lib/auth/financial-sanitizer";
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

  return <DashboardView initialData={securedData} />;
}

