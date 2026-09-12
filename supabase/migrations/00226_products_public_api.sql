-- ─────────────────────────────────────────────────────────────────────────────
-- 00226 — API publique des produits (lecture seule, par clé API)
--
-- Un logiciel tiers (site e-commerce, application de livraison, borne, tableur)
-- lit le catalogue d'une boutique : nom, prix de vente, promotion en cours, stock,
-- codes-barres, photos et conditionnements (paquet / carton…) avec leur prix.
--
-- Principes :
--   1. La clé en clair n'existe qu'une fois (à la création). La base ne garde que
--      son empreinte SHA-256 — une fuite de la table ne donne accès à rien.
--   2. Une clé peut être bornée à UNE boutique (`store_id`) : le prestataire d'une
--      boutique ne voit pas les autres.
--   3. Aucune table n'est exposée. Les routes /api/v1 appellent, avec la clé
--      service_role, deux RPC `SECURITY DEFINER` qui ne renvoient que ce qu'un client
--      final a le droit de voir : JAMAIS de prix d'achat, de prix plancher ni de marge.
--   4. Même périmètre que la vitrine en ligne (00169) : produits actifs, non supprimés,
--      vendables en boutique, dans le catalogue de la boutique s'il est personnalisé.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS request_count bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.api_keys.store_id IS
  'Boutique à laquelle la clé est limitée. NULL = toutes les boutiques de l''entreprise.';
COMMENT ON COLUMN public.api_keys.request_count IS
  'Nombre d''appels API servis avec cette clé (suivi d''usage affiché au propriétaire).';

-- Chaque appel cherche la clé par son empreinte : index unique (et garantie d'unicité).
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);

-- Création uniquement par RPC : une insertion directe permettrait de poser une
-- empreinte choisie à la main, ou une clé bornée à la boutique d'une autre entreprise.
DROP POLICY IF EXISTS "api_keys_insert" ON public.api_keys;

-- ─────────────────────────────────────────────────────────────────────────────
-- Création d'une clé (owner / super admin). Remplace la version 2 arguments (00058) ;
-- `p_store_id` a une valeur par défaut, donc les appels existants restent valides.
-- `extensions` dans le search_path : pgcrypto y est installé chez Supabase.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_api_key(uuid, text);

