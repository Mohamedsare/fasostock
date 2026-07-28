-- FasoStock — Page « Live » : suivre AUSSI les visiteurs anonymes du site public.
--
-- Mise à jour de 00159 (déjà appliquée). Ce que ça change :
--   * `user_id` devient NULL-able : une ligne sans compte = un visiteur du site vitrine,
--     c'est-à-dire un prospect ;
--   * la clé d'unicité passe de (user_id, session_id) à `session_id` seul, pour qu'une
--     session anonyme qui se connecte soit **rattachée au compte sur la même ligne**
--     (on voit le parcours visite → inscription au lieu de deux lignes sans lien) ;
--   * `visitor_id` (localStorage, persistant) distingue le nouveau venu du visiteur qui
--     revient ; `referrer` dit d'où il arrive (Google, Facebook, lien direct) ;
--   * `record_presence` accepte `p_user_id` NULL et plafonne les sessions anonymes créées
--     par IP et par heure — la route API étant désormais publique ;
--   * les deux fonctions de lecture exposent `is_anonymous`, `visit_count`, `referrer` et
--     le nombre de visiteurs anonymes par ville.
--
-- Entièrement ré-exécutable : sur une base neuve où 00159 contient déjà la version finale,
-- cette migration ne fait que réécrire à l'identique.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table : anonymes autorisés, nouvelles colonnes, nouvelle clé d'unicité
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_presence
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.user_presence
  ADD COLUMN IF NOT EXISTS visitor_id text NULL,
  ADD COLUMN IF NOT EXISTS referrer text NULL;

COMMENT ON COLUMN public.user_presence.user_id IS
  'NULL = visiteur anonyme (site public). Renseigné dès qu''il se connecte, sur la même ligne.';
COMMENT ON COLUMN public.user_presence.visitor_id IS
  'Identifiant de navigateur (localStorage), persistant : reconnaît un visiteur qui revient.';
COMMENT ON COLUMN public.user_presence.referrer IS
  'D''où vient le visiteur (Google, Facebook, lien direct…) — matière première de la prospection.';

-- Doublons théoriques avant de resserrer la contrainte sur `session_id` seul :
-- on garde la ligne vue le plus récemment.
DELETE FROM public.user_presence up
USING public.user_presence keep
WHERE up.session_id = keep.session_id
  AND (up.last_seen_at, up.id) < (keep.last_seen_at, keep.id);

ALTER TABLE public.user_presence
  DROP CONSTRAINT IF EXISTS user_presence_session_unique;
ALTER TABLE public.user_presence
  ADD CONSTRAINT user_presence_session_unique UNIQUE (session_id);

CREATE INDEX IF NOT EXISTS idx_user_presence_visitor
  ON public.user_presence(visitor_id);
/** Garde-fou anti-abus sur l'endpoint public : compter vite les sessions anonymes d'une IP. */
CREATE INDEX IF NOT EXISTS idx_user_presence_anon_ip
  ON public.user_presence(ip, first_seen_at DESC) WHERE user_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Battement de cœur — nouvelle signature (anciennes versions retirées)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.record_presence(
  uuid, text, text, text, uuid, uuid, text, text, text, text,
  numeric, numeric, text, text, text, boolean
);

