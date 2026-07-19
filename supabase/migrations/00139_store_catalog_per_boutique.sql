-- Catalogue produits par boutique.
--
-- Historiquement, les produits sont au niveau entreprise et TOUTES les boutiques
-- partagent le même catalogue (le stock, lui, reste par boutique). Cette migration
-- permet à une boutique d'avoir un catalogue PERSONNALISÉ (produits différents).
--
--   stores.shares_company_catalog = true  (défaut) -> la boutique voit/vend tout le
--       catalogue de l'entreprise. Comportement historique : rien ne change pour l'existant.
--   stores.shares_company_catalog = false -> la boutique ne voit/vend que les produits
--       listés dans store_products (catalogue personnalisé).

-- ========== 1) Flag « partage du catalogue » sur la boutique ==========
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS shares_company_catalog boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.stores.shares_company_catalog IS
  'true = la boutique voit/vend tout le catalogue de l''entreprise (défaut). '
  'false = catalogue personnalisé, limité aux produits de store_products.';

-- ========== 2) Table d'appartenance produit <-> boutique (catalogue personnalisé) ==========
CREATE TABLE IF NOT EXISTS public.store_products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, product_id)
);

COMMENT ON TABLE public.store_products IS
  'Catalogue personnalisé d''une boutique : produits vendus par une boutique dont '
  'shares_company_catalog = false. Ignoré pour les boutiques qui partagent le catalogue.';

CREATE INDEX IF NOT EXISTS idx_store_products_store ON public.store_products(store_id);
CREATE INDEX IF NOT EXISTS idx_store_products_product ON public.store_products(product_id);
CREATE INDEX IF NOT EXISTS idx_store_products_company ON public.store_products(company_id);

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

-- Accès aligné sur products : tout membre de l'entreprise (RLS entreprise).
DROP POLICY IF EXISTS "store_products_all" ON public.store_products;
CREATE POLICY "store_products_all" ON public.store_products FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ========== 3) RPC create_store : choix du catalogue à la création ==========
-- Ancienne signature (7 args) remplacée par une version étendue :
--   p_shares_company_catalog : la nouvelle boutique partage-t-elle tout le catalogue ?
--   p_copy_from_store_id      : si catalogue personnalisé, copier les produits d'une boutique existante.
DROP FUNCTION IF EXISTS public.create_store(uuid, text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.create_store(
  p_company_id uuid,
  p_name text,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_primary boolean DEFAULT false,
  p_shares_company_catalog boolean DEFAULT true,
  p_copy_from_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota int;
  v_count int;
  v_next_num int;
  v_next_code text;
  v_store_id uuid;
  v_store jsonb;
  v_shares boolean := COALESCE(p_shares_company_catalog, true);
  v_src_shares boolean;
BEGIN
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;

  SELECT store_quota INTO v_quota FROM public.companies WHERE id = p_company_id;
  IF v_quota IS NULL THEN
    RAISE EXCEPTION 'Entreprise introuvable';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.stores WHERE company_id = p_company_id;
  IF v_count >= v_quota THEN
    RAISE EXCEPTION 'Quota de boutiques atteint (% boutique(s)). Demandez une augmentation.', v_quota;
  END IF;

  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^B[0-9]+$' THEN CAST(SUBSTRING(code FROM 2) AS INTEGER) ELSE 0 END
  ), 0) + 1 INTO v_next_num
  FROM public.stores WHERE company_id = p_company_id;
  v_next_code := 'B' || v_next_num::text;

  INSERT INTO public.stores (company_id, name, code, address, phone, email, description, is_primary, is_active, shares_company_catalog)
  VALUES (p_company_id, p_name, v_next_code, p_address, p_phone, p_email, p_description, COALESCE(p_is_primary, false), true, v_shares)
  RETURNING id INTO v_store_id;

  -- Catalogue personnalisé : optionnellement copier les produits d'une boutique source.
  IF NOT v_shares AND p_copy_from_store_id IS NOT NULL THEN
    SELECT s.shares_company_catalog INTO v_src_shares
    FROM public.stores s
    WHERE s.id = p_copy_from_store_id AND s.company_id = p_company_id;

    IF v_src_shares IS NOT NULL THEN
      IF v_src_shares THEN
        -- La source partage tout le catalogue -> figer un instantané de tous les produits.
        INSERT INTO public.store_products (company_id, store_id, product_id)
        SELECT p_company_id, v_store_id, p.id
        FROM public.products p
        WHERE p.company_id = p_company_id AND p.deleted_at IS NULL
        ON CONFLICT (store_id, product_id) DO NOTHING;
      ELSE
        -- La source a un catalogue personnalisé -> copier son appartenance.
        INSERT INTO public.store_products (company_id, store_id, product_id)
        SELECT p_company_id, v_store_id, sp.product_id
        FROM public.store_products sp
        WHERE sp.store_id = p_copy_from_store_id
        ON CONFLICT (store_id, product_id) DO NOTHING;
      END IF;
    END IF;
  END IF;

  SELECT to_jsonb(s) INTO v_store
  FROM public.stores s WHERE s.id = v_store_id;

  RETURN v_store;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_store(uuid, text, text, text, text, text, boolean, boolean, uuid) TO authenticated;

-- ========== 4) Enforcement serveur (défense en profondeur) ==========
-- Tout ajout de stock (achats, transferts entrants, ajustements, dispatch dépôt) passe par
-- un INSERT dans store_inventory. On empêche d'introduire un produit HORS du catalogue d'une
-- boutique personnalisée. Point unique => pas besoin de modifier chaque RPC.
--
-- Ne bloque JAMAIS :
--   * les boutiques qui partagent tout le catalogue (shares_company_catalog <> false) ;
--   * une ligne d'inventaire DÉJÀ existante (mise à jour de stock / décrément de vente) ;
--     ainsi le stock déjà présent n'est jamais bloqué, même si le produit a été retiré du catalogue.
CREATE OR REPLACE FUNCTION public.enforce_store_catalog_on_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shares boolean;
BEGIN
  -- Ligne d'inventaire déjà existante (cas INSERT ... ON CONFLICT DO UPDATE) : autoriser.
  IF EXISTS (
    SELECT 1 FROM public.store_inventory si
    WHERE si.store_id = NEW.store_id AND si.product_id = NEW.product_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT shares_company_catalog INTO v_shares
  FROM public.stores WHERE id = NEW.store_id;

  -- Boutique partageant tout le catalogue (ou introuvable) : autoriser.
  IF v_shares IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  -- Catalogue personnalisé : le produit doit y figurer.
  IF EXISTS (
    SELECT 1 FROM public.store_products sp
    WHERE sp.store_id = NEW.store_id AND sp.product_id = NEW.product_id
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Produit hors du catalogue de cette boutique. Ajoutez-le au catalogue de la boutique avant d''y gérer son stock.'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS enforce_store_catalog ON public.store_inventory;
CREATE TRIGGER enforce_store_catalog
  BEFORE INSERT ON public.store_inventory
  FOR EACH ROW EXECUTE FUNCTION public.enforce_store_catalog_on_inventory();
