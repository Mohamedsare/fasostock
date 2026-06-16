-- 00122_security_fixes_multi_warehouse.sql
-- Correctifs de sécurité suite à la revue du système multi-dépôt.
-- Corrige 4 findings confirmés (CONFIRMED par le vérificateur) :
--
-- 1. sync_warehouses_to_quota — aucune vérification d'autorisation → SECURITY DEFINER
--    ouvert à tous les utilisateurs authentifiés.
-- 2. warehouse_update_dispatch_invoice — utilise l'ancienne PK (company_id, product_id)
--    après la migration 00118 ; warehouse_id manquant dans warehouse_movements.
-- 3. ship_transfer — from_warehouse_id jamais validé (appartenance à la company).
-- 4. create_warehouse — pas de contrainte d'unicité sur is_primary = true par company.
-- 5. get_primary_warehouse_id — accessible à tout utilisateur authentifié (leaks UUID).

-- ============================================================
-- 1. sync_warehouses_to_quota : guard super admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_warehouses_to_quota(
  p_company_id uuid,
  p_quota       integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_i     integer;
  v_code  text;
  v_name  text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission_denied: super admin requis';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM warehouses
  WHERE company_id = p_company_id;

  FOR v_i IN (v_total + 1)..p_quota LOOP
    v_code := 'D' || v_i;
    v_name := CASE v_i WHEN 1 THEN 'Principal' ELSE 'Dépôt ' || v_i END;
    INSERT INTO warehouses (company_id, name, code, is_primary, is_active)
    VALUES (p_company_id, v_name, v_code, v_i = 1, true)
    ON CONFLICT (company_id, code) DO NOTHING;
  END LOOP;

  UPDATE warehouses
  SET is_active = true
  WHERE company_id = p_company_id
    AND id IN (
      SELECT id FROM warehouses
      WHERE company_id = p_company_id
      ORDER BY created_at ASC
      LIMIT p_quota
    );

  UPDATE warehouses
  SET is_active = false
  WHERE company_id = p_company_id
    AND is_primary = false
    AND id NOT IN (
      SELECT id FROM warehouses
      WHERE company_id = p_company_id
      ORDER BY created_at ASC
      LIMIT p_quota
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_warehouses_to_quota(uuid, integer) TO authenticated;

-- ============================================================
-- 2. warehouse_update_dispatch_invoice : correction schema multi-dépôt
-- ============================================================
DROP FUNCTION IF EXISTS public.warehouse_update_dispatch_invoice(uuid, uuid, uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.warehouse_update_dispatch_invoice(
  p_company_id  uuid,
  p_invoice_id  uuid,
  p_customer_id uuid,
  p_notes       text,
  p_lines       jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_doc          text;
  v_wh_id        uuid;
  v_old_customer_id uuid;
  v_old_notes    text;
  v_old_lines    jsonb := '[]'::jsonb;
  v_new_lines    jsonb := '[]'::jsonb;
  v_product      record;
  v_old_qty      integer;
  v_new_qty      integer;
  v_delta        integer;
  v_available    integer;
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

  -- Lire le bon + le warehouse_id enregistré à la création
  SELECT w.document_number, w.customer_id, w.notes, w.warehouse_id
  INTO v_doc, v_old_customer_id, v_old_notes, v_wh_id
  FROM public.warehouse_dispatch_invoices w
  WHERE w.id = p_invoice_id
    AND w.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bon introuvable pour cette entreprise';
  END IF;

  -- Fallback si bon créé avant 00118 (warehouse_id NULL)
  IF v_wh_id IS NULL THEN
    v_wh_id := public.get_primary_warehouse_id(p_company_id);
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

  -- Ajustement stock par différence (ancienne vs nouvelle version)
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
      -- Sortie supplémentaire : vérifier stock disponible dans CE dépôt
      SELECT COALESCE(wi.quantity, 0)
      INTO v_available
      FROM public.warehouse_inventory wi
      WHERE wi.warehouse_id = v_wh_id AND wi.product_id = v_product.product_id
      FOR UPDATE;

      IF COALESCE(v_available, 0) < v_delta THEN
        RAISE EXCEPTION 'Stock dépôt insuffisant pour la modification (produit %, +%, dispo %)',
          v_product.product_id, v_delta, COALESCE(v_available, 0);
      END IF;

      UPDATE public.warehouse_inventory wi
      SET quantity   = wi.quantity - v_delta,
          updated_at = now()
      WHERE wi.warehouse_id = v_wh_id AND wi.product_id = v_product.product_id;

      INSERT INTO public.warehouse_movements (
        warehouse_id, company_id, product_id, movement_kind, quantity, unit_cost,
        packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_wh_id, p_company_id, v_product.product_id, 'exit', v_delta, NULL,
        'unite', 1, 'warehouse_dispatch_edit', p_invoice_id,
        COALESCE(v_doc, 'BSD') || ' [EDIT +]', v_uid
      );

    ELSIF v_delta < 0 THEN
      -- Retour en stock dans CE dépôt
      INSERT INTO public.warehouse_inventory (warehouse_id, company_id, product_id, quantity, updated_at)
      VALUES (v_wh_id, p_company_id, v_product.product_id, -v_delta, now())
      ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
        quantity   = public.warehouse_inventory.quantity + EXCLUDED.quantity,
        updated_at = now();

      INSERT INTO public.warehouse_movements (
        warehouse_id, company_id, product_id, movement_kind, quantity, unit_cost,
        packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_wh_id, p_company_id, v_product.product_id, 'entry', -v_delta, NULL,
        'unite', 1, 'warehouse_dispatch_edit', p_invoice_id,
        COALESCE(v_doc, 'BSD') || ' [EDIT -]', v_uid
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
      notes       = NULLIF(trim(p_notes), '')
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
    p_company_id, v_uid, 'update', 'warehouse_dispatch_invoice', p_invoice_id,
    jsonb_build_object('customer_id', v_old_customer_id, 'notes', v_old_notes, 'lines', v_old_lines),
    jsonb_build_object('customer_id', p_customer_id, 'notes', NULLIF(trim(p_notes), ''), 'lines', v_new_lines)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_update_dispatch_invoice(uuid, uuid, uuid, text, jsonb) TO authenticated;

-- ============================================================
-- 3. ship_transfer : valider que from_warehouse_id appartient à la company
-- ============================================================
CREATE OR REPLACE FUNCTION public.ship_transfer(
  p_transfer_id uuid,
  p_user_id     uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer    record;
  v_item        record;
  v_available   int;
  v_wh_q        int;
  v_wh_id       uuid;
  v_product_name text;
BEGIN
  SELECT id, company_id, from_store_id, to_store_id, status, from_warehouse, from_warehouse_id
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

    -- Valider que from_warehouse_id appartient bien à cette company et est actif
    IF v_transfer.from_warehouse_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.warehouses
        WHERE id = v_transfer.from_warehouse_id
          AND company_id = v_transfer.company_id
          AND is_active = true
      ) THEN
        RAISE EXCEPTION 'Dépôt source invalide ou inactif pour ce transfert';
      END IF;
    END IF;

    v_wh_id := COALESCE(
      v_transfer.from_warehouse_id,
      public.get_primary_warehouse_id(v_transfer.company_id)
    );
    IF v_wh_id IS NULL THEN
      RAISE EXCEPTION 'Aucun dépôt source trouvé pour ce transfert';
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
      WHERE wi.warehouse_id = v_wh_id AND wi.product_id = v_item.product_id
      FOR UPDATE;

      IF COALESCE(v_wh_q, 0) < v_item.quantity_requested THEN
        v_product_name := COALESCE(v_item.product_name, v_item.product_id::text);
        RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
          v_product_name, v_item.quantity_requested, COALESCE(v_wh_q, 0);
      END IF;

      INSERT INTO public.warehouse_movements (
        warehouse_id, company_id, product_id, movement_kind, quantity, unit_cost,
        packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_wh_id, v_transfer.company_id, v_item.product_id, 'exit', v_item.quantity_requested, NULL,
        'unite', 1, 'stock_transfer', p_transfer_id, NULL, p_user_id
      );

      UPDATE public.warehouse_inventory wi
      SET quantity   = wi.quantity - v_item.quantity_requested,
          updated_at = now()
      WHERE wi.warehouse_id = v_wh_id AND wi.product_id = v_item.product_id;

      UPDATE public.stock_transfer_items
      SET quantity_shipped = v_item.quantity_requested
      WHERE id = v_item.id;
    END LOOP;

    UPDATE public.stock_transfers
    SET status      = 'shipped',
        shipped_at  = now(),
        approved_by = COALESCE(approved_by, p_user_id),
        updated_at  = now()
    WHERE id = p_transfer_id;
    RETURN;
  END IF;

  -- Transfert boutique → boutique (inchangé)
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
    SET quantity   = quantity - v_item.quantity_requested,
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
  SET status      = 'shipped',
      shipped_at  = now(),
      approved_by = COALESCE(approved_by, p_user_id),
      updated_at  = now()
  WHERE id = p_transfer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ship_transfer(uuid, uuid) TO authenticated;

-- ============================================================
-- 4. Unicité is_primary = true par company (index partiel)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_primary_per_company
  ON public.warehouses (company_id)
  WHERE is_primary = true;

-- ============================================================
-- 5. get_primary_warehouse_id : révoquer l'accès direct authenticated
--    (helper interne appelé uniquement depuis des fonctions SECURITY DEFINER)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.get_primary_warehouse_id(uuid) FROM authenticated;
