import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/**
 * Server-side auth/RBAC helpers for API routes and Server Actions (SPEC §1, §9).
 *
 * These enforce role at the app layer. RLS is the second line of defense at the
 * DB layer — never rely on these alone for data isolation.
 */

export type AppRole = "admin" | "editor" | "viewer";

export interface AuthedUser {
  user: User;
  role: AppRole;
  db: SupabaseClient;
}

/** HTTP-style error thrown by the require* helpers. */
export class AuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Resolve the current authenticated user and their app role.
 * Throws AuthError(401) if not logged in.
 */
export async function requireUser(): Promise<AuthedUser> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new AuthError(401, "unauthorized");

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: AppRole }>();

  return { user, role: profile?.role ?? "viewer", db };
}

/** Require the user to have at least editor privileges (editor or admin). */
export async function requireEditor(): Promise<AuthedUser> {
  const authed = await requireUser();
  if (authed.role !== "admin" && authed.role !== "editor") {
    throw new AuthError(403, "forbidden: editor role required");
  }
  return authed;
}

/** Require admin privileges. */
export async function requireAdmin(): Promise<AuthedUser> {
  const authed = await requireUser();
  if (authed.role !== "admin") {
    throw new AuthError(403, "forbidden: admin role required");
  }
  return authed;
}
