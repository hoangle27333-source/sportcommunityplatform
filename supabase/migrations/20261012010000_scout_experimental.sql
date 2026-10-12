-- Additive experimental storage. No provider/trial/admin budget is enabled automatically.
create table if not exists public.scout_seed_datasets (
 id text primary key, file_name text not null, checksum text not null, sheet text not null,
 profile_rows integer not null, created_at timestamptz not null default now()
);
create table if not exists public.scout_seed_records (
 dataset_id text references public.scout_seed_datasets(id), url text not null,
 record jsonb not null, primary key(dataset_id,url)
);
-- One wallet per actual provider trial/account. Capability allocations cannot duplicate credit.
create table if not exists public.scout_trial_accounts (
 id text primary key, provider text not null, verified boolean not null default false,
 expires_at timestamptz not null, total_value_usd numeric not null check(total_value_usd>=0),
 reserved_value_usd numeric not null default 0 check(reserved_value_usd>=0), receipt jsonb not null
);
alter table public.scout_trial_accounts enable row level security;
revoke all on public.scout_trial_accounts from anon,authenticated;
grant all on public.scout_trial_accounts to service_role;
create table if not exists public.scout_trial_capabilities (
 id uuid primary key default gen_random_uuid(), provider text not null check(provider in ('apify','brave','brightdata','gemini')),
 operation text not null check(operation in ('discovery','profile','posts','analysis')), platform text not null,
 revision text not null, verified boolean not null default false, expires_at timestamptz not null,
 total_units numeric not null check(total_units>=0), used_units numeric not null default 0 check(used_units>=0),
 units_per_request numeric not null check(units_per_request>0), max_value_usd numeric not null check(max_value_usd>0),
 config jsonb not null default '{}', unique(provider,operation,platform)
);
create table if not exists public.scout_external_runs (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.scout_sessions(id),
 task_key text not null, capability_id uuid not null references public.scout_trial_capabilities(id),
 state text not null default 'reserved' check(state in ('reserved','starting','running','start-unknown','succeeded','failed')),
 input jsonb not null, response jsonb, provider_receipt text, reserved_units numeric not null,
 reserved_usd numeric not null, actual_usd numeric, error text, created_at timestamptz not null default now(),
 unique(session_id,task_key)
);
alter table public.scout_seed_datasets enable row level security;
alter table public.scout_seed_records enable row level security;
alter table public.scout_trial_capabilities enable row level security;
alter table public.scout_external_runs enable row level security;
revoke all on public.scout_seed_datasets,public.scout_seed_records,public.scout_trial_capabilities,public.scout_external_runs from anon,authenticated;
grant all on public.scout_seed_datasets,public.scout_seed_records,public.scout_trial_capabilities,public.scout_external_runs to service_role;

