-- FasoStock — Sessions d'inventaire physique au niveau DÉPÔT (magasin), par warehouse_id.
-- Miroir de l'inventaire boutique (00147/00148/00149) mais scopé à un dépôt :
--   - snapshot du stock théorique du dépôt (warehouse_inventory) ;
--   - comptage progressif ;
--   - validation atomique → warehouse_inventory = quantité comptée + mouvement
--     `inventory_session` (entry/exit) dans warehouse_movements.
-- Accès : owner OU magasinier (user_can_manage_company_warehouse), même gating que les
-- autres RPC dépôt. Le dépôt est résolu/validé via resolve_warehouse_id (00119).

-- ==========================================================================
-- 1) Enum de statut
-- ==========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warehouse_inventory_session_status') THEN
    CREATE TYPE public.warehouse_inventory_session_status AS ENUM ('open', 'closed', 'cancelled');
  END IF;
END$$;

-- ==========================================================================
-- 2) Tables
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.warehouse_inventory_sessions (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id  uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status        public.warehouse_inventory_session_status NOT NULL DEFAULT 'open',
  note          text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.warehouse_inventory_session_items (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          uuid NOT NULL REFERENCES public.warehouse_inventory_sessions(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  expected_qty        integer NOT NULL DEFAULT 0,
  counted_qty         integer,
  variance            integer,
  counted_at          timestamptz,
  counted_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_name        text,
  unit_purchase_price numeric NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_inventory_session_items_session_product
  ON public.warehouse_inventory_session_items(session_id, product_id);
CREATE INDEX IF NOT EXISTS idx_wh_inventory_sessions_warehouse_status
  ON public.warehouse_inventory_sessions(warehouse_id, status);
CREATE INDEX IF NOT EXISTS idx_wh_inventory_sessions_company
  ON public.warehouse_inventory_sessions(company_id);

COMMENT ON TABLE public.warehouse_inventory_sessions IS
  'Sessions d''inventaire physique d''un dépôt (magasin) — comptage / écarts / validation.';
COMMENT ON TABLE public.warehouse_inventory_session_items IS
  'Lignes de comptage d''une session d''inventaire dépôt (stock théorique + compté + écart).';

-- ==========================================================================
-- 3) RLS : lecture owner OU magasinier (comme les autres tables dépôt) ; écriture via RPC.
-- ==========================================================================
ALTER TABLE public.warehouse_inventory_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_inventory_session_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wh_inventory_sessions_select ON public.warehouse_inventory_sessions;
CREATE POLICY wh_inventory_sessions_select ON public.warehouse_inventory_sessions
  FOR SELECT TO authenticated
  USING (public.user_can_manage_company_warehouse(company_id));

DROP POLICY IF EXISTS wh_inventory_session_items_select ON public.warehouse_inventory_session_items;
CREATE POLICY wh_inventory_session_items_select ON public.warehouse_inventory_session_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.warehouse_inventory_sessions s
    WHERE s.id = warehouse_inventory_session_items.session_id
      AND public.user_can_manage_company_warehouse(s.company_id)
  ));

GRANT SELECT ON public.warehouse_inventory_sessions TO authenticated;
GRANT SELECT ON public.warehouse_inventory_session_items TO authenticated;

-- ==========================================================================
-- RPC
-- ==========================================================================

