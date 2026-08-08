-- Transferts inter-boutiques et Prédictions IA : modules ADDITIFS.
-- Auparavant soustractifs (ouverts à tous, coupés à la main par le super admin) :
-- désormais fermés à la création, le super admin les ouvre au cas par cas
-- (Admin › Fonctionnalités). Seules les entreprises créées APRÈS cette migration
-- sont concernées — les entreprises existantes gardent leur réglage actuel.

ALTER TABLE public.companies
  ALTER COLUMN transfers_feature_enabled SET DEFAULT false,
  ALTER COLUMN ai_predictions_enabled SET DEFAULT false;

COMMENT ON COLUMN public.companies.transfers_feature_enabled IS
  'Module Transferts inter-boutiques. Désactivé par défaut : ouvert par le super admin.';
COMMENT ON COLUMN public.companies.ai_predictions_enabled IS
  'Module Prédictions IA. Désactivé par défaut : ouvert par le super admin.';

-- Pour fermer aussi les entreprises DÉJÀ créées (décision produit, à lancer à la main) :
--   UPDATE public.companies SET transfers_feature_enabled = false, ai_predictions_enabled = false;
