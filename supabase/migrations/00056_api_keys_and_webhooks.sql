-- Clés API et webhooks (API publique, intégrations).
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_company ON public.api_keys(company_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_company ON public.webhook_endpoints(company_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- Seul l'owner (ou super_admin) peut gérer les clés et webhooks de son entreprise.
CREATE POLICY "api_keys_select" ON public.api_keys FOR SELECT USING (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = api_keys.company_id AND ucr.is_active = true AND r.slug = 'owner'
  ))
);
CREATE POLICY "api_keys_insert" ON public.api_keys FOR INSERT WITH CHECK (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = api_keys.company_id AND ucr.is_active = true AND r.slug = 'owner'
  ))
);
CREATE POLICY "api_keys_delete" ON public.api_keys FOR DELETE USING (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = api_keys.company_id AND ucr.is_active = true AND r.slug = 'owner'
  ))
);

CREATE POLICY "webhook_endpoints_all_owner" ON public.webhook_endpoints FOR ALL USING (
  is_super_admin() OR (company_id IN (SELECT * FROM current_user_company_ids()) AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = webhook_endpoints.company_id AND ucr.is_active = true AND r.slug = 'owner'
  ))
);

COMMENT ON TABLE public.api_keys IS 'Clés API pour accès programme (owner uniquement).';
COMMENT ON TABLE public.webhook_endpoints IS 'URLs de webhook pour événements (vente, stock, etc.).';
