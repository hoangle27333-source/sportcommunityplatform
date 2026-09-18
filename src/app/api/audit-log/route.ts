import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string;
  detail: Record<string, any>;
  createdAt: string;
}

/**
 * GET /api/audit-log
 * Retrieves change history / audit trails.
 * Optional query parameters:
 *  - entity: 'kol' | 'community' | 'project' | 'report' | 'scout'
 *  - entityId: string
 *  - limit: number (default 40)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Please log in" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const entity = searchParams.get("entity");
    const entityId = searchParams.get("entityId");
    const limit = Math.min(Number(searchParams.get("limit")) || 40, 100);

    const adminDb = createAdminClient();

    let query = adminDb
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (entity) {
      query = query.eq("entity", entity);
    }
    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    const { data: logs, error: logError } = await query;
    if (logError) throw logError;

    // Fetch actor profiles for all unique actor_ids
    const actorIds = Array.from(
      new Set((logs || []).map((l: any) => l.actor_id).filter(Boolean))
    );

    let profileMap: Record<string, { name: string; email: string }> = {};
    if (actorIds.length > 0) {
      const { data: profiles } = await adminDb
        .from("profiles")
        .select("id, name, email")
        .in("id", actorIds);

      if (profiles) {
        profileMap = Object.fromEntries(
          profiles.map((p: any) => [
            p.id,
            { name: p.name || p.email?.split("@")[0] || "Team Member", email: p.email || "" },
          ])
        );
      }
    }

    const formattedLogs: AuditLogEntry[] = (logs || []).map((l: any) => {
      const actor = l.actor_id ? profileMap[l.actor_id] : null;
      return {
        id: l.id,
        actorId: l.actor_id || null,
        actorName: actor?.name || l.detail?.actorName || "System / Automated",
        actorEmail: actor?.email || l.detail?.actorEmail || "",
        action: l.action,
        entity: l.entity || "",
        entityId: l.entity_id || "",
        detail: l.detail || {},
        createdAt: l.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      logs: formattedLogs,
    });
  } catch (err: any) {
    console.error("API GET /api/audit-log error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch audit log" },
      { status: 500 }
    );
  }
}
