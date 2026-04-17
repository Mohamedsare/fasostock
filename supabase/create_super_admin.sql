-- Création du super admin (à exécuter dans le SQL Editor Supabase ou via psql).
-- Si vous avez "Database error querying schema" à la connexion : exécutez d'abord la migration 00012_grants_profiles_public.sql.
--
-- Email: mohamedsare078@gmail.com
-- Nom: SARE, Prénom: MOHAMED
-- Mot de passe: Mohamedsare1!!
--
-- IMPORTANT (Supabase Cloud) : l'insertion directe dans auth.users peut être refusée.
-- Dans ce cas : 1) Créez l'utilisateur via Dashboard > Authentication > Add user (email + mot de passe).
--               2) Exécutez uniquement le bloc "Promotion super admin (utilisateur existant)" ci-dessous en mettant l'email.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_encrypted_pw TEXT := crypt('Mohamedsare1!!', gen_salt('bf'));
BEGIN
  -- 1. Insertion dans auth.users (les champs token doivent être '' pas NULL, sinon 500 au login)
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'mohamedsare078@gmail.com',
    v_encrypted_pw,
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name": "MOHAMED SARE"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  );

  -- 2. Lien dans auth.identities (nécessaire pour la connexion)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_user_id,
    format('{"sub": "%s", "email": "mohamedsare078@gmail.com"}', v_user_id)::jsonb,
    'email',
    v_user_id::text,
    NOW(),
    NOW(),
    NOW()
  );

  -- 3. Profil public avec is_super_admin = true
  INSERT INTO public.profiles (
    id,
    full_name,
    is_super_admin,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    'MOHAMED SARE',
    true,
    NOW(),
    NOW()
  );

  RAISE NOTICE 'Super admin créé: % (id: %)', 'mohamedsare078@gmail.com', v_user_id;
END $$;

-- =============================================================================
-- Promotion super admin (utilisateur déjà créé via Dashboard > Authentication)
-- Méthode 1 : avec l'UUID du user (récupéré dans Dashboard > Authentication > Users)
-- =============================================================================
-- INSERT INTO public.profiles (id, full_name, is_super_admin, created_at, updated_at)
-- VALUES ('COLLER-UUID-ICI', 'MOHAMED SARE', true, now(), now())
-- ON CONFLICT (id) DO UPDATE SET is_super_admin = true, full_name = EXCLUDED.full_name, updated_at = now();
