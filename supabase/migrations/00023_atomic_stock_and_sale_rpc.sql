-- Opérations atomiques sur le stock pour éviter oversell et race conditions.
-- 1) Création vente avec décrément stock atomique
-- 2) Annulation vente avec restauration stock atomique
-- 3) Ajustement stock atomique

-- Séquence pour numéros de vente uniques (évite collision si deux ventes à la même ms)
CREATE SEQUENCE IF NOT EXISTS public.sale_number_seq;

-- Crée une vente et décrémente le stock de façon atomique. En cas de stock insuffisant, rollback et exception.
CREATE OR REPLACE FUNCTION public.create_sale_with_stock(
  p_company_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount decimal DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal decimal := 0;
  v_total decimal;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price decimal;
  v_disc decimal;
  v_row_count int;
  v_product_name text;
BEGIN
  -- Générer numéro de vente unique
  v_sale_number := 'S-' || nextval('sale_number_seq');

  -- 1) Décrémenter le stock atomiquement pour chaque ligne (évite oversell)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour produit %', v_product_id;
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_qty,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%" (référence: %)', COALESCE(v_product_name, v_product_id::text), v_product_id;
    END IF;
  END LOOP;

  -- 2) Calculer totaux
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price - v_disc);
  END LOOP;
  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  -- 3) Insertion vente
  INSERT INTO public.sales (company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by)
  VALUES (p_company_id, p_store_id, p_customer_id, v_sale_number, 'completed', v_subtotal, COALESCE(p_discount, 0), 0, v_total, p_created_by)
  RETURNING id INTO v_sale_id;

  -- 4) Lignes de vente + mouvements de stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (v_sale_id, v_product_id, v_qty, v_unit_price, v_disc, v_qty * v_unit_price - v_disc);

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (p_store_id, v_product_id, 'sale_out', -v_qty, 'sale', v_sale_id, p_created_by, NULL);
  END LOOP;

  -- 5) Paiements
  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  SELECT v_sale_id,
         (elem->>'method')::payment_method,
         (elem->>'amount')::decimal,
         elem->>'reference'
  FROM jsonb_array_elements(p_payments) AS elem;

  RETURN v_sale_id;
END;
$$;

-- Annule une vente et restaure le stock de façon atomique
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

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, notes)
    VALUES (v_sale.store_id, v_item.product_id, 'return_in', v_item.quantity, 'sale', p_sale_id, 'Annulation vente');
  END LOOP;

  UPDATE public.sales SET status = 'cancelled' WHERE id = p_sale_id;
END;
$$;

-- Ajustement de stock atomique (évite race entre read et write)
CREATE OR REPLACE FUNCTION public.inventory_adjust_atomic(
  p_store_id uuid,
  p_product_id uuid,
  p_delta int,
  p_reason text,
  p_created_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_count int;
BEGIN
  IF p_delta = 0 THEN
    RETURN;
  END IF;

  IF p_delta > 0 THEN
    -- Entrée: UPDATE ou INSERT
    INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
    VALUES (p_store_id, p_product_id, p_delta, 0)
    ON CONFLICT (store_id, product_id) DO UPDATE
    SET quantity = public.store_inventory.quantity + p_delta,
        updated_at = now();
  ELSE
    -- Sortie: décrémenter seulement si stock suffisant
    UPDATE public.store_inventory
    SET quantity = quantity + p_delta,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = p_product_id
      AND quantity >= -p_delta;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      RAISE EXCEPTION 'Stock insuffisant pour cet ajustement (delta: %)', p_delta;
    END IF;
  END IF;

  INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
  VALUES (p_store_id, p_product_id, 'adjustment', p_delta, NULL, NULL, p_created_by, COALESCE(p_reason, 'Ajustement manuel'));
END;
$$;

COMMENT ON FUNCTION public.create_sale_with_stock IS 'Crée une vente et décrémente le stock de façon atomique. Évite oversell en concurrence.';
COMMENT ON FUNCTION public.cancel_sale_restore_stock IS 'Annule une vente et restaure le stock atomiquement.';
COMMENT ON FUNCTION public.inventory_adjust_atomic IS 'Ajuste le stock de façon atomique (évite race read/write).';

GRANT EXECUTE ON FUNCTION public.create_sale_with_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sale_restore_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_adjust_atomic TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.sale_number_seq TO authenticated;

-- Activer Realtime sur store_inventory pour que les vues (Stock, POS) se rafraîchissent quand le stock change.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.store_inventory;
EXCEPTION
  WHEN OTHERS THEN NULL;  -- ignorer si déjà dans la publication ou publication absente
END $$;
