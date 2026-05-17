-- Share link feature columns the application reads/writes but the schema is missing
ALTER TABLE public.share_links
  ADD COLUMN IF NOT EXISTS allow_downloads BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'project';
