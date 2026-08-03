-- ============================================================================
-- Content Automation Hub — Remix Preset: Smart Sub Position + blur_region
-- ============================================================================

-- 1. Cho phép 'auto' trong sub_position (bỏ constraint cũ nếu có)
ALTER TABLE public.remix_presets
  DROP CONSTRAINT IF EXISTS remix_presets_sub_position_check;

-- 2. Lưu vùng blur phụ đề gốc dưới dạng jsonb
--    Format: { "x": 0, "y": 0.82, "w": 1, "h": 0.18 } (normalized 0-1)
ALTER TABLE public.remix_presets
  ADD COLUMN IF NOT EXISTS blur_region jsonb,
  ADD COLUMN IF NOT EXISTS auto_detect_subtitle_region boolean DEFAULT false;

comment on column public.remix_presets.blur_region is
  'Vùng blur phụ đề gốc (normalized 0–1). Dùng với subPosition=auto để đặt sub mới ngay trên vùng này.
   Format: {"x":0,"y":0.82,"w":1,"h":0.18} — mặc định bottom 18%.';
