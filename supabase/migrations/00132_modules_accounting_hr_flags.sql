-- Modules ERP pilotés par la plateforme (super admin) : Comptabilité (SYSCOHADA) et R. Humaine + Paie.
-- Désactivés par DÉFAUT (contrairement à warehouse_feature_enabled) : le super admin les active par entreprise.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS accounting_module_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_module_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.accounting_module_enabled IS
  'Si true, le module Comptabilité (SYSCOHADA) est visible / actif pour cette entreprise. Défaut false.';
COMMENT ON COLUMN public.companies.hr_module_enabled IS
  'Si true, le module R. Humaine + Paie est visible / actif pour cette entreprise. Défaut false.';

-- Étend la garde plateforme (00088) : seuls les super admins modifient ces interrupteurs.
CREATE OR REPLACE FUNCTION public.companies_enforce_platform_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
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
     OR NEW.accounting_module_enabled IS DISTINCT FROM OLD.accounting_module_enabled
     OR NEW.hr_module_enabled IS DISTINCT FROM OLD.hr_module_enabled
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
