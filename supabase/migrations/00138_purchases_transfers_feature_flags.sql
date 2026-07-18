-- Flags plateforme (super admin) pour masquer des modules par entreprise :
-- Achats et Transferts. Le module Magasin dispose déjà de warehouse_feature_enabled.
-- Défaut = true (activé) ; le super admin met à false pour masquer.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS purchases_feature_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS transfers_feature_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.purchases_feature_enabled IS
  'Module Achats — masquable par la plateforme (super admin). Défaut activé.';
COMMENT ON COLUMN public.companies.transfers_feature_enabled IS
  'Module Transferts — masquable par la plateforme (super admin). Défaut activé.';
