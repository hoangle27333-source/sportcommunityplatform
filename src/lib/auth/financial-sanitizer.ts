import type { DashboardData, KOL, Community, Project } from "@/components/sport-hub/types";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "./require-user";

/**
 * Sanitize all monetary and financial values if the user is not an administrator.
 * Zeroes out:
 * - KOL quotations
 * - Community pin fees
 * - Project total budgets & allocated budgets
 * - Project brand contributions
 * - Participant agreed commercial fees
 * - Aggregate KPI totalBudget
 */
export function sanitizeFinancialData<T extends any>(
  data: T,
  isAdmin: boolean
): T {
  if (isAdmin || !data) return data;

  const d = data as any;
  const sanitizedKols = (d.kols || []).map((k: any) =>
    k ? { ...k, quotation: 0 } : k
  );

  const sanitizedCommunities = (d.communities || []).map((c: any) =>
    c ? { ...c, pricePerPin: 0 } : c
  );

  const sanitizedProjects = (d.projects || []).map((p: any) =>
    p
      ? {
          ...p,
          budget: 0,
          allocatedBudget: 0,
          brandDetails: (p.brandDetails || []).map((b: any) => ({
            ...b,
            contribution: 0,
          })),
          participants: (p.participants || []).map((part: any) => ({
            ...part,
            agreedFee: 0,
          })),
        }
      : p
  );

  const sanitizedKpis = d.kpis
    ? {
        ...d.kpis,
        totalBudget: 0,
      }
    : d.kpis;

  return {
    ...d,
    kpis: sanitizedKpis,
    kols: sanitizedKols,
    communities: sanitizedCommunities,
    projects: sanitizedProjects,
  };
}

/**
 * Server-side helper to resolve user role from cookies/session in Server Components and Route Handlers.
 */
export async function getServerUserRole(): Promise<{
  userId: string | null;
  email: string | null;
  role: AppRole;
  isAdmin: boolean;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        userId: null,
        email: null,
        role: "viewer",
        isAdmin: false,
      };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (profile?.role as AppRole) || "viewer";

    // Fallback for hardcoded admin emails if profile role is not yet updated
    const isHardcodedAdmin =
      user.email === "admin@sportcommunityplatform.com" ||
      user.email === "hoangle27333@gmail.com";

    const effectiveRole = isHardcodedAdmin ? "admin" : role;

    return {
      userId: user.id,
      email: user.email || null,
      role: effectiveRole,
      isAdmin: effectiveRole === "admin",
    };
  } catch (err) {
    console.warn("getServerUserRole error:", err);
    return {
      userId: null,
      email: null,
      role: "viewer",
      isAdmin: false,
    };
  }
}
