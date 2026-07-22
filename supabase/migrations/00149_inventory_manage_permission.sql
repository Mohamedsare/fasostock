-- FasoStock — Droit dédié « Faire l'inventaire » (inventory.manage).
-- Sépare l'inventaire physique de l'ajustement de stock ad hoc (stock.adjust).
-- 100 % rétrocompatible : le droit est accordé à TOUS les rôles/employés qui ont
-- déjà stock.adjust → personne ne perd l'accès. Les RPC d'inventaire sont re-gâtées
-- sur inventory.manage en tenant compte des surcharges par utilisateur (droits effectifs).

-- 1) Nouvelle permission
INSERT INTO public.permissions (id, key) VALUES (uuid_generate_v4(), 'inventory.manage')
ON CONFLICT (key) DO NOTHING;

-- 2) Préserver l'accès : accorder inventory.manage à tous les rôles ayant stock.adjust.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, pnew.id
FROM public.role_permissions rp
JOIN public.permissions padj ON padj.id = rp.permission_id AND padj.key = 'stock.adjust'
CROSS JOIN public.permissions pnew
WHERE pnew.key = 'inventory.manage'
ON CONFLICT DO NOTHING;

-- 3) Préserver les surcharges par utilisateur (grant ET deny) de stock.adjust → inventory.manage,
--    pour reproduire fidèlement l'accès effectif actuel de chaque employé.
INSERT INTO public.user_permission_overrides (user_id, company_id, permission_id, granted)
SELECT o.user_id, o.company_id, pnew.id, o.granted
FROM public.user_permission_overrides o
JOIN public.permissions padj ON padj.id = o.permission_id AND padj.key = 'stock.adjust'
CROSS JOIN public.permissions pnew
WHERE pnew.key = 'inventory.manage'
ON CONFLICT (user_id, company_id, permission_id) DO NOTHING;

