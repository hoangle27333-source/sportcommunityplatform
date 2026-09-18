import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { costRollup } from "@/lib/ai/cost";
import { TelegramSettings } from "@/components/shared/telegram-settings";

export const dynamic = "force-dynamic";

/**
 * Settings (SPEC §9) — admin only (nav-gated; RLS also guards the data).
 *
 * Shows the team roster with roles (R1.3 manual elevation), the current AI
 * provider, and this month's AI cost rollup vs. the configured budget (R9.2/R9.3).
 * Role changes and budget edits are client-enhanced actions; this is the read view.
 */

interface ProfileRow {
  id: string;
  role: "admin" | "editor" | "viewer";
  name: string | null;
  email: string | null;
}

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export default async function SettingsPage() {
  const db = await createClient();

  const { data: profiles } = await db
    .from("profiles")
    .select("id, role, name, email")
    .order("created_at", { ascending: true });

  // Cost rollup needs service-role read (ai_generations is admin-only in RLS,
  // but aggregating server-side with the admin client is simplest & safe here).
  let monthVnd = 0;
  let byKind: Record<string, number> = {};
  let byProvider: Record<string, number> = {};
  try {
    const rollup = await costRollup(createAdminClient(), {
      since: startOfMonthIso(),
    });
    monthVnd = rollup.totalVnd;
    byKind = rollup.byKind;
    byProvider = rollup.byProvider;
  } catch {
    // Cost table may not exist yet (pre-migration) — degrade gracefully.
  }

  const budget = Number(process.env.AI_MONTHLY_BUDGET_VND ?? "0");
  const overBudget = budget > 0 && monthVnd > budget;
  const provider = process.env.AI_PROVIDER ?? "gemini";

  const fmtVnd = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "VND" }).format(n);

  const rows = (profiles ?? []) as ProfileRow[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage team members, AI providers, and infrastructure costs.
        </p>
      </div>

      {/* AI cost */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          AI Costs This Month
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total Cost</p>
            <p
              className={`mt-1 text-2xl font-bold ${overBudget ? "text-red-600" : "text-gray-900"}`}
            >
              {fmtVnd(monthVnd)}
            </p>
            {budget > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                Budget: {fmtVnd(budget)}
                {overBudget && (
                  <span className="ml-1 font-medium text-red-600">
                    — over budget!
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">By Content Type</p>
            <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
              {Object.keys(byKind).length === 0 && (
                <li className="text-gray-400">—</li>
              )}
              {Object.entries(byKind).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="tabular-nums">{fmtVnd(v)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">By Provider</p>
            <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
              {Object.keys(byProvider).length === 0 && (
                <li className="text-gray-400">—</li>
              )}
              {Object.entries(byProvider).map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="tabular-nums">{fmtVnd(v)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Current AI Provider: <strong>{provider}</strong>
        </p>
      </section>

      {/* Users */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Users &amp; Permissions
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Email</th>
              <th className="py-2 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="py-2 text-gray-900">{p.name ?? "—"}</td>
                <td className="py-2 text-gray-600">{p.email ?? "—"}</td>
                <td className="py-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {p.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">
          New user role elevation (default: viewer) is performed manually by administrators
          (R1.3). Role modification events are recorded in the audit log (R1.6).
        </p>
      </section>

      {/* Telegram Integrations */}
      <section className="mt-8">
        <TelegramSettings />
      </section>
    </div>
  );
}
