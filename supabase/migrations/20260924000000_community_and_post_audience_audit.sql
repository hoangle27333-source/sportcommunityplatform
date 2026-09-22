-- Community audience audits + per-post audit snapshot

create table if not exists public.community_audience_audits (
  id                      uuid primary key default gen_random_uuid(),
  community_id            uuid not null references public.communities(id) on delete cascade,
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

create index if not exists idx_community_audience_audits_community
  on public.community_audience_audits(community_id, audited_at desc);

alter table if exists public.communities
  add column if not exists audience_audit jsonb default null;

alter table if exists public.scouted_posts
  add column if not exists community_id uuid references public.communities(id) on delete set null,
  add column if not exists content_audit jsonb default null;

create index if not exists idx_scouted_posts_community_id
  on public.scouted_posts(community_id);

alter table public.community_audience_audits enable row level security;

drop policy if exists "Allow read community_audience_audits" on public.community_audience_audits;
create policy "Allow read community_audience_audits"
  on public.community_audience_audits for select using (true);

drop policy if exists "Allow write community_audience_audits" on public.community_audience_audits;
create policy "Allow write community_audience_audits"
  on public.community_audience_audits for all using (true) with check (true);
