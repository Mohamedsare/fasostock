-- FasoStock — Rattrapage du module « Achats Progressifs » (complète 00154).
--
-- À appliquer sur les bases où 00154 a été passé AVANT ces évolutions. Sur une base
-- neuve, 00154 contient déjà ces définitions : ce fichier est alors sans effet
-- (mêmes CREATE OR REPLACE, mêmes corps de fonction).
--
-- Ce qui change :
--   1. Le module vaut pour TOUS les métiers (pas seulement la vente de motos) :
--      messages d'erreur et libellés génériques (« article » au lieu de « engin »).
--   2. `progressive_ticket_data` renvoie en plus `business_type_slug` pour adapter le
--      vocabulaire du ticket thermique à l'activité de l'entreprise.
--   3. `progressive_plan_cancel` ne bloque plus quand il reste de l'épargne : elle est
--      TOUJOURS remboursée au client (ligne 'refund' + ticket) dans la même transaction.
--      Nouvelle signature (p_plan_id, p_method, p_reason).
--   4. `progressive_plan_delete` : suppression possible tant qu'aucune vente n'est née
--      du dossier ET que le solde du client est à zéro (rien ne disparaît sans
--      remboursement). Ne dépend plus de l'absence de mouvements.
--
-- Les DROP ci-dessous sont nécessaires : les colonnes de retour / la signature changent.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Commentaires (module tous métiers)
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.stores.progressive_purchases_enabled IS
  'Module Achats Progressifs (épargne par versements vers un achat) — activable par '
  'boutique par le super admin, tous métiers. Défaut désactivé.';

