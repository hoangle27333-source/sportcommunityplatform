ALTER TABLE public.remix_presets
  ADD COLUMN IF NOT EXISTS on_screen_text_size_mode text NOT NULL DEFAULT 'auto_fit'
    CHECK (on_screen_text_size_mode IN ('auto_fit', 'fixed'));

COMMENT ON COLUMN public.remix_presets.on_screen_text_size_mode IS
  'How translated on-screen text should size: auto_fit matches OCR bbox, fixed uses preset size.';
