-- ============================================================================
-- Content Automation Hub — Remix Presets
-- ============================================================================

create table public.remix_presets (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  name              text default 'Default',
  target_language   text default 'vi',
  voice_name        text default 'vi-VN-WaveNet-A',
  speaking_rate     real default 1.0,
  sub_font          text default 'Arial',
  sub_font_size     int default 24,
  sub_color         text default '#FFFFFF',
  sub_bg_color      text default '#80000000',
  sub_bold          boolean default false,
  sub_italic        boolean default false,
  sub_outline       int default 2,
  sub_border_style  int default 3,
  sub_position      text default 'bottom',
  blur_original_sub boolean default true,
  bg_volume         real default 0.3,
  output_format     text default 'mp4',
  output_ratio      text default '9:16',
  output_crf        int default 18,
  intro_enabled     boolean default false,
  intro_media_id    uuid references public.media_assets (id) on delete set null,
  outro_enabled     boolean default false,
  outro_media_id    uuid references public.media_assets (id) on delete set null,
  auto_vietsub      boolean default true,
  auto_dub          boolean default true,
  is_default        boolean default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create trigger trg_remix_presets_updated
  before update on public.remix_presets
  for each row execute function public.set_updated_at();

alter table public.remix_presets enable row level security;
create policy remix_presets_all on public.remix_presets
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

create table public.favorite_voices (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  voice_name        text not null,
  display_name      text,
  language_code     text default 'vi-VN',
  gender            text,
  created_at        timestamptz default now(),
  unique(user_id, voice_name)
);

alter table public.favorite_voices enable row level security;
create policy favorite_voices_all on public.favorite_voices
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.remix_jobs 
  add column if not exists batch_id uuid,
  add column if not exists batch_index integer,
  add column if not exists preset_id uuid references public.remix_presets (id) on delete set null,
  add column if not exists generation_mode text default 'manual' check (generation_mode in ('auto', 'manual'));

create index if not exists idx_remix_jobs_batch on public.remix_jobs (batch_id) where batch_id is not null;
