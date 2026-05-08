-- Retourne l’identifiant et l’horodatage serveur du paiement pour un même reçu Web / Flutter.

DROP FUNCTION IF EXISTS public.append_legacy_customer_credit_payment(uuid, public.payment_method, numeric, text);

CREATE OR REPLACE FUNCTION public.append_legacy_customer_credit_payment(
  p_credit_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit record;
  v_paid numeric;
  v_new_id uuid;
  v_created_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  IF p_credit_id IS NULL THEN
    RAISE EXCEPTION 'Crédit introuvable';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;
  IF p_method = 'other'::public.payment_method THEN
    RAISE EXCEPTION 'Méthode de paiement invalide';
  END IF;

  SELECT c.id, c.company_id, c.store_id, c.principal_amount
  INTO v_credit
  FROM public.legacy_customer_credits c
  WHERE c.id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crédit introuvable';
  END IF;

  IF NOT (v_credit.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF NOT public.has_store_access(v_credit.store_id, v_credit.company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique';
  END IF;
  IF NOT ('sales.update' = ANY (public.get_my_permission_keys(v_credit.company_id))) THEN
    RAISE EXCEPTION 'Permission refusée : sales.update';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid
  FROM public.legacy_customer_credit_payments
  WHERE credit_id = p_credit_id;

  IF (v_paid + p_amount) > (v_credit.principal_amount + 0.0001) THEN
    RAISE EXCEPTION 'Montant supérieur au reste à payer';
  END IF;

  INSERT INTO public.legacy_customer_credit_payments (credit_id, method, amount, reference, created_by)
  VALUES (
    p_credit_id,
    p_method,
    p_amount,
    NULLIF(trim(COALESCE(p_reference, '')), ''),
    auth.uid()
  )
  RETURNING id, created_at INTO v_new_id, v_created_at;

  UPDATE public.legacy_customer_credits
  SET updated_at = now()
  WHERE id = p_credit_id;

  RETURN jsonb_build_object(
    'payment_id', v_new_id,
    'created_at', v_created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_legacy_customer_credit_payment(uuid, public.payment_method, numeric, text) TO authenticated;


DROP FUNCTION IF EXISTS public.append_sale_payment(uuid, public.payment_method, numeric, text);

CREATE OR REPLACE FUNCTION public.append_sale_payment(
  p_sale_id uuid,
  p_method public.payment_method,
  p_amount numeric,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_paid numeric;
  v_new_id uuid;
  v_created_at timestamptz;
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
  VALUES (p_sale_id, p_method, p_amount, NULLIF(trim(COALESCE(p_reference, '')), ''))
  RETURNING id, created_at INTO v_new_id, v_created_at;

  UPDATE public.sales SET updated_at = now() WHERE id = p_sale_id;

  RETURN jsonb_build_object(
    'payment_id', v_new_id,
    'created_at', v_created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_sale_payment(uuid, public.payment_method, numeric, text) TO authenticated;
