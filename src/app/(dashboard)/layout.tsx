import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import type { NavCounts, Role } from "@/components/shell/nav";

/**
 * Dashboard shell for all authenticated routes (route group "(dashboard)").
 *
 * Middleware already guarantees a session here (R1.1); this layout additionally
 * loads the user's role to drive role-aware navigation. Hard authorization for
 * writes lives in RLS (R1.4) + route handlers — nav visibility is UX only.
 *
 * Badge counts are resolved here (one round trip each, `head: true` so only the
 * count crosses the wire) and handed to the client shell as plain numbers.
 */

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth: middleware should have redirected, but never render
  // the shell without a user.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, name, email")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "viewer") as Role;
  const email = profile?.email ?? user.email ?? "";
  const displayName = profile?.name ?? email ?? "User";

  const counts = await navCounts(supabase, role);

  return (
    <DashboardShell role={role} counts={counts} name={displayName} email={email}>
      {children}
    </DashboardShell>
  );
}

/**
 * Nav badge counts. Each query is count-only and RLS-scoped; a viewer never
 * sees the write-side badges because those nav items are filtered out anyway.
 * Failures degrade to "no badge" rather than breaking the whole shell.
 */
async function navCounts(
  db: Awaited<ReturnType<typeof createClient>>,
  role: Role,
): Promise<NavCounts> {
  const isAdmin = role === "admin";
  const canWrite = role !== "viewer";

  const [drafts, remixReview, pendingEngagement, needsReauth] = await Promise.all([
    db
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    canWrite
      ? db
          .from("remix_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "review")
      : null,
    canWrite
      ? db
          .from("engagement_items")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : null,
    isAdmin
      ? db
          .from("social_accounts")
          .select("id", { count: "exact", head: true })
          .in("status", ["needs_reauth", "expired"])
      : null,
  ]);

  return {
    drafts: drafts?.count ?? undefined,
    remixReview: remixReview?.count ?? undefined,
    pendingEngagement: pendingEngagement?.count ?? undefined,
    needsReauth: needsReauth?.count ?? undefined,
  };
}
