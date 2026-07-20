-- Activité « Ventes d'engins » (motos, voitures) — slug `vente-engins`
-- (aligné appweb `lib/config/business-types.ts`).
--
-- Objectif : les boutiques d'une entreprise ayant choisi cette activité à
-- l'inscription doivent avoir NATIVEMENT les modules « Vente Engins »
-- (stores.engine_sales_enabled) et « Immatriculation Engins »
-- (stores.engine_registration_enabled) activés — sans intervention du super admin.
--
-- Mécanique : trigger BEFORE INSERT sur `stores` qui active les deux flags quand
-- l'entreprise propriétaire a business_type_slug = 'vente-engins'. Couvre la 1re
-- boutique (via create_company_with_owner, qui insère la company AVANT le store)
-- ET toute boutique ajoutée par la suite. Le super admin peut toujours désactiver
-- un flag ensuite (UPDATE) — le trigger n'agit qu'à la création.

CREATE OR REPLACE FUNCTION public.stores_apply_activity_engine_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  SELECT business_type_slug INTO v_slug
  FROM public.companies
  WHERE id = NEW.company_id;

  IF v_slug = 'vente-engins' THEN
    NEW.engine_sales_enabled := true;
    NEW.engine_registration_enabled := true;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stores_apply_activity_engine_flags IS
  'Active nativement Vente Engins + Immatriculation sur les boutiques des entreprises '
  'dont l''activité (business_type_slug) est ''vente-engins''. S''applique à la création '
  'du store (BEFORE INSERT) ; le super admin peut désactiver ensuite.';

DROP TRIGGER IF EXISTS stores_apply_activity_engine_flags ON public.stores;
CREATE TRIGGER stores_apply_activity_engine_flags
  BEFORE INSERT ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.stores_apply_activity_engine_flags();

-- Rattrapage (idempotent) : boutiques existantes d'entreprises déjà en 'vente-engins'.
UPDATE public.stores s
SET
  engine_sales_enabled = true,
  engine_registration_enabled = true
FROM public.companies c
WHERE c.id = s.company_id
  AND c.business_type_slug = 'vente-engins'
  AND (s.engine_sales_enabled = false OR s.engine_registration_enabled = false);
