-- Brave paid Search only. No capability or credential is enabled by this migration.
create table if not exists public.scout_provider_monthly_budgets (
 provider text not null check(provider='brave'), period_start date not null,
 cap_usd numeric not null default 4.5 check(cap_usd>=0 and cap_usd<=4.5),
 primary key(provider,period_start)
);
alter table public.scout_provider_monthly_budgets enable row level security;
revoke all on public.scout_provider_monthly_budgets from public,anon,authenticated;
grant all on public.scout_provider_monthly_budgets to service_role;
create or replace function public.scout_brave_budget() returns jsonb language sql security definer set search_path=public as $$
 with usage as (
 select coalesce(sum(coalesce(r.actual_usd,r.reserved_usd)),0) as usd from scout_external_runs r join scout_trial_capabilities c on c.id=r.capability_id
 where c.provider='brave' and (r.created_at>=(date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh') or r.actual_usd is null)
 ), budget as (
 select coalesce((select cap_usd from scout_provider_monthly_budgets where provider='brave' and period_start=date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date),4.5) as cap
 ) select jsonb_build_object('period',to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM'),'limitUsd',cap,'usedUsd',usd,'remainingUsd',greatest(0,cap-usd)) from usage,budget;
$$;
revoke all on function public.scout_brave_budget() from public,anon,authenticated;
grant execute on function public.scout_brave_budget() to service_role;
create or replace function public.reserve_scout_external(p_session uuid,p_key text,p_capability uuid,p_revision text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c scout_trial_capabilities; s scout_sessions; saved_run scout_external_runs; cfg scout_budget_settings;
 session_spend numeric; day_spend numeric; model_spend numeric; wallet scout_trial_accounts; paid_model boolean; paid_search boolean; search_usage numeric;
begin
 perform pg_advisory_xact_lock(610050);
 select * into s from scout_sessions where id=p_session for update;
 if s.id is null or s.params->>'searchStrategy' is distinct from 'seed_content_v1' then raise exception 'INVALID_SESSION'; end if;
 if not exists(select 1 from profiles where id=s.owner_id and role in ('admin','editor')) then raise exception 'FORBIDDEN'; end if;
 select * into saved_run from scout_external_runs where session_id=p_session and task_key=p_key;
 if saved_run.id is not null then return jsonb_build_object('claimed',false,'run',to_jsonb(saved_run)); end if;
 select * into c from scout_trial_capabilities where id=p_capability for update;
 paid_model := c.provider='gemini' and c.operation='analysis' and c.config->>'paidModel'='true' and c.config->>'model'='gemini-2.5-flash-lite' and c.config->>'pricingRevision'='2026-10-12-flash-lite-0.10-0.40' and c.max_value_usd<=0.005;
 paid_search := c.provider='brave' and c.operation='discovery' and c.config->>'paidSearch'='true' and c.config->>'adapterRevision'='brave-web-1' and c.config->>'pricingRevision'='brave-search-20261013-0.005' and c.max_value_usd=0.005 and c.units_per_request=1;
 if c.id is null or not c.verified or c.expires_at<=now() or c.revision<>p_revision
 or (not coalesce(paid_model,false) and not coalesce(paid_search,false) and (coalesce((c.config->>'trialOnly')::boolean,false)=false or coalesce((c.config->>'billingDisabled')::boolean,false)=false)) then raise exception 'TRIAL_UNAVAILABLE'; end if;
 if not coalesce(paid_model,false) and not coalesce(paid_search,false) then
 select * into wallet from scout_trial_accounts where id=c.config->>'trialAccountId' for update;
 if wallet.id is null or not wallet.verified or wallet.provider<>c.provider or wallet.expires_at<=now()
 or wallet.reserved_value_usd+c.max_value_usd>wallet.total_value_usd then raise exception 'TRIAL_EXHAUSTED'; end if;
 end if;
 if (select count(*) from scout_external_runs r join scout_trial_capabilities tc on tc.id=r.capability_id where r.session_id=p_session and tc.operation=c.operation)>=(case c.operation when 'discovery' then 12 when 'profile' then 20 when 'posts' then 20 else 40 end) then raise exception 'QUOTA_EXHAUSTED'; end if;
 if c.used_units+c.units_per_request>c.total_units then raise exception 'TRIAL_EXHAUSTED'; end if;
 select * into cfg from scout_budget_settings where id;
 if not cfg.enabled then raise exception 'SCOUT_DISABLED'; end if;
 select coalesce(sum(case when capability_id in(select id from scout_trial_capabilities where provider in ('gemini','apify')) then coalesce(actual_usd,reserved_usd) else reserved_usd end),0) into session_spend from scout_external_runs where session_id=p_session;
 select session_spend+coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into session_spend from scout_provider_runs where session_id=p_session;
 select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into day_spend from scout_external_runs where created_at>=(date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh');
 select day_spend+coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into day_spend from scout_provider_runs where budget_day=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
 if coalesce(paid_search,false) then
 insert into scout_provider_monthly_budgets(provider,period_start,cap_usd) values('brave',date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date,4.5) on conflict do nothing;
 perform 1 from scout_provider_monthly_budgets where provider='brave' and period_start=date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date for update;
 select coalesce(sum(coalesce(r.actual_usd,r.reserved_usd)),0) into search_usage from scout_external_runs r join scout_trial_capabilities tc on tc.id=r.capability_id
 where tc.provider='brave' and (r.created_at>=(date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh') or r.actual_usd is null);
 if search_usage+c.max_value_usd>(select cap_usd from scout_provider_monthly_budgets where provider='brave' and period_start=date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date) then raise exception 'BUDGET_EXHAUSTED'; end if;
 elsif coalesce(paid_model,false) then
 select coalesce(sum(coalesce(r.actual_usd,r.reserved_usd)),0) into model_spend from scout_external_runs r join scout_trial_capabilities tc on tc.id=r.capability_id where r.session_id=p_session and tc.provider='gemini';
 if model_spend+c.max_value_usd>least(0.02,coalesce((s.params->'searchPlan'->'criteria'->>'maxModelUsd')::numeric,0.02)) then raise exception 'BUDGET_EXHAUSTED'; end if;
 else
 update scout_trial_accounts set reserved_value_usd=reserved_value_usd+c.max_value_usd where id=wallet.id;
 end if;
 if session_spend+c.max_value_usd>least(cfg.session_usd,(s.params->'searchPlan'->>'maxSessionUsd')::numeric)
 or day_spend+c.max_value_usd>cfg.daily_usd or c.max_value_usd>(case when c.platform='TikTok' then cfg.tiktok_run_usd else cfg.run_usd end) then raise exception 'BUDGET_EXHAUSTED'; end if;
 update scout_trial_capabilities set used_units=used_units+c.units_per_request where id=c.id;
 insert into scout_external_runs(session_id,task_key,capability_id,input,reserved_units,reserved_usd)
 values(p_session,p_key,c.id,p_input,c.units_per_request,c.max_value_usd) returning * into saved_run;
 return jsonb_build_object('claimed',true,'run',to_jsonb(saved_run));
end $$;
revoke all on function public.reserve_scout_external(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_scout_external(uuid,text,uuid,text,jsonb) to service_role;

