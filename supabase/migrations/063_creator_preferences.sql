-- 063_creator_preferences.sql
-- Per-producer workspace preferences persisted to creator_profiles so
-- they survive page reloads. Both columns are boolean with sensible
-- defaults matching the prior hard-coded values in ToggleRow.
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS lossless_exports boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_tagging     boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
