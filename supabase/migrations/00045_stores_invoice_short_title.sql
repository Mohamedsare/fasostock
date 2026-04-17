-- Titre court / acronyme affiché en tête de la facture A4 (ex. E L O F)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS invoice_short_title TEXT;

COMMENT ON COLUMN public.stores.invoice_short_title IS 'Titre court ou acronyme affiché en haut à droite sur la facture A4 (ex. E L O F)';
