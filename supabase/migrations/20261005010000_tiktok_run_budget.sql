-- Platform-specific increase; existing global caps and ledger remain unchanged.
alter table public.scout_budget_settings add column if not exists tiktok_run_usd numeric not null default 0.5 check(tiktok_run_usd > 0 and tiktok_run_usd <= 0.5);
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
 cap := least(case when p_platform='TikTok' then cfg.tiktok_run_usd else cfg.run_usd end,cfg.session_usd-session_spend,cfg.daily_usd-day_spend,
 case when s.verification then cfg.verification_usd-verification_spend else case when p_platform='TikTok' then cfg.tiktok_run_usd else cfg.run_usd end end);
 if cap <= 0 then raise exception 'BUDGET_EXHAUSTED'; end if;
 insert into scout_provider_runs(session_id,task_key,cache_key,actor,platform,task,build,input,reserved_usd)
 values(p_session,p_key,p_cache,p_actor,p_platform,p_task,p_build,p_input,cap) returning * into r;
 return jsonb_build_object('claimed',true,'run',to_jsonb(r));
end $$;
