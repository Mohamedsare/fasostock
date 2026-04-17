-- Annuler un bon / facture de sortie dépôt : réintègre le stock, supprime mouvements et document.

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
  v_uid uuid := auth.uid();
  v_line record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut annuler un bon de sortie magasin.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse_dispatch_invoices w
    WHERE w.id = p_invoice_id AND w.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Bon introuvable pour cette entreprise';
  END IF;

  FOR v_line IN
    SELECT product_id, quantity
    FROM public.warehouse_dispatch_items
    WHERE invoice_id = p_invoice_id
  LOOP
    INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, updated_at)
    VALUES (p_company_id, v_line.product_id, v_line.quantity, now())
    ON CONFLICT (company_id, product_id) DO UPDATE SET
      quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
      updated_at = now();
  END LOOP;

  DELETE FROM public.warehouse_movements
  WHERE company_id = p_company_id
    AND reference_type = 'warehouse_dispatch'
    AND reference_id = p_invoice_id;

  DELETE FROM public.warehouse_dispatch_invoices
  WHERE id = p_invoice_id AND company_id = p_company_id;
END;
$$;

COMMENT ON FUNCTION public.warehouse_void_dispatch_invoice(uuid, uuid) IS
  'Annule un bon de sortie dépôt : réintègre le stock magasin, supprime les mouvements et le document.';

GRANT EXECUTE ON FUNCTION public.warehouse_void_dispatch_invoice(uuid, uuid) TO authenticated;
