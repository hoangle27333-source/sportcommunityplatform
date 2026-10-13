create or replace function public.reserve_scout_external(p_session uuid,p_key text,p_capability uuid,p_revision text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c scout_trial_capabilities; s scout_sessions; saved_run scout_external_runs; cfg scout_budget_settings;
 session_spend numeric; day_spend numeric; model_spend numeric; wallet scout_trial_accounts; paid_model boolean;
begin
 perform pg_advisory_xact_lock(610050);
 select * into s from scout_sessions where id=p_session for update;
 if s.id is null or s.params->>'searchStrategy' is distinct from 'seed_content_v1' then raise exception 'INVALID_SESSION'; end if;
 if not exists(select 1 from profiles where id=s.owner_id and role in ('admin','editor')) then raise exception 'FORBIDDEN'; end if;
 select * into saved_run from scout_external_runs where session_id=p_session and task_key=p_key;
 if saved_run.id is not null then return jsonb_build_object('claimed',false,'run',to_jsonb(saved_run)); end if;
 select * into c from scout_trial_capabilities where id=p_capability for update;
 paid_model := c.provider='gemini' and c.operation='analysis' and c.config->>'paidModel'='true' and c.config->>'model'='gemini-2.5-flash-lite' and c.config->>'pricingRevision'='2026-10-12-flash-lite-0.10-0.40' and c.max_value_usd<=0.005;
 if c.id is null or not c.verified or c.expires_at<=now() or c.revision<>p_revision
 or (not coalesce(paid_model,false) and (coalesce((c.config->>'trialOnly')::boolean,false)=false or coalesce((c.config->>'billingDisabled')::boolean,false)=false)) then raise exception 'TRIAL_UNAVAILABLE'; end if;
 if not coalesce(paid_model,false) then
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
 if coalesce(paid_model,false) then
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

-- Transfer one Apify reservation into its existing provider ledger atomically.
-- The external row allocates trial credit; it is not a second charge for the same run.
create or replace function public.reserve_scout_apify_trial_run(p_session uuid,p_key text,p_cache text,p_actor text,p_platform text,p_task text,p_build text,p_input jsonb,p_external uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e scout_external_runs; c scout_trial_capabilities; claim jsonb;
begin
 perform pg_advisory_xact_lock(610050);
 select * into e from scout_external_runs where id=p_external and session_id=p_session for update;
 select * into c from scout_trial_capabilities where id=e.capability_id;
 if e.id is null or c.provider<>'apify' or c.platform<>p_platform or e.state not in ('reserved','running') or c.operation<>(case when p_task='profile-details' then 'profile' when p_task='profile-posts' then 'posts' else 'discovery' end) then raise exception 'INVALID_TRIAL_BRIDGE'; end if;
 -- If the nested reservation fails, PostgreSQL rolls this update back too.
 update scout_external_runs set actual_usd=0 where id=e.id;
 claim := reserve_scout_run(p_session,p_key,p_cache,p_actor,p_platform,p_task,p_build,p_input);
 update scout_external_runs set provider_receipt=claim->'run'->>'id',input=input||jsonb_build_object('reusedProvider',not coalesce((claim->>'claimed')::boolean,false)) where id=e.id;
 return claim;
end $$;
revoke all on function public.reserve_scout_apify_trial_run(uuid,text,text,text,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.reserve_scout_apify_trial_run(uuid,text,text,text,text,text,text,jsonb,uuid) to service_role;

create or replace function public.settle_scout_apify_trial(p_external uuid,p_response jsonb,p_failure text default null)
returns void language plpgsql security definer set search_path=public as $$
declare e scout_external_runs; c scout_trial_capabilities; pr scout_provider_runs; amount numeric;
begin
 perform pg_advisory_xact_lock(610050);
 select * into e from scout_external_runs where id=p_external for update;
 select * into c from scout_trial_capabilities where id=e.capability_id;
 if e.id is null or c.provider<>'apify' then raise exception 'INVALID_TRIAL_BRIDGE'; end if;
 if e.input->>'trialSettled'='true' then return; end if;
 if e.provider_receipt is not null then
 select * into pr from scout_provider_runs where id=e.provider_receipt::uuid;
 if pr.id is null or pr.actual_usd is null or pr.state in ('reserved','starting','running','start-unknown') then raise exception 'UNRESOLVED_TRIAL_BRIDGE'; end if;
 amount := case when pr.session_id<>e.session_id or e.input->>'reusedProvider'='true' then 0 else pr.actual_usd end;
 else
 -- A successful cache hit never transmitted a provider start or created a run row.
 if p_failure is not null then raise exception 'UNRESOLVED_TRIAL_BRIDGE'; end if;
 amount := 0;
 end if;
 if amount>e.reserved_usd then raise exception 'TRIAL_CHARGE_ABOVE_RESERVATION'; end if;
 update scout_trial_accounts set reserved_value_usd=greatest(0,reserved_value_usd-e.reserved_usd+amount) where id=c.config->>'trialAccountId';
 update scout_external_runs set state=case when p_failure is null then 'succeeded' else 'failed' end,response=p_response,error=p_failure,actual_usd=0,input=input||jsonb_build_object('trialSettled',true,'actualCreditValueUsd',amount) where id=e.id;
end $$;
revoke all on function public.settle_scout_apify_trial(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.settle_scout_apify_trial(uuid,jsonb,text) to service_role;

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
 if not exists(select 1 from scout_trial_capabilities tc where tc.provider='apify' and tc.platform=p_platform and tc.operation=(case when p_task='profile-details' then 'profile' when p_task='profile-posts' then 'posts' else 'discovery' end) and tc.verified and tc.expires_at>now() and tc.config->>'trialOnly'='true' and tc.config->>'billingDisabled'='true') then raise exception 'TRIAL_UNAVAILABLE'; end if;
 cap := least(cap,(select min(tc.max_value_usd) from scout_trial_capabilities tc where tc.provider='apify' and tc.platform=p_platform and tc.operation=(case when p_task='profile-details' then 'profile' when p_task='profile-posts' then 'posts' else 'discovery' end) and tc.verified and tc.expires_at>now()));
 if cap is null then raise exception 'TRIAL_UNAVAILABLE'; end if;
 end if;
 if cap <= 0 then raise exception 'BUDGET_EXHAUSTED'; end if;
 insert into scout_provider_runs(session_id,task_key,cache_key,actor,platform,task,build,input,reserved_usd)
 values(p_session,p_key,p_cache,p_actor,p_platform,p_task,p_build,p_input,cap) returning * into r;
 return jsonb_build_object('claimed',true,'run',to_jsonb(r));
end $$;


