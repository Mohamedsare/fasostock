-- Fix: companies RLS for signup flow (anon role before email confirmation)
-- Also fix: companies table uses "id" not "company_id" in policies
-- Ensure is_super_admin exists (in case 00002 wasn't run)

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Drop and recreate companies policies
DROP POLICY IF EXISTS "companies_select" ON public.companies;
DROP POLICY IF EXISTS "companies_insert" ON public.companies;
DROP POLICY IF EXISTS "companies_update" ON public.companies;

CREATE POLICY "companies_select" ON public.companies FOR SELECT USING (
  is_super_admin() OR id IN (SELECT * FROM current_user_company_ids())
);

-- Allow insert for signup flow (anon before email confirmation, or authenticated after)
CREATE POLICY "companies_insert" ON public.companies FOR INSERT WITH CHECK (true);

CREATE POLICY "companies_update" ON public.companies FOR UPDATE USING (
  is_super_admin() OR id IN (SELECT * FROM current_user_company_ids())
);
