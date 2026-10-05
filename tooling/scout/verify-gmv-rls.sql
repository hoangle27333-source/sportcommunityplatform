-- Run on an isolated database after the auth shim and sport-hub migrations.
-- All fixtures and writes roll back.
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.profiles(id,role) values ('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','editor'),('00000000-0000-0000-0000-000000000003','viewer');
insert into public.kols(id,name) values ('00000000-0000-0000-0000-000000000004','GMV Test');
grant select,insert,update,delete on public.kol_gmv_monthly to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.kol_gmv_monthly(kol_id,month,amount,source,updated_by) values ('00000000-0000-0000-0000-000000000004','2026-09',1000,'Test report','00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000004','2026-10',0,'Test report','00000000-0000-0000-0000-000000000001');
do $$ begin
  if (select amount from public.kol_gmv_monthly order by month desc limit 1) <> 0 then raise exception 'Latest month or zero lost'; end if;
  begin
    insert into public.kol_gmv_monthly(kol_id,month,amount,source,updated_by) values ('00000000-0000-0000-0000-000000000004','2026-11',-1,'Test','00000000-0000-0000-0000-000000000001');
    raise exception 'Negative amount accepted';
  exception when check_violation then null; end;
  begin
    insert into public.kol_gmv_monthly(kol_id,month,amount,source,updated_by) values ('00000000-0000-0000-0000-000000000004','2026-13',1,'Test','00000000-0000-0000-0000-000000000001');
    raise exception 'Invalid month accepted';
  exception when check_violation then null; end;
  begin
    insert into public.kol_gmv_monthly(kol_id,month,amount,source,updated_by) values ('00000000-0000-0000-0000-000000000004','2026-11',1,' ','00000000-0000-0000-0000-000000000001');
    raise exception 'Blank source accepted';
  exception when check_violation then null; end;
  begin
    insert into public.kol_gmv_monthly(kol_id,month,amount,source,updated_by) values ('00000000-0000-0000-0000-000000000004','2026-10',1,'Test','00000000-0000-0000-0000-000000000001');
    raise exception 'Duplicate month accepted';
  exception when unique_violation then null; end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from public.kol_gmv_monthly) <> 0 then raise exception 'Editor read leaked'; end if;
  begin
    insert into public.kol_gmv_monthly(kol_id,month,amount,source,updated_by) values ('00000000-0000-0000-0000-000000000004','2026-11',1,'Test','00000000-0000-0000-0000-000000000002');
    raise exception 'Editor wrote GMV';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from public.kol_gmv_monthly) <> 0 then raise exception 'Viewer read leaked'; end if;
  update public.kol_gmv_monthly set amount=999; if found then raise exception 'Viewer updated GMV'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform amount from public.kol_gmv_monthly; raise exception 'Anonymous GMV read leaked'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Retry-safe identity unique index also supports ON CONFLICT inference.
insert into public.scouted_posts(author,post_url,scout_identity) values ('Test','https://instagram.com/p/test','Instagram:https://instagram.com/p/test') on conflict (scout_identity) do nothing;
insert into public.scouted_posts(author,post_url,scout_identity) values ('Test','https://instagram.com/p/test','Instagram:https://instagram.com/p/test') on conflict (scout_identity) do nothing;
do $$ begin if (select count(*) from public.scouted_posts where scout_identity='Instagram:https://instagram.com/p/test') <> 1 then raise exception 'Duplicate post identity'; end if; end $$;
rollback;
