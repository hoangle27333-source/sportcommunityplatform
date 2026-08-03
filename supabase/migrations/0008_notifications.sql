-- ============================================================================
-- Content Automation Hub — Notifications
-- ============================================================================

create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           text not null, -- 'remix_completed' | 'remix_failed' | 'approval_needed' | 'auto_fix_ready' | 'feedback_received'
  title          text not null,
  body           text,
  link           text, -- e.g. '/remix?jobId=xxx'
  metadata       jsonb default '{}',
  is_read        boolean default false,
  created_at     timestamptz default now()
);

create index idx_notifications_user on public.notifications(user_id, created_at desc);
create index idx_notifications_unread on public.notifications(user_id) where is_read = false;

alter table public.notifications enable row level security;
create policy notifications_own on public.notifications
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Add auto_fix_source_id to remix_jobs for tracking auto-fix chain
alter table public.remix_jobs
  add column if not exists auto_fix_source_id uuid references public.remix_jobs(id) on delete set null,
  add column if not exists is_auto_fix boolean default false;

create index if not exists idx_remix_jobs_autofix on public.remix_jobs(auto_fix_source_id) where auto_fix_source_id is not null;
