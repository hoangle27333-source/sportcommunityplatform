-- tracked_accounts: public social profiles being monitored (competitors or own without OAuth)
CREATE TABLE tracked_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram')),
  profile_url     TEXT NOT NULL,
  username        TEXT,
  display_name    TEXT,
  avatar_url      TEXT,
  followers_count INTEGER,
  following_count INTEGER,
  posts_count     INTEGER,
  engagement_rate NUMERIC(6,2),
  bio             TEXT,
  is_verified     BOOLEAN DEFAULT false,
  label           TEXT NOT NULL DEFAULT 'competitor'
                    CHECK (label IN ('competitor', 'own', 'reference')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'scraping', 'error', 'paused')),
  error_message   TEXT,
  last_scraped_at TIMESTAMPTZ,
  scrape_metadata JSONB,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON tracked_accounts (platform);
CREATE INDEX ON tracked_accounts (status);
CREATE INDEX ON tracked_accounts (label);
CREATE INDEX ON tracked_accounts (created_by);

-- tracked_account_snapshots: time-series history of scraped metrics
CREATE TABLE tracked_account_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_account_id    UUID NOT NULL REFERENCES tracked_accounts(id) ON DELETE CASCADE,
  followers_count       INTEGER,
  following_count       INTEGER,
  posts_count           INTEGER,
  avg_likes             NUMERIC(10,2),
  avg_comments          NUMERIC(10,2),
  avg_shares            NUMERIC(10,2),
  avg_views             NUMERIC(10,2),
  engagement_rate       NUMERIC(6,2),
  posts_per_week        NUMERIC(5,1),
  top_hashtags          TEXT[],
  recent_posts          JSONB,
  captured_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON tracked_account_snapshots (tracked_account_id, captured_at DESC);

-- RLS: all authenticated users can read/write
ALTER TABLE tracked_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_account_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read"
  ON tracked_accounts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth_write"
  ON tracked_accounts FOR ALL
  TO authenticated USING (true);

CREATE POLICY "auth_read_snaps"
  ON tracked_account_snapshots FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth_write_snaps"
  ON tracked_account_snapshots FOR ALL
  TO authenticated USING (true);
