-- FasoStock — Module « Boutique en ligne » (catalogue public + commandes).
--
-- Idée : une extension digitale de la boutique physique. Le commerçant partage un
-- lien propre (/boutique/<slug>) sur WhatsApp / Facebook ; le client voit les
-- produits RÉELLEMENT en stock dans cette boutique, avec les prix réels (promotions
-- comprises), remplit un panier et valide sa commande. La commande arrive dans le
-- même tableau de bord FasoStock : le gestionnaire la confirme, l'encaisse, et la
-- vente devient une vente normale (stock décrémenté, ticket, rapports, comptabilité).
--
-- Trois principes :
--   1. Stock synchronisé : le catalogue lit `store_inventory` en direct ; on ne peut
--      pas commander plus que la quantité disponible. Le stock n'est décrémenté qu'à
--      la validation par le commerçant (`online_order_convert_to_sale`), afin qu'une
--      commande non honorée ne bloque jamais la caisse physique.
--   2. Un seul écran : les commandes web atterrissent dans `online_orders`, converties
--      en `sales` par le même RPC que la caisse (`create_sale_with_stock`).
--   3. Lien catalogue : pas de site à construire — un slug suffit.
--
-- Activation : RÉSERVÉE AU SUPER ADMIN, pour toute une entreprise
-- (`companies.online_store_enabled`) ou boutique par boutique
-- (`stores.online_store_enabled`). Additif : l'un OU l'autre suffit.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drapeaux plateforme
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS online_store_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.online_store_enabled IS
  'Boutique en ligne (catalogue public + commandes) ouverte pour TOUTE l''entreprise. '
  'Réservé au super admin (Admin › Boutique en ligne).';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS online_store_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.online_store_enabled IS
  'Boutique en ligne activée pour cette boutique en particulier — super admin. '
  'Additif : le drapeau entreprise suffit aussi.';

-- Garde plateforme (étend 00132 / 00162 / 00164 / 00165 — même corps, colonne en plus).
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
     OR NEW.online_store_enabled IS DISTINCT FROM OLD.online_store_enabled
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
-- 2. Permission dédiée (owner par défaut, accordable aux autres rôles)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'online_store.manage')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Vitrine : réglages publics d'une boutique (1 ligne par boutique)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_online_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  /** Identifiant du lien public : /boutique/<slug>. Minuscules, tirets. */
  slug text NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  display_name text,
  tagline text,
  description text,
  cover_url text,
  logo_url text,
  accent_color text,
  whatsapp_phone text,
  call_phone text,
  address text,
  city text,
  hours_note text,
  delivery_enabled boolean NOT NULL DEFAULT true,
  delivery_fee numeric(18,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  delivery_note text,
  pickup_enabled boolean NOT NULL DEFAULT true,
  pay_on_delivery_enabled boolean NOT NULL DEFAULT true,
  pay_mobile_money_enabled boolean NOT NULL DEFAULT false,
  mobile_money_number text,
  min_order_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  /** Afficher aussi les produits en rupture (grisés) plutôt que les masquer. */
  show_out_of_stock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_online_settings_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
);

COMMENT ON TABLE public.store_online_settings IS
  'Vitrine publique d''une boutique : slug du lien catalogue, livraison, paiement, habillage.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_online_settings_slug
  ON public.store_online_settings (lower(slug));
CREATE INDEX IF NOT EXISTS idx_store_online_settings_company
  ON public.store_online_settings (company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Commandes en ligne
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.online_order_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.online_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_number text NOT NULL UNIQUE,
  /** Jeton du lien de suivi remis au client (aucune donnée sensible derrière). */
  public_token uuid NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'ready', 'completed', 'canceled')),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_address text,
  /** 'delivery' (livraison) | 'pickup' (retrait en boutique). */
  delivery_mode text NOT NULL DEFAULT 'delivery'
    CHECK (delivery_mode IN ('delivery', 'pickup')),
  /** 'cash_on_delivery' | 'mobile_money' | 'on_site'. */
  payment_method text NOT NULL DEFAULT 'cash_on_delivery'
    CHECK (payment_method IN ('cash_on_delivery', 'mobile_money', 'on_site')),
  note text,
  /** D'où vient le client : lien WhatsApp, Facebook, direct… (paramètre ?src=). */
  source text NOT NULL DEFAULT 'catalog',
  items_count integer NOT NULL DEFAULT 0,
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  /** Vente créée à la validation — la commande devient une vente FasoStock normale. */
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  handled_by uuid REFERENCES auth.users(id),
  handled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.online_orders IS
  'Commandes passées depuis le catalogue public. Converties en ventes (create_sale_with_stock) à la validation.';

