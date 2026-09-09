-- Crédit libre (anciens encours avant FasoStock) :
-- - création owner uniquement
-- - encaissement partiel via RPC (permission sales.update)

CREATE TABLE IF NOT EXISTS public.legacy_customer_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Crédit libre',
  principal_amount DECIMAL(18,4) NOT NULL CHECK (principal_amount > 0),
  due_at TIMESTAMPTZ,
  internal_note TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legacy_customer_credit_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  credit_id UUID NOT NULL REFERENCES public.legacy_customer_credits(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount DECIMAL(18,4) NOT NULL CHECK (amount > 0),
  reference TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_customer_credits_company_store
  ON public.legacy_customer_credits(company_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legacy_customer_credits_customer
  ON public.legacy_customer_credits(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legacy_customer_credit_payments_credit
  ON public.legacy_customer_credit_payments(credit_id, created_at DESC);

ALTER TABLE public.legacy_customer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_customer_credit_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legacy_customer_credits_select ON public.legacy_customer_credits;
CREATE POLICY legacy_customer_credits_select
ON public.legacy_customer_credits
FOR SELECT
USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.has_store_access(store_id, company_id)
);

DROP POLICY IF EXISTS legacy_customer_credits_owner_insert ON public.legacy_customer_credits;
CREATE POLICY legacy_customer_credits_owner_insert
ON public.legacy_customer_credits
FOR INSERT
WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.user_is_company_owner(company_id)
  AND public.has_store_access(store_id, company_id)
);

DROP POLICY IF EXISTS legacy_customer_credits_owner_update ON public.legacy_customer_credits;
CREATE POLICY legacy_customer_credits_owner_update
ON public.legacy_customer_credits
FOR UPDATE
USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.user_is_company_owner(company_id)
)
WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.user_is_company_owner(company_id)
  AND public.has_store_access(store_id, company_id)
);

DROP POLICY IF EXISTS legacy_customer_credits_owner_delete ON public.legacy_customer_credits;
CREATE POLICY legacy_customer_credits_owner_delete
ON public.legacy_customer_credits
FOR DELETE
USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.user_is_company_owner(company_id)
);

DROP POLICY IF EXISTS legacy_customer_credit_payments_select ON public.legacy_customer_credit_payments;
CREATE POLICY legacy_customer_credit_payments_select
ON public.legacy_customer_credit_payments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.legacy_customer_credits c
    WHERE c.id = legacy_customer_credit_payments.credit_id
      AND c.company_id IN (SELECT * FROM public.current_user_company_ids())
      AND public.has_store_access(c.store_id, c.company_id)
  )
);

DROP POLICY IF EXISTS legacy_customer_credit_payments_owner_insert ON public.legacy_customer_credit_payments;
CREATE POLICY legacy_customer_credit_payments_owner_insert
ON public.legacy_customer_credit_payments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.legacy_customer_credits c
    WHERE c.id = legacy_customer_credit_payments.credit_id
      AND c.company_id IN (SELECT * FROM public.current_user_company_ids())
      AND public.user_is_company_owner(c.company_id)
      AND public.has_store_access(c.store_id, c.company_id)
  )
);

CREATE OR REPLACE FUNCTION public.owner_create_legacy_customer_credit(
  p_company_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_title text,
  p_amount numeric,
  p_due_at timestamptz DEFAULT NULL,
  p_internal_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifié';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;
  IF p_company_id IS NULL OR p_store_id IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Paramètres manquants';
  END IF;
  IF NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Réservé au propriétaire';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Client introuvable';
  END IF;

  INSERT INTO public.legacy_customer_credits (
    company_id, store_id, customer_id, title, principal_amount, due_at, internal_note, created_by
  )
  VALUES (
    p_company_id,
    p_store_id,
    p_customer_id,
    COALESCE(NULLIF(trim(COALESCE(p_title, '')), ''), 'Crédit libre'),
    p_amount,
    p_due_at,
    NULLIF(trim(COALESCE(p_internal_note, '')), ''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_create_legacy_customer_credit(uuid, uuid, uuid, text, numeric, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.append_legacy_customer_credit_payment(
  p_credit_id uuid,
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
  v_credit record;
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
  );

  UPDATE public.legacy_customer_credits
  SET updated_at = now()
  WHERE id = p_credit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_legacy_customer_credit_payment(uuid, public.payment_method, numeric, text) TO authenticated;
