-- Champ "Mobile money" (optionnel) pour la facture A4, affiché après Activité.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS mobile_money TEXT;

COMMENT ON COLUMN public.stores.mobile_money IS 'Numéro ou compte Mobile money (affiché sur la facture A4 si renseigné)';
