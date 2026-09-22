import { NextRequest, NextResponse } from "next/server";
import {
  getLatestCommunityAudienceAudit,
  runCommunityAudienceAudit,
} from "@/lib/sport-hub/audience-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const data = await getLatestCommunityAudienceAudit(id);
    if (!data) {
      return NextResponse.json(
        { success: false, error: "No community audience audit yet. Run POST to generate one." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load community audit" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    let body: { force?: boolean; postLimit?: number; heuristicsOnly?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const data = await runCommunityAudienceAudit(id, {
      force: Boolean(body.force),
      postLimit: body.postLimit,
      heuristicsOnly: Boolean(body.heuristicsOnly),
    });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to audit community" },
      { status: 500 }
    );
  }
}
