-- 00177 — Ventes hors ligne : ne jamais perdre une vente déjà encaissée.
--
-- Deux problèmes traités ensemble, parce qu'ils touchent la même fonction :
--
-- 1) DEUX SURCHARGES VIVAIENT EN PARALLÈLE
--    00061 a créé la version à 10 paramètres (avec `p_client_request_id`, idempotence).
--    00067 puis 00072 ont redéfini la version à 9 paramètres en y ajoutant le garde-fou
--    `product_scope` — sans jamais supprimer celle à 10. Les deux coexistaient donc, et
--    l'app appelant toujours avec `p_client_request_id`, c'est la version 00061 qui
--    servait : le garde-fou « produit réservé au dépôt magasin » ne s'est jamais
--    appliqué aux ventes en caisse. Cette migration fusionne les deux en UNE fonction.
--
-- 2) UNE VENTE HORS LIGNE POUVAIT ÊTRE PERDUE
--    Au rejeu de la file, si le stock enregistré était devenu insuffisant, la fonction
--    levait « Stock insuffisant » — la vente échouait 25 fois puis dormait pour toujours
--    dans IndexedDB. Or la marchandise était sortie et l'argent encaissé depuis des
--    heures : refuser n'annule pas la vente, ça fait seulement disparaître la recette
--    des livres et laisse la caisse physique en désaccord avec la base.
--
--    `p_allow_negative_stock` (réservé au rejeu de la file) enregistre la vente malgré
--    tout. Le stock est ramené à 0 — et non passé en négatif : `store_inventory.quantity`
--    porte `CHECK (quantity >= 0)`, et surtout un stock physique ne peut pas être négatif.
--    L'écart est un fait comptable, pas physique : il est consigné sur la vente
--    (`stock_anomaly`, `stock_anomaly_detail`) pour arbitrage, et le mouvement de stock
--    conserve la quantité réellement vendue.

-- ---------------------------------------------------------------------------
-- 1) Marqueur d'écart sur la vente
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS stock_anomaly boolean NOT NULL DEFAULT false;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS stock_anomaly_detail text;

COMMENT ON COLUMN public.sales.stock_anomaly IS
  'Vente hors ligne rejouée alors que le stock enregistré était insuffisant. La vente est réelle (encaissée) ; le stock a été ramené à 0 et l''écart demande un arbitrage (inventaire).';
COMMENT ON COLUMN public.sales.stock_anomaly_detail IS
  'Détail lisible de l''écart : produit(s) et quantité manquante au moment de la synchronisation.';

-- Retrouver rapidement les ventes à arbitrer (rare : index partiel).
CREATE INDEX IF NOT EXISTS idx_sales_stock_anomaly
  ON public.sales (company_id, created_at DESC)
  WHERE stock_anomaly;

-- ---------------------------------------------------------------------------
-- 2) Fonction unique et complète
-- ---------------------------------------------------------------------------

-- Les deux surcharges disparaissent au profit d'une seule : les paramètres 10 et 11
-- ayant une valeur par défaut, les appels existants continuent de résoudre — et sans
-- ambiguïté possible, puisqu'il ne reste qu'une fonction de ce nom.
--
-- Appelants vérifiés avant suppression :
--   • web / Flutter        : 10 arguments nommés (avec p_client_request_id) ;
--   • convert_progressive… : 10 arguments POSITIONNELS (00154 et 00155, ligne ~347) ;
--   • rejeu de la file     : 11 arguments nommés (nouveau).
-- Tous retombent sur `p_allow_negative_stock = false` sauf le rejeu, qui est le seul
-- contexte où la marchandise est déjà sortie.
DROP FUNCTION IF EXISTS public.create_sale_with_stock(
  uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type
);
DROP FUNCTION IF EXISTS public.create_sale_with_stock(
  uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type, uuid
);