-- Démarre une session : snapshot du stock théorique du dépôt.
CREATE OR REPLACE FUNCTION public.warehouse_inventory_session_start(
  p_company_id   uuid,
  p_warehouse_id uuid DEFAULT NULL,
  p_note         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_wh_id      uuid;
  v_session_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour faire un inventaire du dépôt.';
  END IF;

  v_wh_id := public.resolve_warehouse_id(p_company_id, p_warehouse_id);

  IF EXISTS (
    SELECT 1 FROM public.warehouse_inventory_sessions
    WHERE warehouse_id = v_wh_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Une session d''inventaire est déjà ouverte pour ce dépôt.';
  END IF;

  INSERT INTO public.warehouse_inventory_sessions (warehouse_id, company_id, status, started_at, created_by, note)
  VALUES (v_wh_id, p_company_id, 'open', now(), v_uid, NULLIF(btrim(p_note), ''))
  RETURNING id INTO v_session_id;

  -- Snapshot : produits dépôt actifs de l'entreprise, quantité théorique du dépôt (0 si aucune ligne).
  -- Coût unitaire = CMP dépôt si présent, sinon prix d'achat produit.
  INSERT INTO public.warehouse_inventory_session_items
    (session_id, product_id, expected_qty, counted_qty, variance, product_name, unit_purchase_price)
  SELECT
    v_session_id, p.id, COALESCE(wi.quantity, 0), NULL, NULL,
    p.name, COALESCE(wi.avg_unit_cost, p.purchase_price, 0)
  FROM public.products p
  LEFT JOIN public.warehouse_inventory wi
    ON wi.warehouse_id = v_wh_id AND wi.product_id = p.id
  WHERE p.company_id = p_company_id
    AND p.deleted_at IS NULL
    AND COALESCE(p.is_active, true) = true
    AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only');

  RETURN v_session_id;
END;
$$;

-- Saisit la quantité physiquement comptée d'une ligne.
CREATE OR REPLACE FUNCTION public.warehouse_inventory_session_set_count(
  p_item_id     uuid,
  p_counted_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_company_id uuid;
  v_status     public.warehouse_inventory_session_status;
  v_expected   integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_counted_qty IS NULL OR p_counted_qty < 0 THEN
    RAISE EXCEPTION 'Quantité comptée invalide';
  END IF;

  SELECT s.company_id, s.status, it.expected_qty
  INTO v_company_id, v_status, v_expected
  FROM public.warehouse_inventory_session_items it
  JOIN public.warehouse_inventory_sessions s ON s.id = it.session_id
  WHERE it.id = p_item_id;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Ligne d''inventaire introuvable'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Session non modifiable (déjà clôturée ou annulée).'; END IF;
  IF NOT public.user_can_manage_company_warehouse(v_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis.';
  END IF;

  UPDATE public.warehouse_inventory_session_items
  SET counted_qty = p_counted_qty,
      variance    = p_counted_qty - v_expected,
      counted_at  = now(),
      counted_by  = v_uid
  WHERE id = p_item_id;
END;
$$;

-- Valide la session : applique les corrections (stock dépôt = quantité comptée) de façon
-- atomique, journalise un mouvement `inventory_session` (entry/exit) par écart, clôt la session.
CREATE OR REPLACE FUNCTION public.warehouse_inventory_session_validate(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_wh_id      uuid;
  v_company_id uuid;
  v_status     public.warehouse_inventory_session_status;
  r            RECORD;
  v_now        integer;
  v_cost       numeric;
  v_delta      integer;
  v_apply_cost numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT s.warehouse_id, s.company_id, s.status
  INTO v_wh_id, v_company_id, v_status
  FROM public.warehouse_inventory_sessions s
  WHERE s.id = p_session_id;

  IF v_wh_id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Session déjà clôturée ou annulée.'; END IF;
  IF NOT public.user_can_manage_company_warehouse(v_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour valider l''inventaire du dépôt.';
  END IF;

  FOR r IN
    SELECT it.product_id, it.counted_qty, it.unit_purchase_price
    FROM public.warehouse_inventory_session_items it
    WHERE it.session_id = p_session_id AND it.counted_qty IS NOT NULL
  LOOP
    -- Stock dépôt courant verrouillé au moment de la validation (préserve les sorties intervenues).
    SELECT wi.quantity, wi.avg_unit_cost INTO v_now, v_cost
    FROM public.warehouse_inventory wi
    WHERE wi.warehouse_id = v_wh_id AND wi.product_id = r.product_id
    FOR UPDATE;
    IF v_now IS NULL THEN v_now := 0; END IF;

    v_delta := r.counted_qty - v_now;
    IF v_delta <> 0 THEN
      -- Coût conservé (CMP existant) ; à défaut, coût snapshot de la ligne.
      v_apply_cost := COALESCE(v_cost, NULLIF(r.unit_purchase_price, 0));

      INSERT INTO public.warehouse_inventory (warehouse_id, company_id, product_id, quantity, avg_unit_cost, updated_at)
      VALUES (v_wh_id, v_company_id, r.product_id, r.counted_qty, v_apply_cost, now())
      ON CONFLICT (warehouse_id, product_id) DO UPDATE
      SET quantity      = r.counted_qty,
          avg_unit_cost = COALESCE(public.warehouse_inventory.avg_unit_cost, v_apply_cost),
          updated_at    = now();

      INSERT INTO public.warehouse_movements (
        warehouse_id, company_id, product_id, movement_kind, quantity, unit_cost,
        packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
      ) VALUES (
        v_wh_id, v_company_id, r.product_id,
        CASE WHEN v_delta > 0 THEN 'entry' ELSE 'exit' END,
        abs(v_delta),
        CASE WHEN v_delta > 0 THEN v_apply_cost ELSE NULL END,
        'unite', 1, 'inventory_session', p_session_id, 'Inventaire', v_uid
      );
    END IF;
  END LOOP;

  UPDATE public.warehouse_inventory_sessions
  SET status = 'closed', closed_at = now(), closed_by = v_uid
  WHERE id = p_session_id;
END;
$$;

-- Annule une session ouverte (aucune modification du stock).
CREATE OR REPLACE FUNCTION public.warehouse_inventory_session_cancel(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_company_id uuid;
  v_status     public.warehouse_inventory_session_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT s.company_id, s.status INTO v_company_id, v_status
  FROM public.warehouse_inventory_sessions s
  WHERE s.id = p_session_id;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Seule une session ouverte peut être annulée.'; END IF;
  IF NOT public.user_can_manage_company_warehouse(v_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis.';
  END IF;

  UPDATE public.warehouse_inventory_sessions
  SET status = 'cancelled', closed_at = now(), closed_by = v_uid
  WHERE id = p_session_id;
END;
$$;

-- Supprime définitivement une session ANNULÉE (lignes en cascade). Interdit sur une session validée.
CREATE OR REPLACE FUNCTION public.warehouse_inventory_session_delete(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_company_id uuid;
  v_status     public.warehouse_inventory_session_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT s.company_id, s.status INTO v_company_id, v_status
  FROM public.warehouse_inventory_sessions s
  WHERE s.id = p_session_id;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'Seule une session annulée peut être supprimée.';
  END IF;
  IF NOT public.user_can_manage_company_warehouse(v_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis.';
  END IF;

  DELETE FROM public.warehouse_inventory_sessions WHERE id = p_session_id;
END;
$$;

-- Liste des sessions d'un dépôt + agrégats (pour l'écran historique).
CREATE OR REPLACE FUNCTION public.warehouse_inventory_session_list(
  p_company_id   uuid,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  warehouse_id uuid,
  status public.warehouse_inventory_session_status,
  note text,
  started_at timestamptz,
  closed_at timestamptz,
  created_by uuid,
  item_count bigint,
  counted_count bigint,
  variance_count bigint,
  variance_value_purchase numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh_id uuid;
BEGIN
  IF NOT public.user_can_manage_company_warehouse(p_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis.';
  END IF;
  v_wh_id := public.resolve_warehouse_id(p_company_id, p_warehouse_id);

  RETURN QUERY
  SELECT
    s.id, s.warehouse_id, s.status, s.note, s.started_at, s.closed_at, s.created_by,
    COUNT(it.id) AS item_count,
    COUNT(it.counted_qty) AS counted_count,
    COUNT(*) FILTER (WHERE it.counted_qty IS NOT NULL AND COALESCE(it.variance, 0) <> 0) AS variance_count,
    COALESCE(SUM(COALESCE(it.variance, 0) * it.unit_purchase_price)
             FILTER (WHERE it.counted_qty IS NOT NULL), 0) AS variance_value_purchase
  FROM public.warehouse_inventory_sessions s
  LEFT JOIN public.warehouse_inventory_session_items it ON it.session_id = s.id
  WHERE s.warehouse_id = v_wh_id
  GROUP BY s.id
  ORDER BY s.started_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_inventory_session_start(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory_session_set_count(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory_session_validate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory_session_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory_session_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory_session_list(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.warehouse_inventory_session_start IS
  'Démarre une session d''inventaire dépôt et snapshot le stock théorique du dépôt.';
COMMENT ON FUNCTION public.warehouse_inventory_session_validate IS
  'Valide l''inventaire dépôt : stock = quantité comptée, mouvement inventory_session (entry/exit), atomique.';
