-- 092_contact_crm_status.sql
-- Editable CRM lifecycle stage for contacts (HubSpot-style), distinct from the
-- auto-computed activity tone (active/engaged/cold derived from send recency).
--
-- Nullable: when null, the UI falls back to the derived activity tone for display.
-- Allowed values (prospect/active/engaged/cold/archived) are enforced in Zod, not a
-- CHECK constraint, so adding future stages needs no migration.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS crm_status text;

NOTIFY pgrst, 'reload schema';