CREATE OR REPLACE FUNCTION public.record_presence(
  /** NULL = visiteur anonyme du site public. */
  p_user_id uuid,
  p_session_id text,
  p_visitor_id text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_pathname text DEFAULT NULL,
  p_activity text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_kind text DEFAULT NULL,
  p_client_kind text DEFAULT 'web',
  p_leaving boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session   text := btrim(COALESCE(p_session_id, ''));
  v_ip        text := left(NULLIF(btrim(p_ip), ''), 60);
  v_company   uuid := p_company_id;
  v_anon_seen integer;
BEGIN
  IF v_session = '' THEN
    RETURN;
  END IF;

  /**
   * Endpoint public (visiteurs anonymes) : plafonner les sessions créées par IP et par heure,
   * sinon n'importe qui peut gonfler la table en changeant d'identifiant d'onglet.
   * Au-delà du plafond, on continue de rafraîchir les sessions existantes, sans en créer.
   */
  IF p_user_id IS NULL THEN
    SELECT count(*) INTO v_anon_seen
    FROM public.user_presence
    WHERE user_id IS NULL
      AND ip IS NOT DISTINCT FROM v_ip
      AND first_seen_at > now() - interval '1 hour';

    IF v_anon_seen > 40
       AND NOT EXISTS (
         SELECT 1 FROM public.user_presence WHERE session_id = v_session
       ) THEN
      RETURN;
    END IF;
  END IF;

  /** Entreprise non transmise par le client : la déduire du compte (source de vérité). */
  IF v_company IS NULL AND p_user_id IS NOT NULL THEN
    SELECT ucr.company_id INTO v_company
    FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_user_id AND ucr.is_active
    ORDER BY ucr.company_id
    LIMIT 1;
  END IF;

  INSERT INTO public.user_presence AS up (
    user_id, session_id, visitor_id, company_id, store_id,
    pathname, activity, referrer,
    ip, city, region, country, latitude, longitude,
    user_agent, device_kind, client_kind,
    last_seen_at, ended_at
  ) VALUES (
    p_user_id, v_session, left(NULLIF(btrim(p_visitor_id), ''), 100), v_company, p_store_id,
    left(NULLIF(btrim(p_pathname), ''), 300), left(NULLIF(btrim(p_activity), ''), 120),
    left(NULLIF(btrim(p_referrer), ''), 300),
    v_ip, NULLIF(btrim(p_city), ''), NULLIF(btrim(p_region), ''),
    NULLIF(btrim(p_country), ''), p_latitude, p_longitude,
    left(NULLIF(btrim(p_user_agent), ''), 400),
    CASE WHEN p_device_kind IN ('mobile', 'tablet', 'desktop') THEN p_device_kind END,
    COALESCE(NULLIF(btrim(p_client_kind), ''), 'web'),
    now(),
    CASE WHEN p_leaving THEN now() END
  )
  ON CONFLICT (session_id) DO UPDATE SET
    last_seen_at = now(),
    ended_at     = CASE WHEN p_leaving THEN now() ELSE NULL END,
    -- Une page vue de plus seulement si l'écran a changé (le simple battement n'en est pas une).
    page_views   = up.page_views
                   + CASE
                       WHEN EXCLUDED.pathname IS NOT NULL
                        AND EXCLUDED.pathname IS DISTINCT FROM up.pathname THEN 1
                       ELSE 0
                     END,
    pathname     = COALESCE(EXCLUDED.pathname, up.pathname),
    activity     = COALESCE(EXCLUDED.activity, up.activity),
    /** Le visiteur anonyme vient de se connecter : la session lui est rattachée sans doublon. */
    user_id      = COALESCE(EXCLUDED.user_id, up.user_id),
    visitor_id   = COALESCE(EXCLUDED.visitor_id, up.visitor_id),
    /** Le référent n'a de sens qu'à l'arrivée : on ne l'écrase jamais. */
    referrer     = COALESCE(up.referrer, EXCLUDED.referrer),
    company_id   = COALESCE(EXCLUDED.company_id, up.company_id),
    store_id     = COALESCE(EXCLUDED.store_id, up.store_id),
    ip           = COALESCE(EXCLUDED.ip, up.ip),
    city         = COALESCE(EXCLUDED.city, up.city),
    region       = COALESCE(EXCLUDED.region, up.region),
    country      = COALESCE(EXCLUDED.country, up.country),
    latitude     = COALESCE(EXCLUDED.latitude, up.latitude),
    longitude    = COALESCE(EXCLUDED.longitude, up.longitude),
    user_agent   = COALESCE(EXCLUDED.user_agent, up.user_agent),
    device_kind  = COALESCE(EXCLUDED.device_kind, up.device_kind);

  -- Purge paresseuse (~1 appel sur 200) : garde 90 jours d'historique pour les villes.
  IF random() < 0.005 THEN
    DELETE FROM public.user_presence WHERE last_seen_at < now() - interval '90 days';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_presence(
  uuid, text, text, text, text, text, uuid, uuid, text, text, text, text,
  numeric, numeric, text, text, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_presence(
  uuid, text, text, text, text, text, uuid, uuid, text, text, text, text,
  numeric, numeric, text, text, text, boolean
) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lecture super admin — sessions (le type de retour change : DROP obligatoire)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_live_presence(integer, integer);

CREATE FUNCTION public.admin_live_presence(
  p_window_seconds integer DEFAULT 90,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  is_anonymous boolean,
  visitor_id text,
  visit_count integer,
  referrer text,
  full_name text,
  email text,
  company_id uuid,
  company_name text,
  store_id uuid,
  store_name text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  seconds_since_seen integer,
  is_online boolean,
  pathname text,
  activity text,
  page_views integer,
  ip text,
  city text,
  region text,
  country text,
  device_kind text,
  client_kind text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window integer := GREATEST(30, LEAST(COALESCE(p_window_seconds, 90), 3600));
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès réservé au super administrateur.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    up.id,
    up.user_id,
    (up.user_id IS NULL) AS is_anonymous,
    up.visitor_id,
    /** Nombre de visites déjà faites par ce navigateur — un « revenant » est un signal d'achat. */
    (
      SELECT COUNT(DISTINCT prev.session_id)::integer
      FROM public.user_presence prev
      WHERE up.visitor_id IS NOT NULL AND prev.visitor_id = up.visitor_id
    ) AS visit_count,
    up.referrer,
    COALESCE(
      NULLIF(btrim(p.full_name), ''),
      NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
      'Visiteur anonyme'
    ) AS full_name,
    COALESCE(u.email, '')::text AS email,
    up.company_id,
    c.name AS company_name,
    up.store_id,
    s.name AS store_name,
    up.first_seen_at,
    up.last_seen_at,
    EXTRACT(EPOCH FROM (now() - up.last_seen_at))::integer AS seconds_since_seen,
    (up.ended_at IS NULL AND up.last_seen_at > now() - make_interval(secs => v_window)) AS is_online,
    up.pathname,
    up.activity,
    up.page_views,
    up.ip,
    up.city,
    up.region,
    up.country,
    up.device_kind,
    up.client_kind
  FROM public.user_presence up
  LEFT JOIN public.profiles p ON p.id = up.user_id
  LEFT JOIN auth.users u ON u.id = up.user_id
  LEFT JOIN public.companies c ON c.id = up.company_id
  LEFT JOIN public.stores s ON s.id = up.store_id
  -- Les sessions closes ou trop anciennes gardent un intérêt : « qui vient de partir ».
  WHERE up.last_seen_at > now() - interval '24 hours'
  ORDER BY up.last_seen_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_live_presence(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_live_presence(integer, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Lecture super admin — villes (prospection)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_presence_cities(integer);

CREATE FUNCTION public.admin_presence_cities(
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  city text,
  region text,
  country text,
  users_count integer,
  companies_count integer,
  sessions_count integer,
  last_seen_at timestamptz,
  /** Navigateurs distincts jamais connectés : le vivier de prospection de cette ville. */
  anonymous_visitors_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 90));
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès réservé au super administrateur.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(up.city, 'Ville inconnue') AS city,
    MAX(up.region)  AS region,
    MAX(up.country) AS country,
    COUNT(DISTINCT up.user_id)::integer    AS users_count,
    COUNT(DISTINCT up.company_id)::integer AS companies_count,
    COUNT(*)::integer                      AS sessions_count,
    MAX(up.last_seen_at)                   AS last_seen_at,
    COUNT(DISTINCT up.visitor_id) FILTER (WHERE up.user_id IS NULL)::integer
      AS anonymous_visitors_count
  FROM public.user_presence up
  WHERE up.last_seen_at > now() - make_interval(days => v_days)
  GROUP BY COALESCE(up.city, 'Ville inconnue')
  -- Expressions répétées et non les alias : un alias serait ambigu avec le paramètre de sortie.
  ORDER BY
    (COUNT(DISTINCT up.user_id)
     + COUNT(DISTINCT up.visitor_id) FILTER (WHERE up.user_id IS NULL)) DESC,
    COUNT(*) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_presence_cities(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_presence_cities(integer) TO authenticated;
