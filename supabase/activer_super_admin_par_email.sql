-- ============================================================
-- Vous êtes connecté mais pas reconnu comme super admin ?
-- Exécutez ce script (remplacez l'email si besoin), puis DÉCONNECTEZ-VOUS
-- et RECONNECTEZ-VOUS (ou rechargez la page).
-- ============================================================

UPDATE public.profiles
SET is_super_admin = true, updated_at = now()
WHERE id = (SELECT id FROM auth.users WHERE email = 'mhdclient1@gmail.com' LIMIT 1);
