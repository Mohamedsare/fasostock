-- Création d'entreprise par le super admin (à remettre à une entreprise cliente).
--
-- Contexte : le super admin doit pouvoir provisionner un compte propriétaire complet
-- (entreprise + première boutique + rôle owner) SANS que le client passe par
-- l'auto-inscription. La confirmation d'email est faite automatiquement côté serveur
-- (Auth Admin API, email_confirm=true) — voir app/api/admin/create-company/route.ts.
--
-- Ce RPC est l'équivalent de `create_company_with_owner` mais pour un propriétaire
-- ARBITRAIRE (p_owner_id) au lieu de `auth.uid()`. Réservé au super administrateur.

CREATE OR REPLACE FUNCTION public.admin_create_company_with_owner(
  p_owner_id UUID,
  p_owner_full_name TEXT,
  p_company_name TEXT,
  p_company_slug TEXT DEFAULT NULL,
  p_store_name TEXT DEFAULT NULL,
  p_store_phone TEXT DEFAULT NULL,
  p_business_type_slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_store_id UUID;
  v_owner_role_id UUID;
  v_business_slug TEXT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Réservé au super administrateur.';
  END IF;

  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Propriétaire manquant.';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_company_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Nom de l''entreprise requis.';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_store_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Nom de la première boutique requis.';
  END IF;

  SELECT id INTO v_owner_role_id FROM public.roles WHERE slug = 'owner' LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Rôle owner introuvable. Exécutez le seed.';
  END IF;

  v_business_slug := NULLIF(TRIM(COALESCE(p_business_type_slug, '')), '');

  INSERT INTO public.companies (name, slug, is_active, store_quota, business_type_slug)
  VALUES (TRIM(p_company_name), NULLIF(TRIM(COALESCE(p_company_slug, '')), ''), true, 3, v_business_slug)
  RETURNING id INTO v_company_id;

  INSERT INTO public.user_company_roles (user_id, company_id, role_id)
  VALUES (p_owner_id, v_company_id, v_owner_role_id);

  -- Première boutique : code 'B1' comme l'auto-inscription (voir 00028).
  INSERT INTO public.stores (company_id, name, code, phone, is_active, is_primary)
  VALUES (v_company_id, TRIM(p_store_name), 'B1', NULLIF(TRIM(COALESCE(p_store_phone, '')), ''), true, true)
  RETURNING id INTO v_store_id;

  INSERT INTO public.profiles (id, full_name, is_super_admin, is_active)
  VALUES (p_owner_id, NULLIF(TRIM(COALESCE(p_owner_full_name, '')), ''), false, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(TRIM(EXCLUDED.full_name), ''), public.profiles.full_name),
    is_active = true,
    updated_at = now();

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'store_id', v_store_id,
    'user_id', p_owner_id
  );
END;
$$;

COMMENT ON FUNCTION public.admin_create_company_with_owner(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Provisionne entreprise + boutique + rôle owner pour un propriétaire donné. '
  'Réservé au super admin (is_super_admin()). Utilisé pour créer un compte à remettre à une entreprise.';

GRANT EXECUTE ON FUNCTION public.admin_create_company_with_owner(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
