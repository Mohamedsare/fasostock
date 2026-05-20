-- Durcissement sécurité cœur : profils, rôles entreprise, entreprises, logs d'erreurs.

-- ---------------------------------------------------------------------------
-- 1) profiles : impossible de s'auto-promouvoir super-admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_guard_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_super_admin, false) = true AND NOT public.is_super_admin() THEN
      NEW.is_super_admin := false;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
      IF auth.uid() = OLD.id THEN
        RAISE EXCEPTION 'Modification du statut super admin non autorisée';
      END IF;
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Modification du statut super admin non autorisée';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_sensitive_columns ON public.profiles;
CREATE TRIGGER profiles_guard_sensitive_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_guard_sensitive_columns();

-- ---------------------------------------------------------------------------
-- 2) user_company_roles : clés immuables + UPDATE/INSERT restreints
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_company_roles_guard_keys()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Modification de user_id ou company_id non autorisée';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_company_roles_guard_keys ON public.user_company_roles;
CREATE TRIGGER user_company_roles_guard_keys
  BEFORE UPDATE ON public.user_company_roles
  FOR EACH ROW
  EXECUTE PROCEDURE public.user_company_roles_guard_keys();

DROP POLICY IF EXISTS "user_company_roles_insert" ON public.user_company_roles;
DROP POLICY IF EXISTS "user_company_roles_update" ON public.user_company_roles;

-- INSERT direct : uniquement premier membre (inscription) ; le reste via Edge Functions / RPC admin.
CREATE POLICY "user_company_roles_update_owner" ON public.user_company_roles
  FOR UPDATE
  USING (public.user_is_company_owner(company_id))
  WITH CHECK (public.user_is_company_owner(company_id));

-- ---------------------------------------------------------------------------
-- 3) companies : plus de création libre côté client (RPC create_company_with_owner)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "companies_insert" ON public.companies;
CREATE POLICY "companies_insert" ON public.companies
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 4) log_app_error : company_id / store_id doivent correspondre au périmètre appelant
-- ---------------------------------------------------------------------------
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

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise pour enregistrer une erreur';
  END IF;

  IF p_company_id IS NOT NULL THEN
    IF NOT public.is_super_admin()
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_company_roles ucr
        WHERE ucr.user_id = auth.uid()
          AND ucr.company_id = p_company_id
          AND ucr.is_active = true
      )
    THEN
      RAISE EXCEPTION 'company_id non autorisé pour cet utilisateur';
    END IF;
  END IF;

  IF p_store_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = p_store_id
        AND (p_company_id IS NULL OR s.company_id = p_company_id)
    ) THEN
      RAISE EXCEPTION 'store_id invalide ou incohérent avec company_id';
    END IF;
    IF p_company_id IS NULL THEN
      SELECT s.company_id INTO p_company_id
      FROM public.stores s
      WHERE s.id = p_store_id;
    END IF;
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
  IS 'Enregistre une erreur applicative (company_id/store_id validés pour l''appelant).';

GRANT EXECUTE ON FUNCTION public.log_app_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) TO authenticated;
