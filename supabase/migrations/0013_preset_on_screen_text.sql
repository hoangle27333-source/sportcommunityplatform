-- 0013: Separate on-screen text translation from voice subtitles/dubbing.
ALTER TABLE public.remix_presets
  ADD COLUMN IF NOT EXISTS translate_on_screen_text boolean NOT NULL DEFAULT false;

ALTER TABLE public.remix_presets
  ADD COLUMN IF NOT EXISTS on_screen_text_preset text NOT NULL DEFAULT 'meme'
    CHECK (on_screen_text_preset IN ('meme', 'pop', 'bubble', 'neon', 'clean')),
  ADD COLUMN IF NOT EXISTS on_screen_text_font text NOT NULL DEFAULT 'Impact',
  ADD COLUMN IF NOT EXISTS on_screen_text_size integer NOT NULL DEFAULT 34,
  ADD COLUMN IF NOT EXISTS on_screen_text_color text NOT NULL DEFAULT '#FFFFFF',
  ADD COLUMN IF NOT EXISTS on_screen_text_bg_color text NOT NULL DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS on_screen_text_outline_color text NOT NULL DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS on_screen_text_bold boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.remix_presets.translate_on_screen_text IS
  'When true, Remix translates burned-in/on-screen text from source frames into target_language.';

COMMENT ON COLUMN public.remix_presets.on_screen_text_preset IS
  'Visual style preset for translated source on-screen text overlays.';
