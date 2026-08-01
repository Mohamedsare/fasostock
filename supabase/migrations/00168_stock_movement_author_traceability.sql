-- Traçabilité des mouvements de stock : « qui a fait quoi ».
--
-- L'historique (page Magasin › Mouvements) affiche désormais l'auteur de chaque
-- mouvement, lu dans `stock_movements.created_by`. Deux trous à combler :
--
--  1. `cancel_sale_restore_stock` écrivait le mouvement `return_in` SANS
--     `created_by` (défini en 00023, jamais corrigé depuis). L'annulation de
--     vente est justement l'opération qu'un propriétaire veut pouvoir imputer :
--     du stock revient sans qu'aucun client ne rapporte forcément la
--     marchandise. On renseigne `auth.uid()` — la signature du RPC ne change
--     pas, aucun client (web ou Flutter) n'est à modifier.
--
--  2. La policy `profiles_select_same_company` (00037) masque le profil d'un
--     membre désactivé : l'historique d'un employé parti affichait alors un
--     identifiant tronqué au lieu de son nom. On garde la restriction à
--     l'entreprise, on retire la condition `is_active` : partir de l'entreprise
--     ne doit pas effacer son nom des écritures passées.
--
-- Les mouvements écrits avant cette migration gardent `created_by = NULL` :
-- l'auteur n'a jamais été enregistré, il est impossible de le reconstituer.
-- L'écran affiche « — » dans ce cas.

-- ========== 1) Annulation de vente : imputer l'auteur ==========
CREATE OR REPLACE FUNCTION public.cancel_sale_restore_stock(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_item record;
  v_row_count int;
  v_uid uuid := auth.uid();
BEGIN
  SELECT id, store_id, status INTO v_sale
  FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente non trouvée';
  END IF;
  IF v_sale.status != 'completed' THEN
    RAISE EXCEPTION 'Vente déjà annulée ou non complétée';
  END IF;

  -- Restaurer le stock pour chaque ligne (atomique: UPDATE quantity = quantity + qty)
  FOR v_item IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    UPDATE public.store_inventory
    SET quantity = quantity + v_item.quantity,
        updated_at = now()
    WHERE store_id = v_sale.store_id AND product_id = v_item.product_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
      VALUES (v_sale.store_id, v_item.product_id, v_item.quantity, 0);
    END IF;

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_sale.store_id, v_item.product_id, 'return_in', v_item.quantity, 'sale', p_sale_id, v_uid, 'Annulation vente');
  END LOOP;

  UPDATE public.sales SET status = 'cancelled' WHERE id = p_sale_id;
END;
$$;

-- ========== 2) Nom lisible même après désactivation du compte ==========
DROP POLICY IF EXISTS "profiles_select_same_company" ON public.profiles;
CREATE POLICY "profiles_select_same_company" ON public.profiles FOR SELECT USING (
  id IN (
    SELECT ucr.user_id FROM public.user_company_roles ucr
    WHERE ucr.company_id IN (SELECT * FROM current_user_company_ids())
  )
);
