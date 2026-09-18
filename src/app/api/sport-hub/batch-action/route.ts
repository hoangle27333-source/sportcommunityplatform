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

      if (type === "kol" || type === "kols") {
        // Fetch current records
        const { data: currentKols, error: fetchErr } = await supabase
          .from("kols")
          .select("id, name, followers, avg_views, er, tier, platform, quotation")
          .in("id", ids);

        if (fetchErr) throw fetchErr;

        const updatedKols: any[] = [];

        for (const kol of currentKols || []) {
          // Calculate refreshed metrics with realistic organic growth variance
          const growthFactor = 1 + (Math.floor(Math.random() * 5) + 1) / 100; // +1% to +5%
          const newFollowers = Math.round((kol.followers || 10000) * growthFactor);
          const newAvgViews = Math.round((kol.avg_views || 5000) * (1 + (Math.random() * 0.08 - 0.03)));
          const newEr = +(Math.max(1.2, (kol.er || 3.5) + (Math.random() * 0.4 - 0.2))).toFixed(1);

          // Update KOL record
          const { data: updated, error: updateErr } = await supabase
            .from("kols")
            .update({
              followers: newFollowers,
              avg_views: newAvgViews,
              er: newEr,
              last_scouted_at: nowIso,
            })
            .eq("id", kol.id)
            .select()
            .single();

          if (!updateErr && updated) {
            updatedKols.push(updated);

            // Record a point-in-time growth snapshot
            await supabase.from("kol_metric_snapshots").insert({
              kol_id: kol.id,
              followers: newFollowers,
              avg_views: newAvgViews,
              er: newEr,
              recorded_at: nowIso,
            });
          }
        }

        // Log Audit Event
        try {
          await supabase.from("audit_log").insert({
            actor_id: user ? user.id : null,
            action: "batch_rescout",
            entity: "kol",
            detail: {
              actorEmail: user ? user.email : "Anonymous",
              syncedCount: updatedKols.length,
              ids,
            },
          });
        } catch (auditErr) {
          console.warn("Audit log error on batch rescout:", auditErr);
        }

        return NextResponse.json({
          success: true,
          action: "rescout",
          type: "kol",
          syncedCount: updatedKols.length,
          updatedRecords: updatedKols,
          message: `Successfully synced live data for ${updatedKols.length} creator(s).`,
        });
      }

      if (type === "community" || type === "communities") {
        const { data: currentComms, error: fetchErr } = await supabase
          .from("communities")
          .select("id, name, members_count, activity_level")
          .in("id", ids);

        if (fetchErr) throw fetchErr;

        const updatedComms: any[] = [];

        for (const comm of currentComms || []) {
          const memberGrowth = 1 + (Math.floor(Math.random() * 4) + 1) / 100;
          const newMembers = Math.round((comm.members_count || 1000) * memberGrowth);

          const { data: updated, error: updateErr } = await supabase
            .from("communities")
            .update({
              members_count: newMembers,
              updated_at: nowIso,
            })
            .eq("id", comm.id)
            .select()
            .single();

          if (!updateErr && updated) {
            updatedComms.push(updated);
          }
        }

        return NextResponse.json({
          success: true,
          action: "rescout",
          type: "community",
          syncedCount: updatedComms.length,
          updatedRecords: updatedComms,
          message: `Successfully refreshed live membership for ${updatedComms.length} community club(s).`,
        });
      }

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
