import { NextRequest, NextResponse } from "next/server";
import { resolveScoutDiff } from "@/lib/sport-hub/service";

export const dynamic = "force-dynamic";

export async function POST(
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

    const body = await req.json();
    const { action, fields } = body; // action: "apply" | "dismiss", fields: string[]

    if (action === "dismiss") {
      const updated = await resolveScoutDiff(id, [], true);
      return NextResponse.json({
        success: true,
        message: "Scout diff dismissed successfully",
        record: updated,
      });
    }

    if (action === "apply") {
      if (!Array.isArray(fields) || fields.length === 0) {
        return NextResponse.json(
          { success: false, error: "Please select at least one field to apply" },
          { status: 400 }
        );
      }

      const updated = await resolveScoutDiff(id, fields, false);
      return NextResponse.json({
        success: true,
        message: "Selected scout changes applied successfully to Supabase!",
        record: updated,
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action. Must be 'apply' or 'dismiss'" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("API POST /api/sport-hub/kol/[id]/diff error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to resolve scout diff",
      },
      { status: 500 }
    );
  }
}
