-- Bootstrap des abonnements entreprises + regles de trial.
-- - ELOF MULTI SERVICES et RAMADAN TELECOM: abonnement actif.
-- - Entreprises existantes restantes: essai gratuit 7 jours (a partir de maintenant).
-- - Entreprises futures: essai gratuit 14 jours via trigger.

DO $$
DECLARE
  v_free_plan_id uuid;
  v_paid_plan_id uuid;
BEGIN
  INSERT INTO public.subscription_plans (slug, name, description, price_cents, currency, interval, max_stores, max_users, is_active)
  VALUES ('pro', 'Pro', 'Plan Pro mensuel', 15000, 'XOF', 'month', NULL, NULL, true)
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    currency = EXCLUDED.currency,
    interval = EXCLUDED.interval,
    is_active = true,
    updated_at = now();

  SELECT id INTO v_free_plan_id FROM public.subscription_plans WHERE slug = 'free' LIMIT 1;
  SELECT id INTO v_paid_plan_id FROM public.subscription_plans WHERE slug = 'pro' LIMIT 1;

  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan free introuvable';
  END IF;
  IF v_paid_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan pro introuvable';
  END IF;

  INSERT INTO public.company_subscriptions (company_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end)
  SELECT c.id, v_paid_plan_id, 'active', now(), now() + interval '30 days', false
  FROM public.companies c
  WHERE upper(trim(c.name)) IN ('ELOF MULTI SERVICES', 'RAMADAN TELECOM')
  ON CONFLICT (company_id) DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = false,
    updated_at = now();

  INSERT INTO public.company_subscriptions (company_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end)
  SELECT c.id, v_free_plan_id, 'trialing', now(), now() + interval '7 days', false
  FROM public.companies c
  WHERE upper(trim(c.name)) NOT IN ('ELOF MULTI SERVICES', 'RAMADAN TELECOM')
    AND NOT EXISTS (SELECT 1 FROM public.company_subscriptions s WHERE s.company_id = c.id);
END
$$;

CREATE OR REPLACE FUNCTION public.create_default_company_subscription()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_default_plan_id uuid;
BEGIN
  SELECT id INTO v_default_plan_id FROM public.subscription_plans WHERE slug = 'free' LIMIT 1;

  IF v_default_plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.company_subscriptions (company_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end)
  VALUES (NEW.id, v_default_plan_id, 'trialing', now(), now() + interval '14 days', false)
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_create_default_company_subscription ON public.companies;
CREATE TRIGGER trg_create_default_company_subscription
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.create_default_company_subscription();
