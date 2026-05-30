-- 068_buyer_offers.sql
-- "Make an offer" on exclusive beats. Buyers submit a price + message; the
-- producer sees it (notification + this table) and can accept/counter/decline
-- out-of-band (email reply for v1). This is how exclusive beats actually sell —
-- negotiation rather than a fixed Buy Now.
--
-- seller_user_id is denormalized so the producer can list their offers without
-- joining through tracks (same pattern as license_purchases, mig 049).
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.buyer_offers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id         uuid        NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  track_title      text,
  buyer_email      text        NOT NULL,
  offered_price_usd numeric     NOT NULL CHECK (offered_price_usd >= 0),
  message          text,
  status           text        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'countered', 'declined')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buyer_offers_seller
  ON public.buyer_offers (seller_user_id, created_at DESC);

ALTER TABLE public.buyer_offers ENABLE ROW LEVEL SECURITY;

-- Producer reads + updates (accept/decline) their own offers. Inserts come
-- from the public store via the service-role API after validating input.
DROP POLICY IF EXISTS "seller manages own offers" ON public.buyer_offers;
CREATE POLICY "seller manages own offers" ON public.buyer_offers
  FOR ALL USING (seller_user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
