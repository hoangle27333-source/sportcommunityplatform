import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  createdAt: string;
  picProjectsCount: number;
  reportsCount: number;
}

/**
 * GET /api/users
 * Lists all registered team members with their roles and assignment metrics.
 * Accessible by any authenticated user.
 */
export async function GET() {
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

    const adminDb = createAdminClient();

    // Fetch all profiles, projects, and reports in parallel to calculate stats
    const [profilesRes, projectsRes, reportsRes] = await Promise.all([
      adminDb.from("profiles").select("*").order("created_at", { ascending: true }),
      adminDb.from("sport_projects").select("id, pic"),
      adminDb.from("kol_reports").select("id, evaluator"),
    ]);

    if (profilesRes.error) throw profilesRes.error;

    const rawProfiles = profilesRes.data || [];
    const projects = projectsRes.data || [];
    const reports = reportsRes.data || [];

    const members: TeamMember[] = rawProfiles.map((p: any) => {
      const displayName = p.name || p.email?.split("@")[0] || "Team Member";
      const email = p.email || "";

      // Count PIC projects by name match or ID
      const picProjectsCount = projects.filter((proj: any) => {
        if (proj.pic_user_id && proj.pic_user_id === p.id) return true;
        if (proj.pic && (proj.pic.toLowerCase().includes(displayName.toLowerCase()) || (email && proj.pic.toLowerCase().includes(email.toLowerCase())))) {
          return true;
        }
        return false;
      }).length;

      // Count authored evaluations/reports by name match or ID
      const reportsCount = reports.filter((rep: any) => {
        if (rep.evaluator_id && rep.evaluator_id === p.id) return true;
        if (rep.evaluator && (rep.evaluator.toLowerCase().includes(displayName.toLowerCase()) || (email && rep.evaluator.toLowerCase().includes(email.toLowerCase())))) {
          return true;
        }
        return false;
      }).length;

      return {
        id: p.id,
        name: displayName,
        email: p.email || "",
        role: p.role || "viewer",
        createdAt: p.created_at || new Date().toISOString(),
        picProjectsCount,
        reportsCount,
      };
    });

    return NextResponse.json({
      success: true,
      users: members,
    });
  } catch (err: any) {
    console.error("API GET /api/users error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load team members" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users
 * Update user role. Requires 'admin' role.
 */
export async function PATCH(req: NextRequest) {
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

    const adminDb = createAdminClient();

    // Check caller's role
    const { data: callerProfile } = await adminDb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerProfile?.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Only administrators can modify roles" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { userId, role } = body;

    if (!userId || !role) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: userId and role" },
        { status: 400 }
      );
    }

    if (!["admin", "editor", "viewer"].includes(role)) {
      return NextResponse.json(
        { success: false, error: "Invalid role. Must be 'admin', 'editor', or 'viewer'" },
        { status: 400 }
      );
    }

    const { data: updated, error } = await adminDb
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;

    // Log this sensitive action to audit_log
    await adminDb.from("audit_log").insert({
      actor_id: user.id,
      action: "role_change",
      entity: "profile",
      entity_id: userId,
      detail: {
        newRole: role,
        changedBy: user.email,
      },
    });

    return NextResponse.json({
      success: true,
      user: updated,
      message: `User role successfully changed to ${role}`,
    });
  } catch (err: any) {
    console.error("API PATCH /api/users error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update user role" },
      { status: 500 }
    );
  }
}
