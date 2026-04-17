-- Gestion fine des permissions : propriétaire OU utilisateur avec users.manage (cible non-owner pour les non-propriétaires).

CREATE OR REPLACE FUNCTION public.get_user_permission_keys(p_company_id UUID, p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_owner boolean;
  v_caller_can_manage boolean;
  v_target_is_owner boolean;
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
  ) INTO v_caller_is_owner;

  v_caller_can_manage := v_caller_is_owner
    OR 'users.manage' = ANY (public.get_my_permission_keys(p_company_id));

  IF NOT v_caller_can_manage THEN
    RAISE EXCEPTION 'Permission insuffisante pour consulter les droits d''un utilisateur.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'L''utilisateur n''est pas membre de cette entreprise.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_target_is_owner;

  IF v_target_is_owner AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut consulter les droits d''un autre propriétaire.';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_from_role
  FROM public.user_company_roles ucr
  JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true;

  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_grants
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = true;

  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_revokes
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = false;

  SELECT array_agg(DISTINCT k) INTO v_result
  FROM (
    SELECT unnest(v_from_role || v_grants) AS k
    EXCEPT
    SELECT unnest(v_revokes) AS k
  ) sub;
  RETURN COALESCE(v_result, ARRAY[]::TEXT[]);
END;
$$;

COMMENT ON FUNCTION public.get_user_permission_keys(uuid, uuid) IS
  'Clés effectives (rôle + surcharges). Propriétaire ou users.manage ; seul le propriétaire peut cibler un autre propriétaire.';

CREATE OR REPLACE FUNCTION public.set_user_permission_override(
  p_company_id UUID,
  p_user_id UUID,
  p_permission_key TEXT,
  p_granted BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_owner boolean;
  v_caller_can_manage boolean;
  v_target_is_owner boolean;
  v_permission_id UUID;
  v_member_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_caller_is_owner;

  v_caller_can_manage := v_caller_is_owner
    OR 'users.manage' = ANY (public.get_my_permission_keys(p_company_id));

  IF NOT v_caller_can_manage THEN
    RAISE EXCEPTION 'Permission insuffisante pour modifier les droits d''un utilisateur.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres droits via cette fonction.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_target_is_owner;

  IF v_target_is_owner AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut modifier les droits d''un autre propriétaire.';
  END IF;

  SELECT id INTO v_permission_id FROM public.permissions WHERE key = p_permission_key;
  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'Permission inconnue : %.', p_permission_key;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'L''utilisateur n''est pas membre de cette entreprise.';
  END IF;

  INSERT INTO public.user_permission_overrides (user_id, company_id, permission_id, granted)
  VALUES (p_user_id, p_company_id, v_permission_id, p_granted)
  ON CONFLICT (user_id, company_id, permission_id)
  DO UPDATE SET granted = EXCLUDED.granted, id = public.user_permission_overrides.id;
END;
$$;

COMMENT ON FUNCTION public.set_user_permission_override(uuid, uuid, text, boolean) IS
  'Surcharge de permission. Propriétaire ou users.manage ; seul le propriétaire peut cibler un autre propriétaire.';

CREATE OR REPLACE FUNCTION public.delete_user_permission_override(
  p_company_id UUID,
  p_user_id UUID,
  p_permission_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_owner boolean;
  v_caller_can_manage boolean;
  v_target_is_owner boolean;
  v_permission_id UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_caller_is_owner;

  v_caller_can_manage := v_caller_is_owner
    OR 'users.manage' = ANY (public.get_my_permission_keys(p_company_id));

  IF NOT v_caller_can_manage THEN
    RAISE EXCEPTION 'Permission insuffisante pour modifier les droits.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres droits via cette fonction.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_target_is_owner;

  IF v_target_is_owner AND NOT v_caller_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut modifier les droits d''un autre propriétaire.';
  END IF;

  SELECT id INTO v_permission_id FROM public.permissions WHERE key = p_permission_key;
  IF v_permission_id IS NULL THEN RETURN; END IF;

  DELETE FROM public.user_permission_overrides
  WHERE user_id = p_user_id AND company_id = p_company_id AND permission_id = v_permission_id;
END;
$$;
