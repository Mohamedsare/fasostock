-- Champ "Activité" (secteur d'activité) pour la facture A4, affiché après le slogan.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS activity TEXT;

COMMENT ON COLUMN public.stores.activity IS 'Secteur d''activité / Activité (affiché sur la facture A4 après le slogan)';
