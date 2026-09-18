-- ============================================================================
-- SPORT INFLUENCER HUB — SCOUT SYNC, CONFLICT RESOLUTION & METRIC HISTORY
-- Migration: 20260920000001_scout_sync_and_metrics.sql
-- ============================================================================

-- 1. Enhance kols table with locking and diff staging
alter table if exists public.kols
  add column if not exists user_locked_fields text[] not null default '{}',
  add column if not exists pending_scout_diff jsonb default null,
  add column if not exists last_scouted_at timestamptz default null;

-- 2. Create kol_metric_snapshots table for historical growth tracking
create table if not exists public.kol_metric_snapshots (
  id           uuid primary key default gen_random_uuid(),
  kol_id       uuid not null references public.kols(id) on delete cascade,
  recorded_at  timestamptz not null default now(),
  followers    bigint not null default 0,
  avg_views    bigint not null default 0,
  er           numeric(6,2) not null default 0,
  created_at   timestamptz not null default now()
);

-- 3. Indexes for fast historical queries
create index if not exists idx_metric_snapshots_kol_id on public.kol_metric_snapshots(kol_id);
create index if not exists idx_metric_snapshots_recorded_at on public.kol_metric_snapshots(recorded_at desc);

-- 4. Row Level Security for snapshots
alter table public.kol_metric_snapshots enable row level security;

create policy "Allow read kol_metric_snapshots" on public.kol_metric_snapshots for select using (true);
create policy "Allow write kol_metric_snapshots" on public.kol_metric_snapshots for all using (true) with check (true);
