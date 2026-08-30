-- ═══════════════════════════════════════════════════════════════════════════════
-- 00217 — Le catalogue n'est plus écrivable par tout le monde
-- ═══════════════════════════════════════════════════════════════════════════════
/*
 * CE QUI ÉTAIT OUVERT
 *
 * `products_all` (00002) : FOR ALL USING (company_id ∈ mes entreprises). Une seule
 * policy, aucune permission vérifiée. `products.create` / `products.update` /
 * `products.delete` n'existaient QUE dans l'écran : la base, elle, laissait n'importe
 * quel employé connecté envoyer un PATCH sur `products` et réécrire `sale_price` ou
 * `purchase_price` de n'importe quel article.
 *
 * Le garde-fou posé en 00210 ne couvre que les fiches « en attente de prix »
 * (`OLD.awaiting_pricing = true`) : il empêchait l'employé de chiffrer SA fiche, pas
 * de retarifer le reste du catalogue. La case « Ajouter un produit sans prix » ne
 * tenait donc que par l'interface.
 *
 * CE QUE FAIT CETTE MIGRATION
 *
 * 1. `products` : la policy unique est remplacée par quatre — lecture pour tout membre
 *    (inchangé), écriture réservée aux droits catalogue.
 * 2. `product_packagings` : même traitement. Le prix d'un lot EST un prix de vente ;
 *    le laisser ouvert aurait simplement déplacé le trou d'une table à l'autre.
 * 3. `set_product_barcode` : la page Code Barre écrit `products.barcode` sans avoir
 *    `products.update` (le droit `barcodes.manage` peut être accordé seul). Un RPC
 *    étroit remplace l'UPDATE client — il n'écrit QUE le code-barres.
 * 4. `products.draft_create` retiré aux rôles qui ont déjà `products.update` : chez eux
 *    la case ne restreignait rien et laissait croire le contraire.
 *
 * CE QUI CONTINUE DE PASSER
 *
 * Les RPC `SECURITY DEFINER` ne sont pas concernés par les policies : création de fiche
 * sans prix (`create_draft_product`, 00210), arrivage express (`create_quick_supply`,
 * 00193), prix de revient (`cost_batch_apply`, 00174), sessions d'inventaire. Ils
 * portent déjà leur propre contrôle de droit.
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Qui peut écrire le catalogue
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * Trois portes plutôt qu'une, pour coller aux trois cases de l'écran Employés.
 *
 * `products.import` ouvre la création ET la modification : un import CSV met à jour les
 * fiches existantes autant qu'il en crée, et il pose les prix par nature — le droit dit
 * déjà « cette personne charge le catalogue en masse ».
 *
 * `products.delete` ouvre la modification parce que la suppression est DOUCE : l'écran
 * écrit `deleted_at` et `is_active` par un UPDATE, jamais un DELETE. Sans cette ligne,
 * « Supprimer des produits » ne supprimerait rien.
 */
