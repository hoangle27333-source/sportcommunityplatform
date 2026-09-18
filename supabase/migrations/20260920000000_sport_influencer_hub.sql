-- ============================================================================
-- SPORT INFLUENCER HUB — DATABASE SCHEMA MIGRATION
-- Migration: 20260920000000_sport_influencer_hub.sql
-- Tables: kols, communities, sport_projects, kol_reports, scout_requests, scouted_posts
-- ============================================================================

create extension if not exists "pgcrypto";

-- Helper trigger for automatic updated_at timestamp
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 1. kols (Hồ sơ KOLs & Vận động viên thể thao)
-- ---------------------------------------------------------------------------
create table if not exists public.kols (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  sports       text[] not null default '{}',
  tier         text not null default 'Micro (10k - 50k)',
  platform     text not null default 'Facebook',
  geography    text not null default 'Toàn quốc',
  followers    bigint not null default 0,
  avg_views    bigint not null default 0,
  er           numeric(6,2) not null default 0,
  quotation    numeric(15,2) not null default 0,
  status       text not null default 'Đang hợp tác tích cực',
  contact_info text not null default '',
  bio          text not null default '',
  profile_url  text not null default '',
  avatar_url   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. communities (Hội nhóm, Câu lạc bộ & Diễn đàn thể thao)
-- ---------------------------------------------------------------------------
create table if not exists public.communities (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  sports         text[] not null default '{}',
  geography      text not null default 'Toàn quốc',
  members_count  bigint not null default 0,
  platform       text not null default 'Facebook Group',
  group_url      text not null default '',
  activity_level text not null default 'Rất sôi động (> 20 bài/ngày)',
  privacy        text not null default 'Công khai (Public)',
  purposes       text[] not null default '{}',
  admin_contact  text not null default '',
  price_per_pin  numeric(15,2) not null default 0,
  status         text not null default 'Đang hợp tác tích cực',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. sport_projects (Chiến dịch Booking & Dự án thể thao)
-- ---------------------------------------------------------------------------
create table if not exists public.sport_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  brand       text not null default '',
  budget      numeric(15,2) not null default 0,
  start_date  date,
  end_date    date,
  pic         text not null default 'PM',
  objective   text not null default '',
  status      text not null default 'Planning',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. kol_reports (Form Đánh giá & Nghiệm thu sau chiến dịch)
-- ---------------------------------------------------------------------------
create table if not exists public.kol_reports (
  id           uuid primary key default gen_random_uuid(),
  kol_id       uuid references public.kols(id) on delete set null,
  project_id   uuid references public.sport_projects(id) on delete set null,
  kol_name     text not null,
  project_name text not null,
  title        text not null,
  score        integer not null default 5 check (score >= 1 and score <= 5),
  attitude     integer not null default 5 check (attitude >= 1 and attitude <= 5),
  deadline     text not null default 'Đúng hạn',
  kpi_commit   bigint not null default 0,
  kpi_actual   bigint not null default 0,
  kpi_rate     numeric(6,2) not null default 100,
  notes        text not null default '',
  evaluator    text not null default 'PM',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. scout_requests (Hàng đợi yêu cầu cào Meta / TikTok / Threads)
-- ---------------------------------------------------------------------------
create table if not exists public.scout_requests (
  id              uuid primary key default gen_random_uuid(),
  keyword         text not null,
  target_type     text not null default 'KOLs cá nhân',
  platform        text not null default 'Instagram',
  target_limit    integer not null default 10,
  geography       text not null default 'Toàn quốc',
  status          text not null default 'Chờ xử lý',
  results_summary text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. scouted_posts (Kho bài viết & Reels viral đã scout)
-- ---------------------------------------------------------------------------
create table if not exists public.scouted_posts (
  id            uuid primary key default gen_random_uuid(),
  kol_id        uuid references public.kols(id) on delete set null,
  title         text not null default '',
  author        text not null,
  platform      text not null default 'Instagram',
  post_url      text not null,
  thumbnail_url text not null default '',
  sport         text not null default '',
  likes         bigint not null default 0,
  comments      bigint not null default 0,
  views         bigint not null default 0,
  er            numeric(6,2) not null default 0,
  viral_tier    text not null default 'Tiêu chuẩn',
  hashtags      text not null default '',
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers for updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists set_kols_updated_at on public.kols;
create trigger set_kols_updated_at before update on public.kols
  for each row execute function public.set_updated_at();

drop trigger if exists set_communities_updated_at on public.communities;
create trigger set_communities_updated_at before update on public.communities
  for each row execute function public.set_updated_at();

drop trigger if exists set_sport_projects_updated_at on public.sport_projects;
create trigger set_sport_projects_updated_at before update on public.sport_projects
  for each row execute function public.set_updated_at();

drop trigger if exists set_kol_reports_updated_at on public.kol_reports;
create trigger set_kol_reports_updated_at before update on public.kol_reports
  for each row execute function public.set_updated_at();

drop trigger if exists set_scout_requests_updated_at on public.scout_requests;
create trigger set_scout_requests_updated_at before update on public.scout_requests
  for each row execute function public.set_updated_at();

drop trigger if exists set_scouted_posts_updated_at on public.scouted_posts;
create trigger set_scouted_posts_updated_at before update on public.scouted_posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes for performance
-- ---------------------------------------------------------------------------
create index if not exists idx_kols_name on public.kols(name);
create index if not exists idx_kols_platform on public.kols(platform);
create index if not exists idx_kols_geography on public.kols(geography);
create index if not exists idx_kols_tier on public.kols(tier);
create index if not exists idx_kols_sports on public.kols using gin (sports);

create index if not exists idx_communities_name on public.communities(name);
create index if not exists idx_communities_platform on public.communities(platform);
create index if not exists idx_communities_sports on public.communities using gin (sports);

create index if not exists idx_kol_reports_kol_id on public.kol_reports(kol_id);
create index if not exists idx_kol_reports_project_id on public.kol_reports(project_id);

create index if not exists idx_scouted_posts_kol_id on public.scouted_posts(kol_id);
create index if not exists idx_scouted_posts_viral_tier on public.scouted_posts(viral_tier);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------------
alter table public.kols enable row level security;
alter table public.communities enable row level security;
alter table public.sport_projects enable row level security;
alter table public.kol_reports enable row level security;
alter table public.scout_requests enable row level security;
alter table public.scouted_posts enable row level security;

-- Allow read access to all users (anon & authenticated)
create policy "Allow read kols" on public.kols for select using (true);
create policy "Allow read communities" on public.communities for select using (true);
create policy "Allow read sport_projects" on public.sport_projects for select using (true);
create policy "Allow read kol_reports" on public.kol_reports for select using (true);
create policy "Allow read scout_requests" on public.scout_requests for select using (true);
create policy "Allow read scouted_posts" on public.scouted_posts for select using (true);

-- Allow full mutations for authenticated users & anon (internal portal usage)
create policy "Allow write kols" on public.kols for all using (true) with check (true);
create policy "Allow write communities" on public.communities for all using (true) with check (true);
create policy "Allow write sport_projects" on public.sport_projects for all using (true) with check (true);
create policy "Allow write kol_reports" on public.kol_reports for all using (true) with check (true);
create policy "Allow write scout_requests" on public.scout_requests for all using (true) with check (true);
create policy "Allow write scouted_posts" on public.scouted_posts for all using (true) with check (true);
