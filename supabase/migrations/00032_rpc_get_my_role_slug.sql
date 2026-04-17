-- RPC: retourne le slug du rôle de l'utilisateur courant pour une entreprise.
-- Permet à l'app d'afficher "Utilisateurs" aux owners même si role_permissions ne leur donne pas users.manage.
CREATE OR REPLACE FUNCTION public.get_my_role_slug(p_company_id UUID)
RETURNS TEXT AS $$
  SELECT r.slug
  FROM public.user_company_roles ucr
  JOIN public.roles r ON r.id = ucr.role_id
  WHERE ucr.user_id = auth.uid()
    AND ucr.company_id = p_company_id
    AND ucr.is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_my_role_slug(uuid) TO authenticated;
