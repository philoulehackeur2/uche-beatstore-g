-- 055_creator_seo.sql
--
-- Storefront-level SEO + social-card overrides. We already generate
-- per-track and per-producer OG metadata; this lets the producer
-- override the storefront-root title + description + og:image used
-- when /store itself is shared (so Twitter/iMessage embeds aren't
-- just "U2C Beatstore" + the producer hero).
--
-- All three fields are optional. The /store layout's generateMetadata
-- falls back to sensible defaults when null.
--
-- Idempotent.

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS og_image_url text;

NOTIFY pgrst, 'reload schema';
