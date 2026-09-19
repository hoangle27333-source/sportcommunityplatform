import { NextResponse } from "next/server";
import { getSportHubDashboardData } from "@/lib/sport-hub/service";
import { getServerUserRole, sanitizeFinancialData } from "@/lib/auth/financial-sanitizer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { isAdmin } = await getServerUserRole();
    const rawData = await getSportHubDashboardData();
    const data = sanitizeFinancialData(rawData as any, isAdmin);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...data,
    });
  } catch (err: any) {
    console.error("API /api/sport-hub/data error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to load data from Supabase",
      },
      { status: 500 }
    );
  }
}
