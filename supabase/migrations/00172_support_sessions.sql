-- FasoStock — « Mode dépannage » : le super admin entre dans une entreprise cliente.
--
-- Contexte : la base autorise DÉJÀ le super admin partout — chaque policy RLS est
-- écrite `is_super_admin() OR company_id IN (current_user_company_ids())`. Ce pouvoir
-- est aujourd'hui total, permanent et sans trace ; seule l'interface l'empêchait de
-- s'exercer (la liste des entreprises vient de `user_company_roles`).
--
-- Cette migration ne DONNE donc aucun droit nouveau : elle ENCADRE un droit existant.
--   • motif obligatoire à l'ouverture ;
--   • expiration automatique (60 min par défaut) — on ne reste pas connecté par oubli ;
--   • une seule entreprise à la fois ;
--   • trace dans `audit_logs`, lisible par le propriétaire de l'entreprise.
--
-- Le propriétaire n'est pas notifié (choix produit) mais peut tout reconstituer :
-- ouverture, motif, durée, fermeture, et chaque action faite entre les deux.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_sessions IS
  'Interventions de dépannage du support FasoStock sur une entreprise cliente. '
  'Une session ACTIVE (ended_at IS NULL AND expires_at > now()) autorise l''interface '
  'à charger cette entreprise pour le super admin. Journal consultable par le propriétaire.';

COMMENT ON COLUMN public.support_sessions.reason IS 'Motif saisi par le support à l''ouverture (obligatoire).';
COMMENT ON COLUMN public.support_sessions.expires_at IS 'Fin automatique : au-delà, l''interface retombe sur l''espace admin.';

CREATE INDEX IF NOT EXISTS support_sessions_admin_active_idx
  ON public.support_sessions (super_admin_id, expires_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS support_sessions_company_idx
  ON public.support_sessions (company_id, started_at DESC);

-- Au plus UNE session ouverte par administrateur : impossible d'être « dans » deux
-- entreprises en même temps, donc aucune ambiguïté sur l'origine d'une action.
CREATE UNIQUE INDEX IF NOT EXISTS support_sessions_one_open_per_admin_idx
  ON public.support_sessions (super_admin_id)
  WHERE ended_at IS NULL;

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

-- Lecture : le support voit tout ; le propriétaire voit les interventions SUR SON
-- entreprise (transparence — c'est la contrepartie du droit d'entrée).
DROP POLICY IF EXISTS "support_sessions_select" ON public.support_sessions;
CREATE POLICY "support_sessions_select" ON public.support_sessions FOR SELECT USING (
  public.is_super_admin()
  OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- Aucune écriture directe : tout passe par les RPC ci-dessous (motif + trace garantis).
REVOKE ALL ON public.support_sessions FROM authenticated, anon;
GRANT SELECT ON public.support_sessions TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Ouvrir une session
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_support_session(
  p_company_id uuid,
  p_reason text,
  p_minutes integer DEFAULT 60
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_minutes integer;
  v_company_name text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au support FasoStock.';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Entreprise requise.';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Motif d''intervention requis (5 caractères minimum).';
  END IF;

  SELECT name INTO v_company_name FROM public.companies WHERE id = p_company_id;
  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'Entreprise introuvable.';
  END IF;

  -- Bornes dures : jamais plus de 8 h, même si l'appelant demande davantage.
  v_minutes := LEAST(GREATEST(COALESCE(p_minutes, 60), 5), 480);

  -- Toute session précédente est refermée (et tracée) : une seule entreprise à la fois.
  WITH closed AS (
    UPDATE public.support_sessions
       SET ended_at = now()
     WHERE super_admin_id = auth.uid()
       AND ended_at IS NULL
    RETURNING id, company_id, started_at
  )
  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, new_data)
  SELECT
    c.company_id,
    auth.uid(),
    'support.session.end',
    'support_session',
    c.id,
    jsonb_build_object('duration_seconds', EXTRACT(EPOCH FROM (now() - c.started_at))::bigint)
  FROM closed c;

  INSERT INTO public.support_sessions (super_admin_id, company_id, reason, expires_at)
  VALUES (auth.uid(), p_company_id, btrim(p_reason), now() + make_interval(mins => v_minutes))
  RETURNING id INTO v_id;

  -- Trace côté entreprise : le propriétaire retrouve l'intervention dans son journal.
  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (
    p_company_id,
    auth.uid(),
    'support.session.start',
    'support_session',
    v_id,
    jsonb_build_object('reason', btrim(p_reason), 'minutes', v_minutes)
  );

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.start_support_session(uuid, text, integer) IS
  'Ouvre une intervention de dépannage sur une entreprise (super admin, motif obligatoire, expiration bornée à 8 h).';

GRANT EXECUTE ON FUNCTION public.start_support_session(uuid, text, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fermer la session
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.end_support_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé : réservé au support FasoStock.';
  END IF;

  -- L'index unique garantit au plus une session ouverte, mais la CTE reste
  -- écrite au pluriel : refermer proprement même un état incohérent.
  WITH closed AS (
    UPDATE public.support_sessions
       SET ended_at = now()
     WHERE super_admin_id = auth.uid()
       AND ended_at IS NULL
    RETURNING id, company_id, started_at
  )
  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, new_data)
  SELECT
    c.company_id,
    auth.uid(),
    'support.session.end',
    'support_session',
    c.id,
    jsonb_build_object('duration_seconds', EXTRACT(EPOCH FROM (now() - c.started_at))::bigint)
  FROM closed c;
END;
$$;

COMMENT ON FUNCTION public.end_support_session() IS
  'Referme l''intervention de dépannage en cours et l''inscrit au journal d''audit de l''entreprise.';

GRANT EXECUTE ON FUNCTION public.end_support_session() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Session active de l'appelant (lue à chaque chargement du contexte applicatif)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_support_session()
RETURNS TABLE (
  id uuid,
  company_id uuid,
  company_name text,
  reason text,
  started_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.company_id, c.name, s.reason, s.started_at, s.expires_at
    FROM public.support_sessions s
    JOIN public.companies c ON c.id = s.company_id
   WHERE s.super_admin_id = auth.uid()
     AND s.ended_at IS NULL
     AND s.expires_at > now()
     AND public.is_super_admin()
   ORDER BY s.started_at DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_support_session() IS
  'Intervention de dépannage en cours pour l''appelant (NULL si aucune ou expirée).';

GRANT EXECUTE ON FUNCTION public.current_support_session() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Journal d'audit : accepter le support
-- ─────────────────────────────────────────────────────────────────────────────
-- `log_audit` (00053) exigeait d'être MEMBRE de l'entreprise. En dépannage le super
-- admin ne l'est pas : ses actions sortaient donc du journal — exactement l'inverse
-- du but recherché. On l'autorise explicitement.
CREATE OR REPLACE FUNCTION public.log_audit(
  p_company_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_company_id IS NULL OR p_action IS NULL OR p_entity_type IS NULL THEN
    RAISE EXCEPTION 'company_id, action and entity_type are required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: not authenticated';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id AND ucr.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this company';
  END IF;

  INSERT INTO public.audit_logs (company_id, store_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_company_id, p_store_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_old_data, p_new_data)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_audit(uuid, text, text, uuid, uuid, jsonb, jsonb) IS
  'Enregistre une action dans le journal d''audit (membre de l''entreprise, ou support en dépannage).';

GRANT EXECUTE ON FUNCTION public.log_audit(uuid, text, text, uuid, uuid, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
