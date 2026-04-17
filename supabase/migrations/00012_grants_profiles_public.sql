-- Grants explicites pour éviter "Database error querying schema" à la connexion.
-- Le rôle authenticated doit pouvoir lire public.profiles (profil utilisateur dont is_super_admin).

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Profils : lecture et mise à jour pour son propre profil (RLS restreint déjà).
GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated;
