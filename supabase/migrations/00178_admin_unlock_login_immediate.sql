-- Déblocage immédiat des connexions verrouillées par le super admin.
--
-- Contexte : après 5 mots de passe faux, le compte est verrouillé 30 min
-- (00036 + 00131). Le super admin pouvait déjà débloquer, mais seulement les
-- comptes que la RPC de liste voulait bien montrer — impossible d'agir sur un
-- email dicté au téléphone, ni de voir le temps restant.
--
-- Ici :
--   1) admin_list_locked_logins : ajoute `locked`, `unlock_at`, `updated_at` et
--      remonte AUSSI les tentatives en cours (< 5 échecs) des dernières 24 h,
--      pour voir venir un blocage. Colonnes ajoutées seulement → les clients
--      existants (web, Flutter) qui lisent email_lower/failed_attempts/locked_at
--      continuent de fonctionner.
--   2) admin_unlock_login : SUPPRIME la ligne (remise à zéro totale, plus un
--      simple locked_at = NULL) et retourne `true` si quelque chose a été effacé.
--   3) admin_lookup_login_status : état de verrouillage d'un email arbitraire,
--      pour répondre « oui, il est bloqué, déblocage auto à 14h05 » avant d'agir.
--
-- Le TTL de 30 min reste celui de 00131.

-- ---------------------------------------------------------------------------
-- 1) Liste : verrous actifs + tentatives en cours
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_locked_logins();

CREATE OR REPLACE FUNCTION public.admin_list_locked_logins()
RETURNS TABLE (
  email_lower text,
  failed_attempts int,
  locked_at timestamptz,
  locked boolean,
  unlock_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lat.email_lower,
    lat.failed_attempts,
    CASE WHEN lat.locked_at > now() - interval '30 minutes' THEN lat.locked_at END,
    lat.locked_at IS NOT NULL AND lat.locked_at > now() - interval '30 minutes',
    CASE
      WHEN lat.locked_at IS NOT NULL AND lat.locked_at > now() - interval '30 minutes'
        THEN lat.locked_at + interval '30 minutes'
    END,
    lat.updated_at
  FROM public.login_attempt_tracking lat
  WHERE public.is_super_admin()
    AND (
      -- verrou actif
      (lat.locked_at IS NOT NULL AND lat.locked_at > now() - interval '30 minutes')
      -- ou tentatives récentes pas encore verrouillantes
      OR (lat.failed_attempts > 0 AND lat.updated_at > now() - interval '24 hours')
    )
  ORDER BY
    (lat.locked_at IS NOT NULL AND lat.locked_at > now() - interval '30 minutes') DESC,
    lat.updated_at DESC;
$$;

COMMENT ON FUNCTION public.admin_list_locked_logins() IS
  'Super admin : comptes verrouillés (verrou actif < 30 min) + tentatives en cours des dernières 24 h.';

-- ---------------------------------------------------------------------------
-- 2) Déblocage immédiat : purge complète de la ligne
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_unlock_login(text);

CREATE OR REPLACE FUNCTION public.admin_unlock_login(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_deleted int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  IF v_email = '' THEN
    RETURN false;
  END IF;

  DELETE FROM public.login_attempt_tracking WHERE email_lower = v_email;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted > 0;
END;
$$;

COMMENT ON FUNCTION public.admin_unlock_login(text) IS
  'Super admin : déblocage immédiat d''un email (efface compteur + verrou). true si un blocage/compteur existait.';

-- ---------------------------------------------------------------------------
-- 3) Consultation de l'état d'un email précis (dicté au téléphone)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_lookup_login_status(p_email text)
RETURNS TABLE (
  email_lower text,
  failed_attempts int,
  locked boolean,
  unlock_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(trim(coalesce(p_email, ''))),
    COALESCE(lat.failed_attempts, 0),
    COALESCE(lat.locked_at IS NOT NULL AND lat.locked_at > now() - interval '30 minutes', false),
    CASE
      WHEN lat.locked_at IS NOT NULL AND lat.locked_at > now() - interval '30 minutes'
        THEN lat.locked_at + interval '30 minutes'
    END
  FROM (SELECT 1) AS one
  LEFT JOIN public.login_attempt_tracking lat
    ON lat.email_lower = lower(trim(coalesce(p_email, '')))
  WHERE public.is_super_admin();
$$;

COMMENT ON FUNCTION public.admin_lookup_login_status(text) IS
  'Super admin : état de verrouillage de connexion d''un email donné.';

GRANT EXECUTE ON FUNCTION public.admin_list_locked_logins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlock_login(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_lookup_login_status(text) TO authenticated;
