import { NextRequest, NextResponse } from "next/server";
import {
  logParticipantPerformance,
  evaluateParticipant,
  deleteProjectParticipant,
} from "@/lib/sport-hub/service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { participantId } = await context.params;
    const body = await request.json();

    if (body.action === "evaluate") {
      const updated = await evaluateParticipant(participantId, {
        score: Number(body.score) || 5,
        attitude: Number(body.attitude) || 5,
        deadlineStatus: body.deadlineStatus || "On Time",
        pmNotes: body.pmNotes || "",
        evaluator: body.evaluator || "PM",
        projectName: body.projectName,
      });
      return NextResponse.json({ success: true, participant: updated });
    }

    // Default: update performance
    const updated = await logParticipantPerformance(participantId, {
      actualViews: body.actualViews !== undefined ? Number(body.actualViews) : undefined,
      actualReach: body.actualReach !== undefined ? Number(body.actualReach) : undefined,
      actualER: body.actualER !== undefined ? Number(body.actualER) : undefined,
      proofUrl: body.proofUrl,
      status: body.status,
    });

    return NextResponse.json({ success: true, participant: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update participant" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { participantId } = await context.params;
    await deleteProjectParticipant(participantId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete participant" },
      { status: 500 }
    );
  }
}