-- 4) Helper : droit effectif « gérer l'inventaire » = owner OU inventory.manage (rôle + surcharges).
--    Réutilise get_my_permission_keys (source de vérité, alignée sur l'UI).
CREATE OR REPLACE FUNCTION public.can_manage_inventory(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_company_owner(p_company_id)
     OR ('inventory.manage' = ANY(public.get_my_permission_keys(p_company_id)));
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_inventory(uuid) TO authenticated;

-- 5) Re-déclaration des RPC d'inventaire : gating sur can_manage_inventory (au lieu de stock.adjust).

CREATE OR REPLACE FUNCTION public.inventory_session_start(
  p_store_id uuid,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_session_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT s.company_id INTO v_company_id FROM public.stores s WHERE s.id = p_store_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Boutique introuvable'; END IF;

  IF NOT public.can_manage_inventory(v_company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour faire un inventaire.';
  END IF;
  IF NOT public.has_store_access(p_store_id, v_company_id) THEN
    RAISE EXCEPTION 'Accès à cette boutique refusé.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_sessions WHERE store_id = p_store_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Une session d''inventaire est déjà ouverte pour cette boutique.';
  END IF;

  INSERT INTO public.inventory_sessions (store_id, status, started_at, created_by, note)
  VALUES (p_store_id, 'open', now(), v_uid, NULLIF(btrim(p_note), ''))
  RETURNING id INTO v_session_id;

  INSERT INTO public.inventory_session_items
    (session_id, product_id, expected_qty, counted_qty, variance,
     product_name, unit_purchase_price, unit_sale_price)
  SELECT
    v_session_id, p.id, COALESCE(si.quantity, 0), NULL, NULL,
    p.name, COALESCE(p.purchase_price, 0), COALESCE(p.sale_price, 0)
  FROM public.products p
  LEFT JOIN public.store_inventory si
    ON si.store_id = p_store_id AND si.product_id = p.id
  WHERE p.company_id = v_company_id
    AND p.deleted_at IS NULL
    AND COALESCE(p.is_active, true) = true
    AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only');

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_session_set_count(
  p_item_id uuid,
  p_counted_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store_id uuid;
  v_company_id uuid;
  v_status inventory_session_status;
  v_expected integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_counted_qty IS NULL OR p_counted_qty < 0 THEN
    RAISE EXCEPTION 'Quantité comptée invalide';
  END IF;

  SELECT isess.store_id, s.company_id, isess.status, it.expected_qty
  INTO v_store_id, v_company_id, v_status, v_expected
  FROM public.inventory_session_items it
  JOIN public.inventory_sessions isess ON isess.id = it.session_id
  JOIN public.stores s ON s.id = isess.store_id
  WHERE it.id = p_item_id;

  IF v_store_id IS NULL THEN RAISE EXCEPTION 'Ligne d''inventaire introuvable'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Session non modifiable (déjà clôturée ou annulée).'; END IF;
  IF NOT public.can_manage_inventory(v_company_id) THEN RAISE EXCEPTION 'Droit insuffisant.'; END IF;
  IF NOT public.has_store_access(v_store_id, v_company_id) THEN
    RAISE EXCEPTION 'Accès à cette boutique refusé.';
  END IF;

  UPDATE public.inventory_session_items
  SET counted_qty = p_counted_qty,
      variance = p_counted_qty - v_expected,
      counted_at = now(),
      counted_by = v_uid
  WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_session_validate(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store_id uuid;
  v_company_id uuid;
  v_status inventory_session_status;
  r RECORD;
  v_now integer;
  v_delta integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT isess.store_id, s.company_id, isess.status
  INTO v_store_id, v_company_id, v_status
  FROM public.inventory_sessions isess
  JOIN public.stores s ON s.id = isess.store_id
  WHERE isess.id = p_session_id;

  IF v_store_id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Session déjà clôturée ou annulée.'; END IF;
  IF NOT public.can_manage_inventory(v_company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour valider l''inventaire.';
  END IF;
  IF NOT public.has_store_access(v_store_id, v_company_id) THEN
    RAISE EXCEPTION 'Accès à cette boutique refusé.';
  END IF;

  FOR r IN
    SELECT it.product_id, it.counted_qty
    FROM public.inventory_session_items it
    WHERE it.session_id = p_session_id AND it.counted_qty IS NOT NULL
  LOOP
    SELECT COALESCE(si.quantity, 0) INTO v_now
    FROM public.store_inventory si
    WHERE si.store_id = v_store_id AND si.product_id = r.product_id
    FOR UPDATE;
    IF v_now IS NULL THEN v_now := 0; END IF;

    v_delta := r.counted_qty - v_now;
    IF v_delta <> 0 THEN
      INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
      VALUES (v_store_id, r.product_id, r.counted_qty, 0)
      ON CONFLICT (store_id, product_id) DO UPDATE
      SET quantity = r.counted_qty, updated_at = now();

      INSERT INTO public.stock_movements
        (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
      VALUES
        (v_store_id, r.product_id, 'inventory_correction', v_delta,
         'inventory_session', p_session_id, v_uid, 'Inventaire');

      INSERT INTO public.stock_adjustments
        (store_id, product_id, quantity_delta, reason, created_by)
      VALUES
        (v_store_id, r.product_id, v_delta, 'Inventaire', v_uid);
    END IF;
  END LOOP;

  UPDATE public.inventory_sessions
  SET status = 'closed', closed_at = now(), closed_by = v_uid
  WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_session_cancel(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store_id uuid;
  v_company_id uuid;
  v_status inventory_session_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT isess.store_id, s.company_id, isess.status
  INTO v_store_id, v_company_id, v_status
  FROM public.inventory_sessions isess
  JOIN public.stores s ON s.id = isess.store_id
  WHERE isess.id = p_session_id;

  IF v_store_id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Seule une session ouverte peut être annulée.'; END IF;
  IF NOT public.can_manage_inventory(v_company_id) THEN RAISE EXCEPTION 'Droit insuffisant.'; END IF;
  IF NOT public.has_store_access(v_store_id, v_company_id) THEN
    RAISE EXCEPTION 'Accès à cette boutique refusé.';
  END IF;

  UPDATE public.inventory_sessions
  SET status = 'cancelled', closed_at = now(), closed_by = v_uid
  WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_session_delete(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store_id uuid;
  v_company_id uuid;
  v_status inventory_session_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT isess.store_id, s.company_id, isess.status
  INTO v_store_id, v_company_id, v_status
  FROM public.inventory_sessions isess
  JOIN public.stores s ON s.id = isess.store_id
  WHERE isess.id = p_session_id;

  IF v_store_id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'Seule une session annulée peut être supprimée.';
  END IF;
  IF NOT public.can_manage_inventory(v_company_id) THEN RAISE EXCEPTION 'Droit insuffisant.'; END IF;
  IF NOT public.has_store_access(v_store_id, v_company_id) THEN
    RAISE EXCEPTION 'Accès à cette boutique refusé.';
  END IF;

  DELETE FROM public.inventory_sessions WHERE id = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_session_list(
  p_store_id uuid
)
RETURNS TABLE (
  id uuid,
  status inventory_session_status,
  note text,
  started_at timestamptz,
  closed_at timestamptz,
  created_by uuid,
  item_count bigint,
  counted_count bigint,
  variance_count bigint,
  variance_value_purchase numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    isess.id, isess.status, isess.note, isess.started_at, isess.closed_at, isess.created_by,
    COUNT(it.id) AS item_count,
    COUNT(it.counted_qty) AS counted_count,
    COUNT(*) FILTER (WHERE it.counted_qty IS NOT NULL AND COALESCE(it.variance, 0) <> 0) AS variance_count,
    COALESCE(SUM(COALESCE(it.variance, 0) * it.unit_purchase_price)
             FILTER (WHERE it.counted_qty IS NOT NULL), 0) AS variance_value_purchase
  FROM public.inventory_sessions isess
  JOIN public.stores s ON s.id = isess.store_id
  LEFT JOIN public.inventory_session_items it ON it.session_id = isess.id
  WHERE isess.store_id = p_store_id
    AND public.has_store_access(isess.store_id, s.company_id)
    AND public.can_manage_inventory(s.company_id)
  GROUP BY isess.id
  ORDER BY isess.started_at DESC;
$$;
