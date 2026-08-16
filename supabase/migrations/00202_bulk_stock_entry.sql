-- FasoStock — « Remplir le stock en un clic » : entrer des quantités sur PLUSIEURS
-- produits d'une boutique en une seule opération.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE GESTE COUVERT
-- ─────────────────────────────────────────────────────────────────────────────
-- Le commerçant qui démarre avec l'application a déjà son catalogue (importé, ou saisi
-- article par article) et un magasin plein — mais l'application affiche zéro partout.
-- Aujourd'hui il doit ouvrir la fiche de CHAQUE produit, une par une, pour mettre la
-- quantité : deux cents produits, deux cents dialogues, et il abandonne au trentième.
-- Le même geste revient à chaque grosse livraison d'un fournisseur habituel, où trente
-- références bougent d'un coup.
--
-- Cette migration ajoute l'opération qui manquait : une liste de couples
-- (produit, variation), appliquée EN UNE SEULE TRANSACTION.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI UNE RPC, ET PAS UNE BOUCLE CÔTÉ APPLICATION
-- ─────────────────────────────────────────────────────────────────────────────
-- Boucler sur `inventory_adjust_atomic` depuis le navigateur produirait N allers-retours
-- réseau — soit, sur une connexion de marché à Ouagadougou, plusieurs minutes pendant
-- lesquelles la moitié des produits est déjà modifiée et l'autre pas. Une coupure au
-- milieu laisse un stock à moitié rempli que PERSONNE ne peut plus reconstituer : rien
-- ne distingue, dans l'historique, la ligne déjà passée de celle qui manque.
-- Ici, c'est tout ou rien, et l'historique des mouvements reçoit les N lignes ensemble.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUI EST VÉRIFIÉ (la fonction est SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────
-- `inventory_adjust_atomic` (00023) est SECURITY DEFINER sans aucun contrôle dans son
-- corps : elle est protégée par le seul fait que le client ne peut pas deviner les
-- identifiants d'une autre entreprise — ce qui n'est pas une protection. On ne reproduit
-- pas ce défaut ici (voir la règle posée en 00198) : la boutique, l'appartenance de
-- l'utilisateur à l'entreprise, son droit d'ajuster, et l'appartenance de CHAQUE produit
-- à cette même entreprise sont vérifiés avant la première écriture.
--
-- L'auteur n'est pas un paramètre : c'est `auth.uid()`. Un paramètre `p_created_by`
-- laisserait n'importe qui signer un ajustement du nom d'un collègue.

CREATE OR REPLACE FUNCTION public.inventory_bulk_adjust_atomic(
  p_store_id uuid,
  p_items jsonb,
  p_reason text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_count int := 0;
  v_item record;
  v_row_count int;
  v_product_name text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Aucun produit à mettre à jour.';
  END IF;

  -- Garde-fou de volume : la page envoie par paquets. Sans plafond, un appel unique
  -- pourrait tenir une transaction (et donc les lignes de stock) ouverte assez longtemps
  -- pour bloquer la caisse, qui écrit sur les mêmes lignes à chaque vente.
  IF jsonb_array_length(p_items) > 300 THEN
    RAISE EXCEPTION 'Trop de produits en une fois (maximum 300).';
  END IF;

  SELECT company_id INTO v_company_id FROM public.stores WHERE id = p_store_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Boutique introuvable.';
  END IF;

  IF NOT public.is_super_admin()
     AND v_company_id NOT IN (SELECT * FROM public.current_user_company_ids())
  THEN
    RAISE EXCEPTION 'Boutique introuvable.';
  END IF;

  IF NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(v_company_id)
     AND NOT public.user_has_company_permission(v_company_id, 'stock.adjust')
  THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''ajuster le stock.';
  END IF;

  FOR v_item IN
    SELECT (elem->>'product_id')::uuid AS product_id,
           (elem->>'delta')::int AS delta
    FROM jsonb_array_elements(p_items) AS elem
  LOOP
    IF v_item.product_id IS NULL OR v_item.delta IS NULL OR v_item.delta = 0 THEN
      CONTINUE;
    END IF;

    -- Le produit doit appartenir à l'entreprise de la boutique : sans ce contrôle, un
    -- identifiant glissé dans la requête ferait entrer du stock chez le voisin.
    SELECT name INTO v_product_name
    FROM public.products
    WHERE id = v_item.product_id AND company_id = v_company_id;
    IF v_product_name IS NULL THEN
      RAISE EXCEPTION 'Produit introuvable dans cette entreprise.';
    END IF;

    IF v_item.delta > 0 THEN
      INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
      VALUES (p_store_id, v_item.product_id, v_item.delta, 0)
      ON CONFLICT (store_id, product_id) DO UPDATE
      SET quantity = public.store_inventory.quantity + v_item.delta,
          updated_at = now();
    ELSE
      UPDATE public.store_inventory
      SET quantity = quantity + v_item.delta,
          updated_at = now()
      WHERE store_id = p_store_id
        AND product_id = v_item.product_id
        AND quantity >= -v_item.delta;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      IF v_row_count = 0 THEN
        -- Nommer le produit : sur cinquante lignes, « stock insuffisant » sans nom
        -- oblige à tout reprendre à la main pour trouver laquelle bloque.
        RAISE EXCEPTION 'Stock insuffisant pour "%" (variation: %)', v_product_name, v_item.delta;
      END IF;
    END IF;

    INSERT INTO public.stock_movements (
      store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes
    )
    VALUES (
      p_store_id, v_item.product_id, 'adjustment', v_item.delta, NULL, NULL, v_user_id,
      COALESCE(v_reason, 'Mise à jour groupée du stock')
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.inventory_bulk_adjust_atomic(uuid, jsonb, text) IS
  'Applique une liste de variations de stock (produit, delta) sur une boutique en une '
  'seule transaction : tout passe ou rien. Vérifie l''appartenance à l''entreprise, le '
  'droit stock.adjust, et l''appartenance de chaque produit. Auteur = auth.uid().';

GRANT EXECUTE ON FUNCTION public.inventory_bulk_adjust_atomic(uuid, jsonb, text) TO authenticated;
