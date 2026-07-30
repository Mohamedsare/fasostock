-- Module « Péremption » (DLC / DLUO) activable À LA DEMANDE par le super admin.
--
-- Jusqu'ici le suivi de péremption (page /peremption, lots à date limite, carte du
-- tableau de bord, capture de lot à la réception d'achat) était réservé aux métiers
-- « pharmacie » et « supermarche-alimentation », en dur dans `activity-config.ts`.
--
-- Certains clients d'autres métiers (quincaillerie avec peintures, cosmétiques,
-- boissons, agro…) ont le même besoin. On ajoute donc DEUX interrupteurs additifs :
--   * `companies.expiry_module_enabled` : toute l'entreprise ;
--   * `stores.expiry_module_enabled`    : une boutique en particulier.
--
-- Règle d'application (côté app) : le module est actif si le MÉTIER le prévoit déjà
-- OU si l'un des deux drapeaux est vrai. Les drapeaux n'enlèvent jamais rien : une
-- pharmacie garde son suivi de péremption même avec les deux drapeaux à false.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Entreprise entière
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS expiry_module_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.expiry_module_enabled IS
  'Si true, le suivi de péremption (page Péremptions, lots DLC/DLUO, alertes) est '
  'actif pour TOUTE l''entreprise, quel que soit son métier. Réservé au super admin. '
  'Additif : les métiers pharmacie / supermarché l''ont déjà sans ce drapeau.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Boutique par boutique
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS expiry_module_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.expiry_module_enabled IS
  'Suivi de péremption (DLC/DLUO) activé pour cette boutique — activable par le super '
  'admin depuis Admin › Boutiques. Défaut désactivé (le métier peut déjà l''activer).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Garde plateforme : seul le super admin bascule le drapeau entreprise
--    (étend 00132 — même corps, colonne `expiry_module_enabled` en plus).
-- ─────────────────────────────────────────────────────────────────────────────
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
     OR NEW.expiry_module_enabled IS DISTINCT FROM OLD.expiry_module_enabled
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
