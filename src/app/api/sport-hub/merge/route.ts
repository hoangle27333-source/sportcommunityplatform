import { NextRequest, NextResponse } from "next/server";
import { mergeEntities } from "@/lib/sport-hub/service";
import { getServerUserRole } from "@/lib/auth/financial-sanitizer";

export const dynamic = "force-dynamic";

/**
 * POST /api/sport-hub/merge
 * Merges duplicate KOL or Community records into a single consolidated profile.
 */
export async function POST(req: NextRequest) {
  try {
    const { isAdmin } = await getServerUserRole();

    const body = await req.json();
    const { type, primaryId, secondaryIds, mergedFields, consolidatedChannels } = body;

    if (!type || !primaryId || !secondaryIds || !Array.isArray(secondaryIds) || secondaryIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing required merge parameters (type, primaryId, secondaryIds)" },
        { status: 400 }
      );
    }

    const cleanMergedFields = { ...(mergedFields || {}) };
    if (!isAdmin) {
      delete cleanMergedFields.quotation;
      delete cleanMergedFields.pricePerPin;
    }

    const result = await mergeEntities({
      type,
      primaryId,
      secondaryIds,
      mergedFields: cleanMergedFields,
      consolidatedChannels: consolidatedChannels || [],
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("API /api/sport-hub/merge POST error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to merge entities" },
      { status: 500 }
    );
  }
}
