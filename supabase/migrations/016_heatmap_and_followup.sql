-- Migration 016: Heatmap playhead tracking
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS play_head_pings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id           uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  share_token        text,
  position_seconds   numeric NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Index for speedy heatmap aggregation by track
CREATE INDEX IF NOT EXISTS play_head_pings_track_idx ON play_head_pings(track_id);

-- Enable RLS
ALTER TABLE play_head_pings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS play_head_pings_insert ON play_head_pings;
DROP POLICY IF EXISTS play_head_pings_select ON play_head_pings;

-- Policy: Anyone can insert play pings (anonymous/public share links)
CREATE POLICY play_head_pings_insert ON play_head_pings
  FOR INSERT WITH CHECK (true);

-- Policy: Only track owners can read pings
CREATE POLICY play_head_pings_select ON play_head_pings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tracks t
      WHERE t.id = play_head_pings.track_id
      AND t.user_id = auth.uid()
    )
  );
