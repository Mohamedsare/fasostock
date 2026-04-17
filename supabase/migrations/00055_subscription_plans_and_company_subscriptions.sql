-- Plans d'abonnement et abonnements par entreprise (base pour Stripe).
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'XOF',
  interval TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
  max_stores INTEGER, -- NULL = illimité
  max_users INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company ON public.company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_stripe ON public.company_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

-- Lecture des plans : tout authentifié.
CREATE POLICY "subscription_plans_select" ON public.subscription_plans FOR SELECT TO authenticated USING (is_active = true);

-- Lecture abonnement : uniquement les membres de l'entreprise (ou super_admin).
CREATE POLICY "company_subscriptions_select" ON public.company_subscriptions FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- Insert/Update abonnement : réservé au backend (service role) ou super_admin.
CREATE POLICY "company_subscriptions_insert" ON public.company_subscriptions FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY "company_subscriptions_update" ON public.company_subscriptions FOR UPDATE USING (is_super_admin());

COMMENT ON TABLE public.subscription_plans IS 'Plans d''abonnement (ex. Starter, Pro, Enterprise).';
COMMENT ON TABLE public.company_subscriptions IS 'Abonnement actif par entreprise (lien Stripe optionnel).';

-- Plan gratuit par défaut (pour compatibilité sans Stripe).
INSERT INTO public.subscription_plans (id, slug, name, description, price_cents, currency, interval, max_stores, max_users, is_active)
SELECT uuid_generate_v4(), 'free', 'Gratuit', '1 boutique, utilisateurs limités', 0, 'XOF', 'month', 1, 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE slug = 'free');
