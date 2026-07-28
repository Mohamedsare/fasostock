-- FasoStock — Page « Live » (super admin) : qui utilise l'app EN CE MOMENT.
--
-- Objectif métier : le super admin veut, en temps réel, le nombre de personnes connectées,
-- ce qu'elles sont en train de faire, et surtout **d'où elles viennent (ville)** — c'est la
-- matière première de la prospection commerciale : « 14 sessions à Bobo-Dioulasso cette
-- semaine, dont 3 entreprises qui ne sont pas encore clientes ».
--
-- Modèle — volontairement une seule table, écrasée par battement de cœur :
--   1 ligne = 1 **session d'onglet/appareil** (`user_id` + `session_id`).
--   Le client envoie un « heartbeat » toutes les ~25 s via /api/presence/heartbeat ;
--   la route serveur y ajoute IP + ville (en-têtes de l'hébergeur, non falsifiables côté
--   navigateur) puis appelle `record_presence`.
--
--   en ligne  = `ended_at IS NULL` ET `last_seen_at > now() - fenêtre` (90 s par défaut)
--   historique = les lignes restent 90 jours (statistiques de villes), puis sont purgées.
--
-- Sécurité :
--   * lecture réservée au super admin (RLS + `is_super_admin()` dans les RPC) ;
--   * écriture **impossible depuis le navigateur** : `record_presence` n'est exécutable
--     que par `service_role`, donc l'IP et la ville ne peuvent pas être maquillées ;
--   * l'IP est une donnée personnelle : ne la diffusez pas hors de cet espace.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table de présence
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_presence (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Identifiant d'onglet/appareil (sessionStorage) : un même compte peut être ouvert deux fois. */
  session_id text NOT NULL,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  store_id uuid NULL REFERENCES public.stores(id) ON DELETE SET NULL,

  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  /** Renseigné quand l'onglet est fermé (sendBeacon) : sortie immédiate, sans attendre l'expiration. */
  ended_at timestamptz NULL,

  /** Ce que la personne est en train de faire. */
  pathname text NULL,
  activity text NULL,
  page_views integer NOT NULL DEFAULT 1,

  /** Origine — renseignée côté serveur uniquement. */
  ip text NULL,
  city text NULL,
  region text NULL,
  country text NULL,
  latitude numeric(9,6) NULL,
  longitude numeric(9,6) NULL,

  user_agent text NULL,
  device_kind text NULL CHECK (device_kind IN ('mobile', 'tablet', 'desktop')),
  client_kind text NOT NULL DEFAULT 'web',

  CONSTRAINT user_presence_session_unique UNIQUE (user_id, session_id)
);

COMMENT ON TABLE public.user_presence IS
  'Sessions actives et récentes (page Live du super admin). Une ligne par onglet/appareil.';
COMMENT ON COLUMN public.user_presence.ip IS
  'Adresse IP publique vue par le serveur. Donnée personnelle : usage interne uniquement.';
COMMENT ON COLUMN public.user_presence.activity IS
  'Libellé lisible de l''écran courant (« Caisse (POS) », « Ventes »…), calculé côté client.';

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen
  ON public.user_presence(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_presence_online
  ON public.user_presence(last_seen_at DESC) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_presence_company
  ON public.user_presence(company_id);
CREATE INDEX IF NOT EXISTS idx_user_presence_city
  ON public.user_presence(city);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- Aucune policy d'écriture : seul `service_role` (qui contourne la RLS) alimente la table.
DROP POLICY IF EXISTS "user_presence_select_super_admin" ON public.user_presence;
CREATE POLICY "user_presence_select_super_admin"
ON public.user_presence
FOR SELECT
TO authenticated
USING (public.is_super_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Battement de cœur (appelé par la route API avec la clé service_role)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_presence(
  p_user_id uuid,
  p_session_id text,
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
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.user_presence AS up (
    user_id, session_id, company_id, store_id,
    pathname, activity,
    ip, city, region, country, latitude, longitude,
    user_agent, device_kind, client_kind,
    last_seen_at, ended_at
  ) VALUES (
    p_user_id, btrim(p_session_id), p_company_id, p_store_id,
    left(NULLIF(btrim(p_pathname), ''), 300), left(NULLIF(btrim(p_activity), ''), 120),
    left(NULLIF(btrim(p_ip), ''), 60), NULLIF(btrim(p_city), ''), NULLIF(btrim(p_region), ''),
    NULLIF(btrim(p_country), ''), p_latitude, p_longitude,
    left(NULLIF(btrim(p_user_agent), ''), 400),
    CASE WHEN p_device_kind IN ('mobile', 'tablet', 'desktop') THEN p_device_kind END,
    COALESCE(NULLIF(btrim(p_client_kind), ''), 'web'),
    now(),
    CASE WHEN p_leaving THEN now() END
  )
  ON CONFLICT (user_id, session_id) DO UPDATE SET
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
  uuid, text, text, text, uuid, uuid, text, text, text, text,
  numeric, numeric, text, text, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_presence(
  uuid, text, text, text, uuid, uuid, text, text, text, text,
  numeric, numeric, text, text, text, boolean
) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lecture super admin — sessions en cours
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_live_presence(
  p_window_seconds integer DEFAULT 90,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
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
    COALESCE(NULLIF(btrim(p.full_name), ''), split_part(u.email, '@', 1)) AS full_name,
    u.email::text,
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
CREATE OR REPLACE FUNCTION public.admin_presence_cities(
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  city text,
  region text,
  country text,
  users_count integer,
  companies_count integer,
  sessions_count integer,
  last_seen_at timestamptz
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
    MAX(up.last_seen_at)                   AS last_seen_at
  FROM public.user_presence up
  WHERE up.last_seen_at > now() - make_interval(days => v_days)
  GROUP BY COALESCE(up.city, 'Ville inconnue')
  -- Tri positionnel : `users_count` désignerait aussi le paramètre de sortie (ambiguïté plpgsql).
  ORDER BY 4 DESC, 6 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_presence_cities(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_presence_cities(integer) TO authenticated;
