-- Run the entire script in the Supabase SQL Editor for this project.
-- This is the manual wrapper for migration 20261004000000.
-- Run once. Existing Scout/GMV tables cause an error and roll back the transaction.
-- No existing CRM rows are deleted or reclassified.

begin;

-- Fail early if required earlier migrations are missing.
do $$
declare required_table text;
begin
  foreach required_table in array array[
    'auth.users', 'public.profiles', 'public.kols', 'public.communities',
    'public.scouted_posts', 'public.scout_requests', 'public.kol_metric_snapshots'
  ] loop
    if to_regclass(required_table) is null then
      raise exception 'Required table % is missing. Apply the earlier migrations first.', required_table;
    end if;
  end loop;
end $$;

-- Additive discovery evidence, review feedback and monthly GMV.
create table public.scout_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  kind text not null,
  params jsonb not null,
  runs jsonb not null default '{}',
  candidates jsonb not null default '[]',
  review_decisions jsonb not null default '{}',
  result jsonb,
  status text not null default 'pending',
  lease_until timestamptz,
  created_at timestamptz not null default now()
);
create table public.scout_feedback (
  id uuid primary key default gen_random_uuid(),
  account_key text not null,
  context_key text not null,
  reason text not null check (reason in ('Wrong Entity Type','Not Relevant','Wrong Location','Correct Classification')),
  classification text check (classification in ('Individual','Community','Brand/Business','Unknown')),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.scout_feedback(account_key, created_at desc);
create table public.kol_gmv_monthly (
  id uuid primary key default gen_random_uuid(),
  kol_id uuid not null references public.kols(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount numeric(18,2) not null check (amount >= 0),
  source text not null check (source ~ '[^[:space:]]'),
  notes text not null default '',
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(kol_id, month)
);
alter table public.scout_sessions enable row level security;
alter table public.scout_feedback enable row level security;
alter table public.kol_gmv_monthly enable row level security;
create policy "Admin GMV access" on public.kol_gmv_monthly for all to authenticated
using (exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'))
with check (exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'));
-- Sessions/feedback are accessed by authenticated, authorized server handlers only.
alter table public.kols add column if not exists scout_identity text;
alter table public.communities add column if not exists scout_identity text;
alter table public.communities add column if not exists scout_missing_metrics text[] not null default '{}';
create unique index on public.kols(scout_identity);
create unique index on public.communities(scout_identity);
alter table public.kols add column if not exists scout_missing_metrics text[] not null default '{}';
alter table public.scouted_posts add column if not exists scout_identity text;
alter table public.scouted_posts add column if not exists scout_missing_metrics text[] not null default '{}';
create unique index on public.scouted_posts(scout_identity);
revoke all on public.kol_gmv_monthly from anon;
grant select, insert, update, delete on public.kol_gmv_monthly to authenticated;
revoke all on public.scout_sessions, public.scout_feedback from anon, authenticated;

alter table public.kol_metric_snapshots add column if not exists scout_session_id uuid references public.scout_sessions(id);
create unique index on public.kol_metric_snapshots(kol_id, scout_session_id);

alter table public.scout_requests add column if not exists scout_session_id uuid references public.scout_sessions(id);

-- Refresh the REST API schema cache after commit.
notify pgrst, 'reload schema';
commit;

-- Expected: three rows with rls_enabled = true.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('scout_sessions', 'scout_feedback', 'kol_gmv_monthly')
order by c.relname;

-- Expected: Admin GMV access policy with role {authenticated}.
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'kol_gmv_monthly';
