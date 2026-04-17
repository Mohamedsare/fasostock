-- Droit « modifier une vente complétée » : owner par défaut ; l'owner peut l'accorder à d'autres via user_permission_overrides.

INSERT INTO public.permissions (id, key) VALUES (uuid_generate_v4(), 'sales.update')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner' AND p.key = 'sales.update'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_completed_sale_with_stock(
  p_sale_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount decimal DEFAULT 0,
  p_sale_mode public.sale_mode DEFAULT NULL,
  p_document_type public.document_type DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_item jsonb;
  v_item_old record;
  v_row_count int;
  v_product_id uuid;
  v_qty int;
  v_unit_price decimal;
  v_disc decimal;
  v_subtotal decimal := 0;
  v_total decimal;
  v_product_name text;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Au moins une ligne d''article est requise';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'Paiements invalides';
  END IF;

  SELECT id, company_id, store_id, customer_id, status, sale_mode, document_type
  INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente non trouvée';
  END IF;

  IF v_sale.status IS DISTINCT FROM 'completed'::public.sale_status THEN
    RAISE EXCEPTION 'Seules les ventes complétées peuvent être modifiées';
  END IF;

  IF v_sale.company_id IS NULL OR NOT (v_sale.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;

  IF NOT ('sales.update' = ANY (public.get_my_permission_keys(v_sale.company_id))) THEN
    RAISE EXCEPTION 'Permission refusée : modifier des ventes';
  END IF;

  IF NOT public.has_store_access(v_sale.store_id, v_sale.company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée pour cette entreprise';
  END IF;

  -- Restaurer le stock des anciennes lignes (sans changer le statut).
  FOR v_item_old IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    UPDATE public.store_inventory
    SET quantity = quantity + v_item_old.quantity,
        updated_at = now()
    WHERE store_id = v_sale.store_id AND product_id = v_item_old.product_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
      VALUES (v_sale.store_id, v_item_old.product_id, v_item_old.quantity, 0);
    END IF;

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (
      v_sale.store_id,
      v_item_old.product_id,
      'return_in',
      v_item_old.quantity,
      'sale',
      p_sale_id,
      auth.uid(),
      'Modification vente (lignes précédentes)'
    );
  END LOOP;

  DELETE FROM public.sale_payments WHERE sale_id = p_sale_id;
  DELETE FROM public.sale_items WHERE sale_id = p_sale_id;

  -- Décrémenter pour les nouvelles lignes (même logique que create_sale_with_stock).
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
    WHERE store_id = v_sale.store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%" (référence: %)', COALESCE(v_product_name, v_product_id::text), v_product_id;
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price - v_disc);
  END LOOP;
  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  UPDATE public.sales s
  SET
    customer_id = p_customer_id,
    subtotal = v_subtotal,
    discount = COALESCE(p_discount, 0),
    tax = 0,
    total = v_total,
    sale_mode = COALESCE(p_sale_mode, s.sale_mode),
    document_type = COALESCE(p_document_type, s.document_type),
    updated_at = now()
  WHERE s.id = p_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (p_sale_id, v_product_id, v_qty, v_unit_price, v_disc, v_qty * v_unit_price - v_disc);

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_sale.store_id, v_product_id, 'sale_out', -v_qty, 'sale', p_sale_id, auth.uid(), NULL);
  END LOOP;

  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  SELECT p_sale_id,
         (elem->>'method')::public.payment_method,
         (elem->>'amount')::decimal,
         elem->>'reference'
  FROM jsonb_array_elements(p_payments) AS elem;
END;
$$;

COMMENT ON FUNCTION public.update_completed_sale_with_stock(uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type) IS
  'Remplace lignes et paiements d''une vente complétée, avec recalcul stock (undo + nouveau déstockage). Exige sales.update.';

GRANT EXECUTE ON FUNCTION public.update_completed_sale_with_stock(uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type) TO authenticated;
