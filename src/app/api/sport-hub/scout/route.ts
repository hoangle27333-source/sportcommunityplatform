import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  processScoutRequest,
  previewDiscoveryCandidates,
  ingestSelectedCandidates,
} from "@/lib/apify/scout";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("scout_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (err: any) {
    console.error("API GET /api/sport-hub/scout error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch scout requests" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUserClient = await createClient();
    const {
      data: { user },
    } = await supabaseUserClient.auth.getUser();

    const body = await req.json();
    const {
      action, // "preview" | "confirm" | undefined
      keyword,
      targetType = "Individual KOLs",
      platform = "Instagram",
      limit = 5,
      geography = "Nationwide",
      notes = "",
      candidates = [],
      runImmediate = true,
    } = body;

    // ─── STEP 1 ACTION: PREVIEW CANDIDATES (NO DB INSERT) ───
    if (action === "preview") {
      const trimmed = String(keyword || "").trim();
      if (!trimmed) {
        return NextResponse.json(
          { success: false, error: "Please enter a search keyword or topic" },
          { status: 400 }
        );
      }

      const previewRes = await previewDiscoveryCandidates({
        keyword: trimmed,
        targetType,
        platform,
        limit: Number(limit) || 5,
        geography,
      });

      return NextResponse.json(previewRes);
    }

    // ─── STEP 2 ACTION: INGEST USER-SELECTED CANDIDATES ───
    if (action === "confirm") {
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return NextResponse.json(
          { success: false, error: "Please select at least one candidate to import" },
          { status: 400 }
        );
      }

      const confirmRes = await ingestSelectedCandidates({
        candidates,
        targetType,
        platform,
        geography,
        keyword,
        notes,
      });

      return NextResponse.json(confirmRes);
    }

    const trimmedKeyword = String(keyword || "").trim();
    if (!trimmedKeyword) {
      return NextResponse.json(
        { success: false, error: "Please enter a search keyword or account handle" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    let creatorName = user ? (user.user_metadata?.name || user.email?.split("@")[0] || "Team Member") : "";
    if (user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();
      if (prof?.name) creatorName = prof.name;
    }

    const summaryParts: string[] = [];
    if (notes) summaryParts.push(`Notes: ${notes}`);
    if (creatorName) summaryParts.push(`Requested by: ${creatorName}`);

    // 1. Create scout request in Supabase with user attribution
    const insertPayload: Record<string, any> = {
      keyword: trimmedKeyword,
      target_type: targetType,
      platform,
      target_limit: Number(limit) || 5,
      geography,
      status: "Chờ xử lý",
      results_summary: summaryParts.join(" · "),
    };

    const { data: record, error: insertErr } = await supabase
      .from("scout_requests")
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr || !record) {
      throw insertErr || new Error("Failed to create scout request in database");
    }

    // Audit Logging
    try {
      await supabase.from("audit_log").insert({
        actor_id: user ? user.id : null,
        action: "scout_request",
        entity: "scout",
        entity_id: record.id,
        detail: {
          actorEmail: user ? user.email : "Anonymous",
          creatorName,
          keyword: trimmedKeyword,
          platform,
          targetType,
          limit,
        },
      });
    } catch (auditErr) {
      console.warn("Audit log error on scout:", auditErr);
    }

    // 2. If runImmediate is requested, process scout request and await completion
    let scoutResult: any = null;
    if (runImmediate) {
      scoutResult = await processScoutRequest(record.id);
    }

    return NextResponse.json({
      success: true,
      requestId: record.id,
      creatorName,
      insertedKols: scoutResult?.insertedKols ?? 0,
      updatedKols: scoutResult?.updatedKols ?? 0,
      insertedCommunities: scoutResult?.insertedCommunities ?? 0,
      updatedCommunities: scoutResult?.updatedCommunities ?? 0,
      insertedPosts: scoutResult?.insertedPosts ?? 0,
      summary: scoutResult?.summary || "Scout completed successfully!",
      message: scoutResult?.summary || "Scout completed successfully!",
    });
  } catch (err: any) {
    console.error("API POST /api/sport-hub/scout error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to process scout request",
      },
      { status: 500 }
    );
  }
}
