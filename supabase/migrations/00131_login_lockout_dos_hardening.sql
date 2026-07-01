-- Durcissement anti-DoS du verrouillage de connexion.
--
-- Problème : record_failed_login(email) est appelable par anon et incrémente le
-- compteur d'échecs d'un email arbitraire → un attaquant pouvait bloquer
-- N'IMPORTE QUEL compte (5 appels), de façon PERMANENTE (jusqu'à déblocage manuel).
--
-- Correctifs (100 % dans la RPC → web ET app Flutter inchangés, aucune GRANT
-- modifiée, aucun flux client à toucher) :
--   1) Verrou TEMPORAIRE : auto-expiration après 30 min (le compteur repart à 0).
--      → un DoS permanent devient une gêne transitoire.
--   2) Rate-limit par IP (via request.headers) : plafonne le nombre d'échecs
--      enregistrés par IP et par fenêtre → renchérit l'abus de masse.
--   3) admin_list_locked_logins réservé au super-admin (avant : tout authentifié
--      pouvait lister les emails bloqués).
--
-- Durée de verrou : 30 min. Fenêtre IP : 15 min / 40 enregistrements max.

-- ---------------------------------------------------------------------------
-- Table de rate-limit par IP (accès uniquement via la RPC SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.login_failed_ip_limits (
  ip text PRIMARY KEY,
  attempts int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.login_failed_ip_limits IS
  'Anti-abus : nombre d''échecs de connexion enregistrés par IP et par fenêtre (anti-DoS du lockout).';

-- Aucune GRANT directe + RLS activée : accès seulement via record_failed_login (SECURITY DEFINER).
ALTER TABLE public.login_failed_ip_limits ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- record_failed_login : IP rate-limit + verrou temporaire
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_attempts int;
  v_locked_at timestamptz;
  v_now timestamptz := now();
  v_lock_ttl interval := interval '30 minutes';
  -- IP appelante (1re entrée de x-forwarded-for). NULL si indisponible.
  v_ip text := NULLIF(btrim(split_part(
    COALESCE(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
    ',', 1)), '');
  v_ip_attempts int;
  v_ip_window_start timestamptz;
  v_ip_window interval := interval '15 minutes';
  v_ip_max int := 40;
BEGIN
  IF v_email = '' THEN
    RETURN;
  END IF;

  -- 1) Rate-limit par IP : au-delà du plafond dans la fenêtre, on n'incrémente pas.
  IF v_ip IS NOT NULL THEN
    SELECT attempts, window_start
    INTO v_ip_attempts, v_ip_window_start
    FROM public.login_failed_ip_limits
    WHERE ip = v_ip;

    IF v_ip_window_start IS NULL OR v_ip_window_start <= v_now - v_ip_window THEN
      -- Nouvelle fenêtre.
      INSERT INTO public.login_failed_ip_limits (ip, attempts, window_start, updated_at)
      VALUES (v_ip, 1, v_now, v_now)
      ON CONFLICT (ip) DO UPDATE SET attempts = 1, window_start = v_now, updated_at = v_now;
    ELSIF v_ip_attempts >= v_ip_max THEN
      -- Plafond atteint : ignorer silencieusement (anti-DoS).
      RETURN;
    ELSE
      UPDATE public.login_failed_ip_limits
      SET attempts = attempts + 1, updated_at = v_now
      WHERE ip = v_ip;
    END IF;
  END IF;

  -- 2) Compteur par email avec verrou temporaire auto-expirant.
  SELECT failed_attempts, locked_at
  INTO v_attempts, v_locked_at
  FROM public.login_attempt_tracking
  WHERE email_lower = v_email;

  -- Verrou expiré → on repart de zéro.
  IF v_locked_at IS NOT NULL AND v_locked_at <= v_now - v_lock_ttl THEN
    v_attempts := 0;
    v_locked_at := NULL;
  END IF;

  v_attempts := COALESCE(v_attempts, 0) + 1;
  IF v_attempts >= 5 AND v_locked_at IS NULL THEN
    v_locked_at := v_now;
  END IF;

  INSERT INTO public.login_attempt_tracking (email_lower, failed_attempts, locked_at, updated_at)
  VALUES (v_email, LEAST(v_attempts, 5), v_locked_at, v_now)
  ON CONFLICT (email_lower) DO UPDATE SET
    failed_attempts = LEAST(v_attempts, 5),
    locked_at = v_locked_at,
    updated_at = v_now;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_login_lock_status : le verrou est considéré actif seulement dans la fenêtre TTL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_login_lock_status(p_email text)
RETURNS TABLE (locked boolean, failed_attempts int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT lat.locked_at IS NOT NULL AND lat.locked_at > now() - interval '30 minutes'
      FROM public.login_attempt_tracking lat
      WHERE lat.email_lower = lower(trim(p_email))
    ), false),
    COALESCE((
      SELECT CASE
        WHEN lat.locked_at IS NOT NULL AND lat.locked_at <= now() - interval '30 minutes' THEN 0
        ELSE lat.failed_attempts
      END
      FROM public.login_attempt_tracking lat
      WHERE lat.email_lower = lower(trim(p_email))
    ), 0);
$$;

-- ---------------------------------------------------------------------------
-- admin_list_locked_logins : super-admin uniquement + ne lister que les verrous actifs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_locked_logins()
RETURNS TABLE (email_lower text, failed_attempts int, locked_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lat.email_lower, lat.failed_attempts, lat.locked_at
  FROM public.login_attempt_tracking lat
  WHERE public.is_super_admin()
    AND lat.locked_at IS NOT NULL
    AND lat.locked_at > now() - interval '30 minutes'
  ORDER BY lat.locked_at DESC;
$$;

-- Grants inchangées (record_failed_login / get_login_lock_status restent
-- accessibles à anon+authenticated : web et Flutter continuent d'appeler la même
-- RPC sans modification).
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_login_lock_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_locked_logins() TO authenticated;
