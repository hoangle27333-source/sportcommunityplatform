-- Disposable fixture assertions for the reviewed budget and repeated reservations.
do $$ declare first jsonb; again jsonb; second jsonb; total numeric; blocked boolean:=false; begin
 first:=reserve_scout_run('00000000-0000-0000-0000-000000000002','a','a','actor','Facebook','profiles','0.0.333','{}');
 again:=reserve_scout_run('00000000-0000-0000-0000-000000000002','a','a','actor','Facebook','profiles','0.0.333','{}');
 if first->'run'->>'id'<>again->'run'->>'id' or (again->>'claimed')::boolean then raise exception 'Repeated reservation charged twice'; end if;
 second:=reserve_scout_run('00000000-0000-0000-0000-000000000002','b','b','actor','TikTok','keyword','0.0.612','{}');
 select sum(reserved_usd) into total from scout_provider_runs;
 if total<>.3 or (second->'run'->>'reserved_usd')::numeric<>.1 then raise exception 'Reviewed budget was not enforced: %',total; end if;
 begin perform reserve_scout_run('00000000-0000-0000-0000-000000000002','c','c','actor','Facebook','profiles','0.0.333','{}');exception when others then if sqlerrm like '%BUDGET_EXHAUSTED%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Exhausted reviewed budget allowed another run'; end if;
 if has_function_privilege('authenticated','scout_search_budget_policy()','execute') then raise exception 'Policy probe exposed to authenticated role'; end if;
 if has_function_privilege('authenticated','reserve_scout_run(uuid,text,text,text,text,text,text,jsonb)','execute') then raise exception 'Reservation exposed to authenticated role'; end if;
 if scout_search_budget_policy()<>4 then raise exception 'Wrong budget policy'; end if;
 raise notice 'PASS reviewed cap, TikTok cap, replay reservation, exhaustion and policy access';
end $$;
