import { NextRequest, NextResponse } from "next/server";
import {
  fetchProjectParticipants,
  addParticipantToProject,
} from "@/lib/sport-hub/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const participants = await fetchProjectParticipants(id);
    return NextResponse.json({ success: true, participants });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch participants" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const created = await addParticipantToProject({
      ...body,
      projectId: id,
    });
    return NextResponse.json({ success: true, participant: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to add participant" },
      { status: 500 }
    );
  }
}
