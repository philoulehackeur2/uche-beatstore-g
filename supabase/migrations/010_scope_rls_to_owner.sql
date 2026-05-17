-- Tighten RLS so reads match the write semantics enforced by
-- requireRowOwnership() in src/lib/auth/ownership.ts.
--
-- Migration 002 set policies to USING (true) for tracks/playlists/
-- playlist_tracks so demo content was visible to everyone. The mutation
-- routes were later gated to "auth.uid() = user_id OR user_id IS NULL"
-- via service-role + manual check, but the read policies stayed open. Net
-- effect for an authenticated user: their library shows other users'
-- tracks they cannot edit, and clicking edit returns 403 Forbidden — the
-- exact bug being patched in app code by /api/tracks GET scoping.
--
-- This migration aligns the database to that intent so we don't have to
-- depend on every new endpoint remembering to filter by user_id. App-level
-- scoping stays in place as defense in depth — if you ever revert this
-- migration, the routes still behave correctly.

-- Every block below drops BOTH the legacy policy name AND the new policy
-- name before CREATE, so the migration is idempotent — you can safely
-- re-run it after a partial application without "policy already exists"
-- collisions.

-- tracks ---------------------------------------------------------------
DROP POLICY IF EXISTS "public and team access" ON public.tracks;
DROP POLICY IF EXISTS "owner_or_legacy_null" ON public.tracks;
CREATE POLICY "owner_or_legacy_null" ON public.tracks
  FOR ALL
  USING (user_id IS NULL OR auth.uid() = user_id)
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- playlists ------------------------------------------------------------
DROP POLICY IF EXISTS "public and team access" ON public.playlists;
DROP POLICY IF EXISTS "owner_or_legacy_null" ON public.playlists;
CREATE POLICY "owner_or_legacy_null" ON public.playlists
  FOR ALL
  USING (user_id IS NULL OR auth.uid() = user_id)
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- playlist_tracks ------------------------------------------------------
-- Junction table — gate by ownership of the parent playlist.
DROP POLICY IF EXISTS "public and team access" ON public.playlist_tracks;
DROP POLICY IF EXISTS "owner_via_playlist" ON public.playlist_tracks;
CREATE POLICY "owner_via_playlist" ON public.playlist_tracks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_tracks.playlist_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_tracks.playlist_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )
  );

-- project_tracks (migration 003 left this fully open with USING(true)) -
DROP POLICY IF EXISTS "public and team access" ON public.project_tracks;
DROP POLICY IF EXISTS "owner_via_project" ON public.project_tracks;
CREATE POLICY "owner_via_project" ON public.project_tracks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_tracks.project_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_tracks.project_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )
  );

-- track_versions (also wide-open from migration 003) -------------------
-- Gate via the parent track. Snapshots inherit the parent's ownership.
DROP POLICY IF EXISTS "public and team access" ON public.track_versions;
DROP POLICY IF EXISTS "owner_via_track" ON public.track_versions;
CREATE POLICY "owner_via_track" ON public.track_versions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tracks t
      WHERE t.id = track_versions.track_id
        AND (t.user_id IS NULL OR t.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tracks t
      WHERE t.id = track_versions.track_id
        AND (t.user_id IS NULL OR t.user_id = auth.uid())
    )
  );

-- contacts (CRM) -------------------------------------------------------
-- Migration 008 added user_id; the inherited "team only" policy still let
-- anyone in team_members see every other user's CRM. Replace with strict
-- ownership.
DROP POLICY IF EXISTS "team only" ON public.contacts;
DROP POLICY IF EXISTS "owner_or_legacy_null" ON public.contacts;
CREATE POLICY "owner_or_legacy_null" ON public.contacts
  FOR ALL
  USING (user_id IS NULL OR auth.uid() = user_id)
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- calendar_events ------------------------------------------------------
-- user_id is NOT NULL on this table — no need for the legacy-null branch.
DROP POLICY IF EXISTS "team only" ON public.calendar_events;
DROP POLICY IF EXISTS "owner_only" ON public.calendar_events;
CREATE POLICY "owner_only" ON public.calendar_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- beat_sends -----------------------------------------------------------
-- No user_id column; ownership flows through contacts.user_id.
DROP POLICY IF EXISTS "team only" ON public.beat_sends;
DROP POLICY IF EXISTS "owner_via_contact" ON public.beat_sends;
CREATE POLICY "owner_via_contact" ON public.beat_sends
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = beat_sends.contact_id
        AND (c.user_id IS NULL OR c.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = beat_sends.contact_id
        AND (c.user_id IS NULL OR c.user_id = auth.uid())
    )
  );

-- share_links ---------------------------------------------------------
-- Migration 008 added user_id. Owner full-access; the public can still
-- look up by token via the existing "public read session" policy.
DROP POLICY IF EXISTS "team only" ON public.share_links;
DROP POLICY IF EXISTS "owner_or_legacy_null" ON public.share_links;
CREATE POLICY "owner_or_legacy_null" ON public.share_links
  FOR ALL
  USING (user_id IS NULL OR auth.uid() = user_id)
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
