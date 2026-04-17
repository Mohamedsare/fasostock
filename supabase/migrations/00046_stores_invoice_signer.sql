-- Bloc signataire en bas de la dernière page de la facture A4 (titre + nom ; signature et cachet à la main)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS invoice_signer_title TEXT,
  ADD COLUMN IF NOT EXISTS invoice_signer_name TEXT;

COMMENT ON COLUMN public.stores.invoice_signer_title IS 'Titre du signataire affiché en bas de la facture A4 (ex. Directeur General)';
COMMENT ON COLUMN public.stores.invoice_signer_name IS 'Nom du signataire affiché sous le titre (ex. M. MAHAMADI ELOF)';
