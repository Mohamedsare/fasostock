-- Liste des utilisateurs pour l’admin plateforme (id, email, full_name, company_names).
-- S’exécute en SECURITY DEFINER pour pouvoir lire auth.users.

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  is_super_admin boolean,
  company_names text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    p.id,
    u.email::text,
    p.full_name,
    p.is_super_admin,
    COALESCE(
      ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL),
      ARRAY[]::text[]
    ) AS company_names
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_company_roles ucr ON ucr.user_id = p.id
  LEFT JOIN public.companies c ON c.id = ucr.company_id
  GROUP BY p.id, u.email, p.full_name, p.is_super_admin
  ORDER BY p.full_name NULLS LAST, u.email;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO service_role;
