-- FasoStock — Ce que l'employé peut apporter au catalogue sans y toucher.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LES DEUX GESTES COUVERTS
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 1. LA PHOTO. Un catalogue sans photos se cherche au nom, et un nom se tape mal.
--    Le propriétaire, lui, photographie son stock le soir, seul, et n'en vient jamais
--    à bout. Son vendeur, pendant ce temps, tient l'article dans la main toute la
--    journée. La page « Photos produits » lui confie la PHOTO et rien d'autre : il
--    voit la liste, il voit ce qui manque, il prend l'article en photo. Il ne peut ni
--    renommer, ni reclasser, ni changer un prix, ni supprimer.
--
--    Cette moitié-là ne demande AUCUN schéma. `product_images` est déjà ouverte à tout
--    membre de l'entreprise depuis 00002, et le bucket `product-images` depuis 00167.
--    Ce qui manquait était un droit nommé (`products.photo`, posé en 00209) et une
--    page qui ne montre que ça. Rien à ajouter ici, et c'est le bon résultat : une
--    fonctionnalité qui n'a pas besoin de table n'en crée pas.
--
-- 2. LA FICHE SANS PRIX. Un carton arrive, quarante références dedans. Celui qui le
--    déballe est le seul à avoir les articles sous les yeux — mais lui ouvrir la fiche
--    produit, c'est lui ouvrir le prix d'achat, donc la marge de la maison. C'est
--    précisément ce qu'un commerçant ne fait pas.
--
--    D'où la fiche EN ATTENTE DE PRIX : l'employé saisit ce qu'il voit (le nom,
--    l'unité, le code-barres, une photo), et rien de ce qu'il ne doit pas voir. Le
--    produit existe, il est rangé, il est complet — et il est INVENDABLE. Le jour où
--    le propriétaire ouvre la fiche et pose son prix de vente, l'article devient
--    opérationnel DE LUI-MÊME, sans case à cocher, sans écran à retrouver.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POURQUOI UNE COLONNE, ET PAS « prix = 0 »
-- ═════════════════════════════════════════════════════════════════════════════
-- On aurait pu déduire l'état du prix : `sale_price = 0` ⇒ en attente. Trois raisons
-- de ne pas le faire :
--
--   • Des produits à 0 existent déjà en base, pour de bonnes et de mauvaises raisons
--     (échantillon, article offert, fiche jamais terminée). Les faire basculer d'un
--     coup dans un nouvel état les rendrait invendables du jour au lendemain.
--   • « En attente » n'est pas « gratuit ». Confondre les deux, c'est perdre la
--     distinction le jour où le patron cherche ce qu'il lui reste à chiffrer.
--   • L'état doit pouvoir être RELÂCHÉ explicitement. Une déduction ne se relâche pas.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUI NE CHANGE POUR PERSONNE
-- ═════════════════════════════════════════════════════════════════════════════
-- La colonne arrive à `false` sur toutes les lignes existantes, et tout ce qui suit
-- (trigger de garde compris) ne s'applique QU'AUX LIGNES À `true`, c'est-à-dire aux
-- seules fiches créées par cette fonctionnalité. Une entreprise qui ne l'active jamais
-- ne voit strictement aucun changement de comportement.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. L'état « en attente de prix »
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS awaiting_pricing boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.awaiting_pricing IS
  'Fiche créée par un employé sans prix (module « Produits ajoutés par l''équipe »). '
  'Le produit est inactif donc invendable ; il redevient opérationnel tout seul dès '
  'qu''un prix de vente > 0 est posé (trigger products_release_awaiting_pricing).';

-- Le patron cherche « ce qu'il me reste à chiffrer » : index partiel, donc minuscule
-- (il n'indexe que les lignes en attente, quelques dizaines au plus) et gratuit pour
-- les entreprises qui n'utilisent pas la fonction.
CREATE INDEX IF NOT EXISTS idx_products_awaiting_pricing
  ON public.products(company_id, created_at DESC)
  WHERE awaiting_pricing = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La libération automatique
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * « Quand le propriétaire renseigne le prix, le produit devient opérationnel. »
 *
 * Cette phrase est la fonctionnalité. Elle est tenue ICI, dans un trigger, et non dans
 * l'écran de saisie — parce qu'il y a plus d'un chemin vers un prix : la fiche produit
 * web, la même fiche sur Flutter, un import CSV, la page Prix de revient, une
 * correction en masse. Un seul de ces chemins qui oublierait la règle laisserait un
 * article payé, rangé, photographié… et invendable, sans que rien ne l'explique.
 *
 * ── Ce que le trigger fait, exactement ──
 *
 *   a) prix de vente > 0 posé sur une fiche en attente  → l'attente est levée, et le
 *      produit est réactivé — SAUF si la même écriture décide elle-même de `is_active`
 *      (le propriétaire qui pose un prix ET désactive volontairement l'article a
 *      raison contre le trigger : on ne lui reprend pas sa décision).
 *
 *   b) tentative de lever l'attente à la main sans prix  → refusée. Sinon la promesse
 *      « invendable tant qu'il n'a pas de prix » ne vaut rien.
 *
 *   c) tentative de REMETTRE une fiche déjà chiffrée en attente → refusée. L'état est
 *      un sas d'entrée, pas un interrupteur.
 *
 *   d) prix touché sur une fiche en attente par quelqu'un qui n'a pas le droit de
 *      modifier les produits → refusé. C'est le point qui rend la fonction utilisable :
 *      sans lui, l'employé qui crée la fiche pourrait, dans la foulée, lui donner un
 *      prix — donc s'ouvrir tout seul la porte qu'on venait de fermer.
 *
 * (d) ne durcit RIEN pour les produits ordinaires : la condition d'entrée du bloc est
 * `OLD.awaiting_pricing = true`. Les fiches existantes n'y passent jamais.
 */
