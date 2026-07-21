-- FasoStock — Suppression d'une session d'inventaire ANNULÉE.
-- Migration séparée : la 00147 a pu être appliquée avant l'ajout de cette RPC.
-- `CREATE OR REPLACE` = idempotent (sûr même si déjà présent).

-- Supprime définitivement une session ANNULÉE (les lignes suivent en cascade).
-- Interdit sur une session validée (préserve l'historique des corrections de stock).
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
  IF NOT (public.user_is_company_owner(v_company_id)
          OR public.has_permission(v_company_id, 'stock.adjust')) THEN
    RAISE EXCEPTION 'Droit insuffisant.';
  END IF;
  IF NOT public.has_store_access(v_store_id, v_company_id) THEN
    RAISE EXCEPTION 'Accès à cette boutique refusé.';
  END IF;

  DELETE FROM public.inventory_sessions WHERE id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_session_delete(uuid) TO authenticated;

COMMENT ON FUNCTION public.inventory_session_delete IS 'Supprime une session d''inventaire annulée (owner/stock.adjust). Interdit sur une session validée.';
