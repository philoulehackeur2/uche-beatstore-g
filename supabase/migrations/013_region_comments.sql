-- Region-pinned comments.
--
-- We considered a separate `track_regions` table with a foreign key on
-- comments, but the workflow we want is the simpler one: a region IS a
-- comment with a timestamp range. There's no use for an unannotated
-- region — every region marker exists *because* somebody had something
-- to say about that slice of audio.
--
-- Result: two nullable NUMERIC columns on project_comments. A comment
-- with both set is region-pinned (renders as a timecode pill that seeks
-- the player on click). A comment with just track_id set is track-level
-- (the existing behavior). A comment with neither is project-level.
--
-- Numeric (not integer) so we can store fractional seconds — Essentia's
-- output and the WaveSurfer regions plugin both work in floats.
ALTER TABLE public.project_comments
  ADD COLUMN IF NOT EXISTS region_start NUMERIC,
  ADD COLUMN IF NOT EXISTS region_end   NUMERIC;

-- Soft constraint so a partial range (start without end, or end < start)
-- never lands. The DB rejects malformed inserts up front.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_comments_region_valid'
  ) THEN
    ALTER TABLE public.project_comments
      ADD CONSTRAINT project_comments_region_valid
      CHECK (
        (region_start IS NULL AND region_end IS NULL)
        OR (region_start IS NOT NULL AND region_end IS NOT NULL AND region_end > region_start)
      );
  END IF;
END $$;

-- Index for the common query "show all region-pinned comments on this track."
CREATE INDEX IF NOT EXISTS project_comments_track_region_idx
  ON public.project_comments (track_id, region_start)
  WHERE region_start IS NOT NULL;

NOTIFY pgrst, 'reload schema';
