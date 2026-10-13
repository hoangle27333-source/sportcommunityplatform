begin;
create table if not exists public.scout_content_settings (
 id boolean primary key default true check(id),
 settings jsonb not null,
 updated_at timestamptz not null default now()
);
insert into public.scout_content_settings(id,settings) values(true,'{"enabled":true,"minViews":1000,"minInteractions":50,"metricRule":"views-first","policyVersion":1}') on conflict(id) do nothing;
alter table public.scout_content_settings enable row level security;
revoke all on public.scout_content_settings from anon,authenticated;
grant all on public.scout_content_settings to service_role;
alter table public.scouted_posts add column if not exists scout_content_assessment jsonb;
alter table public.scouted_posts alter column views drop not null, alter column likes drop not null, alter column comments drop not null;
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
    coalesce(case when jsonb_typeof(s.result->'samplePosts')='array' then s.result->'samplePosts' end,(select jsonb_agg(to_jsonb(p) order by p.published_at desc,p.id) from ranked p where p.community_id=c.id and position<=30),'[]'::jsonb),
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

commit;
