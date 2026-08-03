-- ============================================================================
-- Content Automation Hub — Initial schema (SPEC.md §4)
-- Single-tenant. Enums, tables, indexes. RLS policies live in 0002_rls.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role         as enum ('admin', 'editor', 'viewer');
create type social_platform   as enum ('facebook', 'instagram');
create type account_status    as enum ('active', 'expired', 'revoked', 'error');
create type campaign_status   as enum ('draft', 'active', 'paused', 'archived');
create type post_status       as enum ('draft', 'scheduled', 'publishing', 'published', 'failed');
create type target_status     as enum ('pending', 'publishing', 'published', 'failed');
create type media_type        as enum ('image', 'video', 'banner');
create type suggestion_type   as enum ('best_time', 'caption_style', 'hashtag_set', 'media_type');
create type engagement_type   as enum ('comment', 'dm');
create type engagement_status as enum ('pending', 'approved', 'sent', 'skipped');
create type job_status        as enum ('queued', 'running', 'done', 'failed');

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users, holds role (RBAC source of truth)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       user_role   not null default 'viewer',
  name       text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- social_accounts — connected FB Pages / IG Business accounts (SPEC §4)
-- access_token stored encrypted at-rest (AES-256-GCM) — never plaintext.
-- ---------------------------------------------------------------------------
create table public.social_accounts (
  id                 uuid primary key default gen_random_uuid(),
  platform           social_platform not null,
  external_id        text not null,              -- FB page id / IG user id
  name               text not null,
  page_id            text,                       -- FB page id backing an IG account
  access_token_enc   text not null,              -- ciphertext (iv:tag:data)
  token_expires_at   timestamptz,
  status             account_status not null default 'active',
  connected_by       uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (platform, external_id)
);

-- ---------------------------------------------------------------------------
-- tone_of_voice — persona/tone config reused by content-gen + engagement
-- ---------------------------------------------------------------------------
create table public.tone_of_voice (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  persona    text,
  guidelines text,
  examples   text[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  goal            text,
  status          campaign_status not null default 'draft',
  tone_of_voice_id uuid references public.tone_of_voice (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- media_assets — generated/uploaded media (Supabase Storage url)
-- ---------------------------------------------------------------------------
create table public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  type         media_type not null,
  url          text not null,
  storage_path text,                              -- path within Supabase Storage bucket
  meta         jsonb not null default '{}',
  generated_by text,                              -- 'comfyui' | 'satori' | 'remotion' | 'upload' | 'image-edit'
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
create table public.posts (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid references public.campaigns (id) on delete set null,
  status           post_status not null default 'draft',
  caption          text,
  hashtags         text[] not null default '{}',
  cta              text,
  link             text,
  primary_platform social_platform not null default 'facebook',
  scheduled_at     timestamptz,
  published_at     timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  approved_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- join: post <-> media assets (ordered for carousel)
create table public.post_media (
  post_id  uuid not null references public.posts (id) on delete cascade,
  media_id uuid not null references public.media_assets (id) on delete cascade,
  position int not null default 0,
  primary key (post_id, media_id)
);

-- ---------------------------------------------------------------------------
-- post_targets — one row per channel a post fans out to
-- external_post_id enables idempotent publish (SPEC §9)
-- ---------------------------------------------------------------------------
create table public.post_targets (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.posts (id) on delete cascade,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  external_post_id  text,                          -- set once published; dedupe key
  status            target_status not null default 'pending',
  error             text,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (post_id, social_account_id)
);

-- ---------------------------------------------------------------------------
-- metrics — append-only time-series of post performance
-- ---------------------------------------------------------------------------
create table public.metrics (
  id             uuid primary key default gen_random_uuid(),
  post_target_id uuid not null references public.post_targets (id) on delete cascade,
  reach          bigint,
  impressions    bigint,
  engagement     bigint,
  likes          bigint,
  comments       bigint,
  shares         bigint,
  raw            jsonb not null default '{}',
  captured_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ai_suggestions — output of analysis jobs
-- ---------------------------------------------------------------------------
create table public.ai_suggestions (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns (id) on delete cascade,
  post_id     uuid references public.posts (id) on delete cascade,
  type        suggestion_type not null,
  content     text not null,
  rationale   text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- engagement_items — comments/DMs on OWNED accounts + AI-suggested replies
-- human-in-the-loop: status flows pending -> approved -> sent
-- ---------------------------------------------------------------------------
create table public.engagement_items (
  id                uuid primary key default gen_random_uuid(),
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  type              engagement_type not null,
  external_id       text not null,
  message           text,
  suggested_reply   text,
  status            engagement_status not null default 'pending',
  reviewed_by       uuid references public.profiles (id) on delete set null,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  unique (social_account_id, external_id)
);

-- ---------------------------------------------------------------------------
-- schedule_jobs — bridge to BullMQ jobs for scheduled publishing
-- ---------------------------------------------------------------------------
create table public.schedule_jobs (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  run_at      timestamptz not null,
  bull_job_id text,
  status      job_status not null default 'queued',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- audit_log — records sensitive actions (role changes, publishes, replies)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_posts_status        on public.posts (status);
create index idx_posts_scheduled_at  on public.posts (scheduled_at) where scheduled_at is not null;
create index idx_posts_campaign      on public.posts (campaign_id);
create index idx_post_targets_post   on public.post_targets (post_id);
create index idx_metrics_target      on public.metrics (post_target_id);
create index idx_metrics_captured_at on public.metrics (captured_at);
create index idx_engagement_status   on public.engagement_items (status);
create index idx_schedule_jobs_runat on public.schedule_jobs (run_at) where status = 'queued';
create index idx_audit_created_at    on public.audit_log (created_at);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated       before update on public.profiles       for each row execute function public.set_updated_at();
create trigger trg_social_accounts_updated before update on public.social_accounts for each row execute function public.set_updated_at();
create trigger trg_tone_updated           before update on public.tone_of_voice   for each row execute function public.set_updated_at();
create trigger trg_campaigns_updated      before update on public.campaigns       for each row execute function public.set_updated_at();
create trigger trg_posts_updated          before update on public.posts           for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New auth user -> auto-create profile with default 'viewer' role (R1.3)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
