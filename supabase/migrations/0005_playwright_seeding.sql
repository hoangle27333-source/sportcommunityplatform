-- Migration 0005: Playwright unofficial channel connector + seeding jobs
-- Thêm cột session management vào social_accounts
-- Tạo bảng seeding_jobs cho browser automation

-- ── 1. Mở rộng social_accounts ─────────────────────────────────────────────
ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'official'
    CHECK (channel_type IN ('official', 'unofficial')),
  ADD COLUMN IF NOT EXISTS cookie_enc        TEXT,
  ADD COLUMN IF NOT EXISTS session_status    TEXT NOT NULL DEFAULT 'unknown'
    CHECK (session_status IN ('unknown', 'active', 'needs_relogin', 'checkpoint', 'banned')),
  ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_action_at     TIMESTAMPTZ,
  -- loại kênh unofficial: facebook_page | facebook_profile | facebook_group
  ADD COLUMN IF NOT EXISTS fb_target_type    TEXT
    CHECK (fb_target_type IN ('page', 'profile', 'group'));

COMMENT ON COLUMN social_accounts.channel_type IS 'official = Meta Graph API; unofficial = Playwright browser automation';
COMMENT ON COLUMN social_accounts.cookie_enc IS 'AES-256-GCM encrypted JSON array of Playwright cookies';
COMMENT ON COLUMN social_accounts.session_status IS 'Trạng thái session Playwright: unknown/active/needs_relogin/checkpoint/banned';

-- ── 2. Bảng seeding_jobs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seeding_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  action          TEXT NOT NULL CHECK (action IN ('post', 'comment', 'like', 'react', 'share')),

  -- Target
  target_post_url TEXT,         -- URL bài cần comment/like/share (null nếu action=post)
  target_group_ids TEXT[],      -- Group IDs nếu đăng vào group

  -- Nội dung
  post_caption    TEXT,         -- Nội dung bài đăng (action=post)
  post_media_urls TEXT[],       -- URLs ảnh/video đính kèm (action=post)
  comment_content TEXT,         -- Nội dung comment (action=comment)
  comment_mode    TEXT NOT NULL DEFAULT 'manual'
    CHECK (comment_mode IN ('manual', 'ai_generate')),
  reaction_type   TEXT DEFAULT 'like'
    CHECK (reaction_type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
  share_caption   TEXT,         -- Caption khi share

  -- Scheduling
  run_at          TIMESTAMPTZ,  -- NULL = thực thi ngay, có giá trị = lên lịch

  -- BullMQ
  bull_job_id     TEXT,

  -- Kết quả
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  result_post_url TEXT,         -- URL bài đã đăng sau khi done
  error           TEXT,
  executed_at     TIMESTAMPTZ,

  -- Audit
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE seeding_jobs IS 'Playwright browser automation jobs: post, comment, like, react, share trên các kênh unofficial';

-- Index để query theo account và status
CREATE INDEX IF NOT EXISTS seeding_jobs_account_id_idx ON seeding_jobs(account_id);
CREATE INDEX IF NOT EXISTS seeding_jobs_status_idx     ON seeding_jobs(status);
CREATE INDEX IF NOT EXISTS seeding_jobs_run_at_idx     ON seeding_jobs(run_at) WHERE run_at IS NOT NULL;

-- ── 3. RLS cho seeding_jobs ────────────────────────────────────────────────
ALTER TABLE seeding_jobs ENABLE ROW LEVEL SECURITY;

-- Admin/editor có thể đọc và tạo
CREATE POLICY "seeding_jobs_select" ON seeding_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'editor', 'viewer')
    )
  );

CREATE POLICY "seeding_jobs_insert" ON seeding_jobs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'editor')
    )
  );

-- Chỉ admin mới xóa
CREATE POLICY "seeding_jobs_delete" ON seeding_jobs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
