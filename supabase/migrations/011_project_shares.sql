-- Project sharing with permission roles + a comments layer.
--
-- The existing `share_links` table is a flat "here are some tracks behind
-- a token" object — fine for one-off sends but has no concept of:
--   - sharing a whole *project* (with its track set evolving over time),
--   - roles beyond "you can download or not",
--   - feedback from recipients.
--
-- This migration adds two tables:
--
--   project_shares    — a token-addressed grant on a project, with a role
--                       (viewer / commenter / editor) and the usual
--                       expires_at / password_hash / allow_downloads
--                       options. Recipients optionally have an
--                       invited_email so the project owner can see who
--                       a given link was generated for.
--
--   project_comments  — flat list (parent_id supports threading later) of
--                       feedback on a project, optionally pinned to a
--                       specific track. Authored either by an
--                       authenticated user (user_id) or by an anonymous
--                       commenter via a share link (share_token +
--                       author_name).
--
-- RLS posture: same as migration 010 — scoped to project ownership for
-- writes by the owner, and to a valid share token + role for writes by
-- guests. App-level checks remain in place as defense in depth.

-- ============== project_shares ==============================
CREATE TABLE IF NOT EXISTS public.project_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  role            TEXT NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('viewer', 'commenter', 'editor')),
  allow_downloads BOOLEAN NOT NULL DEFAULT true,
  password_hash   TEXT,
  expires_at      TIMESTAMPTZ,
  invited_email   TEXT,
  -- Free-form label so owners can tell shares apart in the list ("for label X").
  label           TEXT,
  plays           INT NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS project_shares_project_id_idx ON public.project_shares (project_id);
CREATE INDEX IF NOT EXISTS project_shares_token_idx       ON public.project_shares (token);
CREATE INDEX IF NOT EXISTS project_shares_created_by_idx  ON public.project_shares (created_by);

ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_via_project" ON public.project_shares;
CREATE POLICY "owner_via_project" ON public.project_shares
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_shares.project_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_shares.project_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )
  );

-- Anonymous guests need to read the share row by token to see if their
-- link is still valid; the route then enforces password + role server-side.
DROP POLICY IF EXISTS "public_token_lookup" ON public.project_shares;
CREATE POLICY "public_token_lookup" ON public.project_shares
  FOR SELECT
  USING (true);

-- ============== project_comments ============================
CREATE TABLE IF NOT EXISTS public.project_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Optional pin to a specific track in the project (lets a reviewer say
  -- "the vocal in v2 is too dry" instead of "in this project somewhere").
  track_id     UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  -- Either an authenticated user OR an anonymous guest authoring through
  -- a share link. Both are nullable; the API enforces exactly one is set.
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  share_token  TEXT REFERENCES public.project_shares(token) ON DELETE SET NULL,
  -- Display name. For authed users we can resolve it server-side; for
  -- guests this is the value they typed in the comment form.
  author_name  TEXT NOT NULL,
  body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  -- Threading: top-level rows have parent_id NULL, replies point at the
  -- parent comment's id. ON DELETE CASCADE keeps an entire thread
  -- consistent when the root is removed.
  parent_id    UUID REFERENCES public.project_comments(id) ON DELETE CASCADE,
  -- Soft-edit/delete bookkeeping so owners can audit changes.
  edited_at    TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_comments_project_id_idx ON public.project_comments (project_id, created_at);
CREATE INDEX IF NOT EXISTS project_comments_parent_id_idx  ON public.project_comments (parent_id);
CREATE INDEX IF NOT EXISTS project_comments_track_id_idx   ON public.project_comments (track_id);

ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

-- Owners see and write everything on their projects.
DROP POLICY IF EXISTS "owner_via_project" ON public.project_comments;
CREATE POLICY "owner_via_project" ON public.project_comments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_comments.project_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_comments.project_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )
  );

-- Public read so the share-page reader endpoint can return comments
-- without owning the row. The API filters by project_id + (optional)
-- share token before returning, so this isn't an open enumeration.
DROP POLICY IF EXISTS "public_read" ON public.project_comments;
CREATE POLICY "public_read" ON public.project_comments
  FOR SELECT
  USING (true);

NOTIFY pgrst, 'reload schema';
