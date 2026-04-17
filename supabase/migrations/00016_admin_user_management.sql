-- Gestion des utilisateurs par le super admin : mise à jour profil, affectation entreprises.

-- Mettre à jour le profil d'un utilisateur (full_name, is_super_admin). Réservé au super admin.
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_is_super_admin boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  UPDATE public.profiles
  SET
    full_name = COALESCE(NULLIF(TRIM(p_full_name), ''), full_name),
    is_super_admin = COALESCE(p_is_super_admin, is_super_admin),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Retourne les company_id auxquelles l'utilisateur est rattaché.
CREATE OR REPLACE FUNCTION public.admin_get_user_company_ids(p_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(company_id) FILTER (WHERE company_id IS NOT NULL), ARRAY[]::uuid[])
  FROM public.user_company_roles
  WHERE user_id = p_user_id;
$$;

-- Remplace les affectations entreprises d'un utilisateur. p_role_slug par défaut : store_manager.
CREATE OR REPLACE FUNCTION public.admin_set_user_companies(
  p_user_id uuid,
  p_company_ids uuid[],
  p_role_slug text DEFAULT 'store_manager'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_cid uuid;
BEGIN
  IF NOT (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  SELECT id INTO v_role_id FROM public.roles WHERE slug = p_role_slug LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle % introuvable', p_role_slug;
  END IF;
  DELETE FROM public.user_company_roles WHERE user_id = p_user_id;
  IF array_length(p_company_ids, 1) > 0 THEN
    FOREACH v_cid IN ARRAY p_company_ids
    LOOP
      INSERT INTO public.user_company_roles (user_id, company_id, role_id)
      VALUES (p_user_id, v_cid, v_role_id)
      ON CONFLICT (user_id, company_id) DO UPDATE SET role_id = v_role_id;
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_company_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_companies(uuid, uuid[], text) TO authenticated;
