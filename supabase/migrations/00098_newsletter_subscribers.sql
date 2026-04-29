-- Abonnés newsletter depuis landing publique.

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_lower TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'landing_footer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.newsletter_subscribers IS 'Emails abonnés à la newsletter FasoStock.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_email_lower_unique
  ON public.newsletter_subscribers(email_lower);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created_at
  ON public.newsletter_subscribers(created_at DESC);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS newsletter_subscribers_insert_public ON public.newsletter_subscribers;
CREATE POLICY newsletter_subscribers_insert_public
ON public.newsletter_subscribers
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS newsletter_subscribers_select_super_admin ON public.newsletter_subscribers;
CREATE POLICY newsletter_subscribers_select_super_admin
ON public.newsletter_subscribers
FOR SELECT
TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS newsletter_subscribers_delete_super_admin ON public.newsletter_subscribers;
CREATE POLICY newsletter_subscribers_delete_super_admin
ON public.newsletter_subscribers
FOR DELETE
TO authenticated
USING (public.is_super_admin());

GRANT INSERT ON public.newsletter_subscribers TO anon, authenticated;
GRANT SELECT, DELETE ON public.newsletter_subscribers TO authenticated;

