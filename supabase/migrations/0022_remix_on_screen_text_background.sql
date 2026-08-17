alter table public.remix_presets
  add column if not exists on_screen_text_background_style text not null default 'solid',
  add column if not exists on_screen_text_background_opacity numeric not null default 0.72;

alter table public.remix_presets
  drop constraint if exists remix_presets_on_screen_text_background_style_check;

alter table public.remix_presets
  add constraint remix_presets_on_screen_text_background_style_check
  check (on_screen_text_background_style in ('solid', 'blur'));
