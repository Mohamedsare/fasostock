-- Allow super_admin to delete companies and stores (definitive removal).
CREATE POLICY "companies_delete" ON public.companies FOR DELETE USING (is_super_admin());
CREATE POLICY "stores_delete" ON public.stores FOR DELETE USING (is_super_admin());

-- Allow super_admin to see all user_company_roles for admin stats.
DROP POLICY IF EXISTS "user_company_roles_select" ON public.user_company_roles;
CREATE POLICY "user_company_roles_select" ON public.user_company_roles FOR SELECT USING (
  is_super_admin() OR auth.uid() = user_id OR company_id IN (SELECT * FROM current_user_company_ids())
);
