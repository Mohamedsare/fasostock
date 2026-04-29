-- Modifier un bon de sortie dépôt :
-- - met à jour client/notes/lignes
-- - ajuste le stock dépôt par différence de quantités
-- - trace les ajustements dans warehouse_movements

CREATE OR REPLACE FUNCTION public.warehouse_update_dispatch_invoice(
  p_company_id uuid,
  p_invoice_id uuid,
  p_customer_id uuid,
  p_notes text,
  p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc text;
  v_old_customer_id uuid;
  v_old_notes text;
  v_old_lines jsonb := '[]'::jsonb;
  v_new_lines jsonb := '[]'::jsonb;
  v_product record;
  v_old_qty integer;
  v_new_qty integer;
  v_delta integer;
  v_available integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour modifier un bon de sortie dépôt.';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Au moins une ligne produit est requise';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'Client introuvable pour cette entreprise';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (elem->>'product_id')::uuid AS pid
      FROM jsonb_array_elements(p_lines) AS elem
      WHERE (elem->>'product_id') IS NOT NULL AND (elem->>'product_id') <> ''
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'Chaque produit ne peut apparaître qu''une fois (regroupez les quantités)';
  END IF;

  SELECT w.document_number, w.customer_id, w.notes
  INTO v_doc, v_old_customer_id, v_old_notes
  FROM public.warehouse_dispatch_invoices w
  WHERE w.id = p_invoice_id
    AND w.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bon introuvable pour cette entreprise';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', di.product_id,
        'quantity', di.quantity,
        'unit_price', di.unit_price
      ) ORDER BY di.id
    ),
    '[]'::jsonb
  )
  INTO v_old_lines
  FROM public.warehouse_dispatch_items di
  WHERE di.invoice_id = p_invoice_id;

  -- Valider les lignes cibles
  FOR v_product IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      (elem->>'quantity')::integer AS quantity,
      (elem->>'unit_price')::numeric AS unit_price
    FROM jsonb_array_elements(p_lines) AS elem
  LOOP
    IF v_product.product_id IS NULL THEN
      RAISE EXCEPTION 'product_id manquant sur une ligne';
    END IF;
    IF v_product.quantity IS NULL OR v_product.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un produit';
    END IF;
    IF v_product.unit_price IS NULL OR v_product.unit_price < 0 THEN
      RAISE EXCEPTION 'Prix unitaire invalide pour un produit';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product.product_id
        AND p.company_id = p_company_id
        AND p.deleted_at IS NULL
        AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
    ) THEN
      RAISE EXCEPTION 'Produit introuvable ou non autorisé pour le dépôt';
    END IF;
  END LOOP;

  -- Ajustement stock par différence de quantités (ancienne vs nouvelle version)
  FOR v_product IN
    SELECT DISTINCT product_id
    FROM (
      SELECT (elem->>'product_id')::uuid AS product_id
      FROM jsonb_array_elements(v_old_lines) AS elem
      UNION
      SELECT (elem->>'product_id')::uuid AS product_id
      FROM jsonb_array_elements(p_lines) AS elem
    ) u
    WHERE product_id IS NOT NULL
  LOOP
    SELECT COALESCE((elem->>'quantity')::integer, 0)
    INTO v_old_qty
    FROM jsonb_array_elements(v_old_lines) AS elem
    WHERE (elem->>'product_id')::uuid = v_product.product_id
    LIMIT 1;
    v_old_qty := COALESCE(v_old_qty, 0);

    SELECT COALESCE((elem->>'quantity')::integer, 0)
    INTO v_new_qty
    FROM jsonb_array_elements(p_lines) AS elem
    WHERE (elem->>'product_id')::uuid = v_product.product_id
    LIMIT 1;
    v_new_qty := COALESCE(v_new_qty, 0);

    v_delta := v_new_qty - v_old_qty;

    IF v_delta > 0 THEN
      SELECT COALESCE(wi.quantity, 0)
      INTO v_available
      FROM public.warehouse_inventory wi
      WHERE wi.company_id = p_company_id AND wi.product_id = v_product.product_id
      FOR UPDATE;
      IF COALESCE(v_available, 0) < v_delta THEN
        RAISE EXCEPTION 'Stock dépôt insuffisant pour la modification (produit %, +%, dispo %)',
          v_product.product_id, v_delta, COALESCE(v_available, 0);
      END IF;
      UPDATE public.warehouse_inventory wi
      SET quantity = wi.quantity - v_delta,
          updated_at = now()
      WHERE wi.company_id = p_company_id AND wi.product_id = v_product.product_id;

      INSERT INTO public.warehouse_movements (
        company_id, product_id, movement_kind, quantity, unit_cost,
        packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
      ) VALUES (
        p_company_id, v_product.product_id, 'exit', v_delta, NULL,
        'unite', 1, 'warehouse_dispatch_edit', p_invoice_id, COALESCE(v_doc, 'BSD') || ' [EDIT +]', v_uid
      );
    ELSIF v_delta < 0 THEN
      INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, updated_at)
      VALUES (p_company_id, v_product.product_id, -v_delta, now())
      ON CONFLICT (company_id, product_id) DO UPDATE SET
        quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
        updated_at = now();

      INSERT INTO public.warehouse_movements (
        company_id, product_id, movement_kind, quantity, unit_cost,
        packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
      ) VALUES (
        p_company_id, v_product.product_id, 'entry', -v_delta, NULL,
        'unite', 1, 'warehouse_dispatch_edit', p_invoice_id, COALESCE(v_doc, 'BSD') || ' [EDIT -]', v_uid
      );
    END IF;
  END LOOP;

  DELETE FROM public.warehouse_dispatch_items WHERE invoice_id = p_invoice_id;

  INSERT INTO public.warehouse_dispatch_items (invoice_id, product_id, quantity, unit_price)
  SELECT
    p_invoice_id,
    (elem->>'product_id')::uuid,
    (elem->>'quantity')::integer,
    (elem->>'unit_price')::numeric
  FROM jsonb_array_elements(p_lines) AS elem;

  UPDATE public.warehouse_dispatch_invoices
  SET customer_id = p_customer_id,
      notes = NULLIF(trim(p_notes), '')
  WHERE id = p_invoice_id
    AND company_id = p_company_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', di.product_id,
        'quantity', di.quantity,
        'unit_price', di.unit_price
      ) ORDER BY di.id
    ),
    '[]'::jsonb
  )
  INTO v_new_lines
  FROM public.warehouse_dispatch_items di
  WHERE di.invoice_id = p_invoice_id;

  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    p_company_id,
    v_uid,
    'update',
    'warehouse_dispatch_invoice',
    p_invoice_id,
    jsonb_build_object(
      'customer_id', v_old_customer_id,
      'notes', v_old_notes,
      'lines', v_old_lines
    ),
    jsonb_build_object(
      'customer_id', p_customer_id,
      'notes', NULLIF(trim(p_notes), ''),
      'lines', v_new_lines
    )
  );
END;
$$;

COMMENT ON FUNCTION public.warehouse_update_dispatch_invoice(uuid, uuid, uuid, text, jsonb) IS
  'Modifie un bon de sortie dépôt et ajuste le stock par différence, avec traçabilité des mouvements.';

GRANT EXECUTE ON FUNCTION public.warehouse_update_dispatch_invoice(uuid, uuid, uuid, text, jsonb) TO authenticated;

