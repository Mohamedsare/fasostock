-- Encaissements : ne pas compter les lignes `sale_payments.method = 'other'` (solde à crédit POS / facture A4).
-- Sinon une vente 100 % crédit a déjà SUM(amount)=total et append_sale_payment refuse tout encaissement réel.

CREATE OR REPLACE FUNCTION public.append_sale_payment(
  p_sale_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_paid numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;

  SELECT id, company_id, store_id, status, total
  INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Vente non trouvée'; END IF;

  IF v_sale.status IS DISTINCT FROM 'completed'::public.sale_status THEN
    RAISE EXCEPTION 'Encaissement impossible sur une vente non complétée';
  END IF;

  IF v_sale.company_id IS NULL OR NOT (v_sale.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF NOT public.has_store_access(v_sale.store_id, v_sale.company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique';
  END IF;

  IF NOT ('sales.update' = ANY (public.get_my_permission_keys(v_sale.company_id))) THEN
    RAISE EXCEPTION 'Permission refusée : sales.update';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.sale_payments
  WHERE sale_id = p_sale_id
    AND method IS DISTINCT FROM 'other'::public.payment_method;

  IF (v_paid + p_amount) > (v_sale.total + 0.0001) THEN
    RAISE EXCEPTION 'Montant supérieur au reste à payer';
  END IF;

  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  VALUES (p_sale_id, p_method, p_amount, NULLIF(trim(COALESCE(p_reference, '')), ''));

  UPDATE public.sales SET updated_at = now() WHERE id = p_sale_id;
END;
$$;