create or replace function public.reserve_scout_external(p_session uuid,p_key text,p_capability uuid,p_revision text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c scout_trial_capabilities; s scout_sessions; r scout_external_runs; cfg scout_budget_settings;
 session_spend numeric; day_spend numeric; model_spend numeric; wallet scout_trial_accounts; paid_model boolean;
begin
 perform pg_advisory_xact_lock(610050);
 select * into s from scout_sessions where id=p_session for update;
 if s.id is null or s.params->>'searchStrategy' is distinct from 'seed_content_v1' then raise exception 'INVALID_SESSION'; end if;
 if not exists(select 1 from profiles where id=s.owner_id and role in ('admin','editor')) then raise exception 'FORBIDDEN'; end if;
 select * into r from scout_external_runs where session_id=p_session and task_key=p_key;
 if r.id is not null then return jsonb_build_object('claimed',false,'run',to_jsonb(r)); end if;
 select * into c from scout_trial_capabilities where id=p_capability for update;
 paid_model := c.provider='gemini' and c.operation='analysis' and c.config->>'paidModel'='true' and c.config->>'model'='gemini-2.5-flash-lite' and c.config->>'pricingRevision'='2026-10-12-flash-lite-0.10-0.40' and c.max_value_usd<=0.005;
 if c.id is null or not c.verified or c.expires_at<=now() or c.revision<>p_revision
 or (not coalesce(paid_model,false) and (coalesce((c.config->>'trialOnly')::boolean,false)=false or coalesce((c.config->>'billingDisabled')::boolean,false)=false)) then raise exception 'TRIAL_UNAVAILABLE'; end if;
 if not coalesce(paid_model,false) then
 select * into wallet from scout_trial_accounts where id=c.config->>'trialAccountId' for update;
 if wallet.id is null or not wallet.verified or wallet.provider<>c.provider or wallet.expires_at<=now()
 or wallet.reserved_value_usd+c.max_value_usd>wallet.total_value_usd then raise exception 'TRIAL_EXHAUSTED'; end if;
 end if;
 if c.used_units+c.units_per_request>c.total_units then raise exception 'TRIAL_EXHAUSTED'; end if;
 select * into cfg from scout_budget_settings where id;
 if not cfg.enabled then raise exception 'SCOUT_DISABLED'; end if;
 select coalesce(sum(case when capability_id in(select id from scout_trial_capabilities where provider='gemini') then coalesce(actual_usd,reserved_usd) else reserved_usd end),0) into session_spend from scout_external_runs where session_id=p_session;
 select session_spend+coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into session_spend from scout_provider_runs where session_id=p_session;
 select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into day_spend from scout_external_runs where created_at>=(date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh');
 select day_spend+coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into day_spend from scout_provider_runs where budget_day=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
 if coalesce(paid_model,false) then
 select coalesce(sum(coalesce(r.actual_usd,r.reserved_usd)),0) into model_spend from scout_external_runs r join scout_trial_capabilities tc on tc.id=r.capability_id where r.session_id=p_session and tc.provider='gemini';
 if model_spend+c.max_value_usd>least(0.02,coalesce((s.params->'searchPlan'->'criteria'->>'maxModelUsd')::numeric,0.02)) then raise exception 'BUDGET_EXHAUSTED'; end if;
 else
 update scout_trial_accounts set reserved_value_usd=reserved_value_usd+c.max_value_usd where id=wallet.id;
 end if;
 if session_spend+c.max_value_usd>least(cfg.session_usd,(s.params->'searchPlan'->>'maxSessionUsd')::numeric)
 or day_spend+c.max_value_usd>cfg.daily_usd or c.max_value_usd>cfg.run_usd then raise exception 'BUDGET_EXHAUSTED'; end if;
 update scout_trial_capabilities set used_units=used_units+c.units_per_request where id=c.id;
 insert into scout_external_runs(session_id,task_key,capability_id,input,reserved_units,reserved_usd)
 values(p_session,p_key,c.id,p_input,c.units_per_request,c.max_value_usd) returning * into r;
 return jsonb_build_object('claimed',true,'run',to_jsonb(r));
end $$;
revoke all on function public.reserve_scout_external(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_scout_external(uuid,text,uuid,text,jsonb) to service_role;

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
 select day_spend+coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into day_spend from scout_external_runs where created_at>=(date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh');
 select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into session_spend from scout_provider_runs where session_id=p_session;
 select session_spend+coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into session_spend from scout_external_runs where session_id=p_session;
 select coalesce(sum(coalesce(pr.actual_usd,pr.reserved_usd)),0) into verification_spend from scout_provider_runs pr join scout_sessions x on x.id=pr.session_id where x.verification;
 cap := least(case when p_platform='TikTok' then cfg.tiktok_run_usd else cfg.run_usd end,least(cfg.session_usd,coalesce((s.params->'searchPlan'->>'maxSessionUsd')::numeric,(s.params->>'maxSessionUsd')::numeric,cfg.session_usd))-session_spend,cfg.daily_usd-day_spend,
 case when s.verification then cfg.verification_usd-verification_spend else case when p_platform='TikTok' then cfg.tiktok_run_usd else cfg.run_usd end end);
 if s.params->>'searchStrategy'='seed_content_v1' then
 cap := least(cap,(select min(tc.max_value_usd) from scout_trial_capabilities tc where tc.provider='apify' and tc.platform=p_platform and tc.verified and tc.expires_at>now()));
 if cap is null then raise exception 'TRIAL_UNAVAILABLE'; end if;
 end if;
 if cap <= 0 then raise exception 'BUDGET_EXHAUSTED'; end if;
 insert into scout_provider_runs(session_id,task_key,cache_key,actor,platform,task,build,input,reserved_usd)
 values(p_session,p_key,p_cache,p_actor,p_platform,p_task,p_build,p_input,cap) returning * into r;
 return jsonb_build_object('claimed',true,'run',to_jsonb(r));
end $$;


