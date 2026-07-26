-- FasoStock — Reprise d'une session d'inventaire clôturée (validée) ou annulée.
--
-- Besoin métier : un inventaire complet s'étale souvent sur plusieurs jours. Il arrive
-- qu'on valide à mi-parcours (volontairement ou par erreur) et qu'on veuille ensuite
-- continuer le comptage des produits restants sur la MÊME session, sans repartir de zéro.
--
-- Principe de la réouverture (le point délicat) : lors de la validation, le stock a déjà
-- été aligné sur les quantités comptées. Rouvrir en gardant l'ancien `expected_qty`
-- ferait ré-appliquer les mêmes écarts à la validation suivante (double correction).
-- On RE-SNAPSHOTE donc le stock théorique courant :
--   - les lignes déjà comptées repassent à un écart de 0 (sauf mouvements survenus depuis,
--     auquel cas l'écart affiché est le vrai écart restant) → re-valider est idempotent ;
--   - les lignes non comptées repartent du stock à jour ;
--   - les produits créés depuis le démarrage sont ajoutés au snapshot.
-- La progression (nombre de produits comptés) est conservée.
--
-- Contrainte : une seule session ouverte à la fois par boutique / dépôt, comme au démarrage.

-- ==========================================================================
-- 1) Boutique — inventory_session_reopen
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.inventory_session_reopen(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_store_id   uuid;
  v_company_id uuid;
  v_status     inventory_session_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT isess.store_id, s.company_id, isess.status
  INTO v_store_id, v_company_id, v_status
  FROM public.inventory_sessions isess
  JOIN public.stores s ON s.id = isess.store_id
  WHERE isess.id = p_session_id;

  IF v_store_id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_status = 'open' THEN RAISE EXCEPTION 'Cette session est déjà en cours.'; END IF;
  IF NOT (public.user_is_company_owner(v_company_id)
          OR public.has_permission(v_company_id, 'stock.adjust')) THEN
    RAISE EXCEPTION 'Droit insuffisant pour reprendre l''inventaire.';
  END IF;
  IF NOT public.has_store_access(v_store_id, v_company_id) THEN
    RAISE EXCEPTION 'Accès à cette boutique refusé.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inventory_sessions
    WHERE store_id = v_store_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Un autre inventaire est déjà en cours pour cette boutique. Terminez-le ou annulez-le d''abord.';
  END IF;

  -- Ajoute les produits apparus depuis le démarrage de la session.
  INSERT INTO public.inventory_session_items
    (session_id, product_id, expected_qty, counted_qty, variance,
     product_name, unit_purchase_price, unit_sale_price)
  SELECT
    p_session_id, p.id, COALESCE(si.quantity, 0), NULL, NULL,
    p.name, COALESCE(p.purchase_price, 0), COALESCE(p.sale_price, 0)
  FROM public.products p
  LEFT JOIN public.store_inventory si
    ON si.store_id = v_store_id AND si.product_id = p.id
  WHERE p.company_id = v_company_id
    AND p.deleted_at IS NULL
    AND COALESCE(p.is_active, true) = true
    AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only')
  ON CONFLICT (session_id, product_id) DO NOTHING;

  -- Re-snapshot du stock théorique + recalcul des écarts sur les lignes déjà comptées.
  -- Sous-requête scalaire (et non UPDATE ... FROM) pour couvrir aussi les produits
  -- sans ligne de stock, qui doivent retomber à 0.
  UPDATE public.inventory_session_items it
  SET expected_qty = COALESCE(
        (SELECT si.quantity FROM public.store_inventory si
         WHERE si.store_id = v_store_id AND si.product_id = it.product_id), 0),
      variance = CASE
        WHEN it.counted_qty IS NULL THEN NULL
        ELSE it.counted_qty - COALESCE(
          (SELECT si.quantity FROM public.store_inventory si
           WHERE si.store_id = v_store_id AND si.product_id = it.product_id), 0)
      END
  WHERE it.session_id = p_session_id;

  UPDATE public.inventory_sessions
  SET status = 'open', closed_at = NULL, closed_by = NULL
  WHERE id = p_session_id;
END;
$$;

-- ==========================================================================
-- 2) Dépôt — warehouse_inventory_session_reopen
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.warehouse_inventory_session_reopen(
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT s.warehouse_id, s.company_id, s.status
  INTO v_wh_id, v_company_id, v_status
  FROM public.warehouse_inventory_sessions s
  WHERE s.id = p_session_id;

  IF v_wh_id IS NULL THEN RAISE EXCEPTION 'Session introuvable'; END IF;
  IF v_status = 'open' THEN RAISE EXCEPTION 'Cette session est déjà en cours.'; END IF;
  IF NOT public.user_can_manage_company_warehouse(v_company_id) THEN
    RAISE EXCEPTION 'Droit magasin requis pour reprendre l''inventaire du dépôt.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouse_inventory_sessions
    WHERE warehouse_id = v_wh_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Un autre inventaire est déjà en cours pour ce dépôt. Terminez-le ou annulez-le d''abord.';
  END IF;

  INSERT INTO public.warehouse_inventory_session_items
    (session_id, product_id, expected_qty, counted_qty, variance, product_name, unit_purchase_price)
  SELECT
    p_session_id, p.id, COALESCE(wi.quantity, 0), NULL, NULL,
    p.name, COALESCE(wi.avg_unit_cost, p.purchase_price, 0)
  FROM public.products p
  LEFT JOIN public.warehouse_inventory wi
    ON wi.warehouse_id = v_wh_id AND wi.product_id = p.id
  WHERE p.company_id = v_company_id
    AND p.deleted_at IS NULL
    AND COALESCE(p.is_active, true) = true
    AND COALESCE(p.product_scope, 'both') IN ('both', 'warehouse_only')
  ON CONFLICT (session_id, product_id) DO NOTHING;

  UPDATE public.warehouse_inventory_session_items it
  SET expected_qty = COALESCE(
        (SELECT wi.quantity FROM public.warehouse_inventory wi
         WHERE wi.warehouse_id = v_wh_id AND wi.product_id = it.product_id), 0),
      variance = CASE
        WHEN it.counted_qty IS NULL THEN NULL
        ELSE it.counted_qty - COALESCE(
          (SELECT wi.quantity FROM public.warehouse_inventory wi
           WHERE wi.warehouse_id = v_wh_id AND wi.product_id = it.product_id), 0)
      END
  WHERE it.session_id = p_session_id;

  UPDATE public.warehouse_inventory_sessions
  SET status = 'open', closed_at = NULL, closed_by = NULL
  WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_session_reopen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_inventory_session_reopen(uuid) TO authenticated;

COMMENT ON FUNCTION public.inventory_session_reopen IS
  'Rouvre une session d''inventaire boutique clôturée/annulée : re-snapshot du stock théorique (évite la double correction) et retour au statut open.';
COMMENT ON FUNCTION public.warehouse_inventory_session_reopen IS
  'Rouvre une session d''inventaire dépôt clôturée/annulée : re-snapshot du stock théorique du dépôt et retour au statut open.';
