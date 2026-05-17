-- Multi-tenant ownership: ensure share_links and contacts carry a user_id so
-- inserts that include user_id (and RLS that filters by it) work.
-- Older migrations omitted these columns; add them idempotently.

ALTER TABLE public.share_links
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS share_links_user_id_idx ON public.share_links (user_id);
CREATE INDEX IF NOT EXISTS contacts_user_id_idx     ON public.contacts     (user_id);

-- Force PostgREST to reload its schema cache so the new columns are visible
-- without a manual restart.
NOTIFY pgrst, 'reload schema';
