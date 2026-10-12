-- Additive only: legacy communities remain unclassified; follower counts are not members.
begin;
alter table public.kols add column if not exists scout_entity_assessment jsonb;
alter table public.kols add column if not exists scout_geography_assessment jsonb;
alter table public.communities add column if not exists scout_entity_assessment jsonb;
alter table public.communities add column if not exists scout_geography_assessment jsonb;
alter table public.communities add column if not exists community_subtype text
  check (community_subtype in ('Community','Club'));
alter table public.communities add column if not exists account_followers bigint check (account_followers >= 0);
alter table public.scout_feedback add column if not exists entity_type text
  check (entity_type in ('Individual','Community','Club','Brand/Business','Media/Event','Other','Unknown'));
alter table public.scout_feedback add column if not exists evidence_hash text;
alter table public.scout_feedback add column if not exists model_version text;
create or replace function public.scout_account_policy_version() returns integer
language sql immutable set search_path = public as $$ select 5; $$;
revoke all on function public.scout_account_policy_version() from public, anon, authenticated;
grant execute on function public.scout_account_policy_version() to service_role;
-- No backfill of account type, location, memberships or accepted review decisions.
commit;
