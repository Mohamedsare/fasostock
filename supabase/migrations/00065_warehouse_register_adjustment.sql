-- Ajustement d'inventaire dépôt (correction, casse, inventaire physique) — owner uniquement.

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
  ) THEN
    RAISE EXCEPTION 'Produit introuvable pour cette entreprise';
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

COMMENT ON FUNCTION public.warehouse_register_adjustment IS
  'Ajustement inventaire dépôt : delta > 0 entrée (CMP), delta < 0 sortie.';

GRANT EXECUTE ON FUNCTION public.warehouse_register_adjustment(uuid, uuid, integer, numeric, text) TO authenticated;
