-- 052_license_needs_stems.sql
--
-- Exclusive purchases used to be blocked at checkout when the underlying
-- track had no WAV and no ready stems. The new policy is: allow the
-- buyer to pay, tag the purchase as "awaiting stems", and notify the
-- producer to upload. This column tracks that state so /sales can
-- surface a badge and the producer can act on it.
--
-- false (default) = nothing special; true = producer needs to upload
-- WAV/stems before the buyer's delivery is complete. The buyer's
-- download URL still works for whatever exists today (MP3); the WAV
-- + stems become available once the producer uploads them and flips
-- this flag back to false.
--
-- Idempotent.

ALTER TABLE public.license_purchases
  ADD COLUMN IF NOT EXISTS needs_stems_upload boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_license_purchases_needs_stems
  ON public.license_purchases (seller_user_id, needs_stems_upload)
  WHERE needs_stems_upload = true;

NOTIFY pgrst, 'reload schema';
