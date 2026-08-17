create table if not exists public.remix_caption_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null default 'Default',
  platforms text[] not null default '{}',
  tone_and_voice text,
  audience text,
  caption_length text,
  hook_style text,
  cta text,
  required_hashtags text[] not null default '{}',
  optional_hashtags text[] not null default '{}',
  banned_hashtags text[] not null default '{}',
  required_keywords text[] not null default '{}',
  banned_keywords text[] not null default '{}',
  emoji_style text,
  format_style text,
  brand_rules text,
  sample_captions text,
  extra_instructions text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists remix_caption_presets_org_idx
  on public.remix_caption_presets (org_id, created_at desc);

create unique index if not exists remix_caption_presets_one_default_per_org_idx
  on public.remix_caption_presets (org_id)
  where is_default = true;

create trigger trg_remix_caption_presets_updated
  before update on public.remix_caption_presets
  for each row execute function public.set_updated_at();

alter table public.remix_caption_presets enable row level security;

create policy remix_caption_presets_select on public.remix_caption_presets
  for select using (auth.uid() is not null);

create policy remix_caption_presets_write on public.remix_caption_presets
  for all using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

alter table public.remix_jobs
  drop constraint if exists remix_own_link_needs_confirmation;

alter table public.remix_jobs
  add constraint remix_own_link_needs_confirmation
  check (
    source_type <> 'own_link'
    or source_url is not null
  );
