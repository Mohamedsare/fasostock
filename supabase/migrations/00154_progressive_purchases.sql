-- FasoStock — Module « Achats Progressifs » (épargne du client vers un achat).
--
-- Métier (TOUS types de commerce : motos, électroménager, meubles, matériaux, téléphones…) :
-- le client vient déposer de l'argent « petit à petit » sans forcément avoir choisi l'article
-- au départ. Chaque versement donne lieu à un TICKET thermique (58 / 80 mm). Quand le cumul
-- atteint le prix d'un article disponible en boutique, le dossier devient « prêt » : on peut
-- convertir l'épargne en vente réelle (déstockage + règlements ventilés par moyen de paiement).
--
-- Activable PAR BOUTIQUE (super admin), exactement comme Vente Engins / Immatriculation.
--
-- Modèle : un dossier (`progressive_plans`) + un GRAND LIVRE de mouvements
-- (`progressive_ledger`) avec 3 natures :
--   * 'deposit'    (+) le client verse
--   * 'refund'     (−) on rend de l'argent au client
--   * 'settlement' (−) l'épargne est consommée par la vente de l'article
-- Solde = Σ deposit − Σ refund − Σ settlement. Aucune ligne n'est jamais modifiée
-- (piste d'audit : un versement encaissé reste tracé même après conversion).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Flag d'activation par boutique
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS progressive_purchases_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.progressive_purchases_enabled IS
  'Module Achats Progressifs (épargne par versements vers un achat) — activable par '
  'boutique par le super admin, tous métiers. Défaut désactivé.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Permission dédiée
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'progressive.manage')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Séquences de numérotation (dossiers + tickets)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.progressive_plan_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.progressive_receipt_number_seq;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.progressive_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  plan_number text NOT NULL UNIQUE,

  -- Client : fiche `customers` rattachée (suivi global) + copie des infos au dossier
  -- (le ticket doit rester fidèle même si la fiche client change ensuite).
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_phone text,
  client_id_type text,
  client_id_number text,
  client_address text,

  -- Objectif : article visé (optionnel — le client ne choisit pas forcément au début)
  -- et/ou montant cible saisi à la main.
  target_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  target_amount numeric(14,2) CHECK (target_amount IS NULL OR target_amount > 0),

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'converted', 'cancelled')),
  converted_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  converted_at timestamptz,

  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.progressive_plans IS
  'Dossier d''achat progressif : un client épargne par versements successifs jusqu''au prix '
  'd''un article de la boutique (tous métiers). Solde calculé depuis progressive_ledger.';

CREATE INDEX IF NOT EXISTS idx_progressive_plans_company ON public.progressive_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_progressive_plans_store ON public.progressive_plans(store_id);
CREATE INDEX IF NOT EXISTS idx_progressive_plans_customer ON public.progressive_plans(customer_id);

