-- Réaffectation des employés entre boutiques (propriétaire).
--
-- Le modèle est DÉJÀ multi-boutiques : `user_store_assignments` est une table N-N
-- et `current_user_store_ids()` renvoie toutes les boutiques d'un employé. Un
-- caissier affecté à deux boutiques y a donc accès aux deux, même si elles ne
-- partagent pas le même catalogue (`stores.shares_company_catalog`, migration 00139) :
-- le catalogue est résolu par boutique, pas par employé.
--
-- Ce qui manquait :
--   1) un point d'entrée pour MODIFIER ces affectations après la création du compte
--      (jusqu'ici figées par l'Edge Function `create-company-user`) ;
--   2) des garde-fous : la policy d'écriture laissait N'IMPORTE QUEL membre de
--      l'entreprise s'auto-affecter à toutes les boutiques via PostgREST ;
--   3) la coupure d'accès d'un compte désactivé (voir 4).

-- ========== 1) Qui peut gérer les employés ? ==========
-- Même règle que `get_user_permission_keys` : propriétaire, ou détenteur de `users.manage`.
CREATE OR REPLACE FUNCTION public.can_manage_company_users(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_super_admin() THEN
    RETURN true;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF v_is_owner THEN
    RETURN true;
  END IF;
  RETURN 'users.manage' = ANY (public.get_my_permission_keys(p_company_id));
END;
$$;

COMMENT ON FUNCTION public.can_manage_company_users(uuid) IS
  'true si l''appelant peut gérer les employés de l''entreprise (propriétaire, users.manage ou super admin).';

GRANT EXECUTE ON FUNCTION public.can_manage_company_users(uuid) TO authenticated;

-- ========== 2) RLS : l'affectation n'est plus modifiable par l'employé lui-même ==========
-- Avant : `company_id IN current_user_company_ids()` en INSERT comme en DELETE,
-- c'est-à-dire que tout membre pouvait s'ajouter les boutiques qu'il voulait.
DROP POLICY IF EXISTS "user_store_assignments_select" ON public.user_store_assignments;
CREATE POLICY "user_store_assignments_select" ON public.user_store_assignments FOR SELECT USING (
  auth.uid() = user_id
  OR is_super_admin()
  OR public.can_manage_company_users(company_id)
);

DROP POLICY IF EXISTS "user_store_assignments_insert" ON public.user_store_assignments;
DROP POLICY IF EXISTS "user_store_assignments_update_delete" ON public.user_store_assignments;
DROP POLICY IF EXISTS "user_store_assignments_write" ON public.user_store_assignments;
CREATE POLICY "user_store_assignments_write" ON public.user_store_assignments FOR ALL
USING (is_super_admin() OR public.can_manage_company_users(company_id))
WITH CHECK (is_super_admin() OR public.can_manage_company_users(company_id));

