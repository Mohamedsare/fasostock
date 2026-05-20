-- Journal des emails transactionnels (Resend) — écriture serveur uniquement (service_role).

CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  resend_id TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

COMMENT ON TABLE public.email_logs IS 'Historique des emails envoyés via Resend (FasoStock).';
COMMENT ON COLUMN public.email_logs.template_key IS 'welcome, trial_started, trial_ending, subscription_paid, subscription_expired, etc.';
COMMENT ON COLUMN public.email_logs.status IS 'pending | sent | failed';

CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs (status);
CREATE INDEX IF NOT EXISTS idx_email_logs_template_key ON public.email_logs (template_key);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs (recipient);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_logs_select_super_admin ON public.email_logs;
CREATE POLICY email_logs_select_super_admin
  ON public.email_logs
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

GRANT SELECT ON public.email_logs TO authenticated;
