-- Mise à jour crédit libre (owner) : garde principal_amount ≥ somme des paiements.

CREATE OR REPLACE FUNCTION public.owner_update_legacy_customer_credit(
  p_credit_id uuid,
  p_customer_id uuid,
  p_store_id uuid,
  p_title text,
  p_amount numeric,
  p_due_at timestamptz DEFAULT NULL,
  p_internal_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_paid numeric;
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
  IF p_customer_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Paramètres manquants';
  END IF;

  SELECT c.company_id
  INTO v_company_id
  FROM public.legacy_customer_credits c
  WHERE c.id = p_credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crédit introuvable';
  END IF;

  IF NOT (v_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF NOT public.user_is_company_owner(v_company_id) THEN
    RAISE EXCEPTION 'Réservé au propriétaire';
  END IF;
  IF NOT public.has_store_access(p_store_id, v_company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers cust
    WHERE cust.id = p_customer_id
      AND cust.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Client introuvable';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid
  FROM public.legacy_customer_credit_payments
  WHERE credit_id = p_credit_id;

  IF p_amount + 0.0001 < v_paid THEN
    RAISE EXCEPTION 'Le montant du crédit ne peut pas être inférieur aux encaissements déjà enregistrés';
  END IF;

  UPDATE public.legacy_customer_credits
  SET
    customer_id = p_customer_id,
    store_id = p_store_id,
    title = COALESCE(NULLIF(trim(COALESCE(p_title, '')), ''), 'Crédit libre'),
    principal_amount = p_amount,
    due_at = p_due_at,
    internal_note = NULLIF(trim(COALESCE(p_internal_note, '')), ''),
    updated_at = now()
  WHERE id = p_credit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_update_legacy_customer_credit(uuid, uuid, uuid, text, numeric, timestamptz, text) TO authenticated;
