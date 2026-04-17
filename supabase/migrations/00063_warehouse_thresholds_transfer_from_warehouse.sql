-- Seuils magasin dédiés + transferts boutique depuis le dépôt central (magasin).

-- ---------------------------------------------------------------------------
-- Seuil d'alerte magasin par produit (0 = utiliser le stock_min produit côté app, ou pas d'alerte si pas de ligne)
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_inventory
  ADD COLUMN IF NOT EXISTS stock_min_warehouse integer NOT NULL DEFAULT 0
  CHECK (stock_min_warehouse >= 0);

COMMENT ON COLUMN public.warehouse_inventory.stock_min_warehouse IS 'Seuil alerte dépôt ; 0 = recours au stock_min du produit en UI.';

-- ---------------------------------------------------------------------------
-- Transfert : origine magasin (dépôt) au lieu d'une boutique
-- ---------------------------------------------------------------------------
ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS from_warehouse boolean NOT NULL DEFAULT false;

ALTER TABLE public.stock_transfers
  ALTER COLUMN from_store_id DROP NOT NULL;

ALTER TABLE public.stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_from_source_check;

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT stock_transfers_from_source_check CHECK (
    (from_warehouse = true AND from_store_id IS NULL)
    OR
    (from_warehouse = false AND from_store_id IS NOT NULL)
  );

COMMENT ON COLUMN public.stock_transfers.from_warehouse IS 'Si true, l''expédition consomme warehouse_inventory au lieu de store_inventory.';

-- ---------------------------------------------------------------------------
-- RPC : définir le seuil magasin (owner)
-- ---------------------------------------------------------------------------
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
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut définir les seuils magasin.';
  END IF;
  IF p_min IS NULL OR p_min < 0 THEN
    RAISE EXCEPTION 'Seuil invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Produit introuvable pour cette entreprise';
  END IF;

  INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, stock_min_warehouse, updated_at)
  VALUES (p_company_id, p_product_id, 0, p_min, now())
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET stock_min_warehouse = p_min,
      updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.warehouse_set_stock_min_warehouse IS 'Définit le seuil d''alerte magasin pour un produit (upsert ligne inventaire si besoin).';

GRANT EXECUTE ON FUNCTION public.warehouse_set_stock_min_warehouse(uuid, uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Expédition transfert : branche magasin (dépôt) ou boutique (existant)
-- ---------------------------------------------------------------------------
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
    IF NOT public.user_is_company_owner(v_transfer.company_id) THEN
      RAISE EXCEPTION 'Seul le propriétaire peut expédier un transfert depuis le magasin (dépôt).';
    END IF;

    FOR v_item IN
      SELECT sti.id, sti.product_id, sti.quantity_requested, p.name AS product_name
      FROM public.stock_transfer_items sti
      JOIN public.products p ON p.id = sti.product_id
      WHERE sti.transfer_id = p_transfer_id
    LOOP
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

  -- Origine boutique (comportement historique)
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

COMMENT ON FUNCTION public.ship_transfer IS 'Expédie un transfert : depuis le magasin (owner) ou depuis une boutique (stock boutique).';
