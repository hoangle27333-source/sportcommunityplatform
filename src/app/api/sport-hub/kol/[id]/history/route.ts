import { NextRequest, NextResponse } from "next/server";
import { getKolMetricHistory } from "@/lib/sport-hub/service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing KOL ID" },
        { status: 400 }
      );
    }

    const history = await getKolMetricHistory(id);
    return NextResponse.json({
      success: true,
      history,
    });
  } catch (err: any) {
    console.error("API GET /api/sport-hub/kol/[id]/history error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to fetch metric history",
      },
      { status: 500 }
    );
  }
}
