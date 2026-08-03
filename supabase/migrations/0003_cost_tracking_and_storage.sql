-- ============================================================================
-- Content Automation Hub — Cost tracking, needs_reauth status, media bucket
-- SPEC.md §6/§7, requirements R4.7, R9.2, R9.3, R2.6, R2.7.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- account_status: add 'needs_reauth' (R2.6/R2.7). Enum values cannot be added
-- inside a txn with other DDL on some PG versions, so this runs first alone.
-- Existing 'expired' rows can be migrated to 'needs_reauth' by the app.
-- ---------------------------------------------------------------------------
alter type account_status add value if not exists 'needs_reauth';

-- ---------------------------------------------------------------------------
-- ai_generations — one row per AI call (R4.7). Powers the cost dashboard
-- (R9.2: by day/week/month, by content type, by provider, in VND) and the
-- monthly budget alert (R9.3).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_generations (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null,                    -- 'gemini' | 'openai' | ...
  model          text not null,
  -- what was produced: caption | banner | image-edit | video | analysis
  kind           text not null,
  prompt_tokens  integer,
  output_tokens  integer,
  total_tokens   integer,
  -- cost in USD (raw from provider) and converted VND (R9.2).
  cost_usd       numeric(12, 6),
  cost_vnd       numeric(14, 2),
  duration_ms    integer,
  media_asset_id uuid references public.media_assets (id) on delete set null,
  post_id        uuid references public.posts (id) on delete set null,
  campaign_id    uuid references public.campaigns (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists ai_generations_created_at_idx
  on public.ai_generations (created_at desc);
create index if not exists ai_generations_kind_idx
  on public.ai_generations (kind);
create index if not exists ai_generations_provider_idx
  on public.ai_generations (provider);

-- ---------------------------------------------------------------------------
-- RLS: cost data is admin-only reading; writes come from the service role
-- (workers/API) which bypasses RLS. Admins can read for the dashboard.
-- ---------------------------------------------------------------------------
alter table public.ai_generations enable row level security;

create policy ai_generations_admin_read on public.ai_generations
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket for generated/uploaded media (SPEC §3, §7).
-- Public-read so published Meta posts can fetch asset URLs; writes are
-- service-role only (workers). Bucket name must match SUPABASE_MEDIA_BUCKET.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Authenticated users can read objects (bucket is public anyway); only the
-- service role writes. No public insert/update/delete policies are created.
create policy "media public read"
  on storage.objects for select
  using (bucket_id = 'media');
