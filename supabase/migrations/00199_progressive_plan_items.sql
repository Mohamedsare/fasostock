-- FasoStock — Achats Progressifs : SÉLECTION LIBRE D'ARTICLES + FACTURE PROFORMA A4
--
-- Métier : jusqu'ici un dossier d'épargne ne visait qu'UN seul article. Dans la vraie
-- vie le client dit « je veux ce salon, deux ventilateurs et la télé » : il faut pouvoir
-- composer librement sa sélection (plusieurs lignes, quantité et prix négocié par ligne)
-- puis lui remettre une FACTURE A4 (proforma) qu'il emporte, garde en photo ou reçoit
-- par WhatsApp — c'est ce papier qui l'engage et qui fixe le montant à atteindre.
--
-- Modèle :
--   * `progressive_plan_items` = la sélection du dossier (lignes libres).
--   * L'objectif du dossier (`progressive_plans.target_amount`) est recalculé = total
--     de la sélection : toute la page (barre de progression, dossiers « prêts »,
--     tickets thermiques) continue de fonctionner sans changement.
--   * `progressive_plan_convert_selection` remet TOUTE la sélection au client en une
--     seule vente (déstockage + règlements ventilés), comme la conversion mono-article.
--
-- Rien n'est modifié pour les dossiers existants : sans ligne de sélection, le dossier
-- garde son article visé et son montant objectif d'avant.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table : la sélection du client
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.progressive_plan_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.progressive_plans(id) ON DELETE CASCADE,
  -- Produit du catalogue. ON DELETE SET NULL : un produit retiré du catalogue ne doit
  -- pas effacer la ligne d'une facture déjà remise au client (`label` en garde la trace).
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  -- Nom figé au moment du choix : la facture proforma reste fidèle même si le produit
  -- est renommé plus tard.
  label text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  -- Prix négocié avec le client (peut différer du prix catalogue).
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.progressive_plan_items IS
  'Sélection d''articles d''un dossier d''achat progressif : plusieurs lignes libres '
  '(quantité + prix négocié). Le total pilote l''objectif du dossier et alimente la '
  'facture proforma A4 remise au client.';

CREATE INDEX IF NOT EXISTS idx_progressive_plan_items_plan
  ON public.progressive_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_progressive_plan_items_company
  ON public.progressive_plan_items(company_id);

ALTER TABLE public.progressive_plan_items ENABLE ROW LEVEL SECURITY;

