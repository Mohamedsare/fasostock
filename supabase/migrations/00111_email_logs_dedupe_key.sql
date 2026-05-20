-- Idempotence des envois transactionnels (évite les doublons welcome, trial_ending, etc.).

ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

COMMENT ON COLUMN public.email_logs.dedupe_key IS 'Clé unique logique (ex. welcome:<company_id>).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_dedupe_key_unique
  ON public.email_logs (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
