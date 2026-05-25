-- 041_promo_codes.sql
-- Promo / discount codes for the storefront.
-- Each code belongs to a seller (creator) and can apply either a percentage
-- or a flat-amount discount to the cart total at checkout.

CREATE TABLE IF NOT EXISTS public.promo_codes (
  code               text PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Exactly one of these two should be non-zero:
  discount_percent   numeric(5,2) DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  discount_amount    numeric(10,2) DEFAULT 0 CHECK (discount_amount >= 0),
  -- Usage caps
  max_uses           integer DEFAULT NULL CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count         integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  -- Lifecycle
  active             boolean NOT NULL DEFAULT true,
  expires_at         timestamptz DEFAULT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Fast look-up by code (case-insensitive via lower())
CREATE INDEX IF NOT EXISTS idx_promo_codes_code_lower ON public.promo_codes(lower(code));
CREATE INDEX IF NOT EXISTS idx_promo_codes_user_id ON public.promo_codes(user_id);

-- RLS: only the owner can manage their promo codes
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promo_codes_select ON public.promo_codes;
DROP POLICY IF EXISTS promo_codes_insert ON public.promo_codes;
DROP POLICY IF EXISTS promo_codes_update ON public.promo_codes;
DROP POLICY IF EXISTS promo_codes_delete ON public.promo_codes;

CREATE POLICY promo_codes_select ON public.promo_codes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY promo_codes_insert ON public.promo_codes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY promo_codes_update ON public.promo_codes
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY promo_codes_delete ON public.promo_codes
  FOR DELETE USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.increment_promo_uses(code_input text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.promo_codes
  SET uses_count = uses_count + 1
  WHERE code = code_input;
END;
$$;

NOTIFY pgrst, 'reload schema';
