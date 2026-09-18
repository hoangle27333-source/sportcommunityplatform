import { NextRequest, NextResponse } from "next/server";
import { scoutSingleKolPosts } from "@/lib/apify/scout";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { kolId, limit = 10, platform = "Instagram" } = body;

    if (!kolId) {
      return NextResponse.json(
        { success: false, error: "Missing required kolId parameter" },
        { status: 400 }
      );
    }

    const result = await scoutSingleKolPosts(
      kolId,
      Math.min(Number(limit) || 10, 50),
      platform
    );

    return NextResponse.json({
      success: true,
      kolName: result.kolName,
      insertedCount: result.insertedCount,
      posts: result.posts,
      message: `Successfully scouted and linked ${result.insertedCount} posts for ${result.kolName}!`,
    });
  } catch (err: any) {
    console.error("API POST /api/sport-hub/scout/kol-posts error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to scout posts for KOL",
      },
      { status: 500 }
    );
  }
}