-- ========== 3) Écrire les affectations d'un employé (remplacement atomique) ==========
CREATE OR REPLACE FUNCTION public.set_user_store_assignments(
  p_company_id uuid,
  p_user_id uuid,
  p_store_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_count int;
  v_valid int;
  v_target_is_owner boolean;
  v_before uuid[];
BEGIN
  IF p_company_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Entreprise ou employé manquant.';
  END IF;

  IF NOT public.can_manage_company_users(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut réaffecter un employé.';
  END IF;

  -- Personne ne s'octroie ses propres boutiques : c'est tout l'objet du garde-fou.
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres affectations.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true
  ) THEN
    RAISE EXCEPTION 'Cet employé n''est pas membre actif de l''entreprise.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_target_is_owner;
  IF v_target_is_owner THEN
    RAISE EXCEPTION 'Le propriétaire a déjà accès à toutes les boutiques.';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
  INTO v_ids
  FROM unnest(COALESCE(p_store_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  v_count := COALESCE(array_length(v_ids, 1), 0);

  -- Zéro boutique = employé enfermé dehors sans le dire. Pour couper l'accès,
  -- la voie explicite est la désactivation du compte.
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Affectez au moins une boutique (pour couper l''accès, désactivez le compte).';
  END IF;

  SELECT count(*) INTO v_valid
  FROM public.stores s
  WHERE s.company_id = p_company_id AND s.id = ANY (v_ids);
  IF v_valid <> v_count THEN
    RAISE EXCEPTION 'Une boutique sélectionnée n''appartient pas à cette entreprise.';
  END IF;

  SELECT COALESCE(array_agg(ua.store_id ORDER BY ua.store_id), ARRAY[]::uuid[])
  INTO v_before
  FROM public.user_store_assignments ua
  JOIN public.stores s ON s.id = ua.store_id
  WHERE ua.user_id = p_user_id AND s.company_id = p_company_id;

  -- Retraits. On passe par `stores` plutôt que par `ua.company_id` : une ligne
  -- héritée dont le `company_id` serait faux doit disparaître elle aussi.
  DELETE FROM public.user_store_assignments ua
  USING public.stores s
  WHERE ua.user_id = p_user_id
    AND s.id = ua.store_id
    AND s.company_id = p_company_id
    AND NOT (ua.store_id = ANY (v_ids));

  -- Ajouts (et remise d'équerre du company_id sur une ligne existante).
  INSERT INTO public.user_store_assignments (user_id, store_id, company_id)
  SELECT p_user_id, x, p_company_id FROM unnest(v_ids) AS x
  ON CONFLICT (user_id, store_id) DO UPDATE SET company_id = EXCLUDED.company_id;

  IF v_before IS DISTINCT FROM (SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[]) FROM unnest(v_ids) AS x) THEN
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      p_company_id, auth.uid(), 'user.store_assignments', 'user', p_user_id,
      jsonb_build_object('store_ids', v_before),
      jsonb_build_object('store_ids', v_ids)
    );
  END IF;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.set_user_store_assignments(uuid, uuid, uuid[]) IS
  'Remplace les boutiques d''un employé (propriétaire / users.manage). Au moins une boutique, jamais sur soi-même ni sur un propriétaire.';

GRANT EXECUTE ON FUNCTION public.set_user_store_assignments(uuid, uuid, uuid[]) TO authenticated;

-- ========== 4) Lire les affectations de toute l'entreprise en une fois ==========
CREATE OR REPLACE FUNCTION public.list_company_store_assignments(p_company_id uuid)
RETURNS TABLE (user_id uuid, store_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_company_users(p_company_id) THEN
    RAISE EXCEPTION 'Permission insuffisante pour consulter les affectations.';
  END IF;
  RETURN QUERY
  SELECT ua.user_id, ua.store_id
  FROM public.user_store_assignments ua
  JOIN public.stores s ON s.id = ua.store_id
  WHERE s.company_id = p_company_id;
END;
$$;

COMMENT ON FUNCTION public.list_company_store_assignments(uuid) IS
  'Affectations employé <-> boutique de l''entreprise (propriétaire / users.manage).';

GRANT EXECUTE ON FUNCTION public.list_company_store_assignments(uuid) TO authenticated;

-- ========== 5) Un compte désactivé perd ses boutiques ==========
-- La branche « owner » vérifiait `is_active`, pas la branche « affectations » :
-- un employé désactivé continuait à voir ses boutiques via `stores_select`
-- (policy sans contrôle d'entreprise). On aligne les deux.
CREATE OR REPLACE FUNCTION public.current_user_store_ids(p_company_id UUID)
RETURNS SETOF UUID AS $$
  SELECT s.id FROM public.stores s
  WHERE s.company_id = p_company_id
  AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      JOIN public.roles r ON r.id = ucr.role_id
      WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
        AND ucr.is_active = true
        AND r.slug = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_store_assignments ua
      JOIN public.user_company_roles ucr
        ON ucr.user_id = ua.user_id
       AND ucr.company_id = p_company_id
       AND ucr.is_active = true
      WHERE ua.user_id = auth.uid() AND ua.store_id = s.id AND ua.company_id = p_company_id
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.current_user_store_ids(uuid) IS
  'Boutiques accessibles : super admin et propriétaire voient tout ; les autres uniquement leurs affectations (user_store_assignments), et seulement si leur compte est actif.';
