-- Abonnement self-service (côté owner) : demande d'abonnement / renouvellement
-- soumise par le propriétaire, puis VALIDÉE par le super-admin (vérification du
-- paiement Mobile Money). 100 % additif.

-- 1) Tarifs : plan mensuel 9 000 XOF, plan annuel 90 000 XOF (2 mois offerts).
UPDATE public.subscription_plans
SET price_cents = 9000, interval = 'month', name = 'Pro (mensuel)', is_active = true, updated_at = now()
WHERE slug = 'pro';

INSERT INTO public.subscription_plans (slug, name, description, price_cents, currency, interval, max_stores, max_users, is_active)
VALUES ('pro-annual', 'Pro (annuel)', 'Plan Pro annuel — 2 mois offerts', 90000, 'XOF', 'year', NULL, NULL, true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    currency = EXCLUDED.currency,
    interval = EXCLUDED.interval,
    is_active = true,
    updated_at = now();

-- 2) Demandes d'abonnement soumises par les owners.
CREATE TABLE IF NOT EXISTS public.subscription_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'XOF',
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT,
  payment_method TEXT NOT NULL,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscription_requests_company ON public.subscription_requests(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_pending ON public.subscription_requests(status) WHERE status = 'pending';

COMMENT ON TABLE public.subscription_requests IS 'Demandes d''abonnement/renouvellement soumises par les owners, validées par le super-admin.';

ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

-- Lecture : membres de l'entreprise (l'UI restreint à l'owner) + super-admin.
CREATE POLICY "subscription_requests_select" ON public.subscription_requests FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- Insertion : membre de l'entreprise concernée (création de sa propre demande).
CREATE POLICY "subscription_requests_insert" ON public.subscription_requests FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM current_user_company_ids())
);

-- Mise à jour (revue) : super-admin uniquement (le RPC ci-dessous est SECURITY DEFINER).
CREATE POLICY "subscription_requests_update" ON public.subscription_requests FOR UPDATE USING (is_super_admin());

GRANT SELECT, INSERT ON public.subscription_requests TO authenticated;

-- 3) RPC de validation/refus par le super-admin (active l'abonnement atomiquement).
CREATE OR REPLACE FUNCTION public.review_subscription_request(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.subscription_requests%ROWTYPE;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_current_end TIMESTAMPTZ;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Réservé au super-administrateur.';
  END IF;

  SELECT * INTO v_req FROM public.subscription_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Demande introuvable.';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Cette demande a déjà été traitée.';
  END IF;

  IF p_approve THEN
    -- Renouvellement : prolonge depuis la fin de période en cours si elle est future.
    SELECT current_period_end INTO v_current_end
    FROM public.company_subscriptions WHERE company_id = v_req.company_id;

    v_start := now();
    IF v_current_end IS NOT NULL AND v_current_end > now() THEN
      v_start := v_current_end;
    END IF;

    IF v_req.billing_interval = 'year' THEN
      v_end := v_start + interval '1 year';
    ELSE
      v_end := v_start + interval '1 month';
    END IF;

    INSERT INTO public.company_subscriptions (
      company_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end
    )
    VALUES (v_req.company_id, v_req.plan_id, 'active', now(), v_end, false)
    ON CONFLICT (company_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        status = 'active',
        current_period_start = now(),
        current_period_end = v_end,
        cancel_at_period_end = false,
        updated_at = now();

    UPDATE public.subscription_requests
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
    WHERE id = p_request_id;
  ELSE
    UPDATE public.subscription_requests
    SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
    WHERE id = p_request_id;
  END IF;
END
$$;

COMMENT ON FUNCTION public.review_subscription_request(uuid, boolean, text) IS 'Valide (active l''abonnement) ou refuse une demande d''abonnement. Super-admin uniquement.';

GRANT EXECUTE ON FUNCTION public.review_subscription_request(uuid, boolean, text) TO authenticated;
