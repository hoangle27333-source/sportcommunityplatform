-- Additive migration. Apply before enabling Workflow dispatch.
alter table public.scout_sessions
  add column if not exists execution_engine text not null default 'legacy',
  add column if not exists workflow_run_id text,
  add column if not exists dispatch_state text not null default 'unsubmitted',
  add column if not exists dispatch_token uuid,
  add column if not exists dispatch_lease_until timestamptz,
  add column if not exists execution_started_at timestamptz;
alter table public.scout_provider_runs add column if not exists dataset_progress jsonb;
create index if not exists scouted_posts_community_published_idx
  on public.scouted_posts(community_id, published_at desc, id);

create table if not exists public.scout_task_checkpoints (
  session_id uuid not null references public.scout_sessions(id) on delete cascade,
  task_key text not null,
  result jsonb not null,
  primary key(session_id, task_key)
);
alter table public.scout_task_checkpoints enable row level security;
revoke all on public.scout_task_checkpoints from anon, authenticated;
grant all on public.scout_task_checkpoints to service_role;

create or replace function public.claim_scout_dispatch(p_session uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update scout_sessions set execution_engine='workflow',
    runtime_version=case when runtime_version=1 then 1 else 3 end,
    dispatch_token=p_token, dispatch_state='starting', workflow_run_id=null,
    dispatch_lease_until=now()+interval '2 minutes',
    warnings=(coalesce(warnings,'[]'::jsonb) - 'Waiting for the worker queue to recover.'
      - 'Starting Scout workflow.' - 'Dispatch needs reconciliation') || '["Starting Scout workflow."]'::jsonb
  where id=p_session and verification=false and status in ('pending','running')
    and (lease_until is null or lease_until<now())
    and (dispatch_lease_until is null or dispatch_lease_until<now())
    and dispatch_state<>'submitted';
  return found;
end $$;

create or replace function public.register_scout_workflow(p_session uuid, p_token uuid, p_run text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update scout_sessions set workflow_run_id=p_run, dispatch_state='submitted',
    dispatch_lease_until=null,
    warnings=warnings - 'Waiting for the worker queue to recover.' - 'Starting Scout workflow.' - 'Dispatch needs reconciliation'
  where id=p_session and dispatch_token=p_token and execution_engine='workflow'
    and status in ('pending','running') and verification=false
    and (workflow_run_id is null or workflow_run_id=p_run);
  return found;
end $$;
revoke all on function public.claim_scout_dispatch(uuid,uuid) from public,anon,authenticated;
revoke all on function public.register_scout_workflow(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_scout_dispatch(uuid,uuid) to service_role;
grant execute on function public.register_scout_workflow(uuid,uuid,text) to service_role;

-- Match the collector URL identity before limiting, including older non-canonical URLs.
create or replace function public.scout_post_url_identity(p_url text)
returns text language sql immutable set search_path=public as $$
  with parts as (
    select regexp_replace(regexp_replace(split_part(split_part(p_url,'#',1),'?',1),
      '^https?://(www\.|m\.(?=facebook))?', 'https://', 'i'), '/$', '') as base,
      split_part(split_part(p_url,'#',1),'?',2) as query
  )
  select nullif(base || coalesce((select '?' || string_agg(m[1] || '=' || m[2], '&' order by
    case m[1] when 'story_fbid' then 1 when 'id' then 2 else 3 end)
    from regexp_matches(query,'(?:^|&)(id|story_fbid|v)=([^&]+)','g') m
    where (base ~ '/(story|permalink)\.php$' and m[1] in ('story_fbid','id'))
      or (base ~ '/profile\.php$' and m[1]='id')
      or (base ~ '/watch$' and m[1]='v')), ''), '') from parts
$$;
revoke all on function public.scout_post_url_identity(text) from public,anon,authenticated;
grant execute on function public.scout_post_url_identity(text) to service_role;

-- Bound the sample per community before applying the API row limit.
create or replace function public.community_engagement_samples(p_ids uuid[])
returns table(community_id uuid, posts jsonb, channel_coverage jsonb, collected_at timestamptz)
language sql stable security definer set search_path=public as $$
  with unique_posts as (
    select distinct on (p.community_id, coalesce(scout_post_url_identity(p.post_url),p.scout_identity,p.id::text)) p.*
    from scouted_posts p where p.community_id=any(p_ids) and p.published_at is not null
    order by p.community_id, coalesce(scout_post_url_identity(p.post_url),p.scout_identity,p.id::text), p.published_at desc,p.id
  ), ranked as (
    select p.*,row_number() over(partition by p.community_id order by p.published_at desc,p.id) as position
    from unique_posts p
  )
  select c.id,
    coalesce((select jsonb_agg(to_jsonb(p) order by p.published_at desc,p.id) from ranked p where p.community_id=c.id and position<=30),'[]'::jsonb),
    coalesce(s.result->'channelCoverage','[]'::jsonb), s.execution_started_at
  from communities c
  left join lateral (
    select result,execution_started_at from scout_sessions
    where kind='community-posts' and params->>'communityId'=c.id::text
      and params->>'collectionMode'='latest-30' and status in ('complete','failed')
    order by created_at desc limit 1
  ) s on true
  where c.id=any(p_ids)
$$;
revoke all on function public.community_engagement_samples(uuid[]) from public,anon,authenticated;
grant execute on function public.community_engagement_samples(uuid[]) to service_role;
