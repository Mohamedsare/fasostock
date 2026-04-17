-- Blocage après 5 tentatives de connexion. Le super_admin peut débloquer dans son espace.

CREATE TABLE IF NOT EXISTS public.login_attempt_tracking (
  email_lower text PRIMARY KEY,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.login_attempt_tracking IS 'Suivi des échecs de connexion : après 5 tentatives le compte est bloqué jusqu''à déblocage par super_admin.';

-- Enregistrer un échec de connexion (appelé par le client après un signInWithPassword échoué).
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_attempts int;
BEGIN
  IF v_email = '' THEN
    RETURN;
  END IF;
  INSERT INTO public.login_attempt_tracking (email_lower, failed_attempts, locked_at, updated_at)
  VALUES (v_email, 1, NULL, now())
  ON CONFLICT (email_lower) DO UPDATE SET
    failed_attempts = LEAST(login_attempt_tracking.failed_attempts + 1, 5),
    locked_at = CASE
      WHEN login_attempt_tracking.failed_attempts + 1 >= 5 THEN now()
      ELSE login_attempt_tracking.locked_at
    END,
    updated_at = now();
END;
$$;

-- Statut de verrouillage pour un email (avant ou après tentative).
CREATE OR REPLACE FUNCTION public.get_login_lock_status(p_email text)
RETURNS TABLE (locked boolean, failed_attempts int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT lat.locked_at IS NOT NULL FROM public.login_attempt_tracking lat WHERE lat.email_lower = lower(trim(p_email))), false),
    COALESCE((SELECT lat.failed_attempts FROM public.login_attempt_tracking lat WHERE lat.email_lower = lower(trim(p_email))), 0);
$$;

-- Réinitialiser les tentatives après une connexion réussie (utilisateur authentifié, pour son propre email).
CREATE OR REPLACE FUNCTION public.reset_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT lower(email::text) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NOT NULL THEN
    DELETE FROM public.login_attempt_tracking WHERE email_lower = v_email;
  END IF;
END;
$$;

-- Liste des comptes bloqués (super_admin uniquement).
CREATE OR REPLACE FUNCTION public.admin_list_locked_logins()
RETURNS TABLE (email_lower text, failed_attempts int, locked_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lat.email_lower, lat.failed_attempts, lat.locked_at
  FROM public.login_attempt_tracking lat
  WHERE lat.locked_at IS NOT NULL
  ORDER BY lat.locked_at DESC;
$$;

-- Débloquer un compte (super_admin uniquement).
CREATE OR REPLACE FUNCTION public.admin_unlock_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  UPDATE public.login_attempt_tracking
  SET failed_attempts = 0, locked_at = NULL, updated_at = now()
  WHERE email_lower = lower(trim(p_email));
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_login_lock_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_login_attempts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_locked_logins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlock_login(text) TO authenticated;
