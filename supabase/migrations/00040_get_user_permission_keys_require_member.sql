-- Exiger que l'utilisateur cible soit membre de l'entreprise dans get_user_permission_keys (cohérence avec set_user_permission_override).
CREATE OR REPLACE FUNCTION public.get_user_permission_keys(p_company_id UUID, p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_member_exists boolean;
  v_from_role TEXT[];
  v_grants TEXT[];
  v_revokes TEXT[];
  v_result TEXT[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut consulter les droits d''un utilisateur.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'L''utilisateur n''est pas membre de cette entreprise.';
  END IF;

  -- Permissions issues du rôle
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_from_role
  FROM public.user_company_roles ucr
  JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true;

  -- Overrides : ajouts (granted = true)
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_grants
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = true;

  -- Overrides : retraits (granted = false)
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_revokes
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = false;

  -- Résultat = (rôle + grants) - revokes, sans doublons
  SELECT array_agg(DISTINCT k) INTO v_result
  FROM (
    SELECT unnest(v_from_role || v_grants) AS k
    EXCEPT
    SELECT unnest(v_revokes) AS k
  ) sub;
  RETURN COALESCE(v_result, ARRAY[]::TEXT[]);
END;
$$;

COMMENT ON FUNCTION public.get_user_permission_keys(uuid, uuid) IS 'Retourne les clés de permissions effectives d''un utilisateur (rôle + overrides). Owner uniquement. L''utilisateur cible doit être membre de l''entreprise.';
