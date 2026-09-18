import { NextRequest, NextResponse } from "next/server";
import {
  createKOL,
  updateKOL,
  createCommunity,
  createProject,
  createReport,
  createScoutRequest,
  createPost,
  updateProject,
  deleteProject,
} from "@/lib/sport-hub/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/sport-hub/record
 * Creates a new KOL, Community, Project, Report, or Scout request with user attribution.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUserClient = await createClient();
    const {
      data: { user },
    } = await supabaseUserClient.auth.getUser();

    const body = await req.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json(
        { success: false, error: "Missing required data (type or data)" },
        { status: 400 }
      );
    }

    // Attach creator user attribution if logged in
    if (user) {
      data.createdBy = user.id;
      data.lastEditedBy = user.id;
    }

    let record: any = null;

    if (type === "scout") {
      const keyword = String(data.keyword || "").trim();
      if (!keyword) {
        return NextResponse.json(
          { success: false, error: "Please enter a search keyword" },
          { status: 400 }
        );
      }
      record = await createScoutRequest(data);
    } else if (type === "report") {
      const kolName = String(data.kolName || "").trim();
      const project = String(data.project || data.projectName || "").trim();

      if (!kolName) {
        return NextResponse.json(
          { success: false, error: "Please enter or select KOL Name" },
          { status: 400 }
        );
      }
      if (!project) {
        return NextResponse.json(
          { success: false, error: "Please enter Project Name" },
          { status: 400 }
        );
      }
      record = await createReport(data);
    } else if (type === "kol") {
      const name = String(data.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "Please enter KOL Name / Channel" },
          { status: 400 }
        );
      }
      record = await createKOL(data);
    } else if (type === "community") {
      const name = String(data.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "Please enter Community / Group Name" },
          { status: 400 }
        );
      }
      record = await createCommunity(data);
    } else if (type === "project") {
      const name = String(data.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "Please enter Campaign / Project Name" },
          { status: 400 }
        );
      }
      record = await createProject(data);
    } else if (type === "post") {
      const title = String(data.title || "").trim();
      if (!title) {
        return NextResponse.json(
          { success: false, error: "Please enter Post Title / Hook" },
          { status: 400 }
        );
      }
      record = await createPost(data);
    } else {
      return NextResponse.json(
        { success: false, error: `Invalid creation type: ${type}` },
        { status: 400 }
      );
    }

    // Audit Logging: Record creation action
    if (record) {
      try {
        const adminDb = createAdminClient();
        await adminDb.from("audit_log").insert({
          actor_id: user ? user.id : null,
          action: "create",
          entity: type,
          entity_id: record.id || "",
          detail: {
            actorEmail: user ? user.email : "Anonymous",
            title: record.name || record.title || data.name || data.title || "",
            createdData: data,
          },
        });
      } catch (auditErr) {
        console.warn("Audit log insert error on create:", auditErr);
      }
    }

    return NextResponse.json({
      success: true,
      record,
      message: "Record created successfully in Supabase!",
    });
  } catch (err: any) {
    console.error("API POST /api/sport-hub/record error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Error creating record in Supabase",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/sport-hub/record
 * Updates an existing record with editor attribution and audit trail diff logging.
 */
export async function PUT(req: NextRequest) {
  try {
    const supabaseUserClient = await createClient();
    const {
      data: { user },
    } = await supabaseUserClient.auth.getUser();

    const body = await req.json();
    const { type, id, data } = body;

    if (!type || !id || !data) {
      return NextResponse.json(
        { success: false, error: "Missing type, record ID, or data to update" },
        { status: 400 }
      );
    }

    // Attach editor user attribution if logged in
    if (user) {
      data.lastEditedBy = user.id;
    }

    const supabase = createAdminClient();
    let updatedRecord: any = null;

    if (type === "kol") {
      updatedRecord = await updateKOL(id, data);
    } else if (type === "community") {
      const payload: Record<string, any> = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.sport !== undefined) payload.sports = data.sport;
      if (data.geography !== undefined) payload.geography = data.geography;
      if (data.members !== undefined) payload.members_count = Number(data.members) || 0;
      if (data.platform !== undefined) payload.platform = data.platform;
      if (data.groupUrl !== undefined) payload.group_url = data.groupUrl;
      if (data.activityLevel !== undefined) payload.activity_level = data.activityLevel;
      if (data.privacy !== undefined) payload.privacy = data.privacy;
      if (data.purpose !== undefined) payload.purposes = data.purpose;
      if (data.adminContact !== undefined) payload.admin_contact = data.adminContact;
      if (data.pricePerPin !== undefined) payload.price_per_pin = Number(data.pricePerPin) || 0;
      if (data.status !== undefined) payload.status = data.status;

      const { data: rec, error } = await supabase
        .from("communities")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      updatedRecord = rec;
    } else if (type === "project") {
      updatedRecord = await updateProject(id, data);
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported update type: ${type}` },
        { status: 400 }
      );
    }

    // Audit Logging: Record update action and field diffs
    try {
      await supabase.from("audit_log").insert({
        actor_id: user ? user.id : null,
        action: "update",
        entity: type,
        entity_id: id,
        detail: {
          actorEmail: user ? user.email : "Anonymous",
          title: updatedRecord?.name || updatedRecord?.title || data.name || "",
          updatedFields: Object.keys(data),
          changes: data,
        },
      });
    } catch (auditErr) {
      console.warn("Audit log insert error on update:", auditErr);
    }

    return NextResponse.json({
      success: true,
      record: updatedRecord,
      message: "Record updated successfully in Supabase!",
    });
  } catch (err: any) {
    console.error("API PUT /api/sport-hub/record error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Error updating record in Supabase",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sport-hub/record
 * Deletes a record and logs audit trail.
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabaseUserClient = await createClient();
    const {
      data: { user },
    } = await supabaseUserClient.auth.getUser();

    let type = req.nextUrl.searchParams.get("type") || req.nextUrl.searchParams.get("table");
    let id = req.nextUrl.searchParams.get("id");

    if (!id) {
      try {
        const body = await req.json();
        type = type || body.type || body.table;
        id = id || body.id;
      } catch {
        // query param fallback
      }
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing record ID to delete" },
        { status: 400 }
      );
    }

    if (type === "project" || type === "projects" || type === "sport_projects") {
      await deleteProject(id);
    } else {
      const supabase = createAdminClient();
      let tableName = "kols";
      if (type === "community" || type === "communities") tableName = "communities";
      else if (type === "report" || type === "reports") tableName = "kol_reports";
      else if (type === "post" || type === "posts") tableName = "scouted_posts";
      else if (type === "scout") tableName = "scout_requests";

      const { error } = await supabase.from(tableName).delete().eq("id", id);
      if (error) throw error;
    }

    // Audit Logging: Record deletion
    try {
      const adminDb = createAdminClient();
      await adminDb.from("audit_log").insert({
        actor_id: user ? user.id : null,
        action: "delete",
        entity: type || "record",
        entity_id: id,
        detail: {
          actorEmail: user ? user.email : "Anonymous",
        },
      });
    } catch (auditErr) {
      console.warn("Audit log insert error on delete:", auditErr);
    }

    return NextResponse.json({
      success: true,
      id,
      message: "Record deleted successfully from Supabase!",
    });
  } catch (err: any) {
    console.error("API DELETE /api/sport-hub/record error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Error deleting record from Supabase",
      },
      { status: 500 }
    );
  }
}
