-- Répare l'anti-abus « mot de passe oublié ».
--
-- Constat en production : la fonction `consume_password_reset_attempt` existait (00113)
-- mais la table `password_reset_rate_limits` (00112) n'avait jamais été créée. La fonction
-- échouait donc en 42P01 et `/api/auth/forgot-password` répondait 503 : plus aucun email de
-- réinitialisation n'était envoyé. Cette migration est idempotente et rejouable sans risque.

CREATE TABLE IF NOT EXISTS public.password_reset_rate_limits (
  email_lower text PRIMARY KEY,
  attempts int NOT NULL DEFAULT 0,
  blocked_until timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.password_reset_rate_limits IS
  'Anti-abus reset password : 5 demandes par email puis blocage temporaire 24 h.';

-- Aucune policy : seule la fonction SECURITY DEFINER (et le service_role) y touche.
ALTER TABLE public.password_reset_rate_limits ENABLE ROW LEVEL SECURITY;

-- Purge des compteurs dormants : un email bloqué il y a des mois n'a plus à être conservé.
CREATE INDEX IF NOT EXISTS password_reset_rate_limits_updated_at_idx
  ON public.password_reset_rate_limits (updated_at);

-- Rejeu de 00113 pour garantir que la fonction et la table sont bien en phase.
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
