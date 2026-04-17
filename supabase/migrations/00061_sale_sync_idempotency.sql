-- Idempotence des ventes rejouées depuis la file offline : évite doubles ventes / doubles déstockages
-- si le client retente après timeout alors que le serveur a déjà enregistré la vente.

CREATE TABLE IF NOT EXISTS public.sale_sync_idempotency (
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.sales (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_sync_idempotency_sale_id ON public.sale_sync_idempotency (sale_id);

ALTER TABLE public.sale_sync_idempotency ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sale_sync_idempotency IS 'Lien idempotence client (UUID par tentative de vente offline) → vente créée. Rempli uniquement par create_sale_with_stock (SECURITY DEFINER).';

DROP FUNCTION IF EXISTS public.create_sale_with_stock(
  uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type
);

CREATE OR REPLACE FUNCTION public.create_sale_with_stock(
  p_company_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_created_by uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount decimal DEFAULT 0,
  p_sale_mode public.sale_mode DEFAULT 'quick_pos',
  p_document_type public.document_type DEFAULT 'thermal_receipt',
  p_client_request_id uuid DEFAULT NULL
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

    UPDATE public.store_inventory
    SET quantity = quantity - v_qty,
        updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%" (référence: %)', COALESCE(v_product_name, v_product_id::text), v_product_id;
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

  INSERT INTO public.sales (company_id, store_id, customer_id, sale_number, status, subtotal, discount, tax, total, created_by, sale_mode, document_type)
  VALUES (p_company_id, p_store_id, p_customer_id, v_sale_number, 'completed', v_subtotal, COALESCE(p_discount, 0), 0, v_total, p_created_by, COALESCE(p_sale_mode, 'quick_pos'::public.sale_mode), COALESCE(p_document_type, 'thermal_receipt'::public.document_type))
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := (v_item->>'unit_price')::decimal;
    v_disc := COALESCE((v_item->>'discount')::decimal, 0);

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (v_sale_id, v_product_id, v_qty, v_unit_price, v_disc, v_qty * v_unit_price - v_disc);

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (p_store_id, v_product_id, 'sale_out', -v_qty, 'sale', v_sale_id, p_created_by, NULL);
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
  uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type, uuid
) TO authenticated;

COMMENT ON FUNCTION public.create_sale_with_stock(uuid, uuid, uuid, uuid, jsonb, jsonb, decimal, public.sale_mode, public.document_type, uuid) IS
  'Crée une vente et décrémente le stock. p_client_request_id (UUID stable par tentative offline) garantit l''idempotence au rejouage de la file sync.';