CREATE INDEX IF NOT EXISTS idx_online_orders_store_created
  ON public.online_orders (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_orders_company_status
  ON public.online_orders (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_orders_phone
  ON public.online_orders (customer_phone, created_at DESC);

CREATE TABLE IF NOT EXISTS public.online_order_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  /** Photographie du libellé au moment de la commande (le produit peut changer). */
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  total numeric(18,2) NOT NULL CHECK (total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_online_order_items_order
  ON public.online_order_items (order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — lecture/écriture réservées aux membres de l'entreprise.
--    Le public n'accède JAMAIS aux tables : uniquement via les RPC ci-dessous.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.store_online_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_online_settings_select" ON public.store_online_settings;
CREATE POLICY "store_online_settings_select" ON public.store_online_settings
  FOR SELECT USING (
    public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
  );

DROP POLICY IF EXISTS "online_orders_select" ON public.online_orders;
CREATE POLICY "online_orders_select" ON public.online_orders
  FOR SELECT USING (
    public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
  );

DROP POLICY IF EXISTS "online_order_items_select" ON public.online_order_items;
CREATE POLICY "online_order_items_select" ON public.online_order_items
  FOR SELECT USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.online_orders o
      WHERE o.id = online_order_items.order_id
        AND o.company_id IN (SELECT * FROM public.current_user_company_ids())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Le module est-il ouvert ici ? (entreprise OU boutique)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.online_store_module_enabled(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT c.online_store_enabled FROM public.companies c WHERE c.id = p_company_id),
    false
  )
  OR CASE
       WHEN p_store_id IS NULL THEN EXISTS (
         SELECT 1 FROM public.stores s
         WHERE s.company_id = p_company_id AND s.online_store_enabled = true
       )
       ELSE COALESCE(
         (SELECT s.online_store_enabled FROM public.stores s
          WHERE s.id = p_store_id AND s.company_id = p_company_id),
         false
       )
     END;
$$;
GRANT EXECUTE ON FUNCTION public.online_store_module_enabled(uuid, uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.can_manage_online_store(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_company_owner(p_company_id)
     OR ('online_store.manage' = ANY(public.get_my_permission_keys(p_company_id)));
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_online_store(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Prix public d'un produit dans une boutique (promotions appliquées)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.online_store_promo_percent(
  p_store_id uuid,
  p_product_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(p.discount_percent), 0)
  FROM public.promotions p
  JOIN public.promotion_products pp ON pp.promotion_id = p.id AND pp.product_id = p_product_id
  JOIN public.promotion_stores ps ON ps.promotion_id = p.id AND ps.store_id = p_store_id
  WHERE p.is_active = true
    AND (p.starts_at IS NULL OR p.starts_at <= now())
    AND (p.ends_at IS NULL OR p.ends_at >= now());
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC publiques (anon) — vitrine, catalogue, commande, suivi
-- ─────────────────────────────────────────────────────────────────────────────

/** Fiche vitrine d'une boutique publiée. Aucune ligne si non publiée / module coupé. */
CREATE OR REPLACE FUNCTION public.public_online_store(p_slug text)
RETURNS TABLE (
  store_id uuid,
  company_id uuid,
  slug text,
  display_name text,
  tagline text,
  description text,
  cover_url text,
  logo_url text,
  accent_color text,
  whatsapp_phone text,
  call_phone text,
  address text,
  city text,
  hours_note text,
  delivery_enabled boolean,
  delivery_fee numeric,
  delivery_note text,
  pickup_enabled boolean,
  pay_on_delivery_enabled boolean,
  pay_mobile_money_enabled boolean,
  mobile_money_number text,
  min_order_amount numeric,
  show_out_of_stock boolean,
  products_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.company_id,
    o.slug,
    COALESCE(NULLIF(btrim(o.display_name), ''), s.name),
    o.tagline,
    o.description,
    o.cover_url,
    COALESCE(NULLIF(btrim(o.logo_url), ''), s.logo_url, c.logo_url),
    COALESCE(NULLIF(btrim(o.accent_color), ''), '#F97316'),
    COALESCE(NULLIF(btrim(o.whatsapp_phone), ''), s.phone),
    COALESCE(NULLIF(btrim(o.call_phone), ''), s.phone),
    COALESCE(NULLIF(btrim(o.address), ''), s.address),
    COALESCE(NULLIF(btrim(o.city), ''), s.city),
    o.hours_note,
    o.delivery_enabled,
    o.delivery_fee,
    o.delivery_note,
    o.pickup_enabled,
    o.pay_on_delivery_enabled,
    o.pay_mobile_money_enabled,
    o.mobile_money_number,
    o.min_order_amount,
    o.show_out_of_stock,
    (
      SELECT COUNT(*)::int
      FROM public.store_inventory si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.store_id = s.id
        AND si.quantity > 0
        AND p.is_active = true
        AND p.deleted_at IS NULL
        AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only')
    )
  FROM public.store_online_settings o
  JOIN public.stores s ON s.id = o.store_id
  JOIN public.companies c ON c.id = s.company_id
  WHERE lower(o.slug) = lower(btrim(p_slug))
    AND o.is_published = true
    AND s.is_active = true
    AND c.is_active = true
    AND public.online_store_module_enabled(s.company_id, s.id);
$$;
GRANT EXECUTE ON FUNCTION public.public_online_store(text) TO anon, authenticated;

/**
 * Catalogue public d'une boutique : produits vendables, stock réel de CETTE boutique,
 * prix promotionnel appliqué. Aucun prix d'achat, aucune marge n'est exposé.
 * Respecte le catalogue par boutique (`stores.shares_company_catalog` / `store_products`).
 */
CREATE OR REPLACE FUNCTION public.public_online_catalog(
  p_slug text,
  p_limit integer DEFAULT 400,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  product_id uuid,
  name text,
  description text,
  unit text,
  category_id uuid,
  category_name text,
  brand_name text,
  price numeric,
  base_price numeric,
  discount_percent numeric,
  stock integer,
  image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH shop AS (
    SELECT s.id AS store_id, s.company_id, s.shares_company_catalog, o.show_out_of_stock
    FROM public.store_online_settings o
    JOIN public.stores s ON s.id = o.store_id
    JOIN public.companies c ON c.id = s.company_id
    WHERE lower(o.slug) = lower(btrim(p_slug))
      AND o.is_published = true
      AND s.is_active = true
      AND c.is_active = true
      AND public.online_store_module_enabled(s.company_id, s.id)
  )
  SELECT
    p.id,
    p.name,
    p.description,
    p.unit,
    p.category_id,
    cat.name,
    br.name,
    round(p.sale_price * (1 - public.online_store_promo_percent(shop.store_id, p.id) / 100.0)),
    round(p.sale_price),
    public.online_store_promo_percent(shop.store_id, p.id),
    COALESCE(si.quantity, 0),
    (
      SELECT pi.url FROM public.product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.position ASC, pi.created_at ASC
      LIMIT 1
    )
  FROM shop
  JOIN public.products p ON p.company_id = shop.company_id
  LEFT JOIN public.store_inventory si ON si.store_id = shop.store_id AND si.product_id = p.id
  LEFT JOIN public.categories cat ON cat.id = p.category_id
  LEFT JOIN public.brands br ON br.id = p.brand_id
  WHERE p.is_active = true
    AND p.deleted_at IS NULL
    AND p.sale_price > 0
    AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only')
    AND (shop.show_out_of_stock OR COALESCE(si.quantity, 0) > 0)
    AND (
      COALESCE(shop.shares_company_catalog, true)
      OR EXISTS (
        SELECT 1 FROM public.store_products sp
        WHERE sp.store_id = shop.store_id AND sp.product_id = p.id
      )
    )
  ORDER BY (COALESCE(si.quantity, 0) > 0) DESC, p.name ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 400), 800))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;
GRANT EXECUTE ON FUNCTION public.public_online_catalog(text, integer, integer) TO anon, authenticated;

/**
 * Enregistre une commande client. Les prix sont RECALCULÉS côté serveur (le panier
 * envoyé par le navigateur n'est jamais cru) et la disponibilité est vérifiée sur le
 * stock réel. Le stock n'est PAS décrémenté ici : il l'est à la validation par le
 * commerçant, pour ne jamais bloquer la caisse physique sur une commande fantôme.
 */
CREATE OR REPLACE FUNCTION public.public_online_order_create(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_mode text,
  p_payment_method text,
  p_customer_address text,
  p_note text,
  p_items jsonb,
  p_source text DEFAULT 'catalog'
)
RETURNS TABLE (order_number text, public_token uuid, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop record;
  v_order_id uuid;
  v_number text;
  v_token uuid;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_price numeric;
  v_subtotal numeric := 0;
  v_count integer := 0;
  v_fee numeric := 0;
  v_mode text := COALESCE(NULLIF(btrim(p_delivery_mode), ''), 'delivery');
  v_pay text := COALESCE(NULLIF(btrim(p_payment_method), ''), 'cash_on_delivery');
  v_phone text := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9+]', '', 'g');
  v_name text := btrim(COALESCE(p_customer_name, ''));
  v_recent integer;
  v_owner record;
BEGIN
  SELECT s.id AS store_id, s.company_id, s.shares_company_catalog,
         o.delivery_enabled, o.pickup_enabled, o.delivery_fee, o.min_order_amount,
         o.pay_on_delivery_enabled, o.pay_mobile_money_enabled,
         COALESCE(NULLIF(btrim(o.display_name), ''), s.name) AS shop_name
  INTO v_shop
  FROM public.store_online_settings o
  JOIN public.stores s ON s.id = o.store_id
  JOIN public.companies c ON c.id = s.company_id
  WHERE lower(o.slug) = lower(btrim(p_slug))
    AND o.is_published = true
    AND s.is_active = true
    AND c.is_active = true
    AND public.online_store_module_enabled(s.company_id, s.id);

  IF v_shop.store_id IS NULL THEN
    RAISE EXCEPTION 'Cette boutique en ligne n''est pas disponible.';
  END IF;

  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Merci d''indiquer votre nom.';
  END IF;
  IF length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide (8 chiffres minimum).';
  END IF;
  IF v_mode NOT IN ('delivery', 'pickup') THEN
    RAISE EXCEPTION 'Mode de réception invalide.';
  END IF;
  IF v_mode = 'delivery' AND NOT v_shop.delivery_enabled THEN
    RAISE EXCEPTION 'Cette boutique ne fait pas de livraison.';
  END IF;
  IF v_mode = 'pickup' AND NOT v_shop.pickup_enabled THEN
    RAISE EXCEPTION 'Cette boutique ne propose pas le retrait sur place.';
  END IF;
  IF v_mode = 'delivery' AND length(btrim(COALESCE(p_customer_address, ''))) < 4 THEN
    RAISE EXCEPTION 'Merci d''indiquer une adresse de livraison.';
  END IF;
  IF v_pay NOT IN ('cash_on_delivery', 'mobile_money', 'on_site') THEN
    RAISE EXCEPTION 'Moyen de paiement invalide.';
  END IF;
  IF v_pay = 'mobile_money' AND NOT v_shop.pay_mobile_money_enabled THEN
    RAISE EXCEPTION 'Le paiement Mobile Money n''est pas accepté ici.';
  END IF;
  IF v_pay = 'cash_on_delivery' AND NOT v_shop.pay_on_delivery_enabled THEN
    RAISE EXCEPTION 'Le paiement à la livraison n''est pas accepté ici.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Votre panier est vide.';
  END IF;
  IF jsonb_array_length(p_items) > 60 THEN
    RAISE EXCEPTION 'Trop d''articles dans une seule commande (60 maximum).';
  END IF;

  -- Garde-fou anti-spam : 5 commandes par numéro et par boutique sur 1 heure.
  SELECT COUNT(*) INTO v_recent
  FROM public.online_orders
  WHERE store_id = v_shop.store_id
    AND customer_phone = v_phone
    AND created_at > now() - interval '1 hour';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'Trop de commandes envoyées récemment. Réessayez dans un moment.';
  END IF;

  v_number := 'W-' || nextval('public.online_order_number_seq');
  v_token := uuid_generate_v4();

  INSERT INTO public.online_orders (
    company_id, store_id, order_number, public_token, status,
    customer_name, customer_phone, customer_address,
    delivery_mode, payment_method, note, source
  ) VALUES (
    v_shop.company_id, v_shop.store_id, v_number, v_token, 'pending',
    v_name, v_phone, NULLIF(btrim(COALESCE(p_customer_address, '')), ''),
    v_mode, v_pay, NULLIF(btrim(COALESCE(p_note, '')), ''),
    COALESCE(NULLIF(btrim(p_source), ''), 'catalog')
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(0, COALESCE((v_item->>'quantity')::int, 0));
    CONTINUE WHEN v_qty = 0;

    SELECT p.id, p.name, p.sale_price, COALESCE(si.quantity, 0) AS stock
    INTO v_product
    FROM public.products p
    LEFT JOIN public.store_inventory si
      ON si.store_id = v_shop.store_id AND si.product_id = p.id
    WHERE p.id = (v_item->>'product_id')::uuid
      AND p.company_id = v_shop.company_id
      AND p.is_active = true
      AND p.deleted_at IS NULL
      AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only')
      AND (
        COALESCE(v_shop.shares_company_catalog, true)
        OR EXISTS (
          SELECT 1 FROM public.store_products sp
          WHERE sp.store_id = v_shop.store_id AND sp.product_id = p.id
        )
      );

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Un article de votre panier n''est plus disponible.';
    END IF;
    IF v_product.stock < v_qty THEN
      RAISE EXCEPTION 'Stock insuffisant pour « % » (% restant).', v_product.name, v_product.stock;
    END IF;

    v_price := round(
      v_product.sale_price
      * (1 - public.online_store_promo_percent(v_shop.store_id, v_product.id) / 100.0)
    );

    INSERT INTO public.online_order_items (order_id, product_id, product_name, quantity, unit_price, total)
    VALUES (v_order_id, v_product.id, v_product.name, v_qty, v_price, v_price * v_qty);

    v_subtotal := v_subtotal + v_price * v_qty;
    v_count := v_count + v_qty;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Votre panier est vide.';
  END IF;
  IF v_subtotal < COALESCE(v_shop.min_order_amount, 0) THEN
    RAISE EXCEPTION 'Commande minimum : % FCFA.', round(v_shop.min_order_amount);
  END IF;

  v_fee := CASE WHEN v_mode = 'delivery' THEN COALESCE(v_shop.delivery_fee, 0) ELSE 0 END;

  UPDATE public.online_orders
  SET items_count = v_count,
      subtotal = v_subtotal,
      delivery_fee = v_fee,
      total = v_subtotal + v_fee,
      updated_at = now()
  WHERE id = v_order_id;

  -- Alerte dans FasoStock : les responsables voient la commande arriver.
  FOR v_owner IN
    SELECT DISTINCT ucr.user_id
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.company_id = v_shop.company_id
      AND ucr.is_active = true
      AND r.slug IN ('owner', 'store_manager')
  LOOP
    INSERT INTO public.notifications (user_id, company_id, type, title, body)
    VALUES (
      v_owner.user_id,
      v_shop.company_id,
      'online_order',
      'Nouvelle commande en ligne',
      v_number || ' · ' || v_name || ' · ' || round(v_subtotal + v_fee) || ' FCFA'
    );
  END LOOP;

  RETURN QUERY SELECT v_number, v_token, v_subtotal + v_fee;
END;
$$;
GRANT EXECUTE ON FUNCTION public.public_online_order_create(
  text, text, text, text, text, text, text, jsonb, text
) TO anon, authenticated;

/** Suivi client d'une commande (lien remis après validation du panier). */
CREATE OR REPLACE FUNCTION public.public_online_order_track(p_token uuid)
RETURNS TABLE (
  order_number text,
  status text,
  created_at timestamptz,
  customer_name text,
  delivery_mode text,
  payment_method text,
  customer_address text,
  subtotal numeric,
  delivery_fee numeric,
  total numeric,
  shop_name text,
  shop_slug text,
  shop_phone text,
  items jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.order_number,
    o.status,
    o.created_at,
    o.customer_name,
    o.delivery_mode,
    o.payment_method,
    o.customer_address,
    o.subtotal,
    o.delivery_fee,
    o.total,
    COALESCE(NULLIF(btrim(st.display_name), ''), s.name),
    st.slug,
    COALESCE(NULLIF(btrim(st.whatsapp_phone), ''), s.phone),
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'name', i.product_name,
          'quantity', i.quantity,
          'unit_price', i.unit_price,
          'total', i.total
        ) ORDER BY i.product_name)
        FROM public.online_order_items i
        WHERE i.order_id = o.id
      ),
      '[]'::jsonb
    )
  FROM public.online_orders o
  JOIN public.stores s ON s.id = o.store_id
  LEFT JOIN public.store_online_settings st ON st.store_id = s.id
  WHERE o.public_token = p_token;
$$;
GRANT EXECUTE ON FUNCTION public.public_online_order_track(uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPC commerçant — réglages, statuts, conversion en vente
-- ─────────────────────────────────────────────────────────────────────────────

/** Crée ou met à jour la vitrine d'une boutique. Slug normalisé et unique. */
CREATE OR REPLACE FUNCTION public.online_store_settings_save(
  p_store_id uuid,
  p_slug text,
  p_is_published boolean,
  p_display_name text,
  p_tagline text,
  p_description text,
  p_cover_url text,
  p_logo_url text,
  p_accent_color text,
  p_whatsapp_phone text,
  p_call_phone text,
  p_address text,
  p_city text,
  p_hours_note text,
  p_delivery_enabled boolean,
  p_delivery_fee numeric,
  p_delivery_note text,
  p_pickup_enabled boolean,
  p_pay_on_delivery_enabled boolean,
  p_pay_mobile_money_enabled boolean,
  p_mobile_money_number text,
  p_min_order_amount numeric,
  p_show_out_of_stock boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_slug text;
BEGIN
  SELECT company_id INTO v_company FROM public.stores WHERE id = p_store_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Boutique introuvable.'; END IF;
  IF NOT (v_company IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Boutique non autorisée.';
  END IF;
  IF NOT public.can_manage_online_store(v_company) THEN
    RAISE EXCEPTION 'Droit insuffisant pour gérer la boutique en ligne.';
  END IF;
  IF NOT public.online_store_module_enabled(v_company, p_store_id) THEN
    RAISE EXCEPTION 'La boutique en ligne n''est pas activée pour cette boutique.';
  END IF;

  v_slug := lower(btrim(COALESCE(p_slug, '')));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  IF length(v_slug) < 3 THEN
    RAISE EXCEPTION 'Le lien doit contenir au moins 3 caractères (lettres, chiffres, tirets).';
  END IF;
  IF length(v_slug) > 50 THEN
    v_slug := substr(v_slug, 1, 50);
    v_slug := btrim(v_slug, '-');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.store_online_settings
    WHERE lower(slug) = v_slug AND store_id <> p_store_id
  ) THEN
    RAISE EXCEPTION 'Ce lien est déjà pris. Choisissez-en un autre.';
  END IF;

  INSERT INTO public.store_online_settings (
    company_id, store_id, slug, is_published, display_name, tagline, description,
    cover_url, logo_url, accent_color, whatsapp_phone, call_phone, address, city,
    hours_note, delivery_enabled, delivery_fee, delivery_note, pickup_enabled,
    pay_on_delivery_enabled, pay_mobile_money_enabled, mobile_money_number,
    min_order_amount, show_out_of_stock
  ) VALUES (
    v_company, p_store_id, v_slug, COALESCE(p_is_published, false),
    NULLIF(btrim(COALESCE(p_display_name, '')), ''),
    NULLIF(btrim(COALESCE(p_tagline, '')), ''),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_cover_url, '')), ''),
    NULLIF(btrim(COALESCE(p_logo_url, '')), ''),
    NULLIF(btrim(COALESCE(p_accent_color, '')), ''),
    NULLIF(btrim(COALESCE(p_whatsapp_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_call_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_city, '')), ''),
    NULLIF(btrim(COALESCE(p_hours_note, '')), ''),
    COALESCE(p_delivery_enabled, true), GREATEST(0, COALESCE(p_delivery_fee, 0)),
    NULLIF(btrim(COALESCE(p_delivery_note, '')), ''),
    COALESCE(p_pickup_enabled, true),
    COALESCE(p_pay_on_delivery_enabled, true),
    COALESCE(p_pay_mobile_money_enabled, false),
    NULLIF(btrim(COALESCE(p_mobile_money_number, '')), ''),
    GREATEST(0, COALESCE(p_min_order_amount, 0)),
    COALESCE(p_show_out_of_stock, false)
  )
  ON CONFLICT (store_id) DO UPDATE SET
    slug = EXCLUDED.slug,
    is_published = EXCLUDED.is_published,
    display_name = EXCLUDED.display_name,
    tagline = EXCLUDED.tagline,
    description = EXCLUDED.description,
    cover_url = EXCLUDED.cover_url,
    logo_url = EXCLUDED.logo_url,
    accent_color = EXCLUDED.accent_color,
    whatsapp_phone = EXCLUDED.whatsapp_phone,
    call_phone = EXCLUDED.call_phone,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    hours_note = EXCLUDED.hours_note,
    delivery_enabled = EXCLUDED.delivery_enabled,
    delivery_fee = EXCLUDED.delivery_fee,
    delivery_note = EXCLUDED.delivery_note,
    pickup_enabled = EXCLUDED.pickup_enabled,
    pay_on_delivery_enabled = EXCLUDED.pay_on_delivery_enabled,
    pay_mobile_money_enabled = EXCLUDED.pay_mobile_money_enabled,
    mobile_money_number = EXCLUDED.mobile_money_number,
    min_order_amount = EXCLUDED.min_order_amount,
    show_out_of_stock = EXCLUDED.show_out_of_stock,
    updated_at = now();

  RETURN v_slug;
END;
$$;
GRANT EXECUTE ON FUNCTION public.online_store_settings_save(
  uuid, text, boolean, text, text, text, text, text, text, text, text, text, text,
  text, boolean, numeric, text, boolean, boolean, boolean, text, numeric, boolean
) TO authenticated;

/** Change le statut d'une commande (hors conversion en vente). */
CREATE OR REPLACE FUNCTION public.online_order_set_status(
  p_order_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
BEGIN
  SELECT id, company_id, status, sale_id INTO v_order
  FROM public.online_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable.'; END IF;
  IF NOT public.can_manage_online_store(v_order.company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour gérer les commandes en ligne.';
  END IF;
  IF p_status NOT IN ('pending', 'confirmed', 'ready', 'canceled') THEN
    RAISE EXCEPTION 'Statut invalide (la validation encaissée passe par la caisse).';
  END IF;
  IF v_order.sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cette commande est déjà encaissée : elle ne peut plus changer de statut.';
  END IF;

  UPDATE public.online_orders
  SET status = p_status,
      cancel_reason = CASE WHEN p_status = 'canceled'
                           THEN NULLIF(btrim(COALESCE(p_reason, '')), '') END,
      handled_by = auth.uid(),
      handled_at = now(),
      updated_at = now()
  WHERE id = p_order_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.online_order_set_status(uuid, text, text) TO authenticated;

/**
 * Encaisse une commande : crée le client s'il n'existe pas, puis la vente FasoStock
 * via le RPC de caisse (stock décrémenté, mouvements, ticket, rapports). La commande
 * passe en `completed` et pointe vers la vente créée.
 */
CREATE OR REPLACE FUNCTION public.online_order_convert_to_sale(
  p_order_id uuid,
  p_payment_method text DEFAULT 'cash'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_customer_id uuid;
  v_sale_id uuid;
  v_items jsonb;
  v_pay text := COALESCE(NULLIF(btrim(p_payment_method), ''), 'cash');
BEGIN
  SELECT * INTO v_order FROM public.online_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable.'; END IF;
  IF NOT public.can_manage_online_store(v_order.company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour encaisser une commande en ligne.';
  END IF;
  IF v_order.sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Commande déjà encaissée (vente existante).';
  END IF;
  IF v_order.status = 'canceled' THEN
    RAISE EXCEPTION 'Commande annulée : impossible de l''encaisser.';
  END IF;
  IF v_pay NOT IN ('cash', 'mobile_money', 'card', 'other') THEN
    RAISE EXCEPTION 'Moyen de paiement invalide.';
  END IF;

  -- Client : réutilise la fiche existante au même numéro, sinon la crée.
  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE company_id = v_order.company_id
    AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')
        = regexp_replace(v_order.customer_phone, '[^0-9]', '', 'g')
    AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') <> ''
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (company_id, name, phone, address, notes)
    VALUES (
      v_order.company_id, v_order.customer_name, v_order.customer_phone,
      v_order.customer_address, 'Client boutique en ligne'
    )
    RETURNING id INTO v_customer_id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', i.product_id,
    'quantity', i.quantity,
    'unit_price', i.unit_price,
    'discount', 0
  ))
  INTO v_items
  FROM public.online_order_items i
  WHERE i.order_id = p_order_id AND i.product_id IS NOT NULL;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Aucun article valide dans cette commande.';
  END IF;

  v_sale_id := public.create_sale_with_stock(
    v_order.company_id,
    v_order.store_id,
    v_customer_id,
    auth.uid(),
    v_items,
    jsonb_build_array(jsonb_build_object(
      'method', v_pay,
      'amount', v_order.total,
      'reference', v_order.order_number
    )),
    -- Les frais de livraison ne sont pas un article de stock : la vente porte le
    -- montant des produits, la livraison reste tracée sur la commande.
    0,
    'quick_pos'::public.sale_mode,
    'thermal_receipt'::public.document_type,
    NULL
  );

  UPDATE public.online_orders
  SET status = 'completed',
      sale_id = v_sale_id,
      customer_id = v_customer_id,
      handled_by = auth.uid(),
      handled_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_sale_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.online_order_convert_to_sale(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Vue super admin : où en est la boutique en ligne de chaque client ?
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_online_store_overview()
RETURNS TABLE (
  store_id uuid,
  store_name text,
  company_id uuid,
  company_name text,
  company_enabled boolean,
  store_enabled boolean,
  slug text,
  is_published boolean,
  orders_count integer,
  orders_pending integer,
  orders_total numeric,
  last_order_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.name,
    c.id,
    c.name,
    c.online_store_enabled,
    s.online_store_enabled,
    o.slug,
    COALESCE(o.is_published, false),
    COALESCE(agg.cnt, 0),
    COALESCE(agg.pending, 0),
    COALESCE(agg.total, 0),
    agg.last_at
  FROM public.stores s
  JOIN public.companies c ON c.id = s.company_id
  LEFT JOIN public.store_online_settings o ON o.store_id = s.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt,
           COUNT(*) FILTER (WHERE oo.status = 'pending')::int AS pending,
           COALESCE(SUM(oo.total) FILTER (WHERE oo.status = 'completed'), 0) AS total,
           MAX(oo.created_at) AS last_at
    FROM public.online_orders oo
    WHERE oo.store_id = s.id
  ) agg ON true
  WHERE public.is_super_admin()
  ORDER BY c.name ASC, s.name ASC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_online_store_overview() TO authenticated;

NOTIFY pgrst, 'reload schema';
