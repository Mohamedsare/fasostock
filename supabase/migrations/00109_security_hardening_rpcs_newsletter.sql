-- Durcissement sécurité : RPC admin, bootstrap super-admin, newsletter, logs erreurs.

-- ---------------------------------------------------------------------------
-- 1) Bootstrap super-admin : uniquement service_role (Edge Function dédiée).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.set_super_admin_profile(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_super_admin_profile(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) RPC admin : contrôle is_super_admin (auth.uid()).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  is_super_admin boolean,
  is_active boolean,
  company_names text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND COALESCE(pr.is_super_admin, false)
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    p.full_name,
    p.is_super_admin,
    COALESCE(p.is_active, true),
    COALESCE(
      ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL),
      ARRAY[]::text[]
    ) AS company_names
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_company_roles ucr ON ucr.user_id = p.id
  LEFT JOIN public.companies c ON c.id = ucr.company_id
  GROUP BY p.id, u.email, p.full_name, p.is_super_admin, p.is_active
  ORDER BY p.full_name NULLS LAST, u.email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_user_company_ids(p_user_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r uuid[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND COALESCE(pr.is_super_admin, false)
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  SELECT COALESCE(ARRAY_AGG(company_id) FILTER (WHERE company_id IS NOT NULL), ARRAY[]::uuid[])
  INTO r
  FROM public.user_company_roles
  WHERE user_id = p_user_id;
  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_company_ids(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_locked_logins();

CREATE OR REPLACE FUNCTION public.admin_list_locked_logins()
RETURNS TABLE (
  email_lower text,
  failed_attempts int,
  locked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND COALESCE(pr.is_super_admin, false)
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  RETURN QUERY
  SELECT lat.email_lower, lat.failed_attempts, lat.locked_at
  FROM public.login_attempt_tracking lat
  WHERE lat.locked_at IS NOT NULL
  ORDER BY lat.locked_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_locked_logins() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Newsletter : plus d'accès direct anon/authenticated aux tables sensibles.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS newsletter_rate_limits_select_public ON public.newsletter_rate_limits;
DROP POLICY IF EXISTS newsletter_rate_limits_write_public ON public.newsletter_rate_limits;

REVOKE ALL ON TABLE public.newsletter_rate_limits FROM anon;
REVOKE ALL ON TABLE public.newsletter_rate_limits FROM authenticated;

DROP POLICY IF EXISTS newsletter_subscribers_insert_public ON public.newsletter_subscribers;

REVOKE INSERT ON public.newsletter_subscribers FROM anon;
REVOKE INSERT ON public.newsletter_subscribers FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4) log_app_error : plus d'exécution anonyme (spam / abus).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.log_app_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) FROM anon;

DROP POLICY IF EXISTS "app_error_logs_insert_self" ON public.app_error_logs;
CREATE POLICY "app_error_logs_insert_self"
ON public.app_error_logs
FOR INSERT
TO authenticated
WITH CHECK (TRUE);

REVOKE INSERT ON public.app_error_logs FROM anon;
