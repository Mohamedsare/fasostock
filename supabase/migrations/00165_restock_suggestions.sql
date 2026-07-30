-- FasoStock — Module « Réassort » : ce qui se vend bien et qui va manquer.
--
-- Problème réel du gérant : ses meilleures ventes tombent en rupture sans qu'il s'en
-- rende compte, et quand il commande il devine les quantités. Cette page répond aux
-- deux questions dans l'ordre :
--
--   1. QUOI commander → les produits QUI SE VENDENT (ventes réelles sur la période)
--      et dont le stock est bas : sous le seuil, ou moins de N jours de couverture.
--   2. COMBIEN        → une quantité conseillée calculée sur l'HISTORIQUE DE VENTES,
--      pas sur une intuition : vitesse de vente × jours de couverture visés − stock.
--      L'IA (page web) affine ensuite ce chiffre et explique son raisonnement, mais
--      la suggestion statistique existe toujours, même sans IA configurée.
--
-- Disponibilité : ACTIVÉ PAR DÉFAUT pour tous les métiers (`DEFAULT true`), le super
-- admin pouvant le couper pour une entreprise (`companies.restock_module_enabled`) ou
-- pour une boutique (`stores.restock_module_enabled`). Contrairement aux autres
-- modules, les deux drapeaux sont donc SOUSTRACTIFS : le module est actif tant que
-- personne ne l'a coupé.
--
-- Aucune table métier n'est créée : la page lit les ventes, le stock et les achats
-- existants. Passer commande réutilise le module Achats (achat brouillon).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drapeaux d'activation (plateforme) — activés par défaut
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS restock_module_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.restock_module_enabled IS
  'Module Réassort (produits à recommander + quantité conseillée) pour toute l''entreprise. '
  'Activé par défaut ; seul le super admin peut le couper.';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS restock_module_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.stores.restock_module_enabled IS
  'Module Réassort actif pour cette boutique. Activé par défaut ; coupé par le super admin '
  'depuis Admin › Boutiques. Le drapeau entreprise prime : s''il est coupé, tout est coupé.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Permission dédiée (owner par défaut, accordable aux autres rôles)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'restock.view')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Garde plateforme : le drapeau entreprise reste au super admin
--    (étend 00132 / 00162 / 00164 — même corps, colonne en plus).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.companies_enforce_platform_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.warehouse_feature_enabled IS DISTINCT FROM OLD.warehouse_feature_enabled
     OR NEW.store_quota_increase_enabled IS DISTINCT FROM OLD.store_quota_increase_enabled
     OR NEW.ai_predictions_enabled IS DISTINCT FROM OLD.ai_predictions_enabled
     OR NEW.accounting_module_enabled IS DISTINCT FROM OLD.accounting_module_enabled
     OR NEW.hr_module_enabled IS DISTINCT FROM OLD.hr_module_enabled
     OR NEW.expiry_module_enabled IS DISTINCT FROM OLD.expiry_module_enabled
     OR NEW.parts_module_enabled IS DISTINCT FROM OLD.parts_module_enabled
     OR NEW.restock_module_enabled IS DISTINCT FROM OLD.restock_module_enabled
  THEN
    RAISE EXCEPTION 'Modification réservée à l''administration plateforme.';
  END IF;

  IF NEW.store_quota IS DISTINCT FROM OLD.store_quota THEN
    IF NEW.store_quota > OLD.store_quota AND NOT COALESCE(OLD.store_quota_increase_enabled, true) THEN
      RAISE EXCEPTION 'L''augmentation du quota de boutiques est désactivée pour cette entreprise.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_platform_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_platform_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.companies_enforce_platform_flags();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Helper : le module est-il actif dans ce périmètre ?
--    `p_store_id` NULL (vue « toutes boutiques ») → au moins une boutique active.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restock_module_enabled(
  p_company_id uuid,
  p_store_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT c.restock_module_enabled FROM public.companies c WHERE c.id = p_company_id),
      false
    )
    AND CASE
      WHEN p_store_id IS NULL THEN EXISTS (
        SELECT 1 FROM public.stores s
        WHERE s.company_id = p_company_id AND s.restock_module_enabled = true
      )
      ELSE COALESCE(
        (SELECT s.restock_module_enabled
         FROM public.stores s
         WHERE s.id = p_store_id AND s.company_id = p_company_id),
        false
      )
    END;
