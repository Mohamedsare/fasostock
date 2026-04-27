-- Renforce la traçabilité des bons de sortie dépôt:
-- - audit explicite à la création
-- - audit explicite à l'annulation (avec snapshot des lignes)

CREATE OR REPLACE FUNCTION public.warehouse_create_dispatch_invoice(
  p_company_id uuid,
  p_customer_id uuid,
  p_notes text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice_id uuid;
  v_doc text;
  v_line record;
  v_wh_q integer;
  v_attempt int := 0;
  v_product_name text;
  v_total numeric := 0;
  v_lines_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour créer un bon / une facture de sortie dépôt.';
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
    SELECT 1 FROM (
      SELECT (elem->>'product_id')::uuid AS pid
      FROM jsonb_array_elements(p_lines) AS elem
      WHERE (elem->>'product_id') IS NOT NULL AND (elem->>'product_id') <> ''
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'Chaque produit ne peut apparaître qu''une fois (regroupez les quantités)';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_doc := 'BSD-' || to_char(timezone('UTC', now()), 'YYYYMMDD') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    BEGIN
      INSERT INTO public.warehouse_dispatch_invoices (
        company_id, customer_id, document_number, notes, created_by
      ) VALUES (
        p_company_id, p_customer_id, v_doc, NULLIF(trim(p_notes), ''), v_uid
      )
      RETURNING id INTO v_invoice_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  FOR v_line IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      (elem->>'quantity')::integer AS quantity,
      (elem->>'unit_price')::numeric AS unit_price
    FROM jsonb_array_elements(p_lines) AS elem
  LOOP
    IF v_line.product_id IS NULL THEN
      RAISE EXCEPTION 'product_id manquant sur une ligne';
    END IF;
    IF v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un produit';
    END IF;
    IF v_line.unit_price IS NULL OR v_line.unit_price < 0 THEN
      RAISE EXCEPTION 'Prix unitaire invalide pour un produit';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_line.product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
        AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
    ) THEN
      RAISE EXCEPTION 'Produit réservé aux boutiques : pas de sortie dépôt pour cet article.';
    END IF;

    SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = v_line.product_id
    FOR UPDATE;

    IF COALESCE(v_wh_q, 0) < v_line.quantity THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_line.product_id;
      RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
        COALESCE(v_product_name, v_line.product_id::text), v_line.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_dispatch_items (invoice_id, product_id, quantity, unit_price)
    VALUES (v_invoice_id, v_line.product_id, v_line.quantity, v_line.unit_price);

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_line.product_id, 'exit', v_line.quantity, v_line.unit_price,
      'unite', 1, 'warehouse_dispatch', v_invoice_id, v_doc, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_line.quantity,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = v_line.product_id;

    v_lines_count := v_lines_count + 1;
    v_total := v_total + (v_line.quantity * v_line.unit_price);
  END LOOP;

  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (
    p_company_id,
    v_uid,
    'create',
    'warehouse_dispatch_invoice',
    v_invoice_id,
    jsonb_build_object(
      'document_number', v_doc,
      'customer_id', p_customer_id,
      'lines_count', v_lines_count,
      'total_amount', v_total,
      'notes', NULLIF(trim(p_notes), '')
    )
  );

  RETURN jsonb_build_object('id', v_invoice_id, 'document_number', v_doc);
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_void_dispatch_invoice(
  p_company_id uuid,
  p_invoice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_line record;
  v_doc text;
  v_customer_id uuid;
  v_notes text;
  v_created_at timestamptz;
  v_lines_snapshot jsonb := '[]'::jsonb;
  v_total numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour annuler un bon de sortie dépôt.';
  END IF;

  SELECT w.document_number, w.customer_id, w.notes, w.created_at
  INTO v_doc, v_customer_id, v_notes, v_created_at
  FROM public.warehouse_dispatch_invoices w
  WHERE w.id = p_invoice_id AND w.company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bon introuvable pour cette entreprise';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', di.product_id,
        'quantity', di.quantity,
        'unit_price', di.unit_price
      )
      ORDER BY di.id
    ),
    '[]'::jsonb
  )
  INTO v_lines_snapshot
  FROM public.warehouse_dispatch_items di
  WHERE di.invoice_id = p_invoice_id;

  FOR v_line IN
    SELECT product_id, quantity, unit_price
    FROM public.warehouse_dispatch_items
    WHERE invoice_id = p_invoice_id
  LOOP
    INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, updated_at)
    VALUES (p_company_id, v_line.product_id, v_line.quantity, now())
    ON CONFLICT (company_id, product_id) DO UPDATE SET
      quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
      updated_at = now();

    v_total := v_total + (v_line.quantity * COALESCE(v_line.unit_price, 0));
  END LOOP;

  DELETE FROM public.warehouse_movements
  WHERE company_id = p_company_id
    AND reference_type = 'warehouse_dispatch'
    AND reference_id = p_invoice_id;

  DELETE FROM public.warehouse_dispatch_invoices
  WHERE id = p_invoice_id AND company_id = p_company_id;

  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    p_company_id,
    v_uid,
    'void',
    'warehouse_dispatch_invoice',
    p_invoice_id,
    jsonb_build_object(
      'document_number', v_doc,
      'customer_id', v_customer_id,
      'notes', v_notes,
      'created_at', v_created_at,
      'lines', v_lines_snapshot,
      'total_amount', v_total
    ),
    jsonb_build_object(
      'status', 'voided',
      'voided_at', now(),
      'voided_by', v_uid
    )
  );
END;
$$;
