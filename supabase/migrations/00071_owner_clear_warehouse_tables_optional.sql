-- Replaces owner_clear_stock / owner_clear_stock_movements_history so they do not
-- fail when warehouse_* tables are missing (older DBs without warehouse migrations).

CREATE OR REPLACE FUNCTION public.owner_clear_stock(
  p_company_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requis';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé: owner requis';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Boutique invalide pour cette entreprise';
  END IF;

  IF p_store_id IS NULL THEN
    SELECT COUNT(*) INTO v_deleted
    FROM public.store_inventory si
    JOIN public.stores s ON s.id = si.store_id
    WHERE s.company_id = p_company_id;

    DELETE FROM public.store_inventory si
    USING public.stores s
    WHERE si.store_id = s.id
      AND s.company_id = p_company_id;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'warehouse_inventory'
    ) THEN
      DELETE FROM public.warehouse_inventory
      WHERE company_id = p_company_id;
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_deleted
    FROM public.store_inventory
    WHERE store_id = p_store_id;

    DELETE FROM public.store_inventory
    WHERE store_id = p_store_id;
  END IF;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_clear_stock(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_clear_stock_movements_history(
  p_company_id UUID,
  p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id requis';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé: owner requis';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Boutique invalide pour cette entreprise';
  END IF;

  IF p_store_id IS NULL THEN
    SELECT COUNT(*) INTO v_deleted
    FROM public.stock_movements sm
    JOIN public.stores s ON s.id = sm.store_id
    WHERE s.company_id = p_company_id;

    DELETE FROM public.stock_movements sm
    USING public.stores s
    WHERE sm.store_id = s.id
      AND s.company_id = p_company_id;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'warehouse_movements'
    ) THEN
      DELETE FROM public.warehouse_movements
      WHERE company_id = p_company_id;
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_deleted
    FROM public.stock_movements
    WHERE store_id = p_store_id;

    DELETE FROM public.stock_movements
    WHERE store_id = p_store_id;
  END IF;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_clear_stock_movements_history(UUID, UUID) TO authenticated;
