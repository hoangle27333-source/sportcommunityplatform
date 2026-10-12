-- Disposable PostgreSQL fixture only. Never run on a shared database.
create extension if not exists pgcrypto;
create role anon; create role authenticated; create role service_role;
create table profiles(id uuid primary key,role text);
create table scout_sessions(id uuid primary key,owner_id uuid,verification boolean default false,params jsonb);
create table scout_budget_settings(id boolean primary key,enabled boolean,session_usd numeric,daily_usd numeric,verification_usd numeric,run_usd numeric,tiktok_run_usd numeric);
create table scout_provider_runs(id uuid primary key default gen_random_uuid(),session_id uuid,task_key text,cache_key text,actor text,platform text,task text,build text,input jsonb,reserved_usd numeric,actual_usd numeric,state text default 'reserved',normalized_rows jsonb,observed_at timestamptz,created_at timestamptz default now(),budget_day date default (now() at time zone 'Asia/Ho_Chi_Minh')::date);
insert into profiles values('00000000-0000-0000-0000-000000000001','editor');
insert into scout_budget_settings values(true,true,1,5,1,.2,.5);
insert into scout_sessions values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',false,'{"searchPlan":{"maxSessionUsd":0.3}}');
