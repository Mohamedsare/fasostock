-- Rate limiting newsletter (clé IP hashée).

CREATE TABLE IF NOT EXISTS public.newsletter_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.newsletter_rate_limits IS 'Compteurs anti-abus pour newsletter.';

ALTER TABLE public.newsletter_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS newsletter_rate_limits_select_public ON public.newsletter_rate_limits;
CREATE POLICY newsletter_rate_limits_select_public
ON public.newsletter_rate_limits
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS newsletter_rate_limits_write_public ON public.newsletter_rate_limits;
CREATE POLICY newsletter_rate_limits_write_public
ON public.newsletter_rate_limits
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.newsletter_rate_limits TO anon, authenticated;

