-- 00119_multi_warehouse_rpc.sql
-- Phase 2 : réécriture des RPC warehouse pour accepter un p_warehouse_id optionnel.
-- Rétrocompat : si p_warehouse_id est NULL, le dépôt principal (get_primary_warehouse_id)
-- est utilisé → les appels existants sans ce paramètre continuent de fonctionner.
--
-- Toutes les requêtes sur warehouse_inventory passent de
--   WHERE company_id = p_company_id AND product_id = ...
-- à
--   WHERE warehouse_id = v_wh_id AND product_id = ...
-- (la PK est maintenant (warehouse_id, product_id) depuis 00118).

-- ============================================================
-- Drop des anciennes surcharges (signatures sans p_warehouse_id)
-- pour éviter l'ambiguïté 42725 lors des appels par nom seul.
-- ============================================================
DROP FUNCTION IF EXISTS public.warehouse_register_manual_entry(uuid, uuid, integer, numeric, text, numeric, text);
DROP FUNCTION IF EXISTS public.warehouse_set_stock_min_warehouse(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.warehouse_register_exit_for_sale(uuid, uuid);
DROP FUNCTION IF EXISTS public.warehouse_register_adjustment(uuid, uuid, integer, numeric, text);
DROP FUNCTION IF EXISTS public.warehouse_create_dispatch_invoice(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.warehouse_void_dispatch_invoice(uuid, uuid);
DROP FUNCTION IF EXISTS public.ship_transfer(uuid, uuid);

-- ============================================================
-- Utilitaire interne : résoudre + valider le warehouse_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_warehouse_id(
  p_company_id  uuid,
  p_warehouse_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh_id uuid;
BEGIN
  IF p_warehouse_id IS NOT NULL THEN
    SELECT id INTO v_wh_id
    FROM public.warehouses
    WHERE id = p_warehouse_id AND company_id = p_company_id AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Dépôt introuvable ou inactif pour cette entreprise (id: %)', p_warehouse_id;
    END IF;
  ELSE
    v_wh_id := public.get_primary_warehouse_id(p_company_id);
    IF v_wh_id IS NULL THEN
      RAISE EXCEPTION 'Aucun dépôt principal configuré pour cette entreprise';
    END IF;
  END IF;
  RETURN v_wh_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_warehouse_id(uuid, uuid) TO authenticated;

-- ============================================================
-- 1. warehouse_register_manual_entry
-- ============================================================
CREATE OR REPLACE FUNCTION public.warehouse_register_manual_entry(
  p_company_id   uuid,
  p_product_id   uuid,
  p_quantity     integer,
  p_unit_cost    numeric,
  p_packaging_type text,
  p_packs_quantity numeric DEFAULT 1,
  p_notes        text DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_wh_id    uuid;
  v_old_q    integer;
  v_old_cost numeric;
  v_pc       numeric;
  v_new_avg  numeric;
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

  v_wh_id := public.resolve_warehouse_id(p_company_id, p_warehouse_id);

  SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
  INTO v_old_q, v_old_cost
  FROM public.warehouse_inventory wi
  WHERE wi.warehouse_id = v_wh_id AND wi.product_id = p_product_id;

  IF v_old_q IS NULL THEN v_old_q := 0; END IF;

  v_pc := p_unit_cost;
  IF v_old_q = 0 THEN
    v_new_avg := v_pc;
  ELSE
    v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_quantity * v_pc)::numeric / (v_old_q + p_quantity);
  END IF;

  INSERT INTO public.warehouse_movements (
    warehouse_id, company_id, product_id, movement_kind, quantity, unit_cost,
    packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    v_wh_id, p_company_id, p_product_id, 'entry', p_quantity, p_unit_cost,
    COALESCE(NULLIF(trim(p_packaging_type), ''), 'unite'),
    COALESCE(p_packs_quantity, 1),
    'manual', NULL, p_notes, v_uid
  );

  INSERT INTO public.warehouse_inventory (warehouse_id, company_id, product_id, quantity, avg_unit_cost, updated_at, stock_min_warehouse)
  VALUES (v_wh_id, p_company_id, p_product_id, p_quantity, v_new_avg, now(), 0)
  ON CONFLICT (warehouse_id, product_id) DO UPDATE
  SET quantity      = public.warehouse_inventory.quantity + p_quantity,
      avg_unit_cost = v_new_avg,
      updated_at    = now();
END;
$$;

COMMENT ON FUNCTION public.warehouse_register_manual_entry IS
  'Entrée stock dépôt (owner/magasinier) : warehouse_id optionnel (dépôt principal si NULL).';
GRANT EXECUTE ON FUNCTION public.warehouse_register_manual_entry(uuid, uuid, integer, numeric, text, numeric, text, uuid) TO authenticated;

-- ============================================================
-- 2. warehouse_set_stock_min_warehouse
-- ============================================================
CREATE OR REPLACE FUNCTION public.warehouse_set_stock_min_warehouse(
  p_company_id   uuid,
  p_product_id   uuid,
  p_min          integer,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_wh_id uuid;
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

  v_wh_id := public.resolve_warehouse_id(p_company_id, p_warehouse_id);

  INSERT INTO public.warehouse_inventory (warehouse_id, company_id, product_id, quantity, stock_min_warehouse, updated_at)
  VALUES (v_wh_id, p_company_id, p_product_id, 0, p_min, now())
  ON CONFLICT (warehouse_id, product_id) DO UPDATE
  SET stock_min_warehouse = p_min,
      updated_at          = now();
END;
$$;

COMMENT ON FUNCTION public.warehouse_set_stock_min_warehouse IS
  'Seuil alerte dépôt pour un produit ; warehouse_id optionnel (dépôt principal si NULL).';
GRANT EXECUTE ON FUNCTION public.warehouse_set_stock_min_warehouse(uuid, uuid, integer, uuid) TO authenticated;

-- ============================================================
-- 3. warehouse_register_exit_for_sale
-- ============================================================
CREATE OR REPLACE FUNCTION public.warehouse_register_exit_for_sale(
  p_company_id   uuid,
  p_sale_id      uuid,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_wh_id uuid;
  v_sale  record;
  v_item  record;
  v_wh_q  integer;
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

  v_wh_id := public.resolve_warehouse_id(p_company_id, p_warehouse_id);

  IF EXISTS (
    SELECT 1 FROM public.warehouse_movements wm
    WHERE wm.warehouse_id = v_wh_id
      AND wm.reference_type = 'sale'
      AND wm.reference_id = p_sale_id
      AND wm.movement_kind = 'exit'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Une sortie magasin existe déjà pour cette vente sur ce dépôt';
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
    WHERE wi.warehouse_id = v_wh_id AND wi.product_id = v_item.product_id;

    IF v_wh_q IS NULL OR v_wh_q < v_item.quantity THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour le produit % (demandé: %, disponible: %)',
        v_item.product_id, v_item.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      warehouse_id, company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      v_wh_id, p_company_id, v_item.product_id, 'exit', v_item.quantity, NULL,
      'unite', 1, 'sale', p_sale_id, NULL, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity   = wi.quantity - v_item.quantity,
        updated_at = now()
    WHERE wi.warehouse_id = v_wh_id AND wi.product_id = v_item.product_id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.warehouse_register_exit_for_sale IS
  'Sortie dépôt pour une vente completed ; warehouse_id optionnel (dépôt principal si NULL).';
GRANT EXECUTE ON FUNCTION public.warehouse_register_exit_for_sale(uuid, uuid, uuid) TO authenticated;

-- ============================================================
-- 4. warehouse_register_adjustment
-- ============================================================
CREATE OR REPLACE FUNCTION public.warehouse_register_adjustment(
  p_company_id   uuid,
  p_product_id   uuid,
  p_delta        integer,
  p_unit_cost    numeric DEFAULT NULL,
  p_reason       text DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_wh_id    uuid;
  v_old_q    integer;
  v_old_cost numeric;
  v_pc       numeric;
  v_new_avg  numeric;
  v_abs      integer;
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

  v_wh_id := public.resolve_warehouse_id(p_company_id, p_warehouse_id);

  IF p_delta > 0 THEN
    v_pc := COALESCE(p_unit_cost, (SELECT purchase_price FROM public.products WHERE id = p_product_id));
    IF v_pc IS NULL OR v_pc < 0 THEN
      RAISE EXCEPTION 'Indiquez un prix d''achat unitaire pour l''ajout en stock';
    END IF;

    SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
    INTO v_old_q, v_old_cost
    FROM public.warehouse_inventory wi
    WHERE wi.warehouse_id = v_wh_id AND wi.product_id = p_product_id
    FOR UPDATE;

    IF v_old_q IS NULL THEN v_old_q := 0; END IF;

    IF v_old_q = 0 THEN
      v_new_avg := v_pc;
    ELSE
      v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_delta * v_pc)::numeric / (v_old_q + p_delta);
    END IF;

    INSERT INTO public.warehouse_movements (
      warehouse_id, company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      v_wh_id, p_company_id, p_product_id, 'entry', p_delta, v_pc,
      'unite', 1, 'adjustment', NULL, NULLIF(trim(p_reason), ''), v_uid
    );

    INSERT INTO public.warehouse_inventory (warehouse_id, company_id, product_id, quantity, avg_unit_cost, updated_at)
    VALUES (v_wh_id, p_company_id, p_product_id, p_delta, v_new_avg, now())
    ON CONFLICT (warehouse_id, product_id) DO UPDATE
    SET quantity      = public.warehouse_inventory.quantity + p_delta,
        avg_unit_cost = v_new_avg,
        updated_at    = now();
  ELSE
    v_abs := -p_delta;

    SELECT COALESCE(wi.quantity, 0)
    INTO v_old_q
    FROM public.warehouse_inventory wi
    WHERE wi.warehouse_id = v_wh_id AND wi.product_id = p_product_id
    FOR UPDATE;

    IF COALESCE(v_old_q, 0) < v_abs THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour cet ajustement (disponible: %)', COALESCE(v_old_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      warehouse_id, company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      v_wh_id, p_company_id, p_product_id, 'exit', v_abs, NULL,
      'unite', 1, 'adjustment', NULL, NULLIF(trim(p_reason), ''), v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity   = wi.quantity - v_abs,
        updated_at = now()
    WHERE wi.warehouse_id = v_wh_id AND wi.product_id = p_product_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.warehouse_register_adjustment IS
  'Ajustement stock dépôt ; warehouse_id optionnel (dépôt principal si NULL).';
GRANT EXECUTE ON FUNCTION public.warehouse_register_adjustment(uuid, uuid, integer, numeric, text, uuid) TO authenticated;

-- ============================================================
-- 5. warehouse_create_dispatch_invoice
-- ============================================================
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
  v_uid        uuid := auth.uid();
  v_wh_id      uuid;
  v_invoice_id uuid;
  v_doc        text;
  v_line       record;
  v_wh_q       integer;
  v_attempt    int := 0;
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

  LOOP
    v_attempt := v_attempt + 1;
    v_doc := 'BSD-' || to_char(timezone('UTC', now()), 'YYYYMMDD') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    BEGIN
      INSERT INTO public.warehouse_dispatch_invoices (
        warehouse_id, company_id, customer_id, document_number, notes, created_by
      ) VALUES (
        v_wh_id, p_company_id, p_customer_id, v_doc, NULLIF(trim(p_notes), ''), v_uid
      )
      RETURNING id INTO v_invoice_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN RAISE; END IF;
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
  'Bon de sortie dépôt ; warehouse_id optionnel (dépôt principal si NULL).';
GRANT EXECUTE ON FUNCTION public.warehouse_create_dispatch_invoice(uuid, uuid, text, jsonb, uuid) TO authenticated;

-- ============================================================
-- 6. warehouse_void_dispatch_invoice
--    (warehouse_id lu depuis la facture — pas de paramètre supplémentaire)
-- ============================================================
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
  v_uid    uuid := auth.uid();
  v_wh_id  uuid;
  v_line   record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour annuler un bon de sortie dépôt.';
  END IF;

  SELECT warehouse_id INTO v_wh_id
  FROM public.warehouse_dispatch_invoices
  WHERE id = p_invoice_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bon introuvable pour cette entreprise';
  END IF;

  FOR v_line IN
    SELECT product_id, quantity
    FROM public.warehouse_dispatch_items
    WHERE invoice_id = p_invoice_id
  LOOP
    INSERT INTO public.warehouse_inventory (warehouse_id, company_id, product_id, quantity, updated_at)
    VALUES (v_wh_id, p_company_id, v_line.product_id, v_line.quantity, now())
    ON CONFLICT (warehouse_id, product_id) DO UPDATE
    SET quantity   = public.warehouse_inventory.quantity + EXCLUDED.quantity,
        updated_at = now();
  END LOOP;

  DELETE FROM public.warehouse_movements
  WHERE warehouse_id = v_wh_id
    AND reference_type = 'warehouse_dispatch'
    AND reference_id = p_invoice_id;

  DELETE FROM public.warehouse_dispatch_invoices
  WHERE id = p_invoice_id AND company_id = p_company_id;
END;
$$;

COMMENT ON FUNCTION public.warehouse_void_dispatch_invoice IS
  'Annule un bon de sortie dépôt : réintègre le stock, supprime mouvements et document.';
GRANT EXECUTE ON FUNCTION public.warehouse_void_dispatch_invoice(uuid, uuid) TO authenticated;

-- ============================================================
-- 7. ship_transfer — branche from_warehouse avec warehouse_id
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

    -- Résoudre le dépôt source (from_warehouse_id ou dépôt principal par défaut)
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

-- ============================================================
-- 8. Contrainte FK stock_transfers : s'assurer que from_warehouse_id
--    appartient à la même entreprise (via warehouses)
-- ============================================================
ALTER TABLE public.stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_from_warehouse_company_check;

-- Note: la FK warehouse → company est déjà garantie par warehouses.company_id.
-- Pas de check redondant nécessaire ; la validation se fait dans ship_transfer.

-- ============================================================
-- 9. RLS mises à jour : warehouse_movements et warehouse_inventory
--    acceptent maintenant la lecture via warehouse_id → company_id
-- ============================================================
DROP POLICY IF EXISTS warehouse_inventory_select_owner ON public.warehouse_inventory;
CREATE POLICY warehouse_inventory_select_owner ON public.warehouse_inventory
  FOR SELECT TO authenticated
  USING (
    public.user_is_company_owner(company_id)
    OR public.user_can_manage_company_warehouse(company_id)
  );

DROP POLICY IF EXISTS warehouse_movements_select_owner ON public.warehouse_movements;
CREATE POLICY warehouse_movements_select_owner ON public.warehouse_movements
  FOR SELECT TO authenticated
  USING (
    public.user_is_company_owner(company_id)
    OR public.user_can_manage_company_warehouse(company_id)
  );
