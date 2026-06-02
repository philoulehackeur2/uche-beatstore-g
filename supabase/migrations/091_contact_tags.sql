-- 091_contact_tags.sql
-- Free-form tags for contacts — the core "find / regroup contacts" mechanism.
-- Mirrors project_tags / playlist_tags. A contact can carry many tags
-- (e.g. "drill", "atlanta", "vip", "paid-before", "needs-followup").

CREATE TABLE IF NOT EXISTS public.contact_tags (
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  category   text,
  PRIMARY KEY (contact_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON public.contact_tags (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON public.contact_tags (tag);

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_tags_via_parent ON public.contact_tags;
CREATE POLICY contact_tags_via_parent ON public.contact_tags
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_tags.contact_id
      AND (c.user_id IS NULL OR c.user_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_tags.contact_id
      AND (c.user_id IS NULL OR c.user_id = auth.uid())
  ));

NOTIFY pgrst, 'reload schema';
