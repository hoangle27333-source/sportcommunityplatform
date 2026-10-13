-- Avoid putting the full v6 plan/seed snapshot in a PostgREST URL for CAS.
-- A row lock and a narrow JSONB update preserve concurrent scopes atomically.
create or replace function public.save_scout_session_snapshot(p_session uuid,p_namespace text,p_key text,p_value text)
returns text language plpgsql security definer set search_path=public as $$
declare s scout_sessions; existing text;
begin
 if p_namespace not in ('retrievalWindows','providerBuilds') or p_key is null or length(p_key)>500 or p_value is null then raise exception 'INVALID_SNAPSHOT'; end if;
 select * into s from scout_sessions where id=p_session for update;
 if s.id is null then raise exception 'SESSION_NOT_FOUND'; end if;
 if not exists(select 1 from profiles where id=s.owner_id and role in ('admin','editor')) then raise exception 'FORBIDDEN'; end if;
 existing := s.params->p_namespace->>p_key;
 if existing is not null then return existing; end if;
 update scout_sessions set params=jsonb_set(coalesce(params,'{}'::jsonb),array[p_namespace],coalesce(params->p_namespace,'{}'::jsonb)||jsonb_build_object(p_key,p_value),true) where id=p_session;
 return p_value;
end $$;
revoke all on function public.save_scout_session_snapshot(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.save_scout_session_snapshot(uuid,text,text,text) to service_role;
