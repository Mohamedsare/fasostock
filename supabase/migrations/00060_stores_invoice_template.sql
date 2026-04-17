-- Choix du modèle d'en-tête pour la facture A4 : classique (défaut) ou ELOF (E L O F, ordre fixe, Orange money en orange).
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS invoice_template TEXT NOT NULL DEFAULT 'classic';

COMMENT ON COLUMN public.stores.invoice_template IS 'Modèle facture A4 : classic = en-tête actuel, elof = en-tête style E L O F (ordre fixe, Orange money en orange)';
