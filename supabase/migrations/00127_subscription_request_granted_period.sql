-- Facture d'abonnement : on conserve la période accordée au moment de
-- l'approbation pour l'afficher fidèlement sur la facture PDF. 100 % additif.

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS granted_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS granted_period_end TIMESTAMPTZ;

-- Le RPC d'approbation renseigne désormais la période accordée sur la demande.
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
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note,
        granted_period_start = v_start, granted_period_end = v_end
    WHERE id = p_request_id;
  ELSE
    UPDATE public.subscription_requests
    SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
    WHERE id = p_request_id;
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.review_subscription_request(uuid, boolean, text) TO authenticated;