CREATE OR REPLACE FUNCTION public.products_release_awaiting_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_may_price boolean;
BEGIN
  -- (c) — remise en attente d'une fiche déjà chiffrée.
  IF NEW.awaiting_pricing = true AND COALESCE(OLD.awaiting_pricing, false) = false THEN
    RAISE EXCEPTION 'Un produit déjà chiffré ne peut pas être remis « en attente de prix ».';
  END IF;

  IF COALESCE(OLD.awaiting_pricing, false) = false THEN
    RETURN NEW;
  END IF;

  -- À partir d'ici : la fiche ÉTAIT en attente. Rien de ce qui suit ne concerne les
  -- produits ordinaires.
  v_may_price :=
    public.is_super_admin()
    OR public.user_is_company_owner(NEW.company_id)
    OR public.user_has_company_permission(NEW.company_id, 'products.update');

  -- (d) — seul qui peut modifier les produits peut poser le prix.
  IF NOT v_may_price
     AND (NEW.sale_price IS DISTINCT FROM OLD.sale_price
          OR NEW.purchase_price IS DISTINCT FROM OLD.purchase_price)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut fixer le prix de ce produit.';
  END IF;

  IF COALESCE(NEW.sale_price, 0) > 0 THEN
    -- (a) — le prix est posé : la fiche entre en service.
    NEW.awaiting_pricing := false;
    IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
      NEW.is_active := true;
    END IF;
  ELSIF NEW.awaiting_pricing = false THEN
    -- (b) — on ne sort pas de l'attente sans prix.
    RAISE EXCEPTION 'Ce produit attend son prix de vente : renseignez-le pour le rendre opérationnel.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.products_release_awaiting_pricing() IS
  'Lève l''état « en attente de prix » dès qu''un prix de vente > 0 est posé (et '
  'réactive alors le produit), refuse toute sortie d''attente sans prix, et réserve '
  'la fixation du prix à qui a le droit products.update.';

DROP TRIGGER IF EXISTS products_release_awaiting_pricing_trigger ON public.products;
CREATE TRIGGER products_release_awaiting_pricing_trigger
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_release_awaiting_pricing();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Les droits effectifs
-- ─────────────────────────────────────────────────────────────────────────────
-- `get_my_permission_keys` (et non `user_has_company_permission`) : c'est la fonction
-- qui applique les SURCHARGES par utilisateur. Le propriétaire qui retire le droit à
-- UN vendeur en particulier doit être entendu, et il ne l'est que par celle-là.
--
-- Le drapeau d'entreprise est vérifié DANS la fonction : le droit seul ne suffit pas.
-- Refermer le module dans Paramètres doit refermer la porte, pas seulement cacher
-- l'entrée de menu.