$$;
GRANT EXECUTE ON FUNCTION public.restock_module_enabled(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC principale — produits à recommander, avec quantité conseillée
--
--    Méthode (volontairement simple et vérifiable par le gérant) :
--      vitesse/jour     = quantité vendue sur la période ÷ nombre de jours
--      couverture       = stock actuel ÷ vitesse/jour     (jours restants)
--      cible            = vitesse/jour × jours de couverture visés
--      quantité conseil. = cible − stock, jamais moins que (seuil − stock), min 1
--    Un produit n'apparaît que s'il S'EST VENDU sur la période (« bien vendu ») ET
--    qu'il est bas : sous son seuil, ou moins de `p_cover_days` de couverture.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restock_candidates(
  p_company_id uuid,
  p_store_id uuid,
  p_days integer DEFAULT 30,
  p_cover_days integer DEFAULT 30,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  sku text,
  unit text,
  category_name text,
  stock numeric,
  stock_min numeric,
  sold_qty numeric,
  sales_count bigint,
  revenue numeric,
  daily_rate numeric,
  cover_days numeric,
  suggested_qty numeric,
  sale_price numeric,
  purchase_price numeric,
  last_purchase_price numeric,
  last_purchase_at timestamptz,
  supplier_id uuid,
  supplier_name text,
  urgency text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      GREATEST(COALESCE(p_days, 30), 1) AS days,
      GREATEST(COALESCE(p_cover_days, 30), 1) AS cover,
      GREATEST(LEAST(COALESCE(p_limit, 100), 500), 1) AS lim
  ),
  scope AS (
    SELECT s.id
    FROM public.stores s
    WHERE s.company_id = p_company_id
      AND (p_store_id IS NULL OR s.id = p_store_id)
  ),
  sold AS (
    SELECT
      si.product_id,
      sum(si.quantity)::numeric AS qty,
      count(DISTINCT s.id) AS tickets,
      sum(si.total)::numeric AS revenue
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params pa
    WHERE s.company_id = p_company_id
      AND s.status = 'completed'
      AND s.store_id IN (SELECT id FROM scope)
      AND s.created_at >= now() - make_interval(days => pa.days)
    GROUP BY si.product_id
  ),
  stock_now AS (
    SELECT inv.product_id, sum(inv.quantity)::numeric AS qty
    FROM public.store_inventory inv
    WHERE inv.store_id IN (SELECT id FROM scope)
    GROUP BY inv.product_id
  ),
  last_purchase AS (
    SELECT DISTINCT ON (pi.product_id)
      pi.product_id,
      pi.unit_price::numeric AS unit_price,
      pu.created_at,
      pu.supplier_id
    FROM public.purchase_items pi
    JOIN public.purchases pu ON pu.id = pi.purchase_id
    WHERE pu.company_id = p_company_id
      AND pu.status <> 'cancelled'
    ORDER BY pi.product_id, pu.created_at DESC
  ),
  base AS (
    SELECT
      p.id,
      p.name,
      p.sku,
      p.unit,
      c.name AS category_name,
      COALESCE(st.qty, 0) AS stock,
      COALESCE(p.stock_min, 0)::numeric AS stock_min,
      so.qty AS sold_qty,
      so.tickets,
      COALESCE(so.revenue, 0) AS revenue,
      (so.qty / pa.days::numeric) AS daily_rate,
      pa.cover AS cover_target,
      p.sale_price::numeric AS sale_price,
      p.purchase_price::numeric AS purchase_price,
      lp.unit_price AS last_purchase_price,
      lp.created_at AS last_purchase_at,
      lp.supplier_id,
      sup.name AS supplier_name,
      pa.lim
    FROM sold so
    JOIN public.products p ON p.id = so.product_id AND p.deleted_at IS NULL
    CROSS JOIN params pa
    LEFT JOIN stock_now st ON st.product_id = p.id
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN last_purchase lp ON lp.product_id = p.id
    LEFT JOIN public.suppliers sup ON sup.id = lp.supplier_id
    WHERE p.company_id = p_company_id
      AND p.is_active = true
      AND so.qty > 0
  ),
  scored AS (
    SELECT
      b.*,
      CASE WHEN b.daily_rate > 0 THEN b.stock / b.daily_rate ELSE NULL END AS cover_days,
      GREATEST(
        ceil(b.daily_rate * b.cover_target) - b.stock,
        b.stock_min - b.stock,
        1
      ) AS suggested_qty
    FROM base b
  )
  SELECT
    s.id, s.name, s.sku, s.unit, s.category_name,
    s.stock, s.stock_min, s.sold_qty, s.tickets, s.revenue,
    round(s.daily_rate, 3) AS daily_rate,
    round(s.cover_days, 1) AS cover_days,
    s.suggested_qty,
    s.sale_price, s.purchase_price,
    s.last_purchase_price, s.last_purchase_at,
    s.supplier_id, s.supplier_name,
    CASE
      WHEN s.stock <= 0 THEN 'rupture'
      WHEN s.stock_min > 0 AND s.stock <= s.stock_min THEN 'critique'
      WHEN s.cover_days IS NOT NULL AND s.cover_days <= 7 THEN 'critique'
      ELSE 'a_surveiller'
    END AS urgency
  FROM scored s
  WHERE p_company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.restock_module_enabled(p_company_id, p_store_id)
    AND (
      s.stock <= 0
      OR (s.stock_min > 0 AND s.stock <= s.stock_min)
      OR (s.cover_days IS NOT NULL AND s.cover_days <= s.cover_target)
    )
  ORDER BY
    CASE
      WHEN s.stock <= 0 THEN 0
      WHEN s.stock_min > 0 AND s.stock <= s.stock_min THEN 1
      WHEN s.cover_days IS NOT NULL AND s.cover_days <= 7 THEN 1
      ELSE 2
    END,
    s.revenue DESC,
    s.sold_qty DESC
  LIMIT (SELECT lim FROM params);
$$;
GRANT EXECUTE ON FUNCTION public.restock_candidates(uuid, uuid, integer, integer, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Index de soutien : l'agrégat de ventes de la période est la requête chaude.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_company_status_created
  ON public.sales(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sale_items_product
  ON public.sale_items(product_id);

CREATE INDEX IF NOT EXISTS idx_purchase_items_product
  ON public.purchase_items(product_id);
