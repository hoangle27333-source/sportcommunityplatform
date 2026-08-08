-- 0017: Custom subtitle Y position and progressive reveal animation.
ALTER TABLE public.remix_presets
  ADD COLUMN IF NOT EXISTS sub_custom_y numeric NOT NULL DEFAULT 0.78
    CHECK (sub_custom_y >= 0.05 AND sub_custom_y <= 0.9);

ALTER TABLE public.remix_presets
  DROP CONSTRAINT IF EXISTS remix_presets_subtitle_animation_check;

ALTER TABLE public.remix_presets
  ADD CONSTRAINT remix_presets_subtitle_animation_check
  CHECK (subtitle_animation IN ('static', 'word_highlight', 'reveal_words'));

COMMENT ON COLUMN public.remix_presets.sub_custom_y IS
  'Normalized top offset for custom subtitle placement, 0.05-0.9 of output height.';

COMMENT ON COLUMN public.remix_presets.subtitle_animation IS
  'Subtitle render mode: static, active-word highlight, or progressive reveal_words burn-in.';
