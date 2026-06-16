-- 00118_multi_warehouse.sql
-- Phase 1 : multi-dépôt. Crée la table `warehouses`, ajoute `warehouse_quota`
-- sur `companies`, rattache toutes les tables dépôt à un `warehouse_id`,
-- migre les données existantes vers un dépôt « Principal » par entreprise,
-- et expose la RPC `create_warehouse` (calquée sur `create_store`).
--
-- Rétrocompatibilité : chaque entreprise existante obtient automatiquement
-- un dépôt principal (D1). Toutes les RPC warehouse existantes continuent
-- de fonctionner via le dépôt principal jusqu'à la Phase 2 (réécriture RPC).

-- ============================================================
-- 1. TABLE warehouses
-- ============================================================
CREATE TABLE public.warehouses (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text,
  is_primary  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_warehouses_company ON public.warehouses (company_id);

COMMENT ON TABLE public.warehouses IS 'Dépôts (magasins) par entreprise ; quota contrôlé via companies.warehouse_quota.';
COMMENT ON COLUMN public.warehouses.is_primary IS 'Un seul dépôt principal par entreprise (D1).';

-- ============================================================
-- 2. QUOTA dépôts sur companies
-- ============================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS warehouse_quota integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.companies.warehouse_quota IS
  'Nombre maximum de dépôts (magasins) autorisés pour l''entreprise. Modifiable uniquement par le super admin.';

-- Étendre le trigger existant pour protéger warehouse_quota
CREATE OR REPLACE FUNCTION public.companies_enforce_platform_flags()
RETURNS trigger
LANGUAGE plpgsql
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
  THEN
    RAISE EXCEPTION 'Modification réservée à l''administration plateforme.';
  END IF;

  IF NEW.store_quota IS DISTINCT FROM OLD.store_quota THEN
    IF NEW.store_quota > OLD.store_quota AND NOT COALESCE(OLD.store_quota_increase_enabled, true) THEN
      RAISE EXCEPTION 'L''augmentation du quota de boutiques est désactivée pour cette entreprise.';
    END IF;
  END IF;

  IF NEW.warehouse_quota IS DISTINCT FROM OLD.warehouse_quota THEN
    RAISE EXCEPTION 'Le quota de dépôts est réservé à l''administration plateforme.';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. COLONNES warehouse_id sur les tables dépôt (nullable d'abord)
-- ============================================================
ALTER TABLE public.warehouse_inventory
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE;

ALTER TABLE public.warehouse_movements
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE;

ALTER TABLE public.warehouse_dispatch_invoices
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE;

-- Pour les transferts dépôt→boutique (from_warehouse = true)
ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS from_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.stock_transfers.from_warehouse_id IS
  'Dépôt source quand from_warehouse = true. NULL sur les anciens transferts (dépôt principal implicite).';

-- ============================================================
-- 4. DATA MIGRATION : créer 1 dépôt principal (D1) par entreprise
--    et rattacher toutes les données existantes
-- ============================================================
DO $$
DECLARE
  r RECORD;
  v_wh_id uuid;
BEGIN
  FOR r IN SELECT id FROM public.companies LOOP
    -- Insérer le dépôt principal si absent
    INSERT INTO public.warehouses (company_id, name, code, is_primary, is_active)
    VALUES (r.id, 'Principal', 'D1', true, true)
    ON CONFLICT (company_id, code) DO NOTHING
    RETURNING id INTO v_wh_id;

    -- Si déjà existait (ON CONFLICT), récupérer l'id
    IF v_wh_id IS NULL THEN
      SELECT id INTO v_wh_id
      FROM public.warehouses
      WHERE company_id = r.id AND code = 'D1';
    END IF;

    -- Rattacher l'inventaire existant
    UPDATE public.warehouse_inventory
    SET warehouse_id = v_wh_id
    WHERE company_id = r.id AND warehouse_id IS NULL;

    -- Rattacher les mouvements existants
    UPDATE public.warehouse_movements
    SET warehouse_id = v_wh_id
    WHERE company_id = r.id AND warehouse_id IS NULL;

    -- Rattacher les factures de dispatch existantes
    UPDATE public.warehouse_dispatch_invoices
    SET warehouse_id = v_wh_id
    WHERE company_id = r.id AND warehouse_id IS NULL;

    -- Rattacher les transferts depuis dépôt
    UPDATE public.stock_transfers
    SET from_warehouse_id = v_wh_id
    WHERE company_id = r.id AND from_warehouse = true AND from_warehouse_id IS NULL;
  END LOOP;
END;
$$;

-- ============================================================
-- 5. Contrainte NOT NULL + changement de PK sur warehouse_inventory
-- ============================================================
ALTER TABLE public.warehouse_inventory
  ALTER COLUMN warehouse_id SET NOT NULL;

ALTER TABLE public.warehouse_movements
  ALTER COLUMN warehouse_id SET NOT NULL;

ALTER TABLE public.warehouse_dispatch_invoices
  ALTER COLUMN warehouse_id SET NOT NULL;

-- Changer la PK : (company_id, product_id) → (warehouse_id, product_id)
ALTER TABLE public.warehouse_inventory
  DROP CONSTRAINT warehouse_inventory_pkey;

ALTER TABLE public.warehouse_inventory
  ADD PRIMARY KEY (warehouse_id, product_id);

-- Index company_id maintenu pour les requêtes RLS
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_company
  ON public.warehouse_inventory (company_id);

-- Index warehouse_id sur les mouvements
CREATE INDEX IF NOT EXISTS idx_warehouse_movements_warehouse_created
  ON public.warehouse_movements (warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_movements_warehouse_product
  ON public.warehouse_movements (warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_dispatch_invoices_warehouse_created
  ON public.warehouse_dispatch_invoices (warehouse_id, created_at DESC);

-- ============================================================
-- 6. RLS sur warehouses
-- ============================================================
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouses_select_owner ON public.warehouses
  FOR SELECT TO authenticated
  USING (public.user_is_company_owner(company_id));

CREATE POLICY warehouses_select_superadmin ON public.warehouses
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

GRANT SELECT ON public.warehouses TO authenticated;

-- ============================================================
-- 7. RPC create_warehouse (calquée sur create_store)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_warehouse(
  p_company_id  uuid,
  p_name        text,
  p_is_primary  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota    int;
  v_count    int;
  v_next_num int;
  v_next_code text;
  v_wh_id   uuid;
  v_wh      jsonb;
BEGIN
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;

  SELECT warehouse_quota INTO v_quota FROM public.companies WHERE id = p_company_id;
  IF v_quota IS NULL THEN
    RAISE EXCEPTION 'Entreprise introuvable';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.warehouses WHERE company_id = p_company_id;
  IF v_count >= v_quota THEN
    RAISE EXCEPTION 'Quota de dépôts atteint (% dépôt(s)). Contactez l''administrateur.', v_quota;
  END IF;

  -- Code auto : D1, D2, …
  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^D[0-9]+$' THEN CAST(SUBSTRING(code FROM 2) AS INTEGER) ELSE 0 END
  ), 0) + 1 INTO v_next_num
  FROM public.warehouses WHERE company_id = p_company_id;
  v_next_code := 'D' || v_next_num::text;

  INSERT INTO public.warehouses (company_id, name, code, is_primary, is_active)
  VALUES (p_company_id, p_name, v_next_code, COALESCE(p_is_primary, false), true)
  RETURNING id INTO v_wh_id;

  SELECT to_jsonb(w) INTO v_wh FROM public.warehouses w WHERE w.id = v_wh_id;
  RETURN v_wh;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_warehouse(uuid, text, boolean) TO authenticated;

-- ============================================================
-- 8. Fonction utilitaire : dépôt principal d'une entreprise
--    (utilisée par les RPC warehouse existantes en Phase 2)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_primary_warehouse_id(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.warehouses
  WHERE company_id = p_company_id AND is_primary = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_primary_warehouse_id(uuid) TO authenticated;
