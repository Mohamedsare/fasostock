-- Suite à la migration 00012 : droits sur les tables utilisées juste après connexion.
-- Si l'erreur persiste, exécutez aussi supabase/troubleshoot_schema_error.sql
-- puis dans le SQL Editor : NOTIFY pgrst, 'reload schema';

GRANT SELECT ON public.user_company_roles TO anon, authenticated;
GRANT SELECT ON public.companies TO anon, authenticated;
GRANT SELECT ON public.roles TO anon, authenticated;
