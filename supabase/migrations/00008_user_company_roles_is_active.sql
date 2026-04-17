-- Add is_active to user_company_roles so owners can enable/disable access per user.
ALTER TABLE public.user_company_roles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_company_roles.is_active IS 'When false, user cannot access this company (owner can reactivate).';

-- Restrict "current companies" to active memberships only (deactivated users lose access).
CREATE OR REPLACE FUNCTION public.current_user_company_ids()
RETURNS SETOF UUID AS $$
  SELECT company_id FROM public.user_company_roles WHERE user_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
