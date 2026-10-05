-- Durable provider execution and atomic USD reservations. All access is server-only.
alter table public.scout_sessions add column if not exists progress jsonb not null default '{}';
alter table public.scout_sessions add column if not exists warnings jsonb not null default '[]';
alter table public.scout_sessions add column if not exists next_poll_at timestamptz;
alter table public.scout_sessions add column if not exists runtime_version integer not null default 1;
alter table public.scout_sessions add column if not exists verification boolean not null default false;
create table public.scout_budget_settings (
 id boolean primary key default true check(id), session_usd numeric not null default 1 check(session_usd > 0),
 daily_usd numeric not null default 10 check(daily_usd > 0), verification_usd numeric not null default 5 check(verification_usd > 0),
 run_usd numeric not null default 0.25 check(run_usd > 0 and run_usd <= 0.25), enabled boolean not null default true
);
insert into public.scout_budget_settings(id) values(true);
create table public.scout_provider_capabilities (
 capability_key text primary key, actor text not null, build text not null, verified boolean not null default false,
 receipt jsonb, verified_at timestamptz
);
create table public.scout_provider_runs (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.scout_sessions(id),
 task_key text not null, cache_key text not null, actor text not null, platform text not null, task text not null,
 build text not null, input jsonb not null, state text not null default 'reserved', provider_run_id text unique,
 dataset_lease_until timestamptz, dataset_token uuid,
 dataset_id text, dataset_ids jsonb, build_id text, observed_at timestamptz, normalized_rows jsonb,
 raw_rows jsonb, warnings jsonb not null default '[]', pricing jsonb, usage jsonb, charged_events jsonb,
 actual_usd numeric check(actual_usd >= 0), reserved_usd numeric not null check(reserved_usd >= 0),
 budget_day date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
 created_at timestamptz not null default now(), unique(session_id,task_key)
);
create table public.scout_provider_cache (
 cache_key text primary key, rows jsonb not null, provenance jsonb not null, expires_at timestamptz not null
);
create table public.scout_usage_ledger (
 run_id uuid primary key references public.scout_provider_runs(id), session_id uuid not null references public.scout_sessions(id),
 amount_usd numeric not null check(amount_usd >= 0), pricing jsonb, usage jsonb, charged_events jsonb,
 recorded_at timestamptz not null default now()
);
create table public.scout_watermarks (
 scope_key text primary key, published_at timestamptz not null, updated_at timestamptz not null default now()
);
create table public.scout_comment_evidence (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.scouted_posts(id) on delete cascade,
 comment_key text not null, text text not null, published_at timestamptz, provenance jsonb not null,
 collected_at timestamptz not null default now(), unique(post_id,comment_key)
);
alter table public.kols add column if not exists scout_provenance jsonb;
alter table public.communities add column if not exists scout_provenance jsonb;
alter table public.scouted_posts add column if not exists scout_provenance jsonb;
alter table public.scouted_posts add column if not exists published_at timestamptz;
alter table public.scouted_posts add column if not exists requested_scope jsonb;
alter table public.tracked_account_snapshots add column if not exists observation_key text;
create unique index on public.tracked_account_snapshots(tracked_account_id, observation_key);
alter table public.kol_metric_snapshots add column if not exists scout_provenance jsonb;
alter table public.scout_sessions add column if not exists lease_token uuid;
alter table public.scout_sessions add column if not exists import_lease_until timestamptz;
alter table public.scout_sessions add column if not exists import_token uuid;
-- Global lock serializes budget changes, reservation and settlement.
create or replace function public.reserve_scout_run(p_session uuid, p_key text, p_cache text, p_actor text,
 p_platform text, p_task text, p_build text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg scout_budget_settings; s scout_sessions; r scout_provider_runs; day_spend numeric;
 session_spend numeric; verification_spend numeric; cap numeric;
begin
 perform pg_advisory_xact_lock(610050);
 select * into cfg from scout_budget_settings where id;
 select * into s from scout_sessions where id=p_session for update;
 if s.id is null then raise exception 'SESSION_NOT_FOUND'; end if;
 if not exists(select 1 from profiles where id=s.owner_id and role in ('admin','editor')) then raise exception 'FORBIDDEN'; end if;
 select * into r from scout_provider_runs where session_id=p_session and task_key=p_key;
 if r.id is not null then return jsonb_build_object('claimed',false,'run',to_jsonb(r)); end if;
 if not s.verification and coalesce((s.params->>'forceRefresh')::boolean,false)=false then
 select * into r from scout_provider_runs where cache_key=p_cache and ((state in ('reserved','starting','running') and created_at>now()-interval '15 minutes') or (state='succeeded' and normalized_rows is not null and observed_at>now()-(case when p_task in ('profile-details','comments') then interval '24 hours' else interval '1 hour' end))) order by created_at limit 1;
 if r.id is not null then return jsonb_build_object('claimed',false,'shared',true,'run',to_jsonb(r)); end if;
 end if;
 if not cfg.enabled then raise exception 'SCOUT_DISABLED'; end if;
 select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into day_spend from scout_provider_runs where budget_day=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
 select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into session_spend from scout_provider_runs where session_id=p_session;
 select coalesce(sum(coalesce(pr.actual_usd,pr.reserved_usd)),0) into verification_spend from scout_provider_runs pr join scout_sessions x on x.id=pr.session_id where x.verification;
 cap := least(cfg.run_usd,cfg.session_usd-session_spend,cfg.daily_usd-day_spend,
 case when s.verification then cfg.verification_usd-verification_spend else cfg.run_usd end);
 if cap <= 0 then raise exception 'BUDGET_EXHAUSTED'; end if;
 insert into scout_provider_runs(session_id,task_key,cache_key,actor,platform,task,build,input,reserved_usd)
 values(p_session,p_key,p_cache,p_actor,p_platform,p_task,p_build,p_input,cap) returning * into r;
 return jsonb_build_object('claimed',true,'run',to_jsonb(r));
end $$;
create or replace function public.settle_scout_run(p_run uuid,p_state text,p_amount numeric,p_pricing jsonb,p_usage jsonb,p_events jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(610050);
 update scout_provider_runs set state=p_state,actual_usd=coalesce(p_amount,actual_usd),pricing=coalesce(p_pricing,pricing),usage=coalesce(p_usage,usage),charged_events=coalesce(p_events,charged_events) where id=p_run;
 if p_amount is not null then
 insert into scout_usage_ledger(run_id,session_id,amount_usd,pricing,usage,charged_events)
 select id,session_id,p_amount,p_pricing,p_usage,p_events from scout_provider_runs where id=p_run
 on conflict(run_id) do update set amount_usd=excluded.amount_usd,pricing=excluded.pricing,usage=excluded.usage,charged_events=excluded.charged_events;
 end if;
end $$;
create or replace function public.update_scout_budget(p_settings jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(610050);
 update scout_budget_settings set session_usd=(p_settings->>'sessionUsd')::numeric,daily_usd=(p_settings->>'dailyUsd')::numeric,
 verification_usd=(p_settings->>'verificationUsd')::numeric,enabled=(p_settings->>'enabled')::boolean where id;
end $$;
do $$ declare tbl text; begin
 foreach tbl in array array['scout_budget_settings','scout_provider_capabilities','scout_provider_runs','scout_provider_cache','scout_usage_ledger','scout_watermarks','scout_comment_evidence'] loop
 execute format('alter table public.%I enable row level security',tbl);
 execute format('revoke all on public.%I from anon, authenticated',tbl);
 execute format('grant all on public.%I to service_role',tbl);
 end loop;
end $$;
revoke all on function public.reserve_scout_run(uuid,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.settle_scout_run(uuid,text,numeric,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.update_scout_budget(jsonb) from public,anon,authenticated;
grant execute on function public.reserve_scout_run(uuid,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.settle_scout_run(uuid,text,numeric,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.update_scout_budget(jsonb) to service_role;
create index on public.scout_provider_runs(budget_day);
create index on public.scout_sessions(status,next_poll_at);

alter table public.kol_audience_audits alter column real_audience_rate drop not null;
alter table public.kol_audience_audits alter column seeding_rate drop not null;
alter table public.community_audience_audits alter column real_audience_rate drop not null;
alter table public.community_audience_audits alter column seeding_rate drop not null;

-- Never move an account/query watermark backwards under concurrent completion.
create or replace function public.advance_scout_watermark(p_scope text,p_published timestamptz) returns void
language sql security definer set search_path=public as $$
 insert into scout_watermarks(scope_key,published_at) values(p_scope,p_published)
 on conflict(scope_key) do update set published_at=greatest(scout_watermarks.published_at,excluded.published_at),updated_at=now();
$$;
revoke all on function public.advance_scout_watermark(text,timestamptz) from public,anon,authenticated;
grant execute on function public.advance_scout_watermark(text,timestamptz) to service_role;
