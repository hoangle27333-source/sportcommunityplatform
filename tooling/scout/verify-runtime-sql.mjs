import pg from 'pg';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const options={host:'127.0.0.1',port:55432,user:'postgres',password:'apify-qa-only',database:'postgres'};
const db=new pg.Client(options);await db.connect();
try {
await db.query(`drop schema public cascade;create schema public;drop schema if exists auth cascade;
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role;end if;end $$;
grant usage on schema public to anon,authenticated,service_role;
create schema auth;create table auth.users(id uuid primary key);
create table profiles(id uuid primary key,role text);create table scout_sessions(id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id),params jsonb default '{}',kind text,status text default 'pending',lease_until timestamptz,created_at timestamptz default now(),runs jsonb default '{}');
create table kols(id uuid primary key);create table communities(id uuid primary key);create table scouted_posts(id uuid primary key);
create table tracked_account_snapshots(id uuid primary key,tracked_account_id uuid);
create table kol_metric_snapshots(id uuid primary key);
create table kol_audience_audits(real_audience_rate numeric not null,seeding_rate numeric not null);
create table community_audience_audits(real_audience_rate numeric not null,seeding_rate numeric not null);
insert into auth.users values('00000000-0000-0000-0000-000000000001');insert into profiles values('00000000-0000-0000-0000-000000000001','admin');`);
await db.query(await readFile('supabase/migrations/20261005000000_apify_runtime.sql','utf8'));
const owner='00000000-0000-0000-0000-000000000001';
const ids=(await db.query(`insert into scout_sessions(owner_id,kind) select $1,'verification' from generate_series(1,20) returning id`,[owner])).rows.map(r=>r.id);
async function reserve(id,key){const c=new pg.Client(options);await c.connect();try{return (await c.query('select reserve_scout_run($1,$2,$2,$3,$4,$5,$6,$7) result',[id,key,'actor','Instagram','profiles','1.0.0',{}])).rows[0].result;}finally{await c.end();}}
const same=await Promise.all(Array.from({length:10},()=>reserve(ids[0],'same')));assert.equal(same.filter(r=>r.claimed).length,1);const shared=await reserve(ids[16],'same');assert.equal(shared.shared,true);assert.equal(shared.run.id,same[0].run.id);
async function claimLease(table,id,field,tokenField){const c=new pg.Client(options);await c.connect();try{return (await c.query(`update ${table} set ${field}=now()+interval '2 minutes',${tokenField}=gen_random_uuid() where id=$1 and (${field} is null or ${field}<now()) returning id`,[id])).rowCount;}finally{await c.end();}}
assert.equal((await Promise.all(Array.from({length:10},()=>claimLease('scout_sessions',ids[10],'lease_until','lease_token')))).reduce((n,r)=>n+r,0),1);
assert.equal((await Promise.all(Array.from({length:10},()=>claimLease('scout_sessions',ids[10],'import_lease_until','import_token')))).reduce((n,r)=>n+r,0),1);
assert.equal((await Promise.all(Array.from({length:10},()=>claimLease('scout_provider_runs',same[0].run.id,'dataset_lease_until','dataset_token')))).reduce((n,r)=>n+r,0),1);
await db.query("update scout_budget_settings set daily_usd=1,session_usd=.5,verification_usd=.5");
const concurrent=await Promise.allSettled(ids.slice(1,11).map((id,i)=>reserve(id,'daily-'+i)));assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,3);
await db.query('select settle_scout_run($1,$2,$3,$4,$5,$6)',[same[0].run.id,'succeeded',.1,null,null,null]);
const spend=(await db.query('select sum(coalesce(actual_usd,reserved_usd)) n from scout_provider_runs')).rows[0].n;assert.equal(Number(spend),.85);
await db.query('update scout_budget_settings set daily_usd=10');await db.query('update scout_sessions set verification=true where id=any($1::uuid[])',[ids.slice(12,15)]);
const verify=await Promise.allSettled(ids.slice(12,15).map(id=>reserve(id,'verification')));assert.equal(verify.filter(r=>r.status==='fulfilled').length,2);
await db.query("update profiles set role='viewer'");await assert.rejects(reserve(ids[19],'forbidden'),/FORBIDDEN/);
await db.query("update profiles set role='admin'");
const sessionCaps=await Promise.allSettled(['cap-a','cap-b','cap-c'].map(key=>reserve(ids[18],key)));assert.equal(sessionCaps.filter(r=>r.status==='fulfilled').length,2);
const day=(await db.query("select budget_day=(now() at time zone 'Asia/Ho_Chi_Minh')::date correct from scout_provider_runs limit 1")).rows[0];assert.equal(day.correct,true);
await db.query("select advance_scout_watermark('account', '2026-10-05T10:00:00Z')");await db.query("select advance_scout_watermark('account', '2026-10-04T10:00:00Z')");assert.equal((await db.query("select published_at from scout_watermarks where scope_key='account'")).rows[0].published_at.toISOString(),'2026-10-05T10:00:00.000Z');
await db.query("update scout_provider_runs set budget_day=(now() at time zone 'Asia/Ho_Chi_Minh')::date-1");await db.query('update scout_budget_settings set daily_usd=.25');const reset=await reserve(ids[17],'new-day');assert.equal(Number(reset.run.reserved_usd),.25);
for(const role of ['anon','authenticated']) {await db.query('set role '+role);await assert.rejects(db.query('select * from scout_provider_runs'),/permission denied/);await assert.rejects(db.query('select reserve_scout_run($1,$2,$2,$3,$4,$5,$6,$7)',[ids[19],'x','a','p','t','b',{}]),/permission denied/);await db.query('reset role');}
await db.query(await readFile('supabase/migrations/20261005010000_tiktok_run_budget.sql','utf8'));
await db.query('update scout_budget_settings set daily_usd=10,session_usd=1,verification_usd=5');
const tik=(await db.query("insert into scout_sessions(owner_id,kind,verification) values($1,'verification',true) returning id",[owner])).rows[0].id;
const claimTik=async(key)=> (await db.query('select reserve_scout_run($1,$2,$2,$3,$4,$5,$6,$7) result',[tik,key,'actor','TikTok','profiles','1.0.0',{}])).rows[0].result;
assert.equal(Number((await claimTik('tik-a')).run.reserved_usd),.5);assert.equal(Number((await claimTik('tik-b')).run.reserved_usd),.5);await assert.rejects(claimTik('tik-c'),/BUDGET_EXHAUSTED/);
await assert.rejects(db.query('update scout_budget_settings set tiktok_run_usd=.51'),/check constraint/);
console.log('PASS: TikTok .50 platform cap, shared 1.00 session cap, .25 default cap and migration, shared/duplicate claims, concurrent worker/import/dataset leases, concurrent daily budget, settlement, verification cap, role revocation, session caps, timezone/day reset, monotonic watermarks and RLS/RPC denial.');
}finally{await db.end();}
