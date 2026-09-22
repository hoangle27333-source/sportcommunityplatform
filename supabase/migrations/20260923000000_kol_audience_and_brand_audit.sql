-- ============================================================================
-- KOL Audience Authenticity & Sponsored Content Brand Audit
-- Migration: 20260923000000_kol_audience_and_brand_audit.sql
-- ============================================================================

-- 1. Audit history per KOL
create table if not exists public.kol_audience_audits (
  id                      uuid primary key default gen_random_uuid(),
  kol_id                  uuid not null references public.kols(id) on delete cascade,
  audited_at              timestamptz not null default now(),
  total_posts_scanned     int not null default 0,
  total_comments_scanned  int not null default 0,
  real_audience_rate      numeric(5,2) not null default 0,
  seeding_rate            numeric(5,2) not null default 0,
  seeding_risk_level      text not null default 'Low',
  top_tag_distribution    jsonb not null default '[]'::jsonb,
  sponsored_content_rate  numeric(5,2) not null default 0,
  commercial_saturation   text not null default 'Balanced',
  booked_categories       jsonb not null default '[]'::jsonb,
  partner_brands          jsonb not null default '[]'::jsonb,
  sample_comments         jsonb not null default '{"organic": [], "seeding": []}'::jsonb,
  audit_summary           text not null default '',
  created_at              timestamptz not null default now()
);

create index if not exists idx_kol_audience_audits_kol_id
  on public.kol_audience_audits(kol_id, audited_at desc);

-- 2. Cache latest audit snapshot on kols
alter table if exists public.kols
  add column if not exists audience_audit jsonb default null;

-- 3. Sponsored / comment sample fields on scouted_posts
alter table if exists public.scouted_posts
  add column if not exists is_sponsored boolean not null default false,
  add column if not exists sponsor_brand text not null default '',
  add column if not exists sponsor_category text not null default '',
  add column if not exists sponsor_disclosure_type text not null default '',
  add column if not exists comments_sample jsonb default '[]'::jsonb;

create index if not exists idx_scouted_posts_is_sponsored
  on public.scouted_posts(is_sponsored)
  where is_sponsored = true;

-- 4. RLS (same open portal pattern as other sport-hub tables)
alter table public.kol_audience_audits enable row level security;

drop policy if exists "Allow read kol_audience_audits" on public.kol_audience_audits;
create policy "Allow read kol_audience_audits"
  on public.kol_audience_audits for select using (true);

drop policy if exists "Allow write kol_audience_audits" on public.kol_audience_audits;
create policy "Allow write kol_audience_audits"
  on public.kol_audience_audits for all using (true) with check (true);
