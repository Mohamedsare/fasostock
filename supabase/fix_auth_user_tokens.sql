-- Fix 500 sur /auth/v1/token pour un utilisateur déjà créé (par SQL ou import).
-- Cause : confirmation_token, email_change, email_change_token_new, recovery_token sont NULL,
-- GoTrue attend des chaînes vides.
--
-- À exécuter dans le SQL Editor Supabase (Dashboard).
-- Remplacez l'email ci-dessous par celui du compte super admin.

UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, '')
WHERE email = 'mohamedsare078@gmail.com';

-- Vérifier (optionnel) : les colonnes ne doivent plus être NULL
-- SELECT id, email, confirmation_token, recovery_token FROM auth.users WHERE email = 'mohamedsare078@gmail.com';
