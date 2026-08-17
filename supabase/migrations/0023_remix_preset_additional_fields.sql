alter table public.remix_presets
add column if not exists on_screen_text_italic boolean default false,
add column if not exists on_screen_text_outline_width numeric default 2,
add column if not exists sub_background_blur boolean default false;
