-- 00123_dispatch_invoice_sequential_number.sql
-- Remplace le numéro de bon de sortie aléatoire (BSD-20260615-bcbf7aca)
-- par un compteur séquentiel annuel par entreprise : BSD-2026-0001, BSD-2026-0002…
-- Le compteur repart à 0001 chaque nouvelle année.
-- La contrainte UNIQUE (company_id, document_number) protège les accès concurrents.

CREATE OR REPLACE FUNCTION public.warehouse_create_dispatch_invoice(
  p_company_id   uuid,
  p_customer_id  uuid,
  p_notes        text,
  p_lines        jsonb,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_wh_id        uuid;
  v_invoice_id   uuid;
  v_doc          text;
  v_year         text;
  v_seq          integer;
  v_line         record;
  v_wh_q         integer;
  v_attempt      int := 0;
  v_product_name text;
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
      GROUP BY 1 HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'Chaque produit ne peut apparaître qu''une fois (regroupez les quantités)';
  END IF;

  v_wh_id := public.resolve_warehouse_id(p_company_id, p_warehouse_id);
  v_year  := to_char(timezone('UTC', now()), 'YYYY');

  -- Numéro séquentiel : max du compteur pour cette entreprise cette année + 1
  SELECT COALESCE(MAX(
    CASE WHEN document_number ~ ('^BSD-' || v_year || '-[0-9]+$')
    THEN (split_part(document_number, '-', 3))::integer
    ELSE 0 END
  ), 0) + 1
  INTO v_seq
  FROM public.warehouse_dispatch_invoices
  WHERE company_id = p_company_id;

  LOOP
    v_attempt := v_attempt + 1;
    v_doc := 'BSD-' || v_year || '-' || lpad(v_seq::text, 4, '0');
    BEGIN
      INSERT INTO public.warehouse_dispatch_invoices (
        warehouse_id, company_id, customer_id, document_number, notes, created_by
      ) VALUES (
        v_wh_id, p_company_id, p_customer_id, v_doc, NULLIF(trim(p_notes), ''), v_uid
      )
      RETURNING id INTO v_invoice_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Collision (accès concurrent) : incrémenter et réessayer
      v_seq := v_seq + 1;
      IF v_attempt >= 10 THEN RAISE; END IF;
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
    WHERE wi.warehouse_id = v_wh_id AND wi.product_id = v_line.product_id
    FOR UPDATE;

    IF COALESCE(v_wh_q, 0) < v_line.quantity THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_line.product_id;
      RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
        COALESCE(v_product_name, v_line.product_id::text), v_line.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_dispatch_items (invoice_id, product_id, quantity, unit_price)
    VALUES (v_invoice_id, v_line.product_id, v_line.quantity, v_line.unit_price);

    INSERT INTO public.warehouse_movements (
      warehouse_id, company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      v_wh_id, p_company_id, v_line.product_id, 'exit', v_line.quantity, v_line.unit_price,
      'unite', 1, 'warehouse_dispatch', v_invoice_id, v_doc, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity   = wi.quantity - v_line.quantity,
        updated_at = now()
    WHERE wi.warehouse_id = v_wh_id AND wi.product_id = v_line.product_id;
  END LOOP;

  RETURN jsonb_build_object('id', v_invoice_id, 'document_number', v_doc);
END;
$$;

COMMENT ON FUNCTION public.warehouse_create_dispatch_invoice IS
  'Bon de sortie dépôt ; numéro séquentiel BSD-YYYY-NNNN ; warehouse_id optionnel (dépôt principal si NULL).';
GRANT EXECUTE ON FUNCTION public.warehouse_create_dispatch_invoice(uuid, uuid, text, jsonb, uuid) TO authenticated;
