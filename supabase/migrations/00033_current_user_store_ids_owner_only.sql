-- Seul le propriétaire (owner) voit toutes les boutiques ; les autres rôles ne voient que les boutiques auxquelles ils sont assignés.
-- Avant : owner, manager et super_admin voyaient tout. Désormais : uniquement owner et super_admin.
CREATE OR REPLACE FUNCTION public.current_user_store_ids(p_company_id UUID)
RETURNS SETOF UUID AS $$
  SELECT s.id FROM public.stores s
  WHERE s.company_id = p_company_id
  AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_company_roles ucr
      JOIN public.roles r ON r.id = ucr.role_id
      WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
        AND ucr.is_active = true
        AND r.slug = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_store_assignments ua
      WHERE ua.user_id = auth.uid() AND ua.store_id = s.id AND ua.company_id = p_company_id
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.current_user_store_ids(uuid) IS 'Store IDs the user can access: super_admin and owner see all; others only their assigned stores (user_store_assignments).';
