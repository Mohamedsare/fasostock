-- Propriétaire : supprimer définitivement une vente déjà au statut « annulée » (purge liste / historique).
-- Le stock a déjà été rétabli lors de l’annulation ; pas de mouvement stock ici.

CREATE OR REPLACE FUNCTION public.owner_purge_cancelled_sale(
  p_company_id uuid,
  p_sale_number text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status public.sale_status;
BEGIN
  IF p_company_id IS NULL OR p_sale_number IS NULL OR trim(p_sale_number) = '' THEN
    RAISE EXCEPTION 'Paramètres invalides';
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
    RAISE EXCEPTION 'Accès refusé : propriétaire requis';
  END IF;

  SELECT id, status INTO v_id, v_status
  FROM public.sales
  WHERE company_id = p_company_id
    AND sale_number = trim(p_sale_number)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente introuvable pour ce numéro';
  END IF;

  IF v_status IS DISTINCT FROM 'cancelled'::public.sale_status THEN
    RAISE EXCEPTION 'Seules les ventes déjà annulées peuvent être purgées';
  END IF;

  DELETE FROM public.sales WHERE id = v_id;
END;
$$;

COMMENT ON FUNCTION public.owner_purge_cancelled_sale(uuid, text) IS
  'Owner uniquement : DELETE une vente cancelled (cascade sale_items, sale_payments).';

GRANT EXECUTE ON FUNCTION public.owner_purge_cancelled_sale(uuid, text) TO authenticated;
