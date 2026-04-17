-- Fonctionnalités pilotées par la plateforme (super admin) : module Magasin, augmentation quota boutiques.
-- `ai_predictions_enabled` existait déjà (00009).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS warehouse_feature_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_quota_increase_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.warehouse_feature_enabled IS
  'Si false, le module dépôt Magasin est masqué / désactivé pour cette entreprise.';
COMMENT ON COLUMN public.companies.store_quota_increase_enabled IS
  'Si false, le quota de boutiques ne peut pas être augmenté (hors super admin selon politique — appliqué côté API + trigger).';

-- Garde : seuls les super admins modifient les interrupteurs plateforme ;
-- les membres ne peuvent pas augmenter store_quota si désactivé.
CREATE OR REPLACE FUNCTION public.companies_enforce_platform_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.warehouse_feature_enabled IS DISTINCT FROM OLD.warehouse_feature_enabled
     OR NEW.store_quota_increase_enabled IS DISTINCT FROM OLD.store_quota_increase_enabled
     OR NEW.ai_predictions_enabled IS DISTINCT FROM OLD.ai_predictions_enabled
  THEN
    RAISE EXCEPTION 'Modification réservée à l''administration plateforme.';
  END IF;

  IF NEW.store_quota IS DISTINCT FROM OLD.store_quota THEN
    IF NEW.store_quota > OLD.store_quota AND NOT COALESCE(OLD.store_quota_increase_enabled, true) THEN
      RAISE EXCEPTION 'L''augmentation du quota de boutiques est désactivée pour cette entreprise.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_platform_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_platform_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.companies_enforce_platform_flags();
