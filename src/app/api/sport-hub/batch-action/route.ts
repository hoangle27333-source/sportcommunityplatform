import { startSession } from '@/lib/apify/sessions';
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/sport-hub/batch-action
 * Executes batch operations (delete, rescout/sync) across KOLs, Communities, and Projects.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUserClient = await createClient();
    const {
      data: { user },
    } = await supabaseUserClient.auth.getUser();

    const body = await req.json();
    const { action, type, ids } = body;

    if (!action || !type || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: action, type, and ids array" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // ──────────────────────────────────────────
    // 1. BATCH DELETE
    // ──────────────────────────────────────────
    if (action === "delete") {
      if (type === "kol" || type === "kols") {
        // Clean up snapshots first to prevent foreign key issues
        try {
          await supabase.from("kol_metric_snapshots").delete().in("kol_id", ids);
        } catch (e) {
          console.warn("Could not delete metric snapshots:", e);
        }
        const { error } = await supabase.from("kols").delete().in("id", ids);
        if (error) throw error;
      } else if (type === "community" || type === "communities") {
        const { error } = await supabase.from("communities").delete().in("id", ids);
        if (error) throw error;
      } else if (type === "project" || type === "projects") {
        try {
          await supabase.from("project_participants").delete().in("project_id", ids);
        } catch (e) {
          console.warn("Could not delete project participants:", e);
        }
        const { error } = await supabase.from("sport_projects").delete().in("id", ids);
        if (error) throw error;
      } else {
        return NextResponse.json(
          { success: false, error: `Unsupported type: ${type}` },
          { status: 400 }
        );
      }

      // Log Audit Event
      try {
        await supabase.from("audit_log").insert({
          actor_id: user ? user.id : null,
          action: "batch_delete",
          entity: type,
          detail: {
            actorEmail: user ? user.email : "Anonymous",
            deletedCount: ids.length,
            ids,
          },
        });
      } catch (auditErr) {
        console.warn("Audit log error on batch delete:", auditErr);
      }

      return NextResponse.json({
        success: true,
        action: "delete",
        type,
        deletedCount: ids.length,
        message: `Successfully deleted ${ids.length} ${type} record(s).`,
      });
    }

    // ──────────────────────────────────────────
    // 2. BATCH RESCOUT / SYNC LIVE DATA
    // ──────────────────────────────────────────
    if (action === "rescout" || action === "sync") {
      const nowIso = new Date().toISOString();

      if (['kol','kols','community','communities'].includes(type)) return startSession('sync',{ids,entityType:type==='kol' || type==='kols' ? 'kol' : 'community',uiContext:body.uiContext});

      if (type === "project" || type === "projects") {
        const { data: currentProjects, error: fetchErr } = await supabase
          .from("sport_projects")
          .select("id, name, budget, kpi_target, kpi_achieved")
          .in("id", ids);

        if (fetchErr) throw fetchErr;

        const updatedProjects: any[] = [];

        for (const proj of currentProjects || []) {
          // Fetch participants to aggregate live delivery
          const { data: participants } = await supabase
            .from("project_participants")
            .select("actual_views, committed_views, post_er")
            .eq("project_id", proj.id);

          let totalActualViews = 0;
          let totalCommittedViews = 0;

          if (participants && participants.length > 0) {
            totalActualViews = participants.reduce((sum, p) => sum + (p.actual_views || 0), 0);
            totalCommittedViews = participants.reduce((sum, p) => sum + (p.committed_views || 0), 0);
          }

          const kpiAchieved = totalActualViews > 0 ? totalActualViews : (proj.kpi_achieved || 0);

          const { data: updated, error: updateErr } = await supabase
            .from("sport_projects")
            .update({
              kpi_achieved: kpiAchieved,
              updated_at: nowIso,
            })
            .eq("id", proj.id)
            .select()
            .single();

          if (!updateErr && updated) {
            updatedProjects.push(updated);
          }
        }

        return NextResponse.json({
          success: true,
          action: "rescout",
          type: "project",
          syncedCount: updatedProjects.length,
          updatedRecords: updatedProjects,
          message: `Successfully updated live delivery stats for ${updatedProjects.length} campaign(s).`,
        });
      }

      return NextResponse.json(
        { success: false, error: `Unsupported type: ${type}` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action: ${action}` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("API POST /api/sport-hub/batch-action error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to execute batch action" },
      { status: 500 }
    );
  }
}
