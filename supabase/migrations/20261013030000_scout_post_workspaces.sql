-- One post, multiple discovery paths. Author and containing group are distinct.
alter table public.scouted_posts
  add column if not exists author_identity text,
  add column if not exists author_profile_url text,
  add column if not exists author_account jsonb,
  add column if not exists collection_sources jsonb not null default '[]'::jsonb;
create index if not exists scouted_posts_author_identity_idx on public.scouted_posts(author_identity);
create index if not exists scouted_posts_sources_idx on public.scouted_posts using gin(collection_sources);

create or replace function public.merge_scout_post_metadata(
  p_post uuid, p_author_identity text, p_author_url text, p_source jsonb, p_author_account jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare r scouted_posts; merged jsonb; incoming_id uuid;
begin
  select * into r from scouted_posts where id=p_post for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if p_author_identity is not null and r.author_identity is not null and r.author_identity<>p_author_identity then
    raise exception 'POST_AUTHOR_CONFLICT';
  end if;
  if p_author_account is not null then
    if p_author_identity is null or coalesce(p_author_account->>'entityType','') not in ('kol','community') then raise exception 'INVALID_AUTHOR_LINK'; end if;
    incoming_id := (p_author_account->>'id')::uuid;
    if r.author_account is not null and r.author_account<>p_author_account then raise exception 'POST_ACCOUNT_CONFLICT'; end if;
    if p_author_account->>'entityType'='kol' then
      if r.kol_id is not null and r.kol_id<>incoming_id then raise exception 'POST_ACCOUNT_CONFLICT'; end if;
      if not exists(select 1 from kols where id=incoming_id) then raise exception 'ACCOUNT_NOT_FOUND'; end if;
    elsif not exists(select 1 from communities where id=incoming_id) then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  end if;
  merged := coalesce(r.collection_sources,'[]'::jsonb);
  if p_source is not null then
    if coalesce(p_source->>'kind','') not in ('account','topic') then raise exception 'INVALID_POST_SOURCE'; end if;
    if not merged @> jsonb_build_array(p_source) then merged := merged || jsonb_build_array(p_source); end if;
  end if;
  update scouted_posts set
    author_identity=coalesce(r.author_identity,p_author_identity),
    author_profile_url=coalesce(r.author_profile_url,p_author_url),
    author_account=coalesce(r.author_account,p_author_account),
    kol_id=case when p_author_account->>'entityType'='kol' then incoming_id else r.kol_id end,
    collection_sources=merged
  where id=p_post returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.merge_scout_post_metadata(uuid,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.merge_scout_post_metadata(uuid,text,text,jsonb,jsonb) to service_role;

-- Use recorded session evidence only. Rows without provenance remain legacy/unknown.
update public.scouted_posts p set collection_sources=jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
  'kind',case when s.kind='trends' then 'topic' else 'account' end,
  'sessionId',s.id,'keyword',case when s.kind='trends' then s.params->>'keyword' end,
  'entityType',case when s.kind='kol-posts' then 'kol' when s.kind='community-posts' then 'community' end,
  'entityId',coalesce(s.params->>'kolId',s.params->>'communityId')
)))
from public.scout_provider_runs pr join public.scout_sessions s on s.id=pr.session_id
where p.collection_sources='[]'::jsonb and s.kind in ('trends','kol-posts','community-posts')
  and (p.scout_provenance->>'runId'=pr.id::text or p.scout_provenance->>'runId'=pr.provider_run_id);
notify pgrst, 'reload schema';
