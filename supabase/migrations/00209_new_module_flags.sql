-- FasoStock — Cinq nouveaux modules : leur COUCHE D'ACTIVATION, et rien d'autre.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POURQUOI CE FICHIER NE CONTIENT AUCUNE TABLE
-- ═════════════════════════════════════════════════════════════════════════════
-- Les cinq modules qui suivent arrivent avec leurs propres migrations (00210 à
-- 00213). Leurs DRAPEAUX d'activation, eux, sont regroupés ici — et c'est une
-- décision de robustesse, pas de rangement.
--
-- Le contexte applicatif (`lib/features/common/app-context.ts`) lit les colonnes de
-- `companies` en UNE requête. Cette lecture-là n'est pas une lecture parmi d'autres :
-- sans elle, il n'y a ni menu, ni droits, ni application. Le code partant souvent en
-- production avant que la migration ne soit jouée, il demande les colonnes récentes de
-- façon optimiste et rejoue la requête sans elles à la première erreur « colonne
-- inconnue » — chaque colonne suivie séparément coûtant un aller-retour de plus.
--
-- Cinq colonnes réparties sur cinq fichiers, ce sont cinq états intermédiaires
-- possibles et cinq compteurs à tenir. Cinq colonnes dans UN fichier, c'est un seul
-- état (« ce lot est passé, ou il ne l'est pas ») et un seul repli. Les tables des
-- migrations suivantes peuvent, elles, manquer sans conséquence : leur module est
-- éteint, donc personne ne les interroge.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LES CINQ MODULES
-- ═════════════════════════════════════════════════════════════════════════════
--
--  employee_photos_enabled ......... « Photos produits ». L'employé voit le catalogue
--      et ne peut RIEN y faire d'autre que prendre les articles en photo. Le patron
--      passe ses soirées à photographier son stock ; son vendeur, lui, tient l'article
--      dans la main toute la journée. Cette page confie la photo sans confier la fiche.
--
--  employee_draft_products_enabled . « Produit ajouté par un employé, sans prix ».
--      L'employé déballe un carton et saisit les articles pendant qu'il les a sous les
--      yeux. Il ne voit ni prix d'achat ni prix de vente — donc ni la marge du patron.
--      Le produit reste INOPÉRANT (invendable) jusqu'à ce que le patron pose son prix.
--
--  partner_offtakes_enabled ........ « Enlèvements partenaires ». L'exact opposé de
--      l'Approvisionnement : là où celui-ci enregistre la marchandise que le commerçant
--      VA PRENDRE chez un confrère, celui-ci enregistre la marchandise qu'un confrère
--      VIENT PRENDRE chez lui — avec ce qui est payé, ce qui reste dû, et le papier
--      qu'on lui remet.
--
--  credit_reminders_enabled ........ « Rappels de crédit ». L'application rappelle
--      d'elle-même qui doit combien, à la fréquence choisie, et propose un message
--      courtois prêt à partir sur WhatsApp.
--
--  shipments_enabled ............... « Expéditions ». Le grossiste facture, sort la
--      marchandise et l'expédie vers un client de province. Les FRAIS D'EXPÉDITION
--      qu'il avance sont suivis à part et se réclament, eux aussi, par un message.
--
-- Tous les cinq sont FERMÉS par défaut. Une entreprise déjà en service ne voit donc
-- strictement aucun changement tant que son propriétaire n'a rien demandé.
--
-- 100 % additif : cinq colonnes, quatre lignes de permissions, aucune table modifiée,
-- aucune donnée touchée.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Les cinq drapeaux (entreprise, réglés par le PROPRIÉTAIRE)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS employee_photos_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS employee_draft_products_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_offtakes_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_reminders_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipments_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.employee_photos_enabled IS
  'Page « Photos produits » (/photos-produits) : l''employé illustre le catalogue sans '
  'pouvoir modifier quoi que ce soit d''autre. Fermée par défaut, ouverte par le '
  'PROPRIÉTAIRE dans Paramètres (RPC company_set_employee_photos_enabled).';
COMMENT ON COLUMN public.companies.employee_draft_products_enabled IS
  'L''employé peut créer un produit SANS prix (products.awaiting_pricing = true). Le '
  'produit reste invendable jusqu''à ce que le propriétaire pose son prix de vente. '
  'Fermé par défaut (RPC company_set_employee_draft_products_enabled).';
COMMENT ON COLUMN public.companies.partner_offtakes_enabled IS
  'Module « Enlèvements partenaires » (/enlevements) : la marchandise qu''un confrère '
  'vient prendre, ce qu''il paie et ce qu''il doit. Fermé par défaut '
  '(RPC company_set_partner_offtakes_enabled).';
COMMENT ON COLUMN public.companies.credit_reminders_enabled IS
  'Module « Rappels de crédit » (/rappels-credit) : relances des clients endettés, à la '
  'fréquence choisie par le propriétaire. Fermé par défaut '
  '(RPC company_set_credit_reminders_enabled).';
COMMENT ON COLUMN public.companies.shipments_enabled IS
  'Module « Expéditions » (/expeditions) : envoi de marchandise vers un client éloigné '
  'et suivi des frais d''expédition avancés. Fermé par défaut '
  '(RPC company_set_shipments_enabled).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Garde des drapeaux propriétaire
-- ─────────────────────────────────────────────────────────────────────────────
-- Posée en 00167, étendue en 00173, 00174, 00182, 00191, 00193, 00201 puis 00203.
-- Cinq drapeaux de plus, même règle, même trigger. (La fonction est recréée en
-- entier : `CREATE OR REPLACE` remplace le corps — les huit tests existants sont donc
-- recopiés à l'identique ci-dessous, ne pas en retirer un seul.)
--
-- La policy d'UPDATE de `companies` est ouverte à tout membre de l'entreprise depuis
-- 00002. C'est ce trigger, et lui seul, qui empêche un caissier de s'ouvrir un module
-- en un appel REST. Un drapeau ajouté sans sa clause ici serait donc modifiable par
-- n'importe qui — ce n'est pas une formalité.
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

  -- ── Les cinq nouveaux (00209) ──────────────────────────────────────────────
  IF NEW.employee_photos_enabled IS DISTINCT FROM OLD.employee_photos_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut ouvrir ou fermer la page Photos produits.';
  END IF;

  IF NEW.employee_draft_products_enabled IS DISTINCT FROM OLD.employee_draft_products_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut autoriser ses employés à ajouter des produits.';
  END IF;

  IF NEW.partner_offtakes_enabled IS DISTINCT FROM OLD.partner_offtakes_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les enlèvements partenaires.';
  END IF;

  IF NEW.credit_reminders_enabled IS DISTINCT FROM OLD.credit_reminders_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les rappels de crédit.';
  END IF;

  IF NEW.shipments_enabled IS DISTINCT FROM OLD.shipments_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les expéditions.';
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
-- 3. Les cinq bascules, réservées au propriétaire
-- ─────────────────────────────────────────────────────────────────────────────
-- Une RPC par drapeau plutôt qu'un UPDATE depuis l'écran : le trigger ci-dessus
-- refuserait bien l'écriture d'un employé, mais avec un message PostgreSQL brut. La
-- RPC pose le refus en français, et rend la règle lisible à qui relit le code client.

CREATE OR REPLACE FUNCTION public.company_set_employee_photos_enabled(
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
    RAISE EXCEPTION 'Seul le propriétaire peut ouvrir ou fermer la page Photos produits.';
  END IF;
  UPDATE public.companies
  SET employee_photos_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_set_employee_draft_products_enabled(
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
    RAISE EXCEPTION 'Seul le propriétaire peut autoriser ses employés à ajouter des produits.';
  END IF;
  UPDATE public.companies
  SET employee_draft_products_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_set_partner_offtakes_enabled(
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
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les enlèvements partenaires.';
  END IF;
  UPDATE public.companies
  SET partner_offtakes_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_set_credit_reminders_enabled(
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
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les rappels de crédit.';
  END IF;
  UPDATE public.companies
  SET credit_reminders_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_set_shipments_enabled(
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
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les expéditions.';
  END IF;
  UPDATE public.companies
  SET shipments_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.company_set_employee_photos_enabled(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_set_employee_draft_products_enabled(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_set_partner_offtakes_enabled(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_set_credit_reminders_enabled(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_set_shipments_enabled(uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.company_set_employee_photos_enabled(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_set_employee_draft_products_enabled(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_set_partner_offtakes_enabled(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_set_credit_reminders_enabled(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_set_shipments_enabled(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Les quatre nouveaux droits
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key)
SELECT uuid_generate_v4(), k
FROM (VALUES
  ('products.photo'),
  ('products.draft_create'),
  ('partner_offtakes.manage'),
  ('shipments.manage')
) AS v(k)
ON CONFLICT (key) DO NOTHING;

/*
 * QUI LES REÇOIT PAR DÉFAUT — et pourquoi ce n'est pas « personne ».
 *
 * `quick_supply.create` (00193) n'est accordé à aucun rôle : il fait entrer du stock
 * réel et engage le prix de revient, le propriétaire l'ouvre donc nommément.
 *
 * Les deux droits catalogue ci-dessous sont d'une autre nature. Ils ne déplacent ni
 * argent ni stock : l'un ajoute une photo, l'autre crée une fiche INVENDABLE tant que
 * le patron n'a pas posé de prix. Et ils n'existent que pour être exercés par l'équipe
 * — c'est leur objet même. Les laisser vides obligerait le propriétaire à ouvrir le
 * réglage PUIS à cocher une case pour chacun de ses six vendeurs, avec, entre les
 * deux, une page qui s'affiche et ne sert à rien. Ils sont donc donnés aux rôles qui
 * travaillent le catalogue et le rayon.
 *
 * Rien ne s'ouvre pour autant : le drapeau d'entreprise est fermé, et sans lui la page
 * n'apparaît pour personne. Le propriétaire garde la main — il la garde d'un seul
 * geste au lieu de sept.
 */
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.slug IN ('manager', 'store_manager', 'stock_manager', 'cashier')
  AND p.key IN ('products.photo', 'products.draft_create')
ON CONFLICT DO NOTHING;

/*
 * Les deux autres, en revanche, restent vides — comme `quick_supply.create`.
 *
 * `partner_offtakes.manage` sort de la marchandise du magasin et ouvre une créance ;
 * `shipments.manage` engage des frais avancés par la maison. Ce sont des décisions de
 * patron. Il les délègue s'il le souhaite, employé par employé, depuis la page
 * Employés — et le propriétaire, lui, les a de fait sans rien cocher
 * (`user_is_company_owner` court-circuite les permissions partout).
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Ce qui n'est PAS ici
-- ─────────────────────────────────────────────────────────────────────────────
-- La FRÉQUENCE des rappels de crédit (tous les jours, tous les trois jours, une fois
-- par semaine…) n'est pas un drapeau : c'est un réglage à plusieurs valeurs, qui va
-- changer souvent, et dont l'absence doit valoir « pas encore réglé » et non « faux ».
-- Il vit donc dans `company_settings` (clé `credit_reminders_config`), table dont
-- l'écriture est déjà réservée au propriétaire depuis 00207.
