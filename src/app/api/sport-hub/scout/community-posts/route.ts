import { NextRequest, NextResponse } from "next/server";
import { scoutSingleCommunityPosts } from "@/lib/apify/scout";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { communityId, limit = 10, platform = "Facebook" } = body;

    if (!communityId) {
      return NextResponse.json(
        { success: false, error: "Missing required communityId parameter" },
        { status: 400 }
      );
    }

    const result = await scoutSingleCommunityPosts(
      communityId,
      Math.min(Number(limit) || 10, 50),
      platform
    );

    return NextResponse.json({
      success: true,
      communityName: result.communityName,
      insertedCount: result.insertedCount,
      posts: result.posts,
      message: `Successfully scouted ${result.insertedCount} posts and discussions for ${result.communityName}!`,
    });
  } catch (err: any) {
    console.error("API POST /api/sport-hub/scout/community-posts error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to scout posts for Community",
      },
      { status: 500 }
    );
  }
}
