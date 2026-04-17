-- RPC: retourne la liste des clés de permissions de l'utilisateur courant pour une entreprise.
-- Utilisé par le frontend (usePermissions) pour afficher/masquer menus et actions selon le rôle.
CREATE OR REPLACE FUNCTION public.get_my_permission_keys(p_company_id UUID)
RETURNS TEXT[] AS $$
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  FROM public.user_company_roles ucr
  JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ucr.user_id = auth.uid()
    AND ucr.company_id = p_company_id
    AND ucr.is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_my_permission_keys(uuid) TO authenticated;
