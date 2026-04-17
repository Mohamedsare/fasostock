-- À exécuter dans le SQL Editor Supabase si vous avez encore
-- "Database error querying schema" après les migrations 00012 et 00013.
--
-- 1) Vérifier les droits sur public.profiles
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'profiles';

-- 2) Ré-appliquer les grants au cas où
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated;
GRANT SELECT ON public.user_company_roles TO anon, authenticated;
GRANT SELECT ON public.companies TO anon, authenticated;
GRANT SELECT ON public.roles TO anon, authenticated;

-- 3) Forcer PostgREST à recharger le cache du schéma
NOTIFY pgrst, 'reload schema';

-- 4) Vérifier qu'un profil super admin existe (remplacer par l'email du compte)
-- SELECT p.id, p.full_name, p.is_super_admin FROM auth.users u
-- JOIN public.profiles p ON p.id = u.id WHERE u.email = 'mohamedsare078@gmail.com';
