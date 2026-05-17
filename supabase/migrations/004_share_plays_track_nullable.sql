-- Allow share_plays.track_id to be NULL so we can log link-level opens
-- (not tied to a specific track play).
ALTER TABLE public.share_plays ALTER COLUMN track_id DROP NOT NULL;
