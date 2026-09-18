import { NextResponse } from "next/server";
import { getSportHubDashboardData } from "@/lib/sport-hub/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getSportHubDashboardData();
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
