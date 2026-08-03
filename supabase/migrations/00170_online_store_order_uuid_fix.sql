-- FasoStock — Correctif de 00169 : création de commande en ligne impossible.
--
-- `public_online_order_create` est figée sur `SET search_path = public` (bonne
-- pratique de sécurité), mais elle appelait `uuid_generate_v4()` pour fabriquer le
-- jeton de suivi. Chez Supabase, uuid-ossp est installé dans le schéma `extensions` :
-- la fonction est donc INTROUVABLE depuis ce search_path, et toute commande échouait
-- sur « function uuid_generate_v4() does not exist ».
--
-- Les DEFAULT des tables (00169) ne sont pas concernés : PostgreSQL y a figé la
-- référence schéma-qualifiée au moment du CREATE TABLE.
--
-- Correctif : `gen_random_uuid()`, fournie par pg_catalog (PostgreSQL 13+), donc
-- toujours résoluble quel que soit le search_path.

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
  -- `gen_random_uuid()` (pg_catalog) et non `uuid_generate_v4()` : cette fonction est
  -- figée sur `search_path = public`, or uuid-ossp est installé dans le schéma
  -- `extensions` chez Supabase — l'appel y serait introuvable à l'exécution.
  v_token := gen_random_uuid();

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

-- ─────────────────────────────────────────────────────────────────────────────
-- Durcissement au passage : l'encaissement d'une commande appelle
-- `create_sale_with_stock`, qui existe en plusieurs surcharges (7, 9 et 10
-- paramètres selon les migrations 00023 → 00072). Le dernier argument est
-- désormais typé `NULL::uuid` pour que la surcharge visée soit choisie sans
-- ambiguïté, quel que soit le catalogue déployé.
-- ─────────────────────────────────────────────────────────────────────────────
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
    -- Typé explicitement : `create_sale_with_stock` existe en plusieurs surcharges
    -- (7, 9 et 10 paramètres selon les migrations 00023 → 00072). Un NULL non typé
    -- laisserait la résolution de surcharge au hasard du catalogue déployé.
    NULL::uuid
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

NOTIFY pgrst, 'reload schema';
