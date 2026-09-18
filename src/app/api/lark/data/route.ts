import { NextResponse } from "next/server";
import { getSportHubDashboardData } from "@/lib/sport-hub/service";
import { getLarkDashboardData } from "@/lib/lark/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Primary: Read from Supabase PostgreSQL (ultra-fast)
    const data = await getSportHubDashboardData();
    if (data.kols.length > 0 || data.communities.length > 0) {
      return NextResponse.json({
        success: true,
        source: "supabase",
        timestamp: new Date().toISOString(),
        ...data,
      });
    }

    // Fallback: Read from Lark Base if Supabase is not yet populated
    const larkData = await getLarkDashboardData();
    return NextResponse.json({
      success: true,
      source: "lark_fallback",
      timestamp: new Date().toISOString(),
      ...larkData,
    });
  } catch (err: any) {
    console.error("API /api/lark/data error, attempting Lark fallback:", err);
    try {
      const larkData = await getLarkDashboardData();
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
