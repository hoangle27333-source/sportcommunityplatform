-- ============================================================================
-- 0014: Tích hợp HeyGen Video Translate API vào remix pipeline
--
-- Thêm 2 cột vào remix_jobs để lưu trạng thái HeyGen job (chờ webhook),
-- và mở rộng CHECK constraint dub_mode trong remix_presets để cho phép 'heygen'.
-- ============================================================================

-- Thêm heygen_job_id và heygen_status vào remix_jobs
ALTER TABLE public.remix_jobs
  ADD COLUMN IF NOT EXISTS heygen_job_id TEXT,
  ADD COLUMN IF NOT EXISTS heygen_status TEXT
    CHECK (heygen_status IN ('pending', 'processing', 'completed', 'failed'));

-- Index để tra nhanh khi webhook callback gửi về heygen_job_id
CREATE INDEX IF NOT EXISTS remix_jobs_heygen_job_id_idx
  ON public.remix_jobs (heygen_job_id)
  WHERE heygen_job_id IS NOT NULL;

-- Mở rộng CHECK constraint dub_mode của remix_presets để cho phép 'heygen'
ALTER TABLE public.remix_presets
  DROP CONSTRAINT IF EXISTS remix_presets_dub_mode_check;

ALTER TABLE public.remix_presets
  ADD CONSTRAINT remix_presets_dub_mode_check
    CHECK (dub_mode IN ('none', 'full', 'preserve_bgm', 'heygen'));
