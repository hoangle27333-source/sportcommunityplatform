-- 0018: Remix folders tree + image preset table + per-kind defaults.

create table if not exists public.remix_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  parent_id uuid references public.remix_folders(id) on delete cascade,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists remix_folders_org_idx
  on public.remix_folders (org_id, parent_id, sort_order, created_at desc);

create trigger trg_remix_folders_updated
  before update on public.remix_folders
  for each row execute function public.set_updated_at();

alter table public.remix_folders enable row level security;

create policy remix_folders_select on public.remix_folders
  for select using (auth.uid() is not null);

create policy remix_folders_write on public.remix_folders
  for all using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

alter table public.remix_jobs
  add column if not exists folder_id uuid references public.remix_folders(id) on delete set null;

create index if not exists remix_jobs_folder_idx
  on public.remix_jobs (folder_id, created_at desc);

create table if not exists public.remix_image_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null default 'Default',
  output_ratio text not null default '9:16',
  color_grade boolean not null default false,
  image_translate text default null,
  caption_prompt text default null,
  caption_tone text default null,
  watermark_defaults jsonb not null default '{}'::jsonb,
  editor_template jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remix_image_presets_output_ratio_check
    check (output_ratio in ('9:16', '16:9', '1:1', '4:5', 'original')),
  constraint remix_image_presets_image_translate_check
    check (image_translate is null or image_translate in ('overlay', 'regenerate'))
);

create index if not exists remix_image_presets_org_idx
  on public.remix_image_presets (org_id, created_at desc);

create unique index if not exists remix_presets_one_default_per_org_idx
  on public.remix_presets (org_id)
  where is_default = true;

create unique index if not exists remix_image_presets_one_default_per_org_idx
  on public.remix_image_presets (org_id)
  where is_default = true;

create trigger trg_remix_image_presets_updated
  before update on public.remix_image_presets
  for each row execute function public.set_updated_at();

alter table public.remix_image_presets enable row level security;

create policy remix_image_presets_select on public.remix_image_presets
  for select using (auth.uid() is not null);

create policy remix_image_presets_write on public.remix_image_presets
  for all using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());
