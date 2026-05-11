-- KPIs « Valeur au prix d'achat / vente » sur le tableau de bord dépôt Magasin — visibilité pilotée par la plateforme.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS warehouse_kpi_show_purchase_value boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS warehouse_kpi_show_sale_value boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.warehouse_kpi_show_purchase_value IS
  'Si false, la carte KPI « Valeur au prix d''achat » est masquée dans le dépôt Magasin (web + mobile).';
COMMENT ON COLUMN public.companies.warehouse_kpi_show_sale_value IS
  'Si false, la carte KPI « Valeur au prix de vente » est masquée dans le dépôt Magasin (web + mobile).';

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
     OR NEW.warehouse_kpi_show_purchase_value IS DISTINCT FROM OLD.warehouse_kpi_show_purchase_value
     OR NEW.warehouse_kpi_show_sale_value IS DISTINCT FROM OLD.warehouse_kpi_show_sale_value
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
