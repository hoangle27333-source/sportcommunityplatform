import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { costRollup } from "@/lib/ai/cost";

export const dynamic = "force-dynamic";

/**
 * GET /api/cost (SPEC §9, requirements R9.2/R9.3)
 *   ?since=ISO&until=ISO   AI cost rollup in VND, broken down by kind + provider.
 *   Admin only. Reads via service-role (ai_generations has admin-only RLS read,
 *   but rollup aggregates many rows — use admin client for a stable read path).
 *   Also returns budget + over-threshold flag (R9.3).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const since =
      req.nextUrl.searchParams.get("since") ?? defaultSince();
    const until = req.nextUrl.searchParams.get("until") ?? undefined;

    const db = createAdminClient();
    const rollup = await costRollup(db, { since, until });

    const budgetVnd = Number(process.env.AI_MONTHLY_BUDGET_VND ?? "0");
    const overBudget = budgetVnd > 0 && rollup.totalVnd > budgetVnd;

    return NextResponse.json({
      since,
      until: until ?? null,
      ...rollup,
      budgetVnd: budgetVnd || null,
      overBudget,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: (e as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}

/** Default window: start of the current month (matches the monthly budget). */
function defaultSince(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
