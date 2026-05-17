-- Lyrics for tracks + extra contact columns the new import / CRM uses

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS lyrics TEXT,
  ADD COLUMN IF NOT EXISTS lyrics_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lyrics_history JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT;

CREATE INDEX IF NOT EXISTS contacts_category_idx ON public.contacts (category);
CREATE INDEX IF NOT EXISTS contacts_email_idx ON public.contacts (email);
