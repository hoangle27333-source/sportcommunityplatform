import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { processScoutRequest } from "@/lib/apify/scout";

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
      keyword,
      targetType = "KOLs cá nhân",
      platform = "Instagram",
      limit = 5,
      geography = "Toàn quốc",
      notes = "",
      runImmediate = true,
    } = body;

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

    // 2. If runImmediate is requested, trigger Apify scraper asynchronously
    if (runImmediate) {
      processScoutRequest(record.id).catch((err) => {
        console.error(`Background Apify scout task ${record.id} error:`, err);
      });
    }

    return NextResponse.json({
      success: true,
      requestId: record.id,
      creatorName,
      message:
        "Scout request created! Apify engine is scanning on Cloud and saving directly into Supabase PostgreSQL.",
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
