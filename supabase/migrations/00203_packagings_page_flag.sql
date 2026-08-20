-- FasoStock — Page « Conditionnements » : drapeau d'activation par entreprise.
--
-- La page /conditionnements montre tout le catalogue par le paquet et le carton, et
-- laisse remplir ou corriger ces lots produit par produit sans ouvrir deux cents
-- fiches. Elle ne crée aucune donnée nouvelle : elle édite `product_packagings`
-- (migration 00129), exactement comme la fiche produit.
--
-- POURQUOI UN DRAPEAU, ET POURQUOI FERMÉ PAR DÉFAUT
-- Beaucoup de commerces ne vendent qu'à la pièce : ni carton, ni sachet, ni prix de
-- gros. Pour eux, cette entrée de menu est une question sans objet — et une entrée de
-- menu qu'on ne comprend pas coûte plus cher qu'elle ne rapporte. Le propriétaire
-- l'ouvre s'il achète en gros et revend au détail.
--
-- Fermer la page ne supprime RIEN : les conditionnements déjà enregistrés restent en
-- base, la caisse continue de les proposer, et la fiche produit garde sa section.
-- Seule l'entrée de menu (et l'accès à la route) disparaît.
--
-- 100 % additif : une colonne, aucune table modifiée, aucune donnée touchée.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Le drapeau (entreprise, réglé par le PROPRIÉTAIRE)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS packagings_page_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.packagings_page_enabled IS
  'Page « Conditionnements » (/conditionnements) : remplir carton/paquet/sachet pour '
  'tout le catalogue d''un seul écran. Désactivée par défaut, activée par le '
  'PROPRIÉTAIRE dans Paramètres (RPC company_set_packagings_page_enabled).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Garde des drapeaux propriétaire — posée en 00167, étendue en 00173, 00174,
--    00182, 00191, 00193 puis 00201 : huitième drapeau, même règle, même trigger.
--    (La fonction est recréée en entier : `CREATE OR REPLACE` remplace le corps.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.companies_enforce_owner_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.product_locations_enabled IS DISTINCT FROM OLD.product_locations_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver le module Emplacements.';
  END IF;

  IF NEW.product_aliases_enabled IS DISTINCT FROM OLD.product_aliases_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les autres noms de produits.';
  END IF;

  IF NEW.landed_cost_enabled IS DISTINCT FROM OLD.landed_cost_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver le module Prix de revient.';
  END IF;

  IF NEW.custom_expenses_enabled IS DISTINCT FROM OLD.custom_expenses_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut personnaliser les dépenses.';
  END IF;

  IF NEW.dual_cashier_enabled IS DISTINCT FROM OLD.dual_cashier_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver la caisse à deux.';
  END IF;

  IF NEW.quick_supply_enabled IS DISTINCT FROM OLD.quick_supply_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver l''approvisionnement rapide.';
  END IF;

  IF NEW.sale_documents_enabled IS DISTINCT FROM OLD.sale_documents_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les devis et factures.';
  END IF;

  IF NEW.packagings_page_enabled IS DISTINCT FROM OLD.packagings_page_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver la page Conditionnements.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_owner_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_owner_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.companies_enforce_owner_flags();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. La bascule, réservée au propriétaire
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.company_set_packagings_page_enabled(
  p_company_id uuid,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT (public.is_super_admin() OR public.user_is_company_owner(p_company_id)) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver la page Conditionnements.';
  END IF;
  UPDATE public.companies
  SET packagings_page_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.company_set_packagings_page_enabled(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_set_packagings_page_enabled(uuid, boolean) TO authenticated;
