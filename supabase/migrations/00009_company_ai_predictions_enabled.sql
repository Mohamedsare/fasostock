-- Super admin can enable/disable AI predictions per company.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ai_predictions_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.ai_predictions_enabled IS 'When false, super admin has disabled AI predictions for this company.';