CREATE FUNCTION public.create_sale_with_stock(
  p_company_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount decimal DEFAULT 0,
  p_sale_mode public.sale_mode DEFAULT 'quick_pos',
  p_document_type public.document_type DEFAULT 'thermal_receipt',
  p_client_request_id uuid DEFAULT NULL,
  p_allow_negative_stock boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal decimal := 0;
  v_total decimal;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price decimal;
  v_disc decimal;
  v_row_count int;
  v_product_name text;
  v_available int;
  v_shortfall int;
  v_has_anomaly boolean := false;
  v_anomaly_detail text := '';
BEGIN
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée pour cette entreprise';
  END IF;
  IF p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Accès refusé : créateur de la vente invalide';
  END IF;

  -- Idempotence (00061) : un rejeu de la file avec le même identifiant renvoie la vente
  -- déjà créée — ni doublon, ni double déstockage.
  IF p_client_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      abs(hashtext(p_company_id::text)),
      abs(hashtext(p_client_request_id::text))
    );
    SELECT i.sale_id INTO v_sale_id
    FROM public.sale_sync_idempotency i
    WHERE i.company_id = p_company_id
      AND i.client_request_id = p_client_request_id;
    IF v_sale_id IS NOT NULL THEN
      RETURN v_sale_id;
    END IF;
  END IF;

  v_sale_number := 'S-' || nextval('public.sale_number_seq');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour produit %', v_product_id;
    END IF;

    -- Garde-fou dépôt (00067/00072) : rétabli ici pour TOUTES les ventes, y compris
    -- celles qui passent un `p_client_request_id` — ce qui n'était plus le cas.
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only')
    ) THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Produit réservé au dépôt magasin, pas à la vente en boutique : %',
        COALESCE(v_product_name, v_product_id::text);
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_qty,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;

      -- Vente en direct : la marchandise est encore là, le caissier corrige tout de suite.
      IF NOT COALESCE(p_allow_negative_stock, false) THEN
        RAISE EXCEPTION 'Stock insuffisant pour "%" (référence: %)',
          COALESCE(v_product_name, v_product_id::text), v_product_id;
      END IF;

      -- Rejeu d'une vente hors ligne : la marchandise est sortie, l'argent est encaissé.
      -- On enregistre la vente et on consigne l'écart plutôt que de la perdre.
      SELECT COALESCE(si.quantity, 0) INTO v_available
      FROM public.store_inventory si
      WHERE si.store_id = p_store_id AND si.product_id = v_product_id;

      v_shortfall := v_qty - COALESCE(v_available, 0);

      INSERT INTO public.store_inventory (store_id, product_id, quantity)
      VALUES (p_store_id, v_product_id, 0)
      ON CONFLICT (store_id, product_id)
      DO UPDATE SET quantity = 0, updated_at = now();

      v_has_anomaly := true;
      v_anomaly_detail := v_anomaly_detail
        || CASE WHEN v_anomaly_detail = '' THEN '' ELSE ' ; ' END
        || COALESCE(v_product_name, v_product_id::text)
        || ' : ' || v_shortfall || ' manquant(s) au moment de la synchronisation';
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);
    v_subtotal := v_subtotal + (v_qty * v_unit_price - v_disc);
  END LOOP;
  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  INSERT INTO public.sales (
    company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total,
    created_by, sale_mode, document_type, stock_anomaly, stock_anomaly_detail
  )
  VALUES (
    p_company_id, p_store_id, p_customer_id, v_sale_number, 'completed', v_subtotal,
    COALESCE(p_discount, 0), 0, v_total, p_created_by,
    COALESCE(p_sale_mode, 'quick_pos'::public.sale_mode),
    COALESCE(p_document_type, 'thermal_receipt'::public.document_type),
    v_has_anomaly,
    NULLIF(v_anomaly_detail, '')
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (v_sale_id, v_product_id, v_qty, v_unit_price, v_disc, v_qty * v_unit_price - v_disc);

    -- Le mouvement conserve la quantité RÉELLEMENT vendue, même si le stock disponible
    -- était moindre : c'est la trace d'audit, elle ne doit pas être arrondie.
    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (
      p_store_id, v_product_id, 'sale_out', -v_qty, 'sale', v_sale_id, p_created_by,
      CASE WHEN v_has_anomaly THEN 'Vente hors ligne synchronisée — écart de stock consigné' END
    );
  END LOOP;

  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  SELECT v_sale_id,
         (elem->>'method')::payment_method,
         (elem->>'amount')::decimal,
         elem->>'reference'
  FROM jsonb_array_elements(p_payments) AS elem;

  IF p_client_request_id IS NOT NULL THEN
    INSERT INTO public.sale_sync_idempotency (company_id, client_request_id, sale_id)
    VALUES (p_company_id, p_client_request_id, v_sale_id)
    ON CONFLICT (company_id, client_request_id) DO NOTHING;
  END IF;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_stock(
  uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type, uuid, boolean
) TO authenticated;

COMMENT ON FUNCTION public.create_sale_with_stock(
  uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type, uuid, boolean
) IS
  'Crée une vente et décrémente le stock. p_client_request_id : idempotence au rejeu de la file hors ligne. p_allow_negative_stock : réservé à ce rejeu — enregistre la vente même si le stock enregistré est devenu insuffisant (stock ramené à 0, écart consigné dans sales.stock_anomaly).';
