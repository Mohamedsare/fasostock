-- Séparation métier : un produit peut être « dépôt uniquement », « boutiques uniquement », ou « les deux ».
-- Les RPC valident : pas d’entrée magasin pour boutique_only, pas de vente POS pour warehouse_only, etc.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_scope text NOT NULL DEFAULT 'both'
  CHECK (product_scope IN ('both', 'warehouse_only', 'boutique_only'));

COMMENT ON COLUMN public.products.product_scope IS 'both = dépôt + boutiques ; warehouse_only = stock magasin uniquement ; boutique_only = caisse / stock boutique uniquement.';

-- ---------------------------------------------------------------------------
-- warehouse_register_manual_entry
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
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une entrée magasin.';
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

-- ---------------------------------------------------------------------------
-- warehouse_set_stock_min_warehouse
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
