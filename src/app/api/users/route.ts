import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const newMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  username: z.string().trim().max(100).optional(),
  email: z.string().trim().email("Enter a valid email address.").max(254).optional(),
  password: z.string().min(8, "Password must contain at least 8 characters.").max(128),
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
});

function parseUserIdentifier(raw: string): { email: string; username: string; isEmail: boolean } {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("Username is required.");
  }
  if (trimmed.includes("@")) {
    const emailResult = z.string().email().safeParse(trimmed);
    if (!emailResult.success) {
      throw new Error("Enter a valid email address or username.");
    }
    return {
      email: trimmed,
      username: trimmed.split("@")[0],
      isEmail: true,
    };
  }
  if (trimmed.length < 3) {
    throw new Error("Username must contain at least 3 characters.");
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    throw new Error("Username can only contain letters, numbers, underscores, dots, or hyphens.");
  }
  return {
    email: `${trimmed}@sportcommunityplatform.com`,
    username: trimmed,
    isEmail: false,
  };
}

/** Admin-created accounts are activated only after their role is saved. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });

    const adminDb = createAdminClient();
    const { data: caller, error: callerError } = await adminDb.from("profiles").select("role").eq("id", user.id).single();
    if (callerError || caller?.role !== "admin") {
      return NextResponse.json({ success: false, error: "Only administrators can add team members." }, { status: 403 });
    }
    const parsed = newMemberSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
    const { name, username: rawUsername, email: rawEmail, password, role } = parsed.data;

    let identifierInfo: { email: string; username: string; isEmail: boolean };
    try {
      if (rawEmail) {
        identifierInfo = {
          email: rawEmail.toLowerCase(),
          username: rawEmail.toLowerCase().split("@")[0],
          isEmail: true,
        };
      } else if (rawUsername) {
        identifierInfo = parseUserIdentifier(rawUsername);
      } else {
        return NextResponse.json({ success: false, error: "Username is required." }, { status: 400 });
      }
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message || "Invalid username." }, { status: 400 });
    }
    const { email: normalizedEmail, username: cleanUsername, isEmail } = identifierInfo;

    const userMetadata: Record<string, any> = { name };
    if (rawUsername) {
      userMetadata.username = cleanUsername;
    }

    const { data, error } = await adminDb.auth.admin.createUser({
      email: normalizedEmail, password, email_confirm: false, ban_duration: "876000h", user_metadata: userMetadata,
    });
    if (error) {
      const duplicate = ["email_exists", "user_already_exists"].includes(error.code || "");
      const duplicateMsg = isEmail
        ? "A member with this email already exists."
        : "A member with this username already exists.";
      return NextResponse.json({
        success: false,
        error: duplicate ? duplicateMsg : "Failed to create member. Check the username and password requirements and try again."
      }, { status: duplicate ? 409 : 400 });
    }
    if (!data.user) throw new Error("Account creation returned no user");
    const memberId = data.user.id;
    try {
      // The signup trigger defaults to editor; explicitly persist the selected role.
      const { data: profile, error: profileError } = await adminDb.from("profiles")
        .upsert({ id: memberId, name, email: normalizedEmail, role, updated_at: new Date().toISOString() }, { onConflict: "id" })
        .select().single();
      if (profileError || !profile) throw new Error("Failed to save member profile");
      const { error: activationError } = await adminDb.auth.admin.updateUserById(memberId, { email_confirm: true, ban_duration: "none" });
      if (activationError) throw new Error("Failed to activate member account");
      const { error: auditError } = await adminDb.from("audit_log").insert({
        actor_id: user.id, action: "create", entity: "profile", entity_id: memberId,
        detail: { title: name, role, email: normalizedEmail, ...(rawUsername ? { username: cleanUsername } : {}) },
      });
      if (auditError) console.error("Member creation audit failed:", auditError.code);
      return NextResponse.json({ success: true, user: {
        id: memberId, name, email: normalizedEmail, ...(rawUsername ? { username: cleanUsername } : {}), role, createdAt: profile.created_at || data.user.created_at,
        picProjectsCount: 0, reportsCount: 0,
      } }, { status: 201 });
    } catch {
      const { error: cleanupError } = await adminDb.auth.admin.deleteUser(memberId);
      if (cleanupError) console.error("Member creation cleanup failed:", memberId, cleanupError.code);
      return NextResponse.json({ success: false, error: "Failed to finish creating member. Refresh the list before trying again." }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ success: false, error: "Failed to add member. Please try again." }, { status: 500 });
  }
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  username?: string;
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

      const isInternalDomain = email.toLowerCase().endsWith("@sportcommunityplatform.com");
      const username = isInternalDomain ? email.split("@")[0] : undefined;

      return {
        id: p.id,
        name: displayName,
        email: p.email || "",
        username,
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
