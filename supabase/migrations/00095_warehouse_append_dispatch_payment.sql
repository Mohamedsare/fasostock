-- Encaissement d'un bon de sortie dépôt (mise à jour du payload "__PAYMENT_INFO__:")
-- - Autorisé si owner OU permission sales.update
-- - cash: montant partiel/total
-- - mobile_money/card: considéré comme encaissé total

CREATE OR REPLACE FUNCTION public.warehouse_append_dispatch_payment(
  p_company_id uuid,
  p_invoice_id uuid,
  p_method public.payment_method,
  p_amount numeric DEFAULT NULL,
  p_mobile_provider text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice record;
  v_total numeric(18,4) := 0;
  v_raw_note text;
  v_payload jsonb;
  v_prev_paid numeric(18,4) := 0;
  v_note_text text := NULL;
  v_new_paid numeric(18,4) := 0;
  v_mobile_provider text := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  IF p_company_id IS NULL OR p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Paramètres manquants';
  END IF;
  IF p_method NOT IN ('cash'::public.payment_method, 'mobile_money'::public.payment_method, 'card'::public.payment_method) THEN
    RAISE EXCEPTION 'Méthode de paiement invalide';
  END IF;

  SELECT w.id, w.company_id, w.notes
  INTO v_invoice
  FROM public.warehouse_dispatch_invoices w
  WHERE w.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bon de sortie introuvable';
  END IF;
  IF v_invoice.company_id <> p_company_id THEN
    RAISE EXCEPTION 'Société invalide';
  END IF;
  IF NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF NOT (
    public.user_is_company_owner(p_company_id)
    OR 'sales.update' = ANY (public.get_my_permission_keys(p_company_id))
  ) THEN
    RAISE EXCEPTION 'Permission refusée : sales.update';
  END IF;

  SELECT COALESCE(SUM(i.quantity * i.unit_price), 0)
  INTO v_total
  FROM public.warehouse_dispatch_items i
  WHERE i.invoice_id = p_invoice_id;

  v_raw_note := COALESCE(v_invoice.notes, '');
  IF left(v_raw_note, 17) = '__PAYMENT_INFO__:' THEN
    BEGIN
      v_payload := (substring(v_raw_note from 18))::jsonb;
      v_prev_paid := COALESCE((v_payload->>'paid_amount')::numeric, 0);
      v_note_text := NULLIF(trim(COALESCE(v_payload->>'note', '')), '');
    EXCEPTION WHEN others THEN
      v_prev_paid := 0;
      v_note_text := NULL;
    END;
  ELSE
    v_prev_paid := 0;
    v_note_text := NULLIF(trim(v_raw_note), '');
  END IF;

  IF p_method = 'cash'::public.payment_method THEN
    IF p_amount IS NULL OR p_amount <= 0 THEN
      RAISE EXCEPTION 'Montant invalide';
    END IF;
    v_new_paid := LEAST(v_total, GREATEST(0, v_prev_paid) + p_amount);
    v_mobile_provider := NULL;
  ELSIF p_method = 'mobile_money'::public.payment_method THEN
    v_new_paid := v_total;
    v_mobile_provider := NULLIF(trim(COALESCE(p_mobile_provider, '')), '');
  ELSE
    v_new_paid := v_total;
    v_mobile_provider := NULL;
  END IF;

  UPDATE public.warehouse_dispatch_invoices
  SET notes =
    '__PAYMENT_INFO__:' ||
    jsonb_build_object(
      'mode', p_method::text,
      'paid_amount', ROUND(v_new_paid),
      'mobile_provider', v_mobile_provider,
      'note', v_note_text
    )::text
  WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.warehouse_append_dispatch_payment(uuid, uuid, public.payment_method, numeric, text) TO authenticated;
