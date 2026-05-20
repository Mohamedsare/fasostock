-- Passe le blocage reset password de 1 h à 24 h (si 00112 déjà appliquée avec l’ancienne durée).

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