-- Lecture pour les membres de l'entreprise ; écritures par RPC uniquement.
DROP POLICY IF EXISTS "progressive_plan_items_select" ON public.progressive_plan_items;
CREATE POLICY "progressive_plan_items_select" ON public.progressive_plan_items FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Total de la sélection d'un dossier
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_selection_total(p_plan_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(round(i.unit_price * i.quantity)), 0)
  FROM public.progressive_plan_items i
  WHERE i.plan_id = p_plan_id;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_selection_total(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC : enregistrer la sélection (remplace intégralement les lignes)
--
-- `p_items` : [{ "product_id": uuid|null, "label": text, "quantity": int, "unit_price": num }, …]
-- L'objectif du dossier suit la sélection :
--   * sélection non vide → target_amount = total (et target_product_id = l'article s'il
--     n'y en a qu'un, pour que les tickets thermiques continuent de le nommer) ;
--   * sélection vidée    → l'objectif saisi à la main est conservé tel quel.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_plan_items_set(
  p_plan_id uuid,
  p_items jsonb
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.progressive_plans;
  v_item jsonb;
  v_pos integer := 0;
  v_product_id uuid;
  v_label text;
  v_qty integer;
  v_price numeric;
  v_count integer := 0;
  v_single_product uuid;
  v_total numeric;
BEGIN
  v_plan := public.progressive_assert_plan_access(p_plan_id);
  IF v_plan.status <> 'open' THEN
    RAISE EXCEPTION 'Dossier clôturé : la sélection n''est plus modifiable.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Sélection invalide.';
  END IF;
  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'Sélection trop longue (100 lignes maximum).';
  END IF;

  DELETE FROM public.progressive_plan_items WHERE plan_id = p_plan_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::integer, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, -1);
    v_label := NULLIF(btrim(COALESCE(v_item->>'label', '')), '');

    IF v_product_id IS NOT NULL THEN
      SELECT pr.name INTO v_label
      FROM public.products pr
      WHERE pr.id = v_product_id AND pr.company_id = v_plan.company_id;
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'Un article de la sélection est introuvable dans le catalogue.';
      END IF;
    END IF;

    IF v_label IS NULL THEN
      RAISE EXCEPTION 'Chaque ligne de la sélection doit porter un libellé.';
    END IF;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour « % ».', v_label;
    END IF;
    IF v_price < 0 THEN
      RAISE EXCEPTION 'Prix invalide pour « % ».', v_label;
    END IF;

    INSERT INTO public.progressive_plan_items (
      company_id, plan_id, product_id, label, quantity, unit_price, position
    ) VALUES (
      v_plan.company_id, p_plan_id, v_product_id, v_label, v_qty, round(v_price), v_pos
    );

    v_pos := v_pos + 1;
    v_count := v_count + 1;
    v_single_product := CASE WHEN v_count = 1 THEN v_product_id ELSE NULL END;
  END LOOP;

  v_total := public.progressive_selection_total(p_plan_id);

  IF v_count > 0 THEN
    UPDATE public.progressive_plans
    SET target_amount = NULLIF(v_total, 0),
        target_product_id = CASE WHEN v_count = 1 THEN v_single_product ELSE NULL END,
        updated_at = now()
    WHERE id = p_plan_id;
  END IF;

  RETURN v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_plan_items_set(uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC : lire la sélection d'un dossier (avec le prix catalogue du jour)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_plan_items_list(p_plan_id uuid)
RETURNS TABLE (
  id uuid,
  product_id uuid,
  label text,
  quantity integer,
  unit_price numeric,
  line_total numeric,
  -- `position` est un mot réservé SQL : impossible comme nom de colonne de sortie.
  sort_order integer,
  current_price numeric,
  image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, i.product_id, i.label, i.quantity, i.unit_price,
    round(i.unit_price * i.quantity) AS line_total,
    i.position AS sort_order,
    pr.sale_price AS current_price,
    (
      SELECT im.url FROM public.product_images im
      WHERE im.product_id = i.product_id
      ORDER BY im.position ASC, im.created_at ASC
      LIMIT 1
    ) AS image_url
  FROM public.progressive_plan_items i
  JOIN public.progressive_plans pl ON pl.id = i.plan_id
  LEFT JOIN public.products pr ON pr.id = i.product_id
  WHERE i.plan_id = p_plan_id
    AND pl.company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_progressive(pl.company_id)
  ORDER BY i.position ASC, i.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_plan_items_list(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC : données de la facture proforma A4 (source unique du PDF serveur)
--
-- Le navigateur n'envoie que l'identifiant du dossier : montants, lignes et en-tête
-- viennent d'ici, avec le contrôle d'accès habituel. Rien n'est falsifiable.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_quote_data(p_plan_id uuid)
RETURNS TABLE (
  plan_id uuid,
  plan_number text,
  status text,
  created_at timestamptz,
  client_name text,
  client_phone text,
  client_id_type text,
  client_id_number text,
  client_address text,
  notes text,
  items jsonb,
  selection_total numeric,
  target_amount numeric,
  total_deposited numeric,
  balance numeric,
  company_id uuid,
  company_name text,
  store_id uuid,
  store_name text,
  store_address text,
  store_phone text,
  store_logo_url text,
  store_activity text,
  store_slogan text,
  store_footer_text text,
  store_primary_color text,
  signer_name text,
  business_type_slug text,
  currency text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pl.id, pl.plan_number, pl.status, pl.created_at,
    pl.client_name, pl.client_phone, pl.client_id_type, pl.client_id_number,
    pl.client_address, pl.notes,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'label', i.label,
                 'quantity', i.quantity,
                 'unit_price', i.unit_price,
                 'line_total', round(i.unit_price * i.quantity)
               )
               ORDER BY i.position ASC, i.created_at ASC
             )
      FROM public.progressive_plan_items i
      WHERE i.plan_id = pl.id
    ), '[]'::jsonb) AS items,
    public.progressive_selection_total(pl.id) AS selection_total,
    pl.target_amount,
    COALESCE((
      SELECT SUM(l.amount) FROM public.progressive_ledger l
      WHERE l.plan_id = pl.id AND l.kind = 'deposit'
    ), 0) AS total_deposited,
    public.progressive_plan_balance(pl.id) AS balance,
    c.id, c.name,
    st.id, st.name, st.address, st.phone, st.logo_url,
    st.activity, st.slogan, st.footer_text, st.primary_color,
    st.invoice_signer_name,
    c.business_type_slug,
    COALESCE(st.currency, 'XOF')
  FROM public.progressive_plans pl
  JOIN public.companies c ON c.id = pl.company_id
  JOIN public.stores st ON st.id = pl.store_id
  WHERE pl.id = p_plan_id
    AND pl.company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_progressive(pl.company_id);
