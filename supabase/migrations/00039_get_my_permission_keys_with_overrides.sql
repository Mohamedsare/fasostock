-- Appliquer les overrides de permissions à get_my_permission_keys (droits effectifs = rôle + granted - revoked).
CREATE OR REPLACE FUNCTION public.get_my_permission_keys(p_company_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH role_keys AS (
    SELECT p.key
    FROM public.user_company_roles ucr
    JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
  ),
  granted AS (
    SELECT p.key
    FROM public.user_permission_overrides o
    JOIN public.permissions p ON p.id = o.permission_id
    WHERE o.user_id = auth.uid() AND o.company_id = p_company_id AND o.granted = true
  ),
  revoked AS (
    SELECT p.key
    FROM public.user_permission_overrides o
    JOIN public.permissions p ON p.id = o.permission_id
    WHERE o.user_id = auth.uid() AND o.company_id = p_company_id AND o.granted = false
  ),
  combined AS (
    SELECT key FROM role_keys
    UNION
    SELECT key FROM granted
    EXCEPT
    SELECT key FROM revoked
  )
  SELECT COALESCE(array_agg(key ORDER BY key), ARRAY[]::TEXT[]) FROM combined;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permission_keys(uuid) TO authenticated;
