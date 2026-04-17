-- =============================================================================
-- CRÉER UN SUPER ADMIN EN 2 ÉTAPES (facile)
-- =============================================================================
--
-- ÉTAPE 1 (Dashboard Supabase) :
--   Authentication > Users > Add user
--   → Entrez l'email et le mot de passe du futur super admin > Create user
--
-- ÉTAPE 2 (ici) :
--   Remplacez VOTRE_EMAIL ci-dessous par cet email, puis exécutez tout le script
--   dans SQL Editor > New query > Run.
--
-- ÉTAPE 3 :
--   Connectez-vous à l'app avec cet email et ce mot de passe.
--   Vous verrez "Admin plateforme" dans le menu et pourrez accéder à /admin.
--
-- =============================================================================

DO $$
DECLARE
  v_email TEXT := 'mhdclient1@gmail.com';  -- Compte super admin
  v_user_id UUID;
  v_name TEXT;
BEGIN
  -- Récupérer l'utilisateur créé dans le Dashboard
  SELECT id, raw_user_meta_data->>'full_name' INTO v_user_id, v_name
  FROM auth.users
  WHERE email = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non trouvé. Créez d''abord l''utilisateur dans Dashboard > Authentication > Add user (email: %)', v_email;
  END IF;

  -- 1) Corriger les tokens (évite l'erreur 500 au login)
  UPDATE auth.users
  SET
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, '')
  WHERE id = v_user_id;

  -- 2) Donner les droits super admin (profil public)
  INSERT INTO public.profiles (id, full_name, is_super_admin, created_at, updated_at)
  VALUES (v_user_id, COALESCE(v_name, 'Super Admin'), true, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    is_super_admin = true,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    updated_at = now();

  RAISE NOTICE 'Super admin créé avec succès : % (id: %)', v_email, v_user_id;
END $$;
