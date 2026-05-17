-- Track lifecycle status: finished | needs_work | archived
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'needs_work'
    CHECK (status IN ('finished', 'needs_work', 'archived'));

-- Backfill existing rows
UPDATE public.tracks SET status = 'needs_work' WHERE status IS NULL;
