import { NextRequest, NextResponse } from "next/server";
import {
  getLatestAudienceAudit,
  runKolAudienceAudit,
} from "@/lib/sport-hub/audience-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET /api/sport-hub/kol/:id/audience-audit
 * Returns the latest cached audience authenticity + sponsored content audit.
 */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id: kolId } = await ctx.params;
    if (!kolId) {
      return NextResponse.json(
        { success: false, error: "Missing KOL id" },
        { status: 400 }
      );
    }

    const data = await getLatestAudienceAudit(kolId);
    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: "No audience audit found for this KOL. Run POST to generate one.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("API GET /api/sport-hub/kol/[id]/audience-audit error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load audience audit" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sport-hub/kol/:id/audience-audit
 * Body: { force?: boolean, postLimit?: number, heuristicsOnly?: boolean }
 * Runs scrape/NLP audit pipeline and returns the response contract.
 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id: kolId } = await ctx.params;
    if (!kolId) {
      return NextResponse.json(
        { success: false, error: "Missing KOL id" },
        { status: 400 }
      );
    }

    let body: {
      force?: boolean;
      postLimit?: number;
      heuristicsOnly?: boolean;
    } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const data = await runKolAudienceAudit(kolId, {
      force: Boolean(body.force),
      postLimit: body.postLimit,
      heuristicsOnly: Boolean(body.heuristicsOnly),
    });

    return NextResponse.json({
      success: true,
      data,
      message: `Audience audit complete for KOL ${kolId}`,
    });
  } catch (err: any) {
    console.error("API POST /api/sport-hub/kol/[id]/audience-audit error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to run audience authenticity audit",
      },
      { status: 500 }
    );
  }
}
