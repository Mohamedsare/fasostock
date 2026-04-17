-- À l'inscription (create_company_with_owner), garantir is_active = true pour le nouveau profil.
-- Évite que les comptes créés par inscription soient considérés désactivés.
CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_company_name TEXT,
  p_company_slug TEXT,
  p_store_name TEXT,
  p_store_code TEXT DEFAULT NULL,
  p_store_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_store_id UUID;
  v_owner_role_id UUID;
  v_store_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT id INTO v_owner_role_id FROM public.roles WHERE slug = 'owner' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle owner introuvable. Exécutez le seed.';
  END IF;

  INSERT INTO public.companies (name, slug, is_active, store_quota)
  VALUES (p_company_name, NULLIF(TRIM(p_company_slug), ''), true, 3)
  RETURNING id INTO v_company_id;

  INSERT INTO public.user_company_roles (user_id, company_id, role_id)
  VALUES (v_user_id, v_company_id, v_owner_role_id);

  v_store_code := COALESCE(NULLIF(TRIM(p_store_code), ''), 'B1');

  INSERT INTO public.stores (company_id, name, code, phone, is_active, is_primary)
  VALUES (v_company_id, p_store_name, v_store_code, NULLIF(TRIM(p_store_phone), ''), true, true)
  RETURNING id INTO v_store_id;

  -- Toujours activer le profil à l'inscription (is_active = true).
  INSERT INTO public.profiles (id, full_name, is_super_admin, is_active)
  VALUES (v_user_id, NULL, false, true)
  ON CONFLICT (id) DO UPDATE SET updated_at = now(), is_active = true;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'store_id', v_store_id,
    'user_id', v_user_id
  );
END;
$$;
