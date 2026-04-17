-- Bons / factures de sortie depuis le **dépôt central (magasin)** — indépendant du stock boutique.
-- Le propriétaire enregistre une sortie avec lignes (produit, qté, prix unitaire) et client optionnel.
-- Les mouvements magasin utilisent reference_type = 'warehouse_dispatch'.

-- ---------------------------------------------------------------------------
-- Tables document + lignes
-- ---------------------------------------------------------------------------
CREATE TABLE public.warehouse_dispatch_invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  document_number text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, document_number)
);

CREATE INDEX idx_warehouse_dispatch_invoices_company_created
  ON public.warehouse_dispatch_invoices (company_id, created_at DESC);

CREATE TABLE public.warehouse_dispatch_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id uuid NOT NULL REFERENCES public.warehouse_dispatch_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX idx_warehouse_dispatch_items_invoice ON public.warehouse_dispatch_items (invoice_id);

COMMENT ON TABLE public.warehouse_dispatch_invoices IS 'Bon ou facture de sortie depuis le dépôt (magasin) — ne modifie pas store_inventory.';
COMMENT ON TABLE public.warehouse_dispatch_items IS 'Lignes produit d''un bon de sortie magasin.';

-- ---------------------------------------------------------------------------
-- RLS : lecture owner uniquement (écriture via RPC)
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_dispatch_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_dispatch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouse_dispatch_invoices_select_owner ON public.warehouse_dispatch_invoices
  FOR SELECT TO authenticated
  USING (public.user_is_company_owner(company_id));

CREATE POLICY warehouse_dispatch_items_select_owner ON public.warehouse_dispatch_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.warehouse_dispatch_invoices w
      WHERE w.id = warehouse_dispatch_items.invoice_id
        AND public.user_is_company_owner(w.company_id)
    )
  );

GRANT SELECT ON public.warehouse_dispatch_invoices TO authenticated;
GRANT SELECT ON public.warehouse_dispatch_items TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC : créer le document, décrémenter warehouse_inventory, tracer les mouvements
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warehouse_create_dispatch_invoice(
  p_company_id uuid,
  p_customer_id uuid,
  p_notes text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice_id uuid;
  v_doc text;
  v_line record;
  v_wh_q integer;
  v_attempt int := 0;
  v_product_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une sortie magasin (bon / facture dépôt).';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Au moins une ligne produit est requise';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'Client introuvable pour cette entreprise';
    END IF;
  END IF;

  -- Pas de doublon produit sur le même document (simplifie stock et affichage)
  IF EXISTS (
    SELECT 1 FROM (
      SELECT (elem->>'product_id')::uuid AS pid
      FROM jsonb_array_elements(p_lines) AS elem
      WHERE (elem->>'product_id') IS NOT NULL AND (elem->>'product_id') <> ''
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'Chaque produit ne peut apparaître qu''une fois (regroupez les quantités)';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_doc := 'BSD-' || to_char(timezone('UTC', now()), 'YYYYMMDD') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    BEGIN
      INSERT INTO public.warehouse_dispatch_invoices (
        company_id, customer_id, document_number, notes, created_by
      ) VALUES (
        p_company_id, p_customer_id, v_doc, NULLIF(trim(p_notes), ''), v_uid
      )
      RETURNING id INTO v_invoice_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  FOR v_line IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      (elem->>'quantity')::integer AS quantity,
      (elem->>'unit_price')::numeric AS unit_price
    FROM jsonb_array_elements(p_lines) AS elem
  LOOP
    IF v_line.product_id IS NULL THEN
      RAISE EXCEPTION 'product_id manquant sur une ligne';
    END IF;
    IF v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un produit';
    END IF;
    IF v_line.unit_price IS NULL OR v_line.unit_price < 0 THEN
      RAISE EXCEPTION 'Prix unitaire invalide pour un produit';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_line.product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Produit introuvable pour cette entreprise';
    END IF;

    SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = v_line.product_id
    FOR UPDATE;

    IF COALESCE(v_wh_q, 0) < v_line.quantity THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_line.product_id;
      RAISE EXCEPTION 'Stock magasin insuffisant pour "%" (demandé: %, disponible: %)',
        COALESCE(v_product_name, v_line.product_id::text), v_line.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_dispatch_items (invoice_id, product_id, quantity, unit_price)
    VALUES (v_invoice_id, v_line.product_id, v_line.quantity, v_line.unit_price);

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_line.product_id, 'exit', v_line.quantity, v_line.unit_price,
      'unite', 1, 'warehouse_dispatch', v_invoice_id, v_doc, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_line.quantity,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = v_line.product_id;
  END LOOP;

  RETURN jsonb_build_object('id', v_invoice_id, 'document_number', v_doc);
END;
$$;

COMMENT ON FUNCTION public.warehouse_create_dispatch_invoice IS
  'Crée un bon de sortie / facture dépôt : sort uniquement warehouse_inventory (pas les boutiques).';

GRANT EXECUTE ON FUNCTION public.warehouse_create_dispatch_invoice(uuid, uuid, text, jsonb) TO authenticated;