CREATE TABLE IF NOT EXISTS public.progressive_ledger (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.progressive_plans(id) ON DELETE CASCADE,

  kind text NOT NULL CHECK (kind IN ('deposit', 'refund', 'settlement')),
  -- Toujours positif : le signe découle de `kind` (deposit = +, refund/settlement = −).
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method public.payment_method,
  reference text,
  note text,

  -- Numéro imprimé sur le ticket remis au client (versement ET remboursement).
  receipt_number text UNIQUE,
  -- Vente issue de la conversion (uniquement kind='settlement').
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.progressive_ledger IS
  'Grand livre d''un achat progressif : versements (+), remboursements (−) et consommation '
  'par la vente (−). Lignes immuables (piste d''audit) — corriger par une écriture inverse.';

CREATE INDEX IF NOT EXISTS idx_progressive_ledger_plan ON public.progressive_ledger(plan_id);
CREATE INDEX IF NOT EXISTS idx_progressive_ledger_company ON public.progressive_ledger(company_id);

-- updated_at auto (fonction existante).
DROP TRIGGER IF EXISTS progressive_plans_set_updated_at ON public.progressive_plans;
CREATE TRIGGER progressive_plans_set_updated_at
  BEFORE UPDATE ON public.progressive_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS : lecture pour les membres de l'entreprise ; écritures via RPC uniquement
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.progressive_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progressive_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "progressive_plans_select" ON public.progressive_plans;
CREATE POLICY "progressive_plans_select" ON public.progressive_plans FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "progressive_ledger_select" ON public.progressive_ledger;
CREATE POLICY "progressive_ledger_select" ON public.progressive_ledger FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Helpers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_progressive(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_company_owner(p_company_id)
     OR ('progressive.manage' = ANY(public.get_my_permission_keys(p_company_id)));
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_progressive(uuid) TO authenticated;

/** Solde disponible d'un dossier (versements − remboursements − consommations). */
CREATE OR REPLACE FUNCTION public.progressive_plan_balance(p_plan_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN l.kind = 'deposit' THEN l.amount ELSE -l.amount END
  ), 0)
  FROM public.progressive_ledger l
  WHERE l.plan_id = p_plan_id;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_plan_balance(uuid) TO authenticated;

/** Contrôles communs : dossier existant + droit + boutique autorisée + module actif. */
CREATE OR REPLACE FUNCTION public.progressive_assert_plan_access(p_plan_id uuid)
RETURNS public.progressive_plans
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.progressive_plans;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT * INTO v_plan FROM public.progressive_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Dossier introuvable'; END IF;
  IF NOT public.can_manage_progressive(v_plan.company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour gérer les achats progressifs.';
  END IF;
  IF NOT public.has_store_access(v_plan.store_id, v_plan.company_id) THEN
    RAISE EXCEPTION 'Accès à cette boutique refusé.';
  END IF;

  RETURN v_plan;
END;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_assert_plan_access(uuid) TO authenticated;

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
-- 8. RPC : enregistrer un versement (avance) → numéro de ticket + nouveau solde
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_deposit_add(
  p_plan_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS TABLE (ledger_id uuid, receipt_number text, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.progressive_plans;
  v_id uuid;
  v_receipt text;
BEGIN
  v_plan := public.progressive_assert_plan_access(p_plan_id);
  IF v_plan.status <> 'open' THEN
    RAISE EXCEPTION 'Dossier clôturé : aucun versement possible.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant du versement invalide.';
  END IF;

  v_receipt := 'AV-' || nextval('public.progressive_receipt_number_seq');

  INSERT INTO public.progressive_ledger (
    company_id, plan_id, kind, amount, method, reference, note, receipt_number, created_by
  ) VALUES (
    v_plan.company_id, p_plan_id, 'deposit', p_amount,
    COALESCE(p_method, 'cash'::public.payment_method),
    NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''), v_receipt, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN QUERY
  SELECT v_id, v_receipt, public.progressive_plan_balance(p_plan_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_deposit_add(
  uuid, numeric, public.payment_method, text, text
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPC : remboursement (rendre de l'argent au client) → ticket + nouveau solde
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_refund_add(
  p_plan_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS TABLE (ledger_id uuid, receipt_number text, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.progressive_plans;
  v_balance numeric;
  v_id uuid;
  v_receipt text;
BEGIN
  v_plan := public.progressive_assert_plan_access(p_plan_id);
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant du remboursement invalide.';
  END IF;

  v_balance := public.progressive_plan_balance(p_plan_id);
  IF p_amount > v_balance + 0.5 THEN
    RAISE EXCEPTION 'Remboursement supérieur au solde disponible (% FCFA).', round(v_balance);
  END IF;

  v_receipt := 'AR-' || nextval('public.progressive_receipt_number_seq');

  INSERT INTO public.progressive_ledger (
    company_id, plan_id, kind, amount, method, reference, note, receipt_number, created_by
  ) VALUES (
    v_plan.company_id, p_plan_id, 'refund', p_amount,
    COALESCE(p_method, 'cash'::public.payment_method),
    NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''), v_receipt, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN QUERY
  SELECT v_id, v_receipt, public.progressive_plan_balance(p_plan_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_refund_add(
  uuid, numeric, public.payment_method, text, text
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RPC : annulation d'un dossier (solde à zéro exigé)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_plan_cancel(p_plan_id uuid)
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
  IF v_plan.status <> 'open' THEN
    RAISE EXCEPTION 'Seul un dossier en cours peut être annulé.';
  END IF;

  v_balance := public.progressive_plan_balance(p_plan_id);
  IF v_balance > 0.5 THEN
    RAISE EXCEPTION 'Remboursez d''abord le solde du client (% FCFA) avant d''annuler.', round(v_balance);
  END IF;

  UPDATE public.progressive_plans
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_plan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_plan_cancel(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RPC : suppression d'un dossier vide (aucun mouvement) — propriétaire
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_plan_delete(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.progressive_plans;
BEGIN
  v_plan := public.progressive_assert_plan_access(p_plan_id);
  IF NOT public.user_is_company_owner(v_plan.company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut supprimer un dossier.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.progressive_ledger WHERE plan_id = p_plan_id) THEN
    RAISE EXCEPTION 'Dossier avec mouvements : annulez-le au lieu de le supprimer.';
  END IF;

  DELETE FROM public.progressive_plans WHERE id = p_plan_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_plan_delete(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
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
-- 13. RPC : liste des dossiers (avec agrégats) pour la page Achats Progressifs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_plans_list(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  plan_number text,
  store_id uuid,
  customer_id uuid,
  client_name text,
  client_phone text,
  client_id_type text,
  client_id_number text,
  client_address text,
  target_product_id uuid,
  target_product_name text,
  target_product_price numeric,
  target_amount numeric,
  status text,
  converted_sale_id uuid,
  converted_sale_number text,
  converted_at timestamptz,
  notes text,
  created_at timestamptz,
  deposit_count bigint,
  total_deposited numeric,
  total_refunded numeric,
  total_settled numeric,
  balance numeric,
  first_deposit_at timestamptz,
  last_deposit_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pl.id, pl.plan_number, pl.store_id, pl.customer_id,
    pl.client_name, pl.client_phone, pl.client_id_type, pl.client_id_number, pl.client_address,
    pl.target_product_id, pr.name AS target_product_name, pr.sale_price AS target_product_price,
    pl.target_amount, pl.status, pl.converted_sale_id, s.sale_number AS converted_sale_number,
    pl.converted_at, pl.notes, pl.created_at,
    COALESCE(agg.deposit_count, 0) AS deposit_count,
    COALESCE(agg.total_deposited, 0) AS total_deposited,
    COALESCE(agg.total_refunded, 0) AS total_refunded,
    COALESCE(agg.total_settled, 0) AS total_settled,
    COALESCE(agg.total_deposited, 0)
      - COALESCE(agg.total_refunded, 0)
      - COALESCE(agg.total_settled, 0) AS balance,
    agg.first_deposit_at,
    agg.last_deposit_at
  FROM public.progressive_plans pl
  LEFT JOIN public.products pr ON pr.id = pl.target_product_id
  LEFT JOIN public.sales s ON s.id = pl.converted_sale_id
  LEFT JOIN (
    SELECT
      l.plan_id,
      COUNT(*) FILTER (WHERE l.kind = 'deposit') AS deposit_count,
      COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'deposit'), 0) AS total_deposited,
      COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'refund'), 0) AS total_refunded,
      COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'settlement'), 0) AS total_settled,
      MIN(l.created_at) FILTER (WHERE l.kind = 'deposit') AS first_deposit_at,
      MAX(l.created_at) FILTER (WHERE l.kind = 'deposit') AS last_deposit_at
    FROM public.progressive_ledger l
    GROUP BY l.plan_id
  ) agg ON agg.plan_id = pl.id
  WHERE pl.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_progressive(p_company_id)
    AND (p_store_id IS NULL OR pl.store_id = p_store_id)
  ORDER BY
    CASE pl.status WHEN 'open' THEN 0 WHEN 'converted' THEN 1 ELSE 2 END,
    pl.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_plans_list(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. RPC : mouvements d'un dossier (relevé + réimpression des tickets)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.progressive_ledger_list(p_plan_id uuid)
RETURNS TABLE (
  id uuid,
  kind text,
  amount numeric,
  method public.payment_method,
  reference text,
  note text,
  receipt_number text,
  sale_id uuid,
  created_at timestamptz,
  created_by_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id, l.kind, l.amount, l.method, l.reference, l.note, l.receipt_number,
    l.sale_id, l.created_at,
    COALESCE(NULLIF(btrim(prof.full_name), ''), u.email::text) AS created_by_name
  FROM public.progressive_ledger l
  JOIN public.progressive_plans pl ON pl.id = l.plan_id
  LEFT JOIN public.profiles prof ON prof.id = l.created_by
  LEFT JOIN auth.users u ON u.id = l.created_by
  WHERE l.plan_id = p_plan_id
    AND pl.company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_progressive(pl.company_id)
  ORDER BY l.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.progressive_ledger_list(uuid) TO authenticated;

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
