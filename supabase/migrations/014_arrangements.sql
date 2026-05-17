-- ----------------------------------------------------------------------------
-- 014_arrangements.sql
--
-- One row per (user, track) holding the studio's in-memory arrangement
-- editor state. Lets a user split a track, drag the clips around, leave
-- the page, and come back to the same arrangement. Per-user because two
-- collaborators on the same legacy null-owner track could otherwise
-- step on each other's edits.
--
-- Shape:
--   markers JSONB → array of seconds (cut points in the source track)
--   ordering JSONB → array of stable clip ids in display order
--
-- We store BOTH because clip ids are derived from `(start, end)` pairs
-- in the client, and reorder operations mutate `ordering` independently
-- from splits. Keeping them as separate columns avoids a denormalised
-- "clips" array that would re-shape on every split.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS arrangements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  markers     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ordering    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One arrangement per (track, user). UPSERTs target this unique pair so
-- a user editing the same track twice doesn't accumulate rows.
CREATE UNIQUE INDEX IF NOT EXISTS arrangements_track_user_uq
  ON arrangements (track_id, user_id);

-- Touch-up trigger — bumps updated_at on UPDATE. Drives the "last
-- edited Nm ago" hint we'll show in a future round.
CREATE OR REPLACE FUNCTION arrangements_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS arrangements_touch ON arrangements;
CREATE TRIGGER arrangements_touch
  BEFORE UPDATE ON arrangements
  FOR EACH ROW
  EXECUTE FUNCTION arrangements_touch_updated_at();

-- RLS — owner-or-legacy-null pattern, same as other owned tables in
-- this app. Anonymous (null user_id) rows survive from before owners
-- existed; current users can read / write only their own rows.
ALTER TABLE arrangements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS arrangements_select ON arrangements;
CREATE POLICY arrangements_select ON arrangements
  FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS arrangements_insert ON arrangements;
CREATE POLICY arrangements_insert ON arrangements
  FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS arrangements_update ON arrangements;
CREATE POLICY arrangements_update ON arrangements
  FOR UPDATE
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS arrangements_delete ON arrangements;
CREATE POLICY arrangements_delete ON arrangements
  FOR DELETE
  USING (user_id = auth.uid() OR user_id IS NULL);
