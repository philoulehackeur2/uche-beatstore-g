-- 070_drop_notified.sql
-- Tracks when a beat's "new drop" announcement was fanned out to the
-- producer's followers (producer_follows, mig 066), so re-listing a beat
-- never re-spams followers. NULL = never announced. Idempotent.

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS drop_notified_at timestamptz;

NOTIFY pgrst, 'reload schema';
