-- Sortie vente dépôt, ajustement, facture dépôt : product_scope.

CREATE OR REPLACE FUNCTION public.warehouse_register_exit_for_sale(
  p_company_id uuid,
  p_sale_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sale record;
  v_item record;
  v_wh_q integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une sortie magasin.';
  END IF;

  SELECT id, company_id, status INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente introuvable';
  END IF;
  IF v_sale.company_id <> p_company_id THEN
    RAISE EXCEPTION 'La vente n''appartient pas à cette entreprise';
  END IF;
  IF v_sale.status IS DISTINCT FROM 'completed'::public.sale_status THEN
    RAISE EXCEPTION 'La vente doit être validée (statut complété) pour autoriser une sortie magasin';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouse_movements wm
    WHERE wm.company_id = p_company_id
      AND wm.reference_type = 'sale'
      AND wm.reference_id = p_sale_id
      AND wm.movement_kind = 'exit'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Une sortie magasin existe déjà pour cette vente';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_item.product_id AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
    ) THEN
      RAISE EXCEPTION 'La vente contient un produit réservé aux boutiques : sortie dépôt impossible pour cet article.';
    END IF;

    SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = v_item.product_id;

    IF v_wh_q IS NULL OR v_wh_q < v_item.quantity THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour le produit % (demandé: %, disponible: %)',
        v_item.product_id, v_item.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'exit', v_item.quantity, NULL,
      'unite', 1, 'sale', p_sale_id, NULL, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_item.quantity,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = v_item.product_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_register_adjustment(
  p_company_id uuid,
  p_product_id uuid,
  p_delta integer,
  p_unit_cost numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_q integer;
  v_old_cost numeric;
  v_pc numeric;
  v_new_avg numeric;
  v_abs integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut ajuster le stock magasin.';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Variation invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
      AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
  ) THEN
    RAISE EXCEPTION 'Produit réservé aux boutiques : pas d''ajustement au dépôt.';
  END IF;

  IF p_delta > 0 THEN
    v_pc := COALESCE(
      p_unit_cost,
      (SELECT purchase_price FROM public.products WHERE id = p_product_id)
    );
    IF v_pc IS NULL OR v_pc < 0 THEN
      RAISE EXCEPTION 'Indiquez un prix d''achat unitaire pour l''ajout en stock';
    END IF;

    SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
    INTO v_old_q, v_old_cost
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id
    FOR UPDATE;

    IF v_old_q IS NULL THEN
      v_old_q := 0;
    END IF;

    IF v_old_q = 0 THEN
      v_new_avg := v_pc;
    ELSE
      v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_delta * v_pc)::numeric / (v_old_q + p_delta);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, p_product_id, 'entry', p_delta, v_pc,
      'unite', 1, 'adjustment', NULL, NULLIF(trim(p_reason), ''), v_uid
    );

    INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, avg_unit_cost, updated_at)
    VALUES (p_company_id, p_product_id, p_delta, v_new_avg, now())
    ON CONFLICT (company_id, product_id) DO UPDATE
    SET quantity = public.warehouse_inventory.quantity + p_delta,
        avg_unit_cost = v_new_avg,
        updated_at = now();
  ELSE
    v_abs := -p_delta;
    SELECT COALESCE(wi.quantity, 0)
    INTO v_old_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id
    FOR UPDATE;

    IF COALESCE(v_old_q, 0) < v_abs THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour cet ajustement (disponible: %)', COALESCE(v_old_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, p_product_id, 'exit', v_abs, NULL,
      'unite', 1, 'adjustment', NULL, NULLIF(trim(p_reason), ''), v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_abs,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id;
  END IF;
END;
$$;

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une sortie magasin (bon / facture dépôt).';
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
  END LOOP;

  RETURN jsonb_build_object('id', v_invoice_id, 'document_number', v_doc);
END;
$$;
