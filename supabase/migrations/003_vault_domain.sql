-- 003_vault_domain.sql
-- Introduces the Vault / Location / Project domain model.
-- Non-destructive: keeps `playlists` table intact for the consumption layer,
-- adds `projects` (production workspace) and `track_versions` (Vault lineage).

-- Projects = DAW-style production workspaces
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cover_url TEXT,
    description TEXT,
    bpm_target INTEGER,
    key_target TEXT,
    status TEXT DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'final', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

-- Project tracks: which tracks a project uses, and in what role
CREATE TABLE IF NOT EXISTS public.project_tracks (
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE NOT NULL,
    role TEXT DEFAULT 'main'
        CHECK (role IN ('main', 'reference', 'stem_source', 'alternate')),
    position INTEGER NOT NULL DEFAULT 0,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (project_id, track_id)
);

-- Track versions: Vault-style lineage (immutable snapshots)
CREATE TABLE IF NOT EXISTS public.track_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE NOT NULL,
    version_number INTEGER NOT NULL,
    version_label TEXT NOT NULL,
    audio_url TEXT NOT NULL,
    duration_seconds INTEGER,
    bpm INTEGER,
    key TEXT,
    scale TEXT,
    loudness NUMERIC,
    energy NUMERIC,
    danceability NUMERIC,
    valence NUMERIC,
    acousticness NUMERIC,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE (track_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_track_versions_track_id ON public.track_versions(track_id);

-- updated_at trigger for projects
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_touch ON public.projects;
CREATE TRIGGER projects_touch
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_versions ENABLE ROW LEVEL SECURITY;

-- Permissive policies matching the 002_public_access.sql style
DROP POLICY IF EXISTS "public and team access" ON public.projects;
CREATE POLICY "public and team access" ON public.projects
    FOR ALL USING (user_id IS NULL OR public.is_team_member() OR auth.uid() = user_id)
    WITH CHECK (user_id IS NULL OR public.is_team_member() OR auth.uid() = user_id);

DROP POLICY IF EXISTS "public and team access" ON public.project_tracks;
CREATE POLICY "public and team access" ON public.project_tracks
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public and team access" ON public.track_versions;
CREATE POLICY "public and team access" ON public.track_versions
    FOR ALL USING (true) WITH CHECK (true);
