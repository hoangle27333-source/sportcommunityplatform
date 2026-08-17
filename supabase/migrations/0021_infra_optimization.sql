-- ============================================================================
-- Content Automation Hub — Infra optimization follow-up
-- Align auth status semantics, add hot-path indexes, and support VPS-friendly
-- analytics query patterns.
-- ============================================================================

-- Normalize historical auth-error rows to the newer status used by the app.
update public.social_accounts
set status = 'needs_reauth'
where status = 'expired';

create index if not exists idx_post_targets_status_account
  on public.post_targets (status, social_account_id);

create index if not exists idx_post_targets_status_with_external
  on public.post_targets (status)
  where external_post_id is not null;

create index if not exists idx_metrics_target_captured_desc
  on public.metrics (post_target_id, captured_at desc);

create index if not exists idx_remix_jobs_folder_created_desc
  on public.remix_jobs (folder_id, created_at desc);

create index if not exists idx_remix_jobs_status_created_desc
  on public.remix_jobs (status, created_at desc);
