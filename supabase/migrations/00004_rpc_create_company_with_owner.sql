-- FasoStock — RPC pour créer entreprise + owner + première boutique
-- Évite les problèmes RLS lors de l'inscription (exécuté avec session utilisateur)

CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_company_name TEXT,
  p_company_slug TEXT,
  p_store_name TEXT,
  p_store_code TEXT DEFAULT NULL
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Récupérer le rôle owner
  SELECT id INTO v_owner_role_id FROM public.roles WHERE slug = 'owner' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle owner introuvable. Exécutez le seed.';
  END IF;

  -- Créer l'entreprise
  INSERT INTO public.companies (name, slug, is_active, store_quota)
  VALUES (p_company_name, NULLIF(TRIM(p_company_slug), ''), true, 3)
  RETURNING id INTO v_company_id;

  -- Lier l'utilisateur comme owner
  INSERT INTO public.user_company_roles (user_id, company_id, role_id)
  VALUES (v_user_id, v_company_id, v_owner_role_id);

  -- Créer la première boutique
  INSERT INTO public.stores (company_id, name, code, is_active, is_primary)
  VALUES (v_company_id, p_store_name, NULLIF(TRIM(p_store_code), ''), true, true)
  RETURNING id INTO v_store_id;

  -- Mettre à jour le profil si nécessaire
  INSERT INTO public.profiles (id, full_name, is_super_admin)
  VALUES (v_user_id, NULL, false)
  ON CONFLICT (id) DO UPDATE SET updated_at = now();

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'store_id', v_store_id,
    'user_id', v_user_id
  );
END;
$$;
