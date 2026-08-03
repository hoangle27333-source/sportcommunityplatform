-- 0011: Add dub_mode column to remix_presets
-- Supports three modes:
--   'none'        : Giữ audio gốc, không lồng tiếng.
--   'full'        : Thay toàn bộ audio bằng giọng TTS.
--   'preserve_bgm': Tách voice/bgm → lồng TTS voice + giữ nhạc nền gốc.

ALTER TABLE public.remix_presets
  ADD COLUMN IF NOT EXISTS dub_mode text NOT NULL DEFAULT 'none'
    CHECK (dub_mode IN ('none', 'full', 'preserve_bgm'));

-- Backfill existing rows: nếu auto_dub=true → 'full', ngược lại → 'none'
UPDATE public.remix_presets
  SET dub_mode = CASE WHEN auto_dub = true THEN 'full' ELSE 'none' END
  WHERE dub_mode = 'none' AND auto_dub IS NOT NULL;
