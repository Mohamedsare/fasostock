/**
 * Statistiques plateforme (super admin) — agrégées EN BASE.
 *
 * Avant : la page Admin téléchargeait dans le navigateur **toutes** les ventes de
 * toutes les entreprises pour les compter en JavaScript. Deux conséquences, l'une
 * visible, l'autre pas :
 *
 * — PostgREST plafonne chaque réponse à 1000 lignes, en silence : passé la 1000ᵉ vente
 *   de la plateforme, les chiffres affichés au super admin étaient tout simplement
 *   faux, sans le moindre signal ;
 * — et le jour où ce plafond serait levé, c'est l'onglet qui tomberait, en tirant
 *   des centaines de mégaoctets sur le réseau.
 *
 * Ces fonctions renvoient un volume constant (une ligne, ou une ligne par entreprise
 * / par jour) quelle que soit la taille de la plateforme. Le compte se fait là où sont
 * les données, et là où il existe des index.
 *
 * `SECURITY DEFINER` + garde `is_super_admin()` : ces vues traversent les entreprises,
 * donc la RLS ne peut pas servir de garde-fou — c'est la fonction qui refuse.
 */

-- ---------------------------------------------------------------- Compteurs ---
CREATE OR REPLACE FUNCTION public.admin_platform_stats()
RETURNS TABLE (
  companies_count integer,
  stores_count integer,
  users_count integer,
  sales_count bigint,
  sales_total_amount numeric,
  active_subscriptions_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès réservé au super administrateur.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::integer FROM public.companies),
    (SELECT COUNT(*)::integer FROM public.stores),
    (SELECT COUNT(*)::integer FROM public.user_company_roles),
    (SELECT COUNT(*)          FROM public.sales s WHERE s.status = 'completed'),
    (SELECT COALESCE(SUM(s.total), 0) FROM public.sales s WHERE s.status = 'completed'),
    /* Table optionnelle sur les installations anciennes : `to_regclass` évite de faire
       échouer toute la page si elle n'existe pas encore. */
    CASE
      WHEN to_regclass('public.company_subscriptions') IS NULL THEN 0
      ELSE (
        SELECT COUNT(*)::integer
        FROM public.company_subscriptions cs
        WHERE cs.status = 'active'
      )
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_platform_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_stats() TO authenticated;

-- ------------------------------------------------------ Ventes par entreprise ---
/**
 * Une ligne par entreprise, y compris celles sans aucune vente (LEFT JOIN) : la page
 * liste toutes les entreprises, une absence de vente est une information en soi.
 */
CREATE OR REPLACE FUNCTION public.admin_sales_by_company()
RETURNS TABLE (
  company_id uuid,
  company_name text,
  sales_count bigint,
  total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès réservé au super administrateur.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    COALESCE(NULLIF(btrim(c.name), ''), '—'),
    COUNT(s.id),
    COALESCE(SUM(s.total), 0)
  FROM public.companies c
  LEFT JOIN public.sales s
    ON s.company_id = c.id AND s.status = 'completed'
  GROUP BY c.id, c.name
  ORDER BY COALESCE(SUM(s.total), 0) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sales_by_company() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_sales_by_company() TO authenticated;

-- --------------------------------------------------------- Ventes par jour ---
/**
 * Une ligne par jour sur la fenêtre demandée, **jours vides compris** : la courbe doit
 * montrer les creux, pas les sauter. `generate_series` fournit le squelette, le LEFT
 * JOIN y accroche les ventes.
 *
 * Le regroupement se fait sur la date locale (`localDayStartIso` côté client utilise le
 * fuseau du navigateur ; ici on s'aligne sur celui de la base, comme le faisait déjà
 * l'agrégation JavaScript qu'on remplace).
 */
CREATE OR REPLACE FUNCTION public.admin_sales_over_time(p_days integer DEFAULT 30)
RETURNS TABLE (
  day date,
  sales_count bigint,
  total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  /* Borné : une fenêtre absurde ferait travailler la base pour rien. */
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Accès réservé au super administrateur.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE - (v_days - 1))::date,
      CURRENT_DATE,
      interval '1 day'
    )::date AS d
  )
  SELECT
    days.d,
    COUNT(s.id),
    COALESCE(SUM(s.total), 0)
  FROM days
  LEFT JOIN public.sales s
    ON s.status = 'completed'
   AND s.created_at >= days.d::timestamptz
   AND s.created_at <  (days.d + 1)::timestamptz
  GROUP BY days.d
  ORDER BY days.d;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sales_over_time(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_sales_over_time(integer) TO authenticated;

/**
 * Index de soutien : ces trois fonctions filtrent toutes sur `status = 'completed'`,
 * et deux d'entre elles ajoutent `company_id` ou une plage de dates. Sans cela, chaque
 * ouverture de la page Admin déclencherait un parcours complet de `sales`.
 */
CREATE INDEX IF NOT EXISTS idx_sales_completed_company
  ON public.sales (company_id) WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_sales_completed_created_at
  ON public.sales (created_at) WHERE status = 'completed';
