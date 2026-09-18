import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { RemixStudio } from "./remix-studio";

export const dynamic = "force-dynamic";

/**
 * /remix — Remix Studio (SPEC §8).
 *
 * Workflow: choose source (upload / own link / reference link) -> choose output +
 * options -> AI plans and pipeline executes -> preview result -> submit feedback or
 * approve to draft a calendar post.
 */

interface CampaignOption {
  id: string;
  name: string;
}

interface JobRow {
  id: string;
  source_type: string;
  output_kind: string;
  status: string;
  prompt: string | null;
  options: Record<string, any>;
  iteration: number;
  created_at: string;
  folder_id: string | null;
}

export default async function RemixPage() {
  const db = await createClient();

  const [campaignsRes, jobsRes] = await Promise.all([
    db
      .from("campaigns")
      .select("id, name")
      .in("status", ["draft", "active"])
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("remix_jobs")
      .select("id, source_type, output_kind, status, prompt, iteration, options, created_at, folder_id")
      .is("folder_id", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remix Studio"
        description="Input your content or a reference link — AI plans the edit, runs the media pipeline, and presents the output for your review and approval."
      />
      <RemixStudio
        campaigns={(campaignsRes.data ?? []) as CampaignOption[]}
        initialJobs={(jobsRes.data ?? []) as JobRow[]}
      />
    </div>
  );
}
