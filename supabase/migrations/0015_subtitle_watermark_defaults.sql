-- 0015: Subtitle animation + watermark defaults for Remix presets.
ALTER TABLE public.remix_presets
  ADD COLUMN IF NOT EXISTS subtitle_preset text NOT NULL DEFAULT 'tiktok_bold'
    CHECK (subtitle_preset IN ('tiktok_bold', 'meme', 'pop', 'bubble', 'neon', 'clean')),
  ADD COLUMN IF NOT EXISTS subtitle_animation text NOT NULL DEFAULT 'word_highlight'
    CHECK (subtitle_animation IN ('static', 'word_highlight')),
  ADD COLUMN IF NOT EXISTS sub_highlight_color text NOT NULL DEFAULT '#FFF200',
  ADD COLUMN IF NOT EXISTS watermark_defaults jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.remix_presets.subtitle_animation IS
  'Subtitle render mode: static or TikTok-like word_highlight burn-in.';

COMMENT ON COLUMN public.remix_presets.watermark_defaults IS
  'Default watermarkConfig JSON for new remix jobs.';