$$;
GRANT EXECUTE ON FUNCTION public.progressive_quote_data(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC : remise de TOUTE la sélection au client (vente multi-lignes)
--
-- Même contrat que `progressive_plan_convert` (mono-article), en une transaction :
-- vente réelle avec déstockage de chaque ligne, règlements ventilés au prorata des
-- moyens de paiement réellement encaissés, écriture 'settlement' et clôture du dossier.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_plan_convert_selection(
  p_plan_id uuid,
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
  v_total numeric;
  v_lines jsonb;
  v_line_count integer;
  v_first_label text;
  v_engine_on boolean;
  v_sale_id uuid;
  v_sale_number text;
  v_payments jsonb := '[]'::jsonb;
  v_left numeric;
  v_take numeric;
  r RECORD;
BEGIN
  v_plan := public.progressive_assert_plan_access(p_plan_id);
  IF v_plan.status <> 'open' THEN
    RAISE EXCEPTION 'Dossier déjà clôturé.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.progressive_plan_items i
    WHERE i.plan_id = p_plan_id AND i.product_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Une ligne de la sélection ne correspond à aucun article du catalogue : corrigez la sélection avant la remise.';
  END IF;

  SELECT
    jsonb_agg(
      jsonb_build_object(
        'product_id', i.product_id,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'discount', 0
      )
      ORDER BY i.position ASC, i.created_at ASC
    ),
    COUNT(*),
    MIN(i.label)
  INTO v_lines, v_line_count, v_first_label
  FROM public.progressive_plan_items i
  WHERE i.plan_id = p_plan_id;

  IF COALESCE(v_line_count, 0) = 0 THEN
    RAISE EXCEPTION 'Aucun article sélectionné dans ce dossier.';
  END IF;

  v_total := public.progressive_selection_total(p_plan_id);
  v_balance := public.progressive_plan_balance(p_plan_id);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Total de la sélection invalide.';
  END IF;
  IF v_total > v_balance + 0.5 THEN
    RAISE EXCEPTION 'Épargne insuffisante : % FCFA disponibles pour une sélection à % FCFA.',
      round(v_balance), round(v_total);
  END IF;

  -- Ventilation des règlements par moyen de paiement effectivement encaissé.
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
    v_lines,
    v_payments,
    0,
    'invoice_pos'::public.sale_mode,
    'a4_invoice'::public.document_type,
    p_client_request_id
  );

  SELECT s.sale_number INTO v_sale_number FROM public.sales s WHERE s.id = v_sale_id;

  -- Fiche engin : seulement si la boutique a le module ET qu'il n'y a qu'une ligne
  -- (une facture engin décrit un engin, pas un panier).
  SELECT st.engine_sales_enabled INTO v_engine_on
  FROM public.stores st WHERE st.id = v_plan.store_id;

  IF COALESCE(v_engine_on, false) AND v_line_count = 1 THEN
    UPDATE public.sales SET sale_kind = 'engine' WHERE id = v_sale_id;

    INSERT INTO public.engine_sale_details (
      sale_id, company_id, client_name, client_id_type, client_id_number,
      client_address, client_phone1, engine_designation, internal_reference, observations
    ) VALUES (
      v_sale_id, v_plan.company_id, v_plan.client_name, v_plan.client_id_type,
      v_plan.client_id_number, v_plan.client_address, v_plan.client_phone,
      v_first_label, v_plan.plan_number,
      'Vente issue de l''achat progressif ' || v_plan.plan_number
    )
    ON CONFLICT (sale_id) DO NOTHING;
  END IF;

  INSERT INTO public.progressive_ledger (
    company_id, plan_id, kind, amount, note, sale_id, created_by
  ) VALUES (
    v_plan.company_id, p_plan_id, 'settlement', v_total,
    'Vente ' || COALESCE(v_sale_number, '') || ' — ' || v_line_count || ' article(s)',
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
GRANT EXECUTE ON FUNCTION public.progressive_plan_convert_selection(uuid, uuid) TO authenticated;
