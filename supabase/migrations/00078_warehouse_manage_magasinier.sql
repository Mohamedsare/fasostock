-- Dépôt magasin : droit dédié warehouse.manage pour le rôle Magasinier (stock_manager) et contrôles RPC/RLS alignés.

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'warehouse.manage')
ON CONFLICT (key) DO NOTHING;

-- Propriétaire : droit magasin explicite (utile pour overrides / cohérence).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner' AND p.key = 'warehouse.manage'
ON CONFLICT DO NOTHING;

-- Magasinier (stock_manager) : Magasin (dépôt) + Stock boutiques + Produits (CRUD complet) + flux magasin (achats, transferts, etc.).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'stock_manager'
  AND p.key IN (
    'warehouse.manage',
    'products.view', 'products.create', 'products.update', 'products.delete', 'products.import',
    'stock.view', 'stock.adjust', 'stock.transfer',
    'transfers.create', 'transfers.approve',
    'stores.view',
    'purchases.view', 'purchases.create', 'purchases.update', 'purchases.cancel', 'purchases.delete',
    'suppliers.view', 'suppliers.manage',
    'sales.view',
    'customers.view', 'customers.manage'
  )
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.user_can_manage_company_warehouse(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_company_owner(p_company_id)
    OR 'warehouse.manage' = ANY(public.get_my_permission_keys(p_company_id));
$$;

COMMENT ON FUNCTION public.user_can_manage_company_warehouse(uuid) IS
  'Propriétaire ou utilisateur avec la permission warehouse.manage (magasinier).';

GRANT EXECUTE ON FUNCTION public.user_can_manage_company_warehouse(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS : lecture tables magasin pour owner OU warehouse.manage
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS warehouse_inventory_select_owner ON public.warehouse_inventory;
CREATE POLICY warehouse_inventory_select_owner ON public.warehouse_inventory
  FOR SELECT TO authenticated
  USING (public.user_can_manage_company_warehouse(company_id));

DROP POLICY IF EXISTS warehouse_movements_select_owner ON public.warehouse_movements;
CREATE POLICY warehouse_movements_select_owner ON public.warehouse_movements
  FOR SELECT TO authenticated
  USING (public.user_can_manage_company_warehouse(company_id));

DROP POLICY IF EXISTS warehouse_dispatch_invoices_select_owner ON public.warehouse_dispatch_invoices;
CREATE POLICY warehouse_dispatch_invoices_select_owner ON public.warehouse_dispatch_invoices
  FOR SELECT TO authenticated
  USING (public.user_can_manage_company_warehouse(company_id));

DROP POLICY IF EXISTS warehouse_dispatch_items_select_owner ON public.warehouse_dispatch_items;
CREATE POLICY warehouse_dispatch_items_select_owner ON public.warehouse_dispatch_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.warehouse_dispatch_invoices w
      WHERE w.id = warehouse_dispatch_items.invoice_id
        AND public.user_can_manage_company_warehouse(w.company_id)
    )
  );

-- ---------------------------------------------------------------------------
-- RPC magasin : propriétaire OU permission warehouse.manage
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.warehouse_register_manual_entry(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_packaging_type text,
  p_packs_quantity numeric DEFAULT 1,
  p_notes text DEFAULT NULL
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour enregistrer une entrée au dépôt.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantité invalide';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Prix d''achat unitaire invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
      AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
  ) THEN
    RAISE EXCEPTION 'Produit réservé aux boutiques : pas d''entrée au dépôt magasin.';
  END IF;

  SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
  INTO v_old_q, v_old_cost
  FROM public.warehouse_inventory wi
  WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id;

  IF v_old_q IS NULL THEN
    v_old_q := 0;
  END IF;

  v_pc := p_unit_cost;
  IF v_old_q = 0 THEN
    v_new_avg := v_pc;
  ELSE
    v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_quantity * v_pc)::numeric / (v_old_q + p_quantity);
  END IF;

  INSERT INTO public.warehouse_movements (
    company_id, product_id, movement_kind, quantity, unit_cost,
    packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    p_company_id, p_product_id, 'entry', p_quantity, p_unit_cost,
    COALESCE(NULLIF(trim(p_packaging_type), ''), 'unite'),
    COALESCE(p_packs_quantity, 1),
    'manual', NULL, p_notes, v_uid
  );

  INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, avg_unit_cost, updated_at, stock_min_warehouse)
  VALUES (p_company_id, p_product_id, p_quantity, v_new_avg, now(), 0)
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET quantity = public.warehouse_inventory.quantity + p_quantity,
      avg_unit_cost = v_new_avg,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.warehouse_set_stock_min_warehouse(
  p_company_id uuid,
  p_product_id uuid,
  p_min integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour définir les seuils dépôt.';
  END IF;
  IF p_min IS NULL OR p_min < 0 THEN
    RAISE EXCEPTION 'Seuil invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
      AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
  ) THEN
    RAISE EXCEPTION 'Produit réservé aux boutiques : pas de seuil dépôt.';
  END IF;

  INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, stock_min_warehouse, updated_at)
  VALUES (p_company_id, p_product_id, 0, p_min, now())
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET stock_min_warehouse = p_min,
      updated_at = now();
