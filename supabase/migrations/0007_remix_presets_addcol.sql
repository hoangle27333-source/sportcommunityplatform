-- 0007: Add missing columns to remix_presets
ALTER TABLE public.remix_presets
  ADD COLUMN IF NOT EXISTS auto_vertical boolean DEFAULT true;