CREATE OR REPLACE FUNCTION public.create_api_key(
  p_company_id uuid,
  p_name text,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_owner boolean;
  v_count integer;
  v_key_raw text;
  v_key_prefix text;
  v_key_hash text;
  v_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'Le nom de la clé est requis.';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Nom trop long (80 caractères maximum).';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  ) INTO v_owner;
  IF NOT v_owner AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Seul le propriétaire peut créer une clé API.';
  END IF;

  IF p_store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Boutique introuvable dans cette entreprise.';
  END IF;

  SELECT count(*) INTO v_count FROM public.api_keys WHERE company_id = p_company_id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Maximum 20 clés API par entreprise. Révoquez une clé inutilisée.';
  END IF;

  v_key_raw := 'fs_' || encode(gen_random_bytes(32), 'hex');
  v_key_prefix := left(v_key_raw, 12);
  v_key_hash := encode(digest(v_key_raw, 'sha256'), 'hex');

  INSERT INTO public.api_keys (company_id, name, key_prefix, key_hash, created_by, store_id)
  VALUES (p_company_id, v_name, v_key_prefix, v_key_hash, auth.uid(), p_store_id)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'key_raw', v_key_raw,
    'key_prefix', v_key_prefix,
    'store_id', p_store_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_api_key(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_api_key(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_api_key(uuid, text, uuid) IS
  'Crée une clé API (owner). La clé en clair n''est retournée qu''une seule fois.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Liste des boutiques visibles par une clé.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.api_stores_list(p_key_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key record;
BEGIN
  SELECT k.id, k.company_id, k.store_id, c.name AS company_name
  INTO v_key
  FROM public.api_keys k
  JOIN public.companies c ON c.id = k.company_id
  WHERE k.key_hash = p_key_hash
    AND c.is_active = true;

  IF v_key.id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_key');
  END IF;

  UPDATE public.api_keys
  SET last_used_at = now(), request_count = request_count + 1
  WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'company', jsonb_build_object('id', v_key.company_id, 'name', v_key.company_name),
    'stores', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'code', s.code,
          'address', s.address,
          'is_primary', s.is_primary
        )
        ORDER BY s.is_primary DESC, s.name ASC
      )
      FROM public.stores s
      WHERE s.company_id = v_key.company_id
        AND s.is_active = true
        AND (v_key.store_id IS NULL OR s.id = v_key.store_id)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.api_stores_list(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_stores_list(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalogue produits d'une boutique, paginé.
--
-- Prix :
--   • `sale_price`  = prix de vente catalogue d'une pièce ;
--   • `price`       = prix réellement facturé aujourd'hui (promotion déduite) ;
--   • conditionnement `price` = prix du LOT ENTIER (règle 00129 : prix dédié, sinon
--     nb de pièces × prix pièce) ; `unit_price` = ce lot ramené à la pièce, arrondi
--     au supérieur exactement comme la caisse le facture.
--
-- La page est découpée AVANT de construire le JSON : sur un catalogue de plusieurs
-- milliers d'articles, photos / conditionnements / promotion ne sont calculés que
-- pour les lignes renvoyées.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.api_products_catalog(
  p_key_hash text,
  p_store_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_in_stock_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key record;
  v_store record;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_barcode text := NULLIF(btrim(COALESCE(p_barcode, '')), '');
  v_like text;
  v_items jsonb;
  v_total bigint;
BEGIN
  SELECT k.id, k.company_id, k.store_id, c.name AS company_name
  INTO v_key
  FROM public.api_keys k
  JOIN public.companies c ON c.id = k.company_id
  WHERE k.key_hash = p_key_hash
    AND c.is_active = true;

  IF v_key.id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid_key');
  END IF;
  IF v_key.store_id IS NOT NULL AND v_key.store_id <> p_store_id THEN
    RETURN jsonb_build_object('error', 'store_forbidden');
  END IF;

  SELECT s.id, s.name, s.code, s.address,
         COALESCE(s.shares_company_catalog, true) AS shares_catalog
  INTO v_store
  FROM public.stores s
  WHERE s.id = p_store_id
    AND s.company_id = v_key.company_id
    AND s.is_active = true;

  IF v_store.id IS NULL THEN
    RETURN jsonb_build_object('error', 'store_not_found');
  END IF;

  UPDATE public.api_keys
  SET last_used_at = now(), request_count = request_count + 1
  WHERE id = v_key.id;

  IF v_search IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH page AS (
    SELECT p.id, p.name, count(*) OVER () AS total
    FROM public.products p
    LEFT JOIN public.store_inventory si
      ON si.store_id = v_store.id AND si.product_id = p.id
    WHERE p.company_id = v_key.company_id
      AND p.is_active = true
      AND p.deleted_at IS NULL
      AND COALESCE(p.awaiting_pricing, false) = false
      AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only')
      AND (
        v_store.shares_catalog
        OR EXISTS (
          SELECT 1 FROM public.store_products sp
          WHERE sp.store_id = v_store.id AND sp.product_id = p.id
        )
      )
      AND (NOT COALESCE(p_in_stock_only, false) OR COALESCE(si.quantity, 0) > 0)
      AND (
        v_like IS NULL
        OR p.name ILIKE v_like
        OR p.sku ILIKE v_like
        OR p.barcode ILIKE v_like
        OR EXISTS (SELECT 1 FROM unnest(p.search_aliases) a WHERE a ILIKE v_like)
      )
      AND (
        v_barcode IS NULL
        OR p.barcode = v_barcode
        OR EXISTS (
          SELECT 1 FROM public.product_packagings pk
          WHERE pk.product_id = p.id AND pk.barcode = v_barcode
        )
      )
    ORDER BY p.name ASC, p.id ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'sku', p.sku,
        'barcode', p.barcode,
        'unit', p.unit,
        'description', p.description,
        'category', CASE WHEN cat.id IS NULL THEN NULL
                         ELSE jsonb_build_object('id', cat.id, 'name', cat.name) END,
        'brand', CASE WHEN br.id IS NULL THEN NULL
                      ELSE jsonb_build_object('id', br.id, 'name', br.name) END,
        'sale_price', p.sale_price,
        'price', CASE WHEN pr.pct > 0
                      THEN round(p.sale_price * (1 - pr.pct / 100.0))
                      ELSE p.sale_price END,
        'promotion', CASE WHEN pr.pct > 0
                          THEN jsonb_build_object(
                            'discount_percent', pr.pct,
                            'price', round(p.sale_price * (1 - pr.pct / 100.0))
                          )
                          ELSE NULL END,
        'stock', COALESCE(si.quantity, 0),
        'in_stock', COALESCE(si.quantity, 0) > 0,
        'images', COALESCE((
          SELECT jsonb_agg(pi.url ORDER BY pi.position ASC, pi.created_at ASC)
          FROM public.product_images pi
          WHERE pi.product_id = p.id
        ), '[]'::jsonb),
        'packagings', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', pk.id,
              'label', pk.label,
              'barcode', pk.barcode,
              'quantity', pk.factor,
              'price', COALESCE(pk.price, pk.factor * p.sale_price),
              'unit_price', ceil(COALESCE(pk.price, pk.factor * p.sale_price) / pk.factor)
            )
            ORDER BY pk.position ASC, pk.factor ASC
          )
          FROM public.product_packagings pk
          WHERE pk.product_id = p.id
        ), '[]'::jsonb),
        'updated_at', p.updated_at
      )
      ORDER BY pg.name ASC, pg.id ASC
    ), '[]'::jsonb),
    COALESCE(max(pg.total), 0)
  INTO v_items, v_total
  FROM page pg
  JOIN public.products p ON p.id = pg.id
  LEFT JOIN public.store_inventory si ON si.store_id = v_store.id AND si.product_id = p.id
  LEFT JOIN public.categories cat ON cat.id = p.category_id
  LEFT JOIN public.brands br ON br.id = p.brand_id
  CROSS JOIN LATERAL (
    SELECT public.online_store_promo_percent(v_store.id, p.id) AS pct
  ) pr;

  RETURN jsonb_build_object(
    'company', jsonb_build_object('id', v_key.company_id, 'name', v_key.company_name),
    'store', jsonb_build_object(
      'id', v_store.id,
      'name', v_store.name,
      'code', v_store.code,
      'address', v_store.address
    ),
    'currency', 'XOF',
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'products', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.api_products_catalog(text, uuid, integer, integer, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_products_catalog(text, uuid, integer, integer, text, text, boolean)
  TO service_role;

COMMENT ON FUNCTION public.api_products_catalog(text, uuid, integer, integer, text, text, boolean) IS
  'API publique /api/v1 : catalogue d''une boutique (prix, promo, stock, conditionnements). service_role uniquement.';
