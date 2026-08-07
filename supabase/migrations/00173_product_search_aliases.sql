-- FasoStock — « Autres noms » d'un produit : les appellations locales du même article.
--
-- Problème : un même produit ne porte pas le même nom d'un client à l'autre, ni d'un
-- vendeur à l'autre. « Omo » / « savon en poudre » / « détergent », « Maggi » / « cube »,
-- « bidon 20 L » / « jerricane ». Le catalogue, lui, n'a qu'un seul nom. Résultat : le
-- caissier tape ce que le client dit, ne trouve rien, et crée un doublon.
--
-- Réponse volontairement minimale : une LISTE D'ALIAS sur le produit
-- (`products.search_aliases`, 4 au maximum → 5 noms en tout avec le nom principal).
-- Ces alias ne sont QUE des clés de recherche :
--   • le nom affiché reste `products.name` — tickets, factures, rapports, exports :
--     rien ne change nulle part ;
--   • aucun autre écran ne lit cette colonne.
--
-- Activation : DÉSACTIVÉ PAR DÉFAUT, ouvert par le PROPRIÉTAIRE lui-même dans
-- Paramètres (`companies.product_aliases_enabled`) — comme les Emplacements, pas
-- besoin du super admin. Tant que le drapeau est faux : la saisie est masquée dans
-- le formulaire produit ET la recherche ignore les alias. Le désactiver ne détruit
-- donc rien : les alias déjà saisis dorment et reviennent tels quels à la réactivation.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drapeau d'activation (entreprise, réglé par le propriétaire)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS product_aliases_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.product_aliases_enabled IS
  'Fonction « Autres noms » du produit (alias de recherche). Désactivée par défaut, '
  'activée par le PROPRIÉTAIRE dans Paramètres (RPC company_set_product_aliases_enabled).';

-- Garde du drapeau : la policy `companies_update` laisse tout membre écrire sur la
-- ligne entreprise. On réutilise le garde des drapeaux propriétaire posé en 00167
-- (module Emplacements) en lui ajoutant ce second drapeau — même règle, même endroit.
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

  RETURN NEW;
END;
$$;

-- Le trigger existe déjà (00167) ; on le (re)pose pour que la migration soit
-- rejouable sur une base où 00167 aurait été appliquée partiellement.
DROP TRIGGER IF EXISTS companies_enforce_owner_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_owner_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.companies_enforce_owner_flags();

-- RPC d'écriture du drapeau (chemin normal de l'écran Paramètres).
CREATE OR REPLACE FUNCTION public.company_set_product_aliases_enabled(
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
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les autres noms de produits.';
  END IF;
  UPDATE public.companies
  SET product_aliases_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.company_set_product_aliases_enabled(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Les alias, sur le produit
-- ─────────────────────────────────────────────────────────────────────────────
-- Un `text[]` et non une table dédiée : la donnée est minuscule (≤ 4 courtes
-- chaînes), toujours lue avec le produit et jamais seule, jamais jointe, jamais
-- comptée. Une table aurait ajouté une jointure à CHAQUE chargement de catalogue
-- (caisse comprise) pour zéro bénéfice.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_aliases text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.products.search_aliases IS
  'Autres appellations du produit (4 maximum), utilisées UNIQUEMENT pour la recherche. '
  'Le nom affiché partout reste products.name. Normalisées par le trigger '
  'products_normalize_search_aliases (vidées, dédoublonnées, tronquées, plafonnées).';

-- Normalisation côté base : quel que soit le client (web, Flutter, import), la
-- colonne ne contient que des libellés propres, uniques (insensible à la casse),
-- différents du nom principal, et au plus 4.
CREATE OR REPLACE FUNCTION public.products_normalize_search_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_clean text[];
BEGIN
  IF NEW.search_aliases IS NULL THEN
    NEW.search_aliases := '{}'::text[];
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg(s.alias ORDER BY s.ord), '{}'::text[])
    INTO v_clean
  FROM (
    SELECT DISTINCT ON (lower(btrim(t.value)))
           left(btrim(t.value), 120) AS alias,
           t.ord
    FROM unnest(NEW.search_aliases) WITH ORDINALITY AS t(value, ord)
    WHERE btrim(COALESCE(t.value, '')) <> ''
      AND lower(btrim(t.value)) <> lower(btrim(COALESCE(NEW.name, '')))
    ORDER BY lower(btrim(t.value)), t.ord
  ) s;

  IF array_length(v_clean, 1) > 4 THEN
    v_clean := v_clean[1:4];
  END IF;

  NEW.search_aliases := v_clean;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_normalize_search_aliases_trigger ON public.products;
CREATE TRIGGER products_normalize_search_aliases_trigger
  BEFORE INSERT OR UPDATE OF search_aliases, name ON public.products
  FOR EACH ROW
  EXECUTE PROCEDURE public.products_normalize_search_aliases();

-- Filet de sécurité (le trigger plafonne déjà) : aucune ligne ne peut dépasser 4 alias.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_search_aliases_max'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_search_aliases_max
      CHECK (search_aliases IS NULL OR cardinality(search_aliases) <= 4);
  END IF;
END;
$$;
