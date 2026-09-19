import { NextResponse } from "next/server";
import { getSportHubDashboardData } from "@/lib/sport-hub/service";
import { getLarkDashboardData } from "@/lib/lark/client";
import { getServerUserRole, sanitizeFinancialData } from "@/lib/auth/financial-sanitizer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { isAdmin } = await getServerUserRole();

    // Primary: Read from Supabase PostgreSQL (ultra-fast)
    const rawData = await getSportHubDashboardData();
    if (rawData.kols.length > 0 || rawData.communities.length > 0) {
      const data = sanitizeFinancialData(rawData as any, isAdmin);
      return NextResponse.json({
        success: true,
        source: "supabase",
        timestamp: new Date().toISOString(),
        ...data,
      });
    }

    // Fallback: Read from Lark Base if Supabase is not yet populated
    const rawLarkData = await getLarkDashboardData();
    const larkData = sanitizeFinancialData(rawLarkData as any, isAdmin);
    return NextResponse.json({
      success: true,
      source: "lark_fallback",
      timestamp: new Date().toISOString(),
      ...larkData,
    });
  } catch (err: any) {
    console.error("API /api/lark/data error, attempting Lark fallback:", err);
    try {
      const { isAdmin } = await getServerUserRole();
      const rawLarkData = await getLarkDashboardData();
      const larkData = sanitizeFinancialData(rawLarkData as any, isAdmin);
      return NextResponse.json({
        success: true,
        source: "lark_fallback",
        timestamp: new Date().toISOString(),
        ...larkData,
      });
    } catch (fallbackErr: any) {
      return NextResponse.json(
        {
          success: false,
          error: fallbackErr.message || "Failed to load data",
        },
        { status: 500 }
      );
    }
  }
}