COMMENT ON TABLE public.progressive_plans IS
  'Dossier d''achat progressif : un client épargne par versements successifs jusqu''au prix '
  'd''un article de la boutique (tous métiers). Solde calculé depuis progressive_ledger.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC : création / modification d'un dossier (p_id NULL = création)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_plan_save(
  p_id uuid,
  p_company_id uuid,
  p_store_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_id_type text,
  p_client_id_number text,
  p_client_address text,
  p_target_product_id uuid,
  p_target_amount numeric,
  p_notes text,
  p_customer_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_customer_id uuid := p_customer_id;
  v_phone text := NULLIF(btrim(p_client_phone), '');
  v_name text := btrim(COALESCE(p_client_name, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.can_manage_progressive(p_company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour gérer les achats progressifs.';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès à cette boutique refusé.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id
      AND s.company_id = p_company_id
      AND s.progressive_purchases_enabled = true
  ) THEN
    RAISE EXCEPTION 'Le module Achats Progressifs n''est pas activé pour cette boutique.';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Nom du client requis'; END IF;
  IF p_target_amount IS NOT NULL AND p_target_amount <= 0 THEN
    RAISE EXCEPTION 'Montant objectif invalide';
  END IF;
  IF p_target_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products pr
    WHERE pr.id = p_target_product_id AND pr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Article visé introuvable dans le catalogue';
  END IF;

  -- Fiche client : réutilise le même numéro de téléphone, sinon crée la fiche
  -- (le dossier apparaît alors dans la page Clients, comme une vente engin à crédit).
  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = v_customer_id AND c.company_id = p_company_id
  ) THEN
    v_customer_id := NULL;
  END IF;
  IF v_customer_id IS NULL AND v_phone IS NOT NULL THEN
    SELECT c.id INTO v_customer_id
    FROM public.customers c
    WHERE c.company_id = p_company_id AND c.phone = v_phone
    LIMIT 1;
  END IF;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (company_id, name, type, phone, address)
    VALUES (p_company_id, v_name, 'individual', v_phone, NULLIF(btrim(p_client_address), ''))
    RETURNING id INTO v_customer_id;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.progressive_plans (
      company_id, store_id, plan_number, customer_id,
      client_name, client_phone, client_id_type, client_id_number, client_address,
      target_product_id, target_amount, notes, created_by
    ) VALUES (
      p_company_id, p_store_id,
      'AP-' || nextval('public.progressive_plan_number_seq'),
      v_customer_id,
      v_name, v_phone,
      NULLIF(btrim(p_client_id_type), ''),
      NULLIF(btrim(p_client_id_number), ''),
      NULLIF(btrim(p_client_address), ''),
      p_target_product_id, p_target_amount,
      NULLIF(btrim(p_notes), ''), v_uid
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.progressive_plans SET
      customer_id = v_customer_id,
      client_name = v_name,
      client_phone = v_phone,
      client_id_type = NULLIF(btrim(p_client_id_type), ''),
      client_id_number = NULLIF(btrim(p_client_id_number), ''),
      client_address = NULLIF(btrim(p_client_address), ''),
      target_product_id = p_target_product_id,
      target_amount = p_target_amount,
      notes = NULLIF(btrim(p_notes), ''),
      updated_at = now()
    WHERE id = p_id AND company_id = p_company_id AND status = 'open'
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Dossier introuvable ou déjà clôturé (modification impossible).';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_plan_save(
  uuid, uuid, uuid, text, text, text, text, text, uuid, numeric, text, uuid
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RPC : annulation d'un dossier — le solde est TOUJOURS rendu au client
--
-- On n'annule jamais un dossier en gardant l'argent : s'il reste de l'épargne, une
-- ligne 'refund' du montant total du solde est écrite (ticket imprimable à remettre
-- au client) puis le dossier est clôturé — le tout dans la même transaction.
-- Retourne la ligne de remboursement créée (le cas échéant) pour imprimer son ticket.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.progressive_plan_cancel(uuid);

CREATE OR REPLACE FUNCTION public.progressive_plan_cancel(
  p_plan_id uuid,
  p_method public.payment_method DEFAULT 'cash',
  p_reason text DEFAULT NULL
)
RETURNS TABLE (refund_ledger_id uuid, refund_receipt_number text, refunded_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.progressive_plans;
  v_balance numeric;
  v_id uuid;
  v_receipt text;
  v_refunded numeric := 0;
BEGIN
  v_plan := public.progressive_assert_plan_access(p_plan_id);
  IF v_plan.status <> 'open' THEN
    RAISE EXCEPTION 'Seul un dossier en cours peut être annulé.';
  END IF;

  v_balance := public.progressive_plan_balance(p_plan_id);

  -- Épargne restante → remboursement intégral obligatoire (avec son ticket).
  IF v_balance > 0.5 THEN
    v_receipt := 'AR-' || nextval('public.progressive_receipt_number_seq');
    INSERT INTO public.progressive_ledger (
      company_id, plan_id, kind, amount, method, note, receipt_number, created_by
    ) VALUES (
      v_plan.company_id, p_plan_id, 'refund', v_balance,
      COALESCE(p_method, 'cash'::public.payment_method),
      COALESCE(NULLIF(btrim(p_reason), ''), 'Remboursement à l''annulation du dossier'),
      v_receipt, auth.uid()
    )
    RETURNING id INTO v_id;
    v_refunded := v_balance;
  END IF;

  UPDATE public.progressive_plans
  SET status = 'cancelled',
      notes = CASE
        WHEN NULLIF(btrim(p_reason), '') IS NULL THEN notes
        ELSE concat_ws(chr(10), NULLIF(btrim(notes), ''), 'Annulation : ' || btrim(p_reason))
      END,
      updated_at = now()
  WHERE id = p_plan_id;

  RETURN QUERY SELECT v_id, v_receipt, v_refunded;
END;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_plan_cancel(
  uuid, public.payment_method, text
) TO authenticated;

-- 11. RPC : suppression définitive d'un dossier (propriétaire)
--
-- Supprime le dossier ET son grand livre (cascade). Trois garde-fous :
--   * propriétaire uniquement ;
--   * JAMAIS d'argent du client dans la nature : le solde doit être à zéro
--     (annuler le dossier rembourse justement ce solde) ;
--   * interdit si une VENTE est née du dossier — cette vente reste une pièce
--     comptable dont on ne casse pas l'historique.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_plan_delete(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.progressive_plans;
  v_balance numeric;
BEGIN
  v_plan := public.progressive_assert_plan_access(p_plan_id);
  IF NOT public.user_is_company_owner(v_plan.company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut supprimer un dossier.';
  END IF;
  IF v_plan.converted_sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Dossier déjà transformé en vente (%) : suppression impossible.',
      (SELECT s.sale_number FROM public.sales s WHERE s.id = v_plan.converted_sale_id);
  END IF;

  v_balance := public.progressive_plan_balance(p_plan_id);
  IF v_balance > 0.5 THEN
    RAISE EXCEPTION
      'Le client a encore % FCFA d''épargne : remboursez-le (ou annulez le dossier, ce qui le rembourse) avant de supprimer.',
      round(v_balance);
  END IF;

  DELETE FROM public.progressive_plans WHERE id = p_plan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_plan_delete(uuid) TO authenticated;

-- 12. RPC : conversion de l'épargne en vente réelle (le client prend son article)
--
-- Atomique : crée la vente (déstockage + règlements ventilés par moyen de paiement,
-- au prorata des versements réellement encaissés), écrit la ligne 'settlement' qui
-- consomme l'épargne, et clôture le dossier. Si (et seulement si) la boutique a le
-- module Vente Engins, la vente est en plus marquée `sale_kind='engine'` avec une fiche
-- `engine_sale_details` pré-remplie (complétable ensuite : châssis, moteur, garantie…).
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
    ON CONFLICT (sale_id) DO NOTHING;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Le RPC ticket gagne une colonne de retour → DROP obligatoire avant recréation.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.progressive_ticket_data(uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. RPC : données d'un ticket (versement / remboursement) — impression sécurisée
--     Le serveur PDF ne fait confiance qu'à cette source (pas au payload client).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_ticket_data(p_ledger_id uuid)
RETURNS TABLE (
  ledger_id uuid,
  kind text,
  amount numeric,
  method public.payment_method,
  reference text,
  note text,
  receipt_number text,
  created_at timestamptz,
  cashier_name text,
  plan_id uuid,
  plan_number text,
  client_name text,
  client_phone text,
  target_product_name text,
  target_amount numeric,
  balance_after numeric,
  total_deposited numeric,
  company_id uuid,
  company_name text,
  store_id uuid,
  store_name text,
  store_address text,
  store_phone text,
  store_logo_url text,
  paper_width_mm smallint,
  business_type_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id, l.kind, l.amount, l.method, l.reference, l.note, l.receipt_number, l.created_at,
    COALESCE(NULLIF(btrim(prof.full_name), ''), u.email::text) AS cashier_name,
    pl.id, pl.plan_number, pl.client_name, pl.client_phone,
    pr.name AS target_product_name,
    COALESCE(pl.target_amount, pr.sale_price) AS target_amount,
    -- Solde du dossier juste après cette écriture (relevé fidèle au moment du ticket).
    (
      SELECT COALESCE(SUM(CASE WHEN x.kind = 'deposit' THEN x.amount ELSE -x.amount END), 0)
      FROM public.progressive_ledger x
      WHERE x.plan_id = pl.id
        AND (x.created_at < l.created_at OR (x.created_at = l.created_at AND x.id = l.id))
    ) AS balance_after,
    (
      SELECT COALESCE(SUM(x.amount), 0)
      FROM public.progressive_ledger x
      WHERE x.plan_id = pl.id AND x.kind = 'deposit' AND x.created_at <= l.created_at
    ) AS total_deposited,
    c.id, c.name, st.id, st.name, st.address, st.phone, st.logo_url,
    st.receipt_paper_width_mm,
    -- Vocabulaire du ticket adapté au métier (engin / article / produit).
    c.business_type_slug
  FROM public.progressive_ledger l
  JOIN public.progressive_plans pl ON pl.id = l.plan_id
  JOIN public.companies c ON c.id = pl.company_id
  JOIN public.stores st ON st.id = pl.store_id
  LEFT JOIN public.products pr ON pr.id = pl.target_product_id
  LEFT JOIN public.profiles prof ON prof.id = l.created_by
  LEFT JOIN auth.users u ON u.id = l.created_by
  WHERE l.id = p_ledger_id
    AND pl.company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_progressive(pl.company_id);
$$;
GRANT EXECUTE ON FUNCTION public.progressive_ticket_data(uuid) TO authenticated;
