-- Limite les demandes de réinitialisation mot de passe : 5 envois puis blocage 24 h par email.

CREATE TABLE IF NOT EXISTS public.password_reset_rate_limits (
  email_lower text PRIMARY KEY,
  attempts int NOT NULL DEFAULT 0,
  blocked_until timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.password_reset_rate_limits IS
  'Anti-abus reset password : 5 demandes par email puis blocage temporaire 24 h.';

ALTER TABLE public.password_reset_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_password_reset_attempt(p_email text)
RETURNS TABLE (
  allowed boolean,
  attempts int,
  remaining_attempts int,
  blocked_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_attempts int := 0;
  v_blocked_until timestamptz := NULL;
  v_now timestamptz := now();
BEGIN
  IF v_email = '' THEN
    RETURN QUERY SELECT false, 0, 0, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT prrl.attempts, prrl.blocked_until
  INTO v_attempts, v_blocked_until
  FROM public.password_reset_rate_limits prrl
  WHERE prrl.email_lower = v_email;

  IF v_blocked_until IS NOT NULL AND v_blocked_until > v_now THEN
    RETURN QUERY
    SELECT false, v_attempts, 0, v_blocked_until;
    RETURN;
  END IF;

  IF v_blocked_until IS NOT NULL AND v_blocked_until <= v_now THEN
    v_attempts := 0;
    v_blocked_until := NULL;
  END IF;

  v_attempts := COALESCE(v_attempts, 0) + 1;

  IF v_attempts >= 5 THEN
    v_blocked_until := v_now + interval '1 day';
  END IF;

  INSERT INTO public.password_reset_rate_limits (email_lower, attempts, blocked_until, updated_at)
  VALUES (v_email, LEAST(v_attempts, 5), v_blocked_until, v_now)
  ON CONFLICT (email_lower) DO UPDATE SET
    attempts = LEAST(EXCLUDED.attempts, 5),
    blocked_until = EXCLUDED.blocked_until,
    updated_at = v_now;

  RETURN QUERY
  SELECT
    true,
    LEAST(v_attempts, 5),
    GREATEST(0, 5 - LEAST(v_attempts, 5))::int,
    v_blocked_until;
END;
$$;

COMMENT ON FUNCTION public.consume_password_reset_attempt(text) IS
  'Consomme une tentative reset password. Bloque 24 h après la 5e demande.';

REVOKE ALL ON FUNCTION public.consume_password_reset_attempt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_password_reset_attempt(text) TO service_role;
