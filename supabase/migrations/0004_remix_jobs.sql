-- ============================================================================
-- Content Automation Hub — Content Remix module
-- Flow: nguồn (upload / link mình sở hữu / link tham khảo) → AI lập kế hoạch
--       → pipeline edit → user review → feedback → sửa lại → approve → calendar
--
-- Ranh giới tuân thủ (SPEC.md §0): KHÔNG tải & tái sử dụng file của bên thứ ba.
-- Link bên thứ ba chỉ dùng ở chế độ 'inspiration' — AI phân tích công thức
-- (hook/cấu trúc/nhịp) rồi sinh nội dung MỚI từ asset của mình.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Nguồn đầu vào. 'inspiration' KHÔNG tải media gốc — chỉ phân tích ý tưởng.
create type remix_source_type as enum ('upload', 'own_link', 'inspiration');

-- Loại đầu ra người dùng muốn.
create type remix_output_kind as enum ('video', 'image', 'caption');

-- Vòng đời job. review = đang chờ người xem; revising = đang sửa theo feedback.
create type remix_status as enum (
  'queued',
  'analyzing',
  'processing',
  'review',
  'revising',
  'approved',
  'failed'
);

-- ---------------------------------------------------------------------------
-- remix_jobs — một yêu cầu remix, sống qua nhiều vòng feedback.
-- Bản kết quả mới nhất nằm ở result_media_id; lịch sử từng vòng ở
-- remix_revisions để người dùng so sánh và quay lại bản trước.
-- ---------------------------------------------------------------------------
create table public.remix_jobs (
  id                uuid primary key default gen_random_uuid(),

  source_type       remix_source_type not null,
  -- Link nguồn. Với 'inspiration' đây là link tham khảo (không tải file).
  source_url        text,
  -- Asset của mình đã upload (source_type = 'upload').
  source_media_id   uuid references public.media_assets (id) on delete set null,

  -- Xác nhận quyền sử dụng nội dung. Bắt buộc true cho 'own_link' —
  -- người dùng khẳng định đây là nội dung họ sở hữu (audit trail).
  ownership_confirmed boolean not null default false,

  output_kind       remix_output_kind not null,
  -- Mô tả tự do của người dùng ("làm reel 30s, nhấn vào 3 lợi ích").
  prompt            text,
  -- Các option cứng: {vietsub, dubVi, vertical, trim, logo, colorGrade, ...}
  options           jsonb not null default '{}',

  status            remix_status not null default 'queued',
  -- Kế hoạch edit do AI lập (danh sách op đã được validate) — auditable.
  plan              jsonb not null default '{}',
  -- Kết quả mới nhất.
  result_media_id   uuid references public.media_assets (id) on delete set null,
  -- Caption/hashtag sinh kèm (khi output_kind = 'caption' hoặc kèm video/ảnh).
  result_caption    text,
  result_hashtags   text[] not null default '{}',

  error             text,
  -- Số vòng đã chạy (0 = bản đầu). Chặn vòng lặp feedback vô hạn.
  iteration         integer not null default 0,

  campaign_id       uuid references public.campaigns (id) on delete set null,
  created_by        uuid references public.profiles (id) on delete set null,

  -- Khi approve: post được tạo và job trỏ tới nó (bước vào calendar).
  approved_by       uuid references public.profiles (id) on delete set null,
  approved_at       timestamptz,
  post_id           uuid references public.posts (id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- 'own_link' phải có link + xác nhận sở hữu.
  constraint remix_own_link_needs_confirmation check (
    source_type <> 'own_link'
    or (source_url is not null and ownership_confirmed = true)
  ),
  -- 'upload' phải trỏ tới asset của mình.
  constraint remix_upload_needs_media check (
    source_type <> 'upload' or source_media_id is not null
  ),
  -- 'inspiration' phải có link tham khảo.
  constraint remix_inspiration_needs_url check (
    source_type <> 'inspiration' or source_url is not null
  )
);

create index remix_jobs_status_idx     on public.remix_jobs (status);
create index remix_jobs_created_by_idx on public.remix_jobs (created_by);
create index remix_jobs_created_at_idx on public.remix_jobs (created_at desc);

-- ---------------------------------------------------------------------------
-- remix_revisions — lịch sử từng vòng (bản đầu + mỗi lần sửa theo feedback).
-- Giữ lại để người dùng so sánh và AI có ngữ cảnh các lần sửa trước.
-- ---------------------------------------------------------------------------
create table public.remix_revisions (
  id              uuid primary key default gen_random_uuid(),
  remix_job_id    uuid not null references public.remix_jobs (id) on delete cascade,
  iteration       integer not null,
  -- Feedback của người dùng dẫn tới vòng này (null ở vòng đầu).
  feedback        text,
  plan            jsonb not null default '{}',
  result_media_id uuid references public.media_assets (id) on delete set null,
  result_caption  text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (remix_job_id, iteration)
);

create index remix_revisions_job_idx on public.remix_revisions (remix_job_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger (dùng lại hàm từ 0001)
-- ---------------------------------------------------------------------------
create trigger trg_remix_jobs_updated
  before update on public.remix_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — editor/admin tạo & sửa; viewer chỉ đọc (khớp R1 với posts).
-- ---------------------------------------------------------------------------
alter table public.remix_jobs      enable row level security;
alter table public.remix_revisions enable row level security;

create policy remix_jobs_select on public.remix_jobs
  for select using (auth.uid() is not null);
create policy remix_jobs_write on public.remix_jobs
  for all using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

create policy remix_revisions_select on public.remix_revisions
  for select using (auth.uid() is not null);
create policy remix_revisions_write on public.remix_revisions
  for all using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());
