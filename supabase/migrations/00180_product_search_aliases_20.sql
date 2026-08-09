-- FasoStock — « Autres noms » d'un produit : le plafond passe de 4 à 20 alias.
--
-- Pourquoi : 4 alias suffisaient pour « Omo / savon en poudre », pas pour les
-- boutiques de pièces et de quincaillerie où un même article traîne une dizaine
-- d'appellations (nom local, marque, référence, abréviation, fautes courantes).
-- Le plafond était le seul frein : la donnée reste minuscule (20 courtes chaînes
-- lues avec le produit, jamais jointes, jamais comptées), donc on l'élargit
-- plutôt que de sortir une table dédiée.
--
-- Rien d'autre ne change : les alias restent des CLÉS DE RECHERCHE seules, le nom
-- affiché partout reste `products.name`, et la fonction reste ouverte par le
-- propriétaire (`companies.product_aliases_enabled`, 00173).
--
-- Migration sans perte : élargir un plafond ne touche aucune ligne existante.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Normalisation : même règle, plafond à 20
-- ─────────────────────────────────────────────────────────────────────────────
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

  IF array_length(v_clean, 1) > 20 THEN
    v_clean := v_clean[1:20];
  END IF;

  NEW.search_aliases := v_clean;
  RETURN NEW;
END;
$$;

-- Le trigger de 00173 pointe déjà sur cette fonction ; on le (re)pose pour que la
-- migration soit rejouable sur une base où 00173 aurait été appliquée partiellement.
DROP TRIGGER IF EXISTS products_normalize_search_aliases_trigger ON public.products;
CREATE TRIGGER products_normalize_search_aliases_trigger
  BEFORE INSERT OR UPDATE OF search_aliases, name ON public.products
  FOR EACH ROW
  EXECUTE PROCEDURE public.products_normalize_search_aliases();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Filet de sécurité : la contrainte suit le nouveau plafond
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_search_aliases_max;

ALTER TABLE public.products
  ADD CONSTRAINT products_search_aliases_max
  CHECK (search_aliases IS NULL OR cardinality(search_aliases) <= 20);

COMMENT ON COLUMN public.products.search_aliases IS
  'Autres appellations du produit (20 maximum), utilisées UNIQUEMENT pour la recherche. '
  'Le nom affiché partout reste products.name. Normalisées par le trigger '
  'products_normalize_search_aliases (vidées, dédoublonnées, tronquées, plafonnées).';
