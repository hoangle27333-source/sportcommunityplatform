import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { AddAccountForm } from "./add-account-form";
import { AccountCard } from "./account-card";
import { Radar } from "lucide-react";

export const dynamic = "force-dynamic";

const LABEL_FILTERS = [
  { value: "", label: "All" },
  { value: "competitor", label: "Competitor" },
  { value: "own", label: "Own" },
  { value: "reference", label: "Reference" },
];

/**
 * Tracked Accounts page — /analytics/tracked
 *
 * Shows competitor / own / reference social profiles that are periodically
 * scraped by the Playwright worker. Users can add new profiles by URL and
 * trigger manual re-scrapes from the card.
 */
export default async function TrackedAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ label?: string }>;
}) {
  const params = await searchParams;
  const label = params.label ?? "";

  const db = await createClient();

  let query = db
    .from("tracked_accounts")
    .select("*")
    .order("created_at", { ascending: false });

  if (label) query = query.eq("label", label);

  const { data: accounts } = await query;

  const empty = !accounts || accounts.length === 0;

  return (
    <div className="space-y-8 p-4 sm:p-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Tracked Accounts & Competitors"
        description="Monitor public social media metrics across Facebook Pages and Instagram profiles automatically."
      />

      {/* ── Add account form ────────────────────────────────────────────────── */}
      <AddAccountForm />

      {/* ── Filter tabs ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {LABEL_FILTERS.map((f) => (
          <a
            key={f.value}
            href={f.value ? `/analytics/tracked?label=${f.value}` : "/analytics/tracked"}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              label === f.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      {/* ── Account grid ────────────────────────────────────────────────────── */}
      {empty ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Radar className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No accounts tracked yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste a Facebook Page or Instagram profile URL above to start tracking.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(accounts as any[]).map((a) => (
            <AccountCard key={a.id as string} account={a} />
          ))}
        </div>
      )}
    </div>
  );
}
