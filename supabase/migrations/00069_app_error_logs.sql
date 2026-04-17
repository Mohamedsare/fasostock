-- Centralise les erreurs Flutter pour affichage côté super admin SaaS.

CREATE TABLE IF NOT EXISTS public.app_error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'app',
  level TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  stack_trace TEXT NULL,
  error_type TEXT NULL,
  platform TEXT NULL,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  store_id UUID NULL REFERENCES public.stores(id) ON DELETE SET NULL,
  context JSONB NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_app_error_logs_created_at
  ON public.app_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_error_logs_company_id
  ON public.app_error_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_app_error_logs_user_id
  ON public.app_error_logs(user_id);

ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_error_logs_insert_self" ON public.app_error_logs;
CREATE POLICY "app_error_logs_insert_self"
ON public.app_error_logs
FOR INSERT
TO authenticated, anon
WITH CHECK (TRUE);

DROP POLICY IF EXISTS "app_error_logs_select_super_admin" ON public.app_error_logs;
CREATE POLICY "app_error_logs_select_super_admin"
ON public.app_error_logs
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.log_app_error(
  p_source TEXT DEFAULT 'app',
  p_level TEXT DEFAULT 'error',
  p_message TEXT DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_error_type TEXT DEFAULT NULL,
  p_platform TEXT DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_message IS NULL OR btrim(p_message) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.app_error_logs (
    user_id,
    source,
    level,
    message,
    stack_trace,
    error_type,
    platform,
    company_id,
    store_id,
    context
  ) VALUES (
    auth.uid(),
    COALESCE(NULLIF(btrim(p_source), ''), 'app'),
    COALESCE(NULLIF(btrim(p_level), ''), 'error'),
    left(p_message, 4000),
    CASE
      WHEN p_stack_trace IS NULL THEN NULL
      ELSE left(p_stack_trace, 16000)
    END,
    p_error_type,
    p_platform,
    p_company_id,
    p_store_id,
    COALESCE(p_context, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_app_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB)
  IS 'Enregistre une erreur applicative côté SaaS (visible super admin).';

GRANT SELECT ON public.app_error_logs TO authenticated;
GRANT INSERT ON public.app_error_logs TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_app_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) TO authenticated, anon;

