-- Confirmation d'achat avec entrée de stock atomique (évite race en concurrence).
CREATE OR REPLACE FUNCTION public.confirm_purchase_with_stock(
  p_purchase_id uuid,
  p_created_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase record;
  v_item record;
BEGIN
  -- Verrouiller la ligne achat et vérifier qu'elle est en brouillon
  SELECT id, store_id, status INTO v_purchase
  FROM public.purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Achat non trouvé';
  END IF;
  IF v_purchase.status != 'draft' THEN
    RAISE EXCEPTION 'Achat déjà confirmé ou annulé';
  END IF;

  -- Pour chaque ligne : entrée de stock atomique (INSERT ou UPDATE quantity = quantity + qty)
  FOR v_item IN
    SELECT product_id, quantity FROM public.purchase_items WHERE purchase_id = p_purchase_id
  LOOP
    INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
    VALUES (v_purchase.store_id, v_item.product_id, v_item.quantity, 0)
    ON CONFLICT (store_id, product_id) DO UPDATE
    SET quantity = public.store_inventory.quantity + v_item.quantity,
        updated_at = now();

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_purchase.store_id, v_item.product_id, 'purchase_in', v_item.quantity, 'purchase', p_purchase_id, p_created_by, NULL);
  END LOOP;

  UPDATE public.purchases SET status = 'received' WHERE id = p_purchase_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_purchase_with_stock IS 'Confirme un achat (brouillon) et enregistre les entrées de stock de façon atomique.';

GRANT EXECUTE ON FUNCTION public.confirm_purchase_with_stock TO authenticated;
