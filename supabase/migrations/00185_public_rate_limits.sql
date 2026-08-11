/**
 * Limite de débit partagée pour les routes API **publiques** (sans session).
 *
 * Motivation : `/api/ai/landing-chat` était ouverte à tous, sans plafond de débit ni de
 * taille. Chaque requête mobilise un appel LLM (30 s de délai, plus une reprise), donc
 * un slot de concurrence de l'hébergeur pendant près d'une minute. Quelques centaines
 * de requêtes simultanées suffisaient à saturer les fonctions — et à emporter la landing
 * *et* l'application métier avec elles, en brûlant au passage le budget du fournisseur.
 *
 * Pourquoi en base et pas en mémoire : sur une plateforme serverless, chaque instance a
 * sa propre mémoire et meurt entre deux requêtes. Un compteur en mémoire ne protège donc
 * rien du tout — il faut un compteur partagé.
 *
 * Le comptage est **atomique** (INSERT … ON CONFLICT DO UPDATE) : deux requêtes
 * concurrentes ne peuvent pas lire la même valeur et l'incrémenter chacune de son côté,
 * ce qui laisserait passer le double du quota au moment précis d'une attaque.
 */

CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  /** Empreinte SHA-256 de « portée:IP » — on ne stocke jamais l'IP en clair. */
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

/** Sert la purge des fenêtres périmées (voir plus bas). */
CREATE INDEX IF NOT EXISTS idx_public_rate_limits_updated_at
  ON public.public_rate_limits (updated_at);

/**
 * RLS active et **aucune politique** : la table n'est accessible qu'au `service_role`
 * (qui contourne la RLS), donc jamais depuis un navigateur, même authentifié.
 */
ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;

/**
 * Consomme un jeton et dit si l'appel est autorisé.
 *
 * Renvoie aussi `retry_after_seconds`, que l'appelant place dans l'en-tête `Retry-After` :
 * un client correct saura attendre au lieu de marteler.
 */
CREATE OR REPLACE FUNCTION public.public_rate_limit_hit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window interval := make_interval(
    secs => GREATEST(1, LEAST(COALESCE(p_window_seconds, 600), 86400))
  );
  v_max integer := GREATEST(1, COALESCE(p_max, 30));
  v_attempts integer;
  v_started timestamptz;
BEGIN
  IF COALESCE(btrim(p_key), '') = '' THEN
    RAISE EXCEPTION 'Clé de limitation vide.';
  END IF;

  INSERT INTO public.public_rate_limits AS r (key, attempts, window_started_at, updated_at)
  VALUES (p_key, 1, now(), now())
  ON CONFLICT (key) DO UPDATE
    SET
      /* Fenêtre expirée : on repart de 1 plutôt que de continuer à cumuler. */
      attempts = CASE
        WHEN r.window_started_at < now() - v_window THEN 1
        ELSE r.attempts + 1
      END,
      window_started_at = CASE
        WHEN r.window_started_at < now() - v_window THEN now()
        ELSE r.window_started_at
      END,
      updated_at = now()
  RETURNING r.attempts, r.window_started_at
  INTO v_attempts, v_started;

  /*
   * Purge opportuniste : sans elle, cette table grossirait indéfiniment (une ligne par
   * IP vue). Une fois sur cent en moyenne, on efface les fenêtres inactives depuis plus
   * d'un jour. Faire ce ménage ici évite d'avoir à planifier une tâche séparée, et le
   * coût reste invisible puisqu'il est amorti sur cent appels.
   */
  IF random() < 0.01 THEN
    DELETE FROM public.public_rate_limits
    WHERE updated_at < now() - interval '1 day';
  END IF;

  RETURN QUERY
  SELECT
    (v_attempts <= v_max),
    GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM ((v_started + v_window) - now())))::integer
    );
END;
$$;

/**
 * Exécutable **uniquement** par `service_role` : cette fonction est appelée depuis les
 * routes serveur. L'exposer à `anon` permettrait à un attaquant de consommer lui-même
 * les jetons de son voisin, ou de sonder la table.
 */
REVOKE ALL ON FUNCTION public.public_rate_limit_hit(text, integer, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_rate_limit_hit(text, integer, integer)
  TO service_role;
