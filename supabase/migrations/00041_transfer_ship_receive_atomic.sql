-- Expédition et réception des transferts de stock (atomiques + stock_movements).

-- Expédition : draft ou approved → shipped. Décrémente le stock de la boutique d'origine.
CREATE OR REPLACE FUNCTION public.ship_transfer(
  p_transfer_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_item record;
  v_available int;
  v_product_name text;
BEGIN
  SELECT id, company_id, from_store_id, to_store_id, status
  INTO v_transfer
  FROM public.stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert non trouvé';
  END IF;
  IF v_transfer.status NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Seuls les transferts en brouillon ou approuvés peuvent être expédiés (statut actuel: %)', v_transfer.status;
  END IF;
  IF v_transfer.from_store_id = v_transfer.to_store_id THEN
    RAISE EXCEPTION 'Boutique origine et destination identiques';
  END IF;

  FOR v_item IN
    SELECT sti.id, sti.product_id, sti.quantity_requested, p.name AS product_name
    FROM public.stock_transfer_items sti
    JOIN public.products p ON p.id = sti.product_id
    WHERE sti.transfer_id = p_transfer_id
  LOOP
    SELECT COALESCE(si.quantity, 0) INTO v_available
    FROM public.store_inventory si
    WHERE si.store_id = v_transfer.from_store_id AND si.product_id = v_item.product_id
    FOR UPDATE;

    IF COALESCE(v_available, 0) < v_item.quantity_requested THEN
      v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
      RAISE EXCEPTION 'Stock insuffisant pour "%" (demandé: %, disponible: %)',
        v_product_name, v_item.quantity_requested, COALESCE(v_available, 0);
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_item.quantity_requested,
        updated_at = now()
    WHERE store_id = v_transfer.from_store_id AND product_id = v_item.product_id;

    IF NOT FOUND THEN
      v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
      RAISE EXCEPTION 'Stock insuffisant pour "%"', v_product_name;
    END IF;

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_transfer.from_store_id, v_item.product_id, 'transfer_out', v_item.quantity_requested, 'stock_transfer', p_transfer_id, p_user_id, NULL);

    UPDATE public.stock_transfer_items
    SET quantity_shipped = v_item.quantity_requested
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'shipped',
      shipped_at = now(),
      approved_by = COALESCE(approved_by, p_user_id),
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

COMMENT ON FUNCTION public.ship_transfer IS 'Expédie un transfert : décrémente le stock de la boutique d''origine et enregistre les sorties (transfer_out).';

-- Réception : shipped → received. Incrémente le stock de la boutique de destination.
CREATE OR REPLACE FUNCTION public.receive_transfer(
  p_transfer_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_item record;
BEGIN
  SELECT id, to_store_id, status
  INTO v_transfer
  FROM public.stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert non trouvé';
  END IF;
  IF v_transfer.status != 'shipped' THEN
    RAISE EXCEPTION 'Seuls les transferts expédiés peuvent être réceptionnés (statut actuel: %)', v_transfer.status;
  END IF;

  FOR v_item IN
    SELECT id, product_id, quantity_shipped
    FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND quantity_shipped > 0
  LOOP
    INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
    VALUES (v_transfer.to_store_id, v_item.product_id, v_item.quantity_shipped, 0)
    ON CONFLICT (store_id, product_id) DO UPDATE
    SET quantity = public.store_inventory.quantity + v_item.quantity_shipped,
        updated_at = now();

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_transfer.to_store_id, v_item.product_id, 'transfer_in', v_item.quantity_shipped, 'stock_transfer', p_transfer_id, p_user_id, NULL);

    UPDATE public.stock_transfer_items
    SET quantity_received = v_item.quantity_shipped
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'received',
      received_at = now(),
      received_by = p_user_id,
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

COMMENT ON FUNCTION public.receive_transfer IS 'Réceptionne un transfert : incrémente le stock de la boutique de destination et enregistre les entrées (transfer_in).';

GRANT EXECUTE ON FUNCTION public.ship_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_transfer TO authenticated;
