-- ============================================================================
-- Content Automation Hub — Row Level Security (SPEC.md §9, requirements R1.4)
-- Enforce RBAC at the database layer, not just the UI.
--   admin  : full access
--   editor : create/edit/delete own content, run generation, schedule
--   viewer : read-only (calendar, analytics, trending library)
-- All access requires an authenticated session (auth.uid() is not null).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: current user's role. SECURITY DEFINER so it can read profiles
-- without recursing through profiles' own RLS policies.
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

create or replace function public.is_editor_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('admin', 'editor'), false);
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.social_accounts  enable row level security;
alter table public.tone_of_voice    enable row level security;
alter table public.campaigns         enable row level security;
alter table public.media_assets      enable row level security;
alter table public.posts             enable row level security;
alter table public.post_media        enable row level security;
alter table public.post_targets      enable row level security;
alter table public.metrics           enable row level security;
alter table public.ai_suggestions    enable row level security;
alter table public.engagement_items  enable row level security;
alter table public.schedule_jobs     enable row level security;
alter table public.audit_log         enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
--   read: any authenticated user can read all profiles (needed for UI author labels)
--   update role: admin only. self can update own name.
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select using (auth.uid() is not null);

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_app_role());  -- cannot self-escalate role

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- social_accounts — ADMIN ONLY (holds encrypted tokens). Editors/viewers
-- never touch this table directly; publishing runs via the service role in
-- the worker, which bypasses RLS.
-- ---------------------------------------------------------------------------
create policy social_accounts_admin_all on public.social_accounts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- tone_of_voice — read: all authenticated; write: editor/admin
-- ---------------------------------------------------------------------------
create policy tone_select on public.tone_of_voice
  for select using (auth.uid() is not null);
create policy tone_write on public.tone_of_voice
  for all using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());

-- ---------------------------------------------------------------------------
-- campaigns — read: all authenticated; write: editor/admin
-- ---------------------------------------------------------------------------
create policy campaigns_select on public.campaigns
  for select using (auth.uid() is not null);
create policy campaigns_write on public.campaigns
  for all using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());

-- ---------------------------------------------------------------------------
-- media_assets — read: all authenticated; write: editor/admin
-- ---------------------------------------------------------------------------
create policy media_select on public.media_assets
  for select using (auth.uid() is not null);
create policy media_write on public.media_assets
  for all using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());

-- ---------------------------------------------------------------------------
-- posts — read: all authenticated; insert/update/delete: editor/admin.
-- R1.4: a viewer calling insert is rejected (WITH CHECK fails).
-- ---------------------------------------------------------------------------
create policy posts_select on public.posts
  for select using (auth.uid() is not null);
create policy posts_insert on public.posts
  for insert with check (public.is_editor_or_admin() and created_by = auth.uid());
create policy posts_update on public.posts
  for update using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy posts_delete on public.posts
  for delete using (public.is_editor_or_admin());

-- ---------------------------------------------------------------------------
-- post_media — mirror posts write access
-- ---------------------------------------------------------------------------
create policy post_media_select on public.post_media
  for select using (auth.uid() is not null);
create policy post_media_write on public.post_media
  for all using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());

-- ---------------------------------------------------------------------------
-- post_targets — read: all authenticated. Writes happen in the worker
-- (service role, bypasses RLS). Editors may create targets when composing.
-- ---------------------------------------------------------------------------
create policy post_targets_select on public.post_targets
  for select using (auth.uid() is not null);
create policy post_targets_write on public.post_targets
  for all using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());

-- ---------------------------------------------------------------------------
-- metrics — read-only to all authenticated. Written by worker (service role).
-- ---------------------------------------------------------------------------
create policy metrics_select on public.metrics
  for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- ai_suggestions — read-only to all authenticated. Written by worker.
-- ---------------------------------------------------------------------------
create policy ai_suggestions_select on public.ai_suggestions
  for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- engagement_items — read: all authenticated. Approve/skip (update): editor/admin.
-- Ingest + send happen in worker (service role).
-- ---------------------------------------------------------------------------
create policy engagement_select on public.engagement_items
  for select using (auth.uid() is not null);
create policy engagement_update on public.engagement_items
  for update using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());

-- ---------------------------------------------------------------------------
-- schedule_jobs — read: editor/admin. Written by worker (service role).
-- ---------------------------------------------------------------------------
create policy schedule_jobs_select on public.schedule_jobs
  for select using (public.is_editor_or_admin());

-- ---------------------------------------------------------------------------
-- audit_log — read: admin only. Inserts happen via service role.
-- ---------------------------------------------------------------------------
create policy audit_admin_select on public.audit_log
  for select using (public.is_admin());
