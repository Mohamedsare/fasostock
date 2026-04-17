-- ============================================================
-- CRÉATION COMPLÈTE D'UN SUPER ADMIN (un seul script)
-- ============================================================
-- Email : mhdclient1@gmail.com
-- Mot de passe : Mohamedsare1
--
-- Exécutez tout ce script dans SQL Editor (Run).
-- Ensuite connectez-vous à l'app avec cet email et ce mot de passe.
--
-- Si erreur "permission denied" sur auth.users : Supabase Cloud
-- n'autorise pas l'insertion directe. Utilisez alors :
--   1) Dashboard > Authentication > Add user (mhdclient1@gmail.com / Mohamedsare1)
--   2) Fichier super_admin_simple.sql avec l'UUID copié
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_encrypted_pw TEXT := crypt('Mohamedsare1', gen_salt('bf'));
BEGIN
  -- 1. Utilisateur auth (tokens en '' pour éviter erreur 500 au login)
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
    'mhdclient1@gmail.com',
    v_encrypted_pw,
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name": "Super Admin"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  );

  -- 2. Identité (pour la connexion)
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
    format('{"sub": "%s", "email": "mhdclient1@gmail.com"}', v_user_id)::jsonb,
    'email',
    v_user_id::text,
    NOW(),
    NOW(),
    NOW()
  );

  -- 3. Profil super admin (ON CONFLICT au cas où un trigger a déjà créé le profil)
  INSERT INTO public.profiles (
    id,
    full_name,
    is_super_admin,
    created_at,
    updated_at
  )
  VALUES (
    v_user_id,
    'Super Admin',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET is_super_admin = true, updated_at = NOW();

  RAISE NOTICE 'Super admin créé. Connectez-vous avec mhdclient1@gmail.com / Mohamedsare1';
END $$;
