insert into communities values ('00000000-0000-0000-0000-000000000001');
insert into scout_sessions(id,kind,params) values ('00000000-0000-0000-0000-000000000002','preview','{}');
do $$ declare token uuid:='00000000-0000-0000-0000-000000000003'; begin
assert claim_scout_dispatch('00000000-0000-0000-0000-000000000002',token);
assert not claim_scout_dispatch('00000000-0000-0000-0000-000000000002',gen_random_uuid());
assert register_scout_workflow('00000000-0000-0000-0000-000000000002',token,'fixture');
assert not register_scout_workflow('00000000-0000-0000-0000-000000000002',token,'duplicate');
assert not claim_scout_dispatch('00000000-0000-0000-0000-000000000002',gen_random_uuid());
update scout_sessions set workflow_run_id=null,dispatch_state='unknown',dispatch_lease_until=now()-interval '1 second';
assert claim_scout_dispatch('00000000-0000-0000-0000-000000000002',gen_random_uuid());
assert not register_scout_workflow('00000000-0000-0000-0000-000000000002',token,'stale');
update scout_sessions set status='failed',dispatch_state='unsubmitted',dispatch_lease_until=null;
assert not claim_scout_dispatch('00000000-0000-0000-0000-000000000002',gen_random_uuid());
assert scout_post_url_identity('http://www.facebook.com/story.php?utm=x&id=7&story_fbid=2')='https://facebook.com/story.php?story_fbid=2&id=7';
assert scout_post_url_identity('http://m.facebook.com/groups/1/posts/2/?utm=x#foo')='https://facebook.com/groups/1/posts/2';
end $$;
insert into scouted_posts(id,community_id,published_at,post_url,likes,comments)
select gen_random_uuid(),'00000000-0000-0000-0000-000000000001',now()-g*interval '1 minute','https://facebook.com/posts/'||g,g,g from generate_series(1,1100) g;
insert into scouted_posts(id,community_id,published_at,post_url,likes,comments) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000001',now()-interval '1 minute','http://www.facebook.com/posts/1/?utm=test',1,1);
do $$ declare sample jsonb; begin
select posts into sample from community_engagement_samples(array['00000000-0000-0000-0000-000000000001']::uuid[]);
assert jsonb_array_length(sample)=30;
assert (sample->29->>'likes')::int=30;
assert (select count(*) from community_engagement_samples(array['00000000-0000-0000-0000-000000000001']::uuid[]))=1;
assert not has_function_privilege('authenticated','claim_scout_dispatch(uuid,uuid)','EXECUTE');
assert not has_function_privilege('anon','community_engagement_samples(uuid[])','EXECUTE');
assert has_function_privilege('service_role','community_engagement_samples(uuid[])','EXECUTE');
end $$;
