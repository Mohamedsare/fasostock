-- Métriques exactes pour le tableau de bord super-admin (hors échantillon limité).
CREATE OR REPLACE FUNCTION public.admin_cockpit_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès réservé au super-admin' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'completed_sales_count', (SELECT COUNT(*)::bigint FROM public.sales WHERE status = 'completed'),
    'completed_sales_total', (SELECT COALESCE(SUM(total), 0)::numeric FROM public.sales WHERE status = 'completed'),
    'products_count', (SELECT COUNT(*)::bigint FROM public.products),
    'customers_count', (SELECT COUNT(*)::bigint FROM public.customers),
    'audit_distinct_users_24h', (
      SELECT COUNT(DISTINCT user_id)::bigint
      FROM public.audit_logs
      WHERE user_id IS NOT NULL
        AND created_at >= (now() - interval '24 hours')
    )
  )
  INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cockpit_dashboard_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cockpit_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cockpit_dashboard_metrics() TO service_role;