CREATE OR REPLACE FUNCTION public.can_add_product_photo(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR (
        EXISTS (
          SELECT 1 FROM public.companies
          WHERE id = p_company_id AND employee_photos_enabled = true
        )
        AND (
          public.user_is_company_owner(p_company_id)
          OR ('products.photo' = ANY(public.get_my_permission_keys(p_company_id)))
          -- Qui peut déjà modifier une fiche peut évidemment l'illustrer : sans ce
          -- repli, ouvrir le module RETIRERAIT la photo au gérant qui l'avait.
          OR ('products.update' = ANY(public.get_my_permission_keys(p_company_id)))
        )
      );
$$;

COMMENT ON FUNCTION public.can_add_product_photo(uuid) IS
  'Droit d''illustrer le catalogue depuis la page Photos produits. Exige le module '
  'ouvert par le propriétaire ET un droit photo (ou le droit de modifier les produits).';

CREATE OR REPLACE FUNCTION public.can_create_draft_product(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR (
        EXISTS (
          SELECT 1 FROM public.companies
          WHERE id = p_company_id AND employee_draft_products_enabled = true
        )
        AND (
          public.user_is_company_owner(p_company_id)
          OR ('products.draft_create' = ANY(public.get_my_permission_keys(p_company_id)))
        )
      );
$$;

COMMENT ON FUNCTION public.can_create_draft_product(uuid) IS
  'Droit de créer une fiche produit sans prix. Exige le module ouvert par le '
  'propriétaire ET le droit products.draft_create.';

GRANT EXECUTE ON FUNCTION public.can_add_product_photo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_draft_product(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Créer la fiche sans prix
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * Un RPC, et non un INSERT depuis l'écran.
 *
 * La policy `products_all` (00002) laisse tout membre de l'entreprise insérer un
 * produit — avec les prix qu'il veut. Un INSERT client, si bien intentionné soit-il,
 * ne garantirait donc jamais que la fiche arrive VRAIMENT sans prix et VRAIMENT
 * inactive : il suffirait de rejouer la requête à la main avec deux champs de plus.
 *
 * Ici, `purchase_price`, `sale_price`, `is_active` et `awaiting_pricing` ne sont pas
 * des paramètres. Ils sont écrits en dur. L'employé n'a aucun moyen de les atteindre,
 * quel que soit ce qu'il envoie.
 *
 * Le SKU n'est pas demandé non plus : il se génère plus tard, dans la fiche, quand le
 * patron reprend l'article. Demander un SKU à quelqu'un qui déballe un carton, c'est
 * arrêter la saisie au troisième article.
 */
CREATE OR REPLACE FUNCTION public.create_draft_product(
  p_company_id uuid,
  p_name text,
  p_unit text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_store_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_barcode text := NULLIF(btrim(COALESCE(p_barcode, '')), '');
  v_unit text := COALESCE(NULLIF(btrim(COALESCE(p_unit, '')), ''), 'pce');
  v_product_id uuid;
  v_shares_catalog boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_company_id IS NULL
     OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids()))
  THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.can_create_draft_product(p_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''ajouter un produit.';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Donnez un nom au produit.';
  END IF;

  -- Le code-barres est la seule donnée que l'employé scanne : un doublon signifie
  -- qu'il vient de recréer un article déjà au catalogue. Le dire tout de suite lui
  -- évite de saisir quarante fiches en double.
  IF v_barcode IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.products
    WHERE company_id = p_company_id
      AND barcode = v_barcode
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ce code-barres est déjà utilisé par un autre produit.';
  END IF;

  -- La catégorie, si elle est fournie, doit être celle de la maison. Un identifiant
  -- glissé dans la requête ne doit pas ranger un article chez le voisin.
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories WHERE id = p_category_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Catégorie introuvable dans cette entreprise.';
  END IF;

  INSERT INTO public.products (
    company_id, name, unit, barcode, description, category_id,
    purchase_price, sale_price, product_scope, is_active, awaiting_pricing
  )
  VALUES (
    p_company_id, v_name, v_unit, v_barcode,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    p_category_id,
    0, 0, 'both', false, true
  )
  RETURNING id INTO v_product_id;

  /*
   * Boutique à catalogue personnalisé : sans ce lien, la fiche chiffrée par le patron
   * resterait introuvable en caisse dans la boutique même qui l'a saisie. Le défaut ne
   * se verrait que des semaines plus tard, au moment de vendre — c'est-à-dire au pire
   * moment. Même précaution que `create_quick_supply` (00193).
   */
  IF p_store_id IS NOT NULL AND public.has_store_access(p_store_id, p_company_id) THEN
    SELECT COALESCE(shares_company_catalog, true) INTO v_shares_catalog
    FROM public.stores WHERE id = p_store_id;
    IF v_shares_catalog = false THEN
      INSERT INTO public.store_products (company_id, store_id, product_id)
      VALUES (p_company_id, p_store_id, v_product_id)
      ON CONFLICT (store_id, product_id) DO NOTHING;
    END IF;
  END IF;

  RETURN v_product_id;
END;
$$;

COMMENT ON FUNCTION public.create_draft_product(uuid, text, text, text, uuid, text, uuid) IS
  'Crée une fiche produit SANS prix, inactive et marquée awaiting_pricing. Les prix et '
  'l''activation ne sont pas des paramètres : ils sont écrits en dur, l''appelant ne '
  'peut pas les atteindre.';

REVOKE ALL ON FUNCTION public.create_draft_product(uuid, text, text, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_draft_product(uuid, text, text, text, uuid, text, uuid) TO authenticated;
