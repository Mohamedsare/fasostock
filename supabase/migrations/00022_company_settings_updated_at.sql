-- company_settings avait un trigger set_updated_at mais pas de colonne updated_at,
-- ce qui faisait échouer les UPDATE (dont l'upsert du paramètre seuil d'alerte stock).
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.company_settings.updated_at IS 'Défini par le trigger set_updated_at.';
