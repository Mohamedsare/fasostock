-- FasoStock — Module Promotions (remises % planifiées, par produit et par boutique).
--
-- Une promotion applique une remise en pourcentage à un ensemble de produits,
-- sur une ou plusieurs boutiques choisies, pendant une période (début/fin optionnels).
-- Elle s'applique automatiquement au POS (caisse) pendant sa fenêtre d'activité.
--
-- Disponibilité : tous les métiers SAUF la pharmacie (gating applicatif côté navigation).
-- Écritures via RPC SECURITY DEFINER gâtées sur `promotions.manage` (owner par défaut).

-- ========== 1) Permission dédiée ==========
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'promotions.manage')
ON CONFLICT (key) DO NOTHING;

-- ========== 2) Tables ==========
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_date_order CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);
COMMENT ON TABLE public.promotions IS
  'Promotions (remise %) planifiées par produit et par boutique. Appliquées au POS pendant leur fenêtre d''activité.';
CREATE INDEX IF NOT EXISTS idx_promotions_company ON public.promotions(company_id);

CREATE TABLE IF NOT EXISTS public.promotion_products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  UNIQUE (promotion_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_promotion_products_promo ON public.promotion_products(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_products_product ON public.promotion_products(product_id);

CREATE TABLE IF NOT EXISTS public.promotion_stores (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  UNIQUE (promotion_id, store_id)
);
CREATE INDEX IF NOT EXISTS idx_promotion_stores_promo ON public.promotion_stores(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_stores_store ON public.promotion_stores(store_id);

-- ========== 3) RLS : lecture membre entreprise ; écriture via RPC uniquement ==========
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promotions_select" ON public.promotions;
CREATE POLICY "promotions_select" ON public.promotions FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "promotion_products_select" ON public.promotion_products;
CREATE POLICY "promotion_products_select" ON public.promotion_products FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "promotion_stores_select" ON public.promotion_stores;
CREATE POLICY "promotion_stores_select" ON public.promotion_stores FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ========== 4) Helper de droit effectif ==========
CREATE OR REPLACE FUNCTION public.can_manage_promotions(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_company_owner(p_company_id)
     OR ('promotions.manage' = ANY(public.get_my_permission_keys(p_company_id)));
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_promotions(uuid) TO authenticated;

-- ========== 5) RPC : création / mise à jour (p_id NULL = création) ==========
CREATE OR REPLACE FUNCTION public.promotion_save(
  p_id uuid,
  p_company_id uuid,
  p_name text,
  p_discount_percent numeric,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_active boolean,
  p_note text,
  p_product_ids uuid[],
  p_store_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.can_manage_promotions(p_company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour gérer les promotions.';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Nom de promotion requis';
  END IF;
  IF p_discount_percent IS NULL OR p_discount_percent <= 0 OR p_discount_percent > 100 THEN
    RAISE EXCEPTION 'Pourcentage de remise invalide (1 à 100).';
  END IF;
  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at < p_starts_at THEN
    RAISE EXCEPTION 'La date de fin doit être postérieure au début.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions
      (company_id, name, discount_percent, starts_at, ends_at, is_active, note, created_by)
    VALUES
      (p_company_id, btrim(p_name), p_discount_percent, p_starts_at, p_ends_at,
       COALESCE(p_is_active, true), NULLIF(btrim(p_note), ''), v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.promotions
    SET name = btrim(p_name),
        discount_percent = p_discount_percent,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        is_active = COALESCE(p_is_active, true),
        note = NULLIF(btrim(p_note), ''),
        updated_at = now()
    WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Promotion introuvable'; END IF;
    DELETE FROM public.promotion_products WHERE promotion_id = v_id;
    DELETE FROM public.promotion_stores WHERE promotion_id = v_id;
  END IF;

  IF p_product_ids IS NOT NULL THEN
    INSERT INTO public.promotion_products (company_id, promotion_id, product_id)
    SELECT p_company_id, v_id, pid
    FROM unnest(p_product_ids) AS pid
    WHERE EXISTS (
      SELECT 1 FROM public.products pr WHERE pr.id = pid AND pr.company_id = p_company_id
    )
    ON CONFLICT (promotion_id, product_id) DO NOTHING;
  END IF;

  IF p_store_ids IS NOT NULL THEN
    INSERT INTO public.promotion_stores (company_id, promotion_id, store_id)
    SELECT p_company_id, v_id, sid
    FROM unnest(p_store_ids) AS sid
    WHERE EXISTS (
      SELECT 1 FROM public.stores st WHERE st.id = sid AND st.company_id = p_company_id
    )
    ON CONFLICT (promotion_id, store_id) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.promotion_save(
  uuid, uuid, text, numeric, timestamptz, timestamptz, boolean, text, uuid[], uuid[]
) TO authenticated;

-- ========== 6) RPC : activer / désactiver ==========
CREATE OR REPLACE FUNCTION public.promotion_set_active(p_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.promotions WHERE id = p_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Promotion introuvable'; END IF;
  IF NOT public.can_manage_promotions(v_company) THEN RAISE EXCEPTION 'Droit insuffisant.'; END IF;
  UPDATE public.promotions
  SET is_active = COALESCE(p_active, false), updated_at = now()
  WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.promotion_set_active(uuid, boolean) TO authenticated;

-- ========== 7) RPC : suppression ==========
CREATE OR REPLACE FUNCTION public.promotion_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.promotions WHERE id = p_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Promotion introuvable'; END IF;
  IF NOT public.can_manage_promotions(v_company) THEN RAISE EXCEPTION 'Droit insuffisant.'; END IF;
  DELETE FROM public.promotions WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.promotion_delete(uuid) TO authenticated;

-- ========== 8) RPC : liste (avec ids produits/boutiques pour l'édition) ==========
CREATE OR REPLACE FUNCTION public.promotions_list(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  discount_percent numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean,
  note text,
  created_at timestamptz,
  product_ids uuid[],
  store_ids uuid[],
  product_count bigint,
  store_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pr.id, pr.name, pr.discount_percent, pr.starts_at, pr.ends_at, pr.is_active, pr.note, pr.created_at,
    COALESCE((SELECT array_agg(pp.product_id) FROM public.promotion_products pp WHERE pp.promotion_id = pr.id), '{}'::uuid[]) AS product_ids,
    COALESCE((SELECT array_agg(ps.store_id) FROM public.promotion_stores ps WHERE ps.promotion_id = pr.id), '{}'::uuid[]) AS store_ids,
    (SELECT count(*) FROM public.promotion_products pp WHERE pp.promotion_id = pr.id) AS product_count,
    (SELECT count(*) FROM public.promotion_stores ps WHERE ps.promotion_id = pr.id) AS store_count
  FROM public.promotions pr
  WHERE pr.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
  ORDER BY pr.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.promotions_list(uuid) TO authenticated;

-- ========== 9) RPC : promotions actives pour une boutique (POS) ==========
-- Retourne, par produit, la MEILLEURE remise active (%) applicable dans la boutique
-- à l'instant présent (is_active + fenêtre de dates).
CREATE OR REPLACE FUNCTION public.promotions_active_for_store(p_store_id uuid)
RETURNS TABLE (
  product_id uuid,
  discount_percent numeric,
  promotion_id uuid,
  name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (pp.product_id)
    pp.product_id, pr.discount_percent, pr.id, pr.name
  FROM public.promotions pr
  JOIN public.stores st ON st.id = p_store_id AND st.company_id = pr.company_id
  JOIN public.promotion_stores ps ON ps.promotion_id = pr.id AND ps.store_id = p_store_id
  JOIN public.promotion_products pp ON pp.promotion_id = pr.id
  WHERE st.company_id IN (SELECT * FROM public.current_user_company_ids())
    AND pr.is_active = true
    AND (pr.starts_at IS NULL OR pr.starts_at <= now())
    AND (pr.ends_at IS NULL OR pr.ends_at >= now())
  ORDER BY pp.product_id, pr.discount_percent DESC;
$$;
GRANT EXECUTE ON FUNCTION public.promotions_active_for_store(uuid) TO authenticated;
