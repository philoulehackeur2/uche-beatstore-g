-- 040_creator_slug.sql
-- Adds a URL-safe slug to creator_profiles so producers can have
-- a vanity URL like /store/producer/nyne-shi.
-- Slug is generated from display_name on first save if not provided.

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS slug text DEFAULT NULL UNIQUE;

-- Index for fast lookup by slug (public-facing route)
CREATE INDEX IF NOT EXISTS idx_creator_profiles_slug ON public.creator_profiles(slug);

NOTIFY pgrst, 'reload schema';
