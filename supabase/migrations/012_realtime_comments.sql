-- Enable Supabase Realtime for project_comments.
--
-- Two things are needed to make `supabase.channel(...).on('postgres_changes',
-- ...)` work for this table:
--
--   1. The table must be added to the `supabase_realtime` publication so
--      Postgres logical replication broadcasts row changes.
--
--   2. REPLICA IDENTITY needs to be FULL so DELETE events carry the old
--      row's payload (otherwise the client only gets the primary key,
--      and our handler can't filter by project_id on DELETE).
--
-- Migration is idempotent — re-running adds the table only if it isn't
-- already a publication member.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_comments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.project_comments';
  END IF;
END $$;

ALTER TABLE public.project_comments REPLICA IDENTITY FULL;
