-- ============================================================================
-- SPORT INFLUENCER HUB — USER ATTRIBUTION & TEAM ROLES MIGRATION
-- Migration: 20260921000000_user_attribution_and_team.sql
-- Adds: user attribution columns, default 'editor' signup role, team RLS
-- ============================================================================

-- 1. Update handle_new_user() trigger to default role 'editor' and parse display name
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    'editor'
  )
  on conflict (id) do update set
    name = coalesce(nullif(trim(excluded.name), ''), public.profiles.name),
    email = coalesce(excluded.email, public.profiles.email);
  return new;
end;
$$;

-- 2. Add user attribution columns to kols
alter table public.kols
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_edited_by uuid references public.profiles(id) on delete set null;

-- 3. Add user attribution columns to communities
alter table public.communities
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_edited_by uuid references public.profiles(id) on delete set null;

-- 4. Add user attribution & PIC link columns to sport_projects
alter table public.sport_projects
  add column if not exists pic_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_edited_by uuid references public.profiles(id) on delete set null;

-- 5. Add user attribution & evaluator link columns to kol_reports
alter table public.kol_reports
  add column if not exists evaluator_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_edited_by uuid references public.profiles(id) on delete set null;

-- 6. Add creator tracking to scout_requests
alter table public.scout_requests
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists creator_name text default '';

-- 7. Add evaluator and editor to project_participants
alter table if exists public.project_participants
  add column if not exists evaluator_id uuid references public.profiles(id) on delete set null,
  add column if not exists last_edited_by uuid references public.profiles(id) on delete set null;

-- 8. Performance Indexes on foreign keys
create index if not exists idx_kols_created_by on public.kols(created_by);
create index if not exists idx_kols_last_edited_by on public.kols(last_edited_by);

create index if not exists idx_communities_created_by on public.communities(created_by);
create index if not exists idx_communities_last_edited_by on public.communities(last_edited_by);

create index if not exists idx_sport_projects_pic_user_id on public.sport_projects(pic_user_id);
create index if not exists idx_sport_projects_created_by on public.sport_projects(created_by);
create index if not exists idx_sport_projects_last_edited_by on public.sport_projects(last_edited_by);

create index if not exists idx_kol_reports_evaluator_id on public.kol_reports(evaluator_id);
create index if not exists idx_kol_reports_created_by on public.kol_reports(created_by);
create index if not exists idx_kol_reports_last_edited_by on public.kol_reports(last_edited_by);

create index if not exists idx_scout_requests_created_by on public.scout_requests(created_by);

-- 9. RLS enhancements for profiles and audit_log
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- Profiles: Authenticated users can view all team members (needed for PIC / Evaluator dropdowns & Team directory)
drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
create policy "Profiles are readable by authenticated users"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Profiles: Users can update their own profile name
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Profiles: Admins can update roles of any profile
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles for update
  using (coalesce(public.current_app_role() = 'admin', false))
  with check (coalesce(public.current_app_role() = 'admin', false));

-- Audit Log: Authenticated users can view audit trails
drop policy if exists "Audit log readable by authenticated users" on public.audit_log;
create policy "Audit log readable by authenticated users"
  on public.audit_log for select
  using (auth.role() = 'authenticated');

-- Audit Log: Authenticated users and service role can insert audit records
drop policy if exists "Audit log insertable by authenticated users" on public.audit_log;
create policy "Audit log insertable by authenticated users"
  on public.audit_log for insert
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
