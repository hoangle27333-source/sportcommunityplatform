-- ============================================================================
-- SPORT INFLUENCER HUB — MIGRATION: 20260920000002_project_participants.sql
-- Adds: multi-brand support & project_participants table (KOLs & Communities)
-- ============================================================================

-- 1. Extend sport_projects table with brands array and brand_details JSONB
alter table public.sport_projects 
  add column if not exists brands text[] default '{}',
  add column if not exists brand_details jsonb default '[]';

-- 2. Create project_participants table
create table if not exists public.project_participants (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.sport_projects(id) on delete cascade,
  entity_type       text not null check (entity_type in ('kol', 'community')),
  kol_id            uuid references public.kols(id) on delete set null,
  community_id      uuid references public.communities(id) on delete set null,
  entity_name       text not null,
  avatar_url        text default '',
  sport             text[] default '{}',
  tier_or_platform  text default '',
  deliverable_scope text not null default '',
  agreed_fee        numeric(15,2) not null default 0,
  target_views      bigint default 0,
  actual_views      bigint default 0,
  target_reach      bigint default 0,
  actual_reach      bigint default 0,
  actual_er         numeric(6,2) default 0,
  proof_url         text default '',
  status            text not null default 'Confirmed',
  rating_score      numeric(3,1) default 5.0,
  attitude_score    numeric(3,1) default 5.0,
  deadline_status   text default 'Đúng hạn',
  pm_notes          text default '',
  evaluator         text default 'PM',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Trigger for automatic updated_at
drop trigger if exists set_project_participants_updated_at on public.project_participants;
create trigger set_project_participants_updated_at before update on public.project_participants
  for each row execute function public.set_updated_at();

-- Indexes for fast roster lookups
create index if not exists idx_project_participants_project_id on public.project_participants(project_id);
create index if not exists idx_project_participants_entity on public.project_participants(entity_type, kol_id, community_id);

-- RLS policies
alter table public.project_participants enable row level security;
create policy "Allow read project_participants" on public.project_participants for select using (true);
create policy "Allow write project_participants" on public.project_participants for all using (true) with check (true);