CREATE OR REPLACE FUNCTION public.user_can_create_products(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.is_super_admin()
      OR public.user_is_company_owner(p_company_id)
      OR public.user_has_company_permission(p_company_id, 'products.create')
      OR public.user_has_company_permission(p_company_id, 'products.import');
$fn$;

CREATE OR REPLACE FUNCTION public.user_can_modify_products(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.is_super_admin()
      OR public.user_is_company_owner(p_company_id)
      OR public.user_has_company_permission(p_company_id, 'products.update')
      OR public.user_has_company_permission(p_company_id, 'products.import')
      OR public.user_has_company_permission(p_company_id, 'products.delete');
$fn$;

CREATE OR REPLACE FUNCTION public.user_can_remove_products(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.is_super_admin()
      OR public.user_is_company_owner(p_company_id)
      OR public.user_has_company_permission(p_company_id, 'products.delete');
$fn$;

COMMENT ON FUNCTION public.user_can_create_products(uuid) IS
  'Droit d''ajouter une fiche produit (products.create ou products.import, owner, super admin).';
COMMENT ON FUNCTION public.user_can_modify_products(uuid) IS
  'Droit de modifier une fiche produit, prix compris. products.delete est inclus : la '
  'suppression est douce (UPDATE deleted_at).';
COMMENT ON FUNCTION public.user_can_remove_products(uuid) IS
  'Droit de supprimer definitivement une fiche produit (products.delete, owner, super admin).';

GRANT EXECUTE ON FUNCTION public.user_can_create_products(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_modify_products(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_remove_products(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. products : lecture pour tous les membres, écriture sur droit
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "products_all" ON public.products;
DROP POLICY IF EXISTS "products_select" ON public.products;
DROP POLICY IF EXISTS "products_insert" ON public.products;
DROP POLICY IF EXISTS "products_update" ON public.products;
DROP POLICY IF EXISTS "products_delete" ON public.products;

-- Lecture : inchangée. La caisse, le stock, les rapports et la page Produits lisent le
-- catalogue pour tout membre de l'entreprise.
CREATE POLICY "products_select" ON public.products FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

CREATE POLICY "products_insert" ON public.products FOR INSERT WITH CHECK (
  public.user_can_create_products(company_id)
);

-- USING borne les lignes atteignables, WITH CHECK borne le résultat : sans les deux, on
-- pourrait déplacer une fiche vers une entreprise où l'on a le droit d'écrire.
CREATE POLICY "products_update" ON public.products FOR UPDATE
  USING (public.user_can_modify_products(company_id))
  WITH CHECK (public.user_can_modify_products(company_id));

CREATE POLICY "products_delete" ON public.products FOR DELETE USING (
  public.user_can_remove_products(company_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. product_packagings : le prix d'un lot est un prix de vente
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "product_packagings_all" ON public.product_packagings;
DROP POLICY IF EXISTS "product_packagings_select" ON public.product_packagings;
DROP POLICY IF EXISTS "product_packagings_insert" ON public.product_packagings;
DROP POLICY IF EXISTS "product_packagings_update" ON public.product_packagings;
DROP POLICY IF EXISTS "product_packagings_delete" ON public.product_packagings;

CREATE POLICY "product_packagings_select" ON public.product_packagings FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- Poser un lot revient à poser un prix : même porte que la modification d'une fiche.
CREATE POLICY "product_packagings_insert" ON public.product_packagings FOR INSERT WITH CHECK (
  public.user_can_create_products(company_id) OR public.user_can_modify_products(company_id)
);

CREATE POLICY "product_packagings_update" ON public.product_packagings FOR UPDATE
  USING (public.user_can_modify_products(company_id))
  WITH CHECK (public.user_can_modify_products(company_id));

CREATE POLICY "product_packagings_delete" ON public.product_packagings FOR DELETE USING (
  public.user_can_modify_products(company_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Code Barre : un RPC qui n'écrit que le code-barres
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * `barcodes.manage` (00089) n'est donné qu'au propriétaire par défaut, mais il peut être
 * accordé seul à un employé — sans `products.update`. L'UPDATE client de la page Code
 * Barre ne passerait donc plus. Le faire passer en élargissant la policy rendrait à ce
 * même employé l'accès à TOUTES les colonnes, prix compris : une policy garde une ligne,
 * pas une colonne. D'où ce RPC, seul chemin qui reste ouvert, et qui n'écrit qu'un champ.
 */
CREATE OR REPLACE FUNCTION public.set_product_barcode(
  p_product_id uuid,
  p_barcode text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company_id uuid;
  v_barcode text := NULLIF(btrim(COALESCE(p_barcode, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT company_id INTO v_company_id FROM public.products WHERE id = p_product_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;

  IF NOT (
    public.user_can_modify_products(v_company_id)
    OR public.user_has_company_permission(v_company_id, 'barcodes.manage')
  ) THEN
    RAISE EXCEPTION 'Accès refusé : vous ne pouvez pas modifier les codes-barres.';
  END IF;

  UPDATE public.products SET barcode = v_barcode WHERE id = p_product_id;
END;
$fn$;

COMMENT ON FUNCTION public.set_product_barcode(uuid, text) IS
  'Ecrit le seul code-barres d''un produit. Ouvert a products.update comme a '
  'barcodes.manage — sans donner acces aux autres colonnes.';

GRANT EXECUTE ON FUNCTION public.set_product_barcode(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. « Ajouter un produit sans prix » retiré à qui peut déjà tout faire
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * 00209 avait donné `products.draft_create` à manager, store_manager, stock_manager et
 * cashier. Les trois premiers ont `products.create` et `products.update` (00035, 00078) :
 * l'écran leur ouvre le formulaire complet, avec les prix, et la fiche réduite n'apparaît
 * jamais. La case restait cochée dans Employés et donnait à lire une restriction qui
 * n'existait pas.
 *
 * Elle reste au CAISSIER, seul rôle à n'avoir que `products.view` (00049) — c'est-à-dire
 * le seul pour qui elle change quelque chose.
 *
 * Les dérogations individuelles (`user_permissions`) ne sont pas touchées : si le
 * propriétaire a coché la case pour quelqu'un en particulier, c'est son choix.
 */
DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.slug IN ('manager', 'store_manager', 'stock_manager')
  AND p.key = 'products.draft_create';
