-- ============================================================================
-- TEST-ONLY shim for Supabase's managed `auth` schema.
-- Supabase provides auth.users + auth.uid() at runtime; a bare Postgres image
-- does not. This file recreates just enough of that surface to let the real
-- migrations (0001, 0002) apply cleanly for validation. NOT a production file.
-- ============================================================================
create extension if not exists "pgcrypto";

create schema if not exists auth;

-- Minimal stand-in for auth.users (only columns our migrations reference).
create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  raw_user_meta_data  jsonb not null default '{}'
);

-- auth.uid() returns the current request's user id. In tests we back it with
-- a GUC so we can impersonate roles: SET request.jwt.claim.sub = '<uuid>'.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
