import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-side/worker use ONLY.
 * BYPASSES RLS — never import this into client code or expose its key.
 * Use for background jobs (publish, analytics ingest) that act as the system.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
