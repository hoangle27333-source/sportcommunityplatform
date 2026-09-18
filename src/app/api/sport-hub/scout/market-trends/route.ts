import { NextRequest, NextResponse } from "next/server";
import { scoutMarketTrends } from "@/lib/apify/scout";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      keyword,
      sport,
      platform = "Instagram",
      limit = 10,
      geography = "Toàn quốc",
    } = body;

    const trimmed = String(keyword || "").trim();
    if (!trimmed) {
      return NextResponse.json(
        { success: false, error: "Please enter a search keyword or hashtag" },
        { status: 400 }
      );
    }

    const result = await scoutMarketTrends({
      keyword: trimmed,
      sport,
      platform,
      limit: Math.min(Number(limit) || 10, 50),
      geography,
    });

    return NextResponse.json({
      success: true,
      keyword: result.keyword,
      totalScouted: result.totalScouted,
      matchedKolsCount: result.matchedKolsCount,
      posts: result.posts,
      message: `Scouted ${result.totalScouted} trending posts! (${result.matchedKolsCount} automatically linked to registered KOLs in your CRM)`,
    });
  } catch (err: any) {
    console.error("API POST /api/sport-hub/scout/market-trends error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to scout market trends",
      },
      { status: 500 }
    );
  }
}