END;
$$;

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
  v_wh_q int;
  v_product_name text;
BEGIN
  SELECT id, company_id, from_store_id, to_store_id, status, from_warehouse
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

  IF v_transfer.from_warehouse THEN
    IF NOT public.user_can_manage_company_warehouse(v_transfer.company_id) THEN
      RAISE EXCEPTION 'Droit magasin requis pour expédier un transfert depuis le dépôt.';
    END IF;

    FOR v_item IN
      SELECT sti.id, sti.product_id, sti.quantity_requested, p.name AS product_name
      FROM public.stock_transfer_items sti
      JOIN public.products p ON p.id = sti.product_id
      WHERE sti.transfer_id = p_transfer_id
    LOOP
      IF COALESCE((SELECT product_scope FROM public.products WHERE id = v_item.product_id), 'both') <> 'both' THEN
        v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
        RAISE EXCEPTION 'Vers une boutique : l''article « % » doit être « dépôt + boutiques » (pas dépôt seul).', v_product_name;
      END IF;

      SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
      FROM public.warehouse_inventory wi
      WHERE wi.company_id = v_transfer.company_id AND wi.product_id = v_item.product_id
      FOR UPDATE;

      IF COALESCE(v_wh_q, 0) < v_item.quantity_requested THEN
        v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
        RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
          v_product_name, v_item.quantity_requested, COALESCE(v_wh_q, 0);
      END IF;

      INSERT INTO public.warehouse_movements (
        company_id, product_id, movement_kind, quantity, unit_cost,
        packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_transfer.company_id, v_item.product_id, 'exit', v_item.quantity_requested, NULL,
        'unite', 1, 'stock_transfer', p_transfer_id, NULL, p_user_id
      );

      UPDATE public.warehouse_inventory wi
      SET quantity = wi.quantity - v_item.quantity_requested,
          updated_at = now()
      WHERE wi.company_id = v_transfer.company_id AND wi.product_id = v_item.product_id;

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
    RETURN;
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
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour enregistrer une sortie liée à une vente.';
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
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour ajuster le stock dépôt.';
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
  END LOOP;

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour annuler un bon de sortie dépôt.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_dispatch_invoices w
    WHERE w.id = p_invoice_id AND w.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Bon introuvable pour cette entreprise';
  END IF;

  FOR v_line IN
    SELECT product_id, quantity
    FROM public.warehouse_dispatch_items
    WHERE invoice_id = p_invoice_id
  LOOP
    INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, updated_at)
    VALUES (p_company_id, v_line.product_id, v_line.quantity, now())
    ON CONFLICT (company_id, product_id) DO UPDATE SET
      quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
      updated_at = now();
  END LOOP;

  DELETE FROM public.warehouse_movements
  WHERE company_id = p_company_id
    AND reference_type = 'warehouse_dispatch'
    AND reference_id = p_invoice_id;

  DELETE FROM public.warehouse_dispatch_invoices
  WHERE id = p_invoice_id AND company_id = p_company_id;
END;
$$;
