-- Désactivation et liste admin : is_active sur profiles + RPC.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_active IS 'Si false, le compte est désactivé par un super admin (connexion refusée).';

-- Liste admin : exposer is_active (changement de type de retour → DROP puis CREATE).
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  is_super_admin boolean,
  is_active boolean,
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
    COALESCE(p.is_active, true),
    COALESCE(
      ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL),
      ARRAY[]::text[]
    ) AS company_names
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_company_roles ucr ON ucr.user_id = p.id
  LEFT JOIN public.companies c ON c.id = ucr.company_id
  GROUP BY p.id, u.email, p.full_name, p.is_super_admin, p.is_active
  ORDER BY p.full_name NULLS LAST, u.email;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO service_role;

-- Désactiver ou réactiver un compte (super admin uniquement).
CREATE OR REPLACE FUNCTION public.admin_set_user_active(
  p_user_id uuid,
  p_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas désactiver votre propre compte';
  END IF;
  UPDATE public.profiles
  SET is_active = p_active, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) TO service_role;
