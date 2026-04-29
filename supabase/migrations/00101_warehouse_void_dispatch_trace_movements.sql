-- Annulation bon de sortie dépôt:
-- - réintègre le stock
-- - supprime les anciens mouvements de sortie liés au bon
-- - crée des mouvements d'entrée de réintégration traçables

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

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_line.product_id, 'entry', v_line.quantity, v_line.unit_price,
      'unite', 1, 'warehouse_dispatch_void', p_invoice_id, COALESCE(v_doc, 'BSD') || ' [ANNULÉ]', v_uid
    );

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

COMMENT ON FUNCTION public.warehouse_void_dispatch_invoice(uuid, uuid) IS
  'Annule un bon dépôt: réintègre le stock et trace des mouvements d''entrée reference_type=warehouse_dispatch_void.';

