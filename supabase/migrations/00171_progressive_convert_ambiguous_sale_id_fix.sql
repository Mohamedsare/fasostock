-- ─────────────────────────────────────────────────────────────────────────────
-- 00171 — Achats progressifs : correction « column reference "sale_id" is ambiguous »
--
-- Symptôme : « Remettre l'article » échouait avec cette erreur Postgres dès que
-- la boutique a le module Vente Engins activé.
--
-- Cause : `progressive_plan_convert` déclare `RETURNS TABLE (sale_id uuid, …)`,
-- donc `sale_id` est aussi une variable OUT de la fonction. Dans la clause
-- `ON CONFLICT (sale_id)` de l'insertion `engine_sale_details`, PL/pgSQL tente de
-- résoudre `sale_id` à la fois comme colonne et comme variable → ambiguïté, et
-- toute la conversion échoue (la vente n'est jamais créée).
--
-- Correction : viser la contrainte par son nom (`engine_sale_details_pkey`,
-- `sale_id` étant la clé primaire de la table) au lieu d'inférer l'index par le
-- nom de colonne. Aucune substitution de variable n'a lieu dans cette forme.
--
-- Le reste du corps est identique à 00155.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.progressive_plan_convert(
  p_plan_id uuid,
  p_product_id uuid,
  p_quantity integer DEFAULT 1,
  p_unit_price numeric DEFAULT NULL,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS TABLE (sale_id uuid, sale_number text, total numeric, residual numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.progressive_plans;
  v_balance numeric;
  v_qty integer := GREATEST(1, COALESCE(p_quantity, 1));
  v_price numeric;
  v_total numeric;
  v_engine_on boolean;
  v_sale_id uuid;
  v_sale_number text;
  v_payments jsonb := '[]'::jsonb;
  v_left numeric;
  v_take numeric;
  r RECORD;
  v_product_name text;
BEGIN
  v_plan := public.progressive_assert_plan_access(p_plan_id);
  IF v_plan.status <> 'open' THEN
    RAISE EXCEPTION 'Dossier déjà clôturé.';
  END IF;

  SELECT pr.name, COALESCE(p_unit_price, pr.sale_price)
  INTO v_product_name, v_price
  FROM public.products pr
  WHERE pr.id = p_product_id AND pr.company_id = v_plan.company_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Article introuvable dans le catalogue de l''entreprise.';
  END IF;
  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'Prix de vente de l''article invalide.';
  END IF;

  v_total := round(v_price * v_qty);
  v_balance := public.progressive_plan_balance(p_plan_id);
  IF v_total > v_balance + 0.5 THEN
    RAISE EXCEPTION 'Épargne insuffisante : % FCFA disponibles pour un article à % FCFA.',
      round(v_balance), v_total;
  END IF;

  -- Ventilation des règlements par moyen de paiement effectivement encaissé
  -- (net des remboursements), plafonnée au total de la vente.
  v_left := v_total;
  FOR r IN
    SELECT l.method AS method,
           SUM(CASE WHEN l.kind = 'deposit' THEN l.amount ELSE -l.amount END) AS amt
    FROM public.progressive_ledger l
    WHERE l.plan_id = p_plan_id AND l.kind IN ('deposit', 'refund')
    GROUP BY l.method
    HAVING SUM(CASE WHEN l.kind = 'deposit' THEN l.amount ELSE -l.amount END) > 0
    ORDER BY 2 DESC
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, round(r.amt));
    IF v_take > 0 THEN
      v_payments := v_payments || jsonb_build_object(
        'method', COALESCE(r.method, 'cash'::public.payment_method),
        'amount', v_take,
        'reference', 'Achat progressif ' || v_plan.plan_number
      );
      v_left := v_left - v_take;
    END IF;
  END LOOP;
  -- Reliquat d'arrondi éventuel : rattaché aux espèces.
  IF v_left > 0 THEN
    v_payments := v_payments || jsonb_build_object(
      'method', 'cash',
      'amount', v_left,
      'reference', 'Achat progressif ' || v_plan.plan_number
    );
  END IF;

  v_sale_id := public.create_sale_with_stock(
    v_plan.company_id,
    v_plan.store_id,
    v_plan.customer_id,
    auth.uid(),
    jsonb_build_array(jsonb_build_object(
      'product_id', p_product_id,
      'quantity', v_qty,
      'unit_price', v_price,
      'discount', 0
    )),
    v_payments,
    0,
    'invoice_pos'::public.sale_mode,
    'a4_invoice'::public.document_type,
    p_client_request_id
  );

  SELECT s.sale_number INTO v_sale_number FROM public.sales s WHERE s.id = v_sale_id;

  SELECT st.engine_sales_enabled INTO v_engine_on
  FROM public.stores st WHERE st.id = v_plan.store_id;

  IF COALESCE(v_engine_on, false) THEN
    UPDATE public.sales SET sale_kind = 'engine' WHERE id = v_sale_id;

    INSERT INTO public.engine_sale_details (
      sale_id, company_id, client_name, client_id_type, client_id_number,
      client_address, client_phone1, engine_designation, internal_reference, observations
    ) VALUES (
      v_sale_id, v_plan.company_id, v_plan.client_name, v_plan.client_id_type,
      v_plan.client_id_number, v_plan.client_address, v_plan.client_phone,
      v_product_name, v_plan.plan_number,
      'Vente issue de l''achat progressif ' || v_plan.plan_number
    )
    -- Contrainte visée par son nom : `ON CONFLICT (sale_id)` serait ambigu avec
    -- la variable OUT `sale_id` de la fonction (cf. en-tête du fichier).
    ON CONFLICT ON CONSTRAINT engine_sale_details_pkey DO NOTHING;
  END IF;

  -- Consommation de l'épargne (ligne immuable, rattachée à la vente).
  INSERT INTO public.progressive_ledger (
    company_id, plan_id, kind, amount, note, sale_id, created_by
  ) VALUES (
    v_plan.company_id, p_plan_id, 'settlement', v_total,
    'Vente ' || COALESCE(v_sale_number, '') || ' — ' || v_product_name,
    v_sale_id, auth.uid()
  );

  UPDATE public.progressive_plans
  SET status = 'converted',
      converted_sale_id = v_sale_id,
      converted_at = now(),
      updated_at = now()
  WHERE id = p_plan_id;

  RETURN QUERY
  SELECT v_sale_id, v_sale_number, v_total, public.progressive_plan_balance(p_plan_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.progressive_plan_convert(
  uuid, uuid, integer, numeric, uuid
) TO authenticated;
