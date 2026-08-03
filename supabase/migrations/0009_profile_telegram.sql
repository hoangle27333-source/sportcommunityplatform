-- Add telegram_chat_id to profiles for Telegram notifications
alter table public.profiles
  add column if not exists telegram_chat_id text;

comment on column public.profiles.telegram_chat_id is
  'Telegram chat ID for job completion notifications. User can set via bot /start command or manually.';
