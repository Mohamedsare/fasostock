-- FasoStock — Module « Ordres de réparation » (activité `garage-mecanique`).
--
-- Métier : dans un garage, la vente n'est pas l'acte central — la RÉPARATION l'est.
-- Un véhicule entre avec une panne décrite par le client, un mécanicien pose un
-- diagnostic, on monte des pièces et on facture du temps de main-d'œuvre, puis le
-- véhicule ressort (souvent payé plus tard). Aujourd'hui l'application ne sait
-- enregistrer que la facture finale : tout ce qui se passe entre l'entrée et la
-- sortie du véhicule vit sur un cahier.
--
-- Ce module ajoute donc :
--   * `repair_orders`      : l'ordre de réparation (véhicule, client, panne,
--                            diagnostic, statut, mécanicien, dates) ;
--   * `repair_order_lines` : ses lignes — PIÈCES (issues du catalogue, donc du
--                            stock) et MAIN-D'ŒUVRE (libellé libre ou prestation
--                            du catalogue).
--
-- Facturation : l'OR ne crée pas un circuit d'argent parallèle. Quand le véhicule
-- est livré, `bill_repair_order` crée une VRAIE vente (`sales`) — donc le chiffre
-- d'affaires, la marge, le crédit client, les rapports et le tableau de bord
-- restent une seule et même vérité. Le stock n'est décrémenté que pour les pièces :
-- une heure de main-d'œuvre n'a pas de stock.
--
-- 100 % additif : aucune table existante n'est modifiée. Le module n'est visible
-- que pour les entreprises dont l'activité est `garage-mecanique` (contrôle côté
-- application) ; pour toutes les autres, rien ne change.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Permission dédiée
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'repairs.manage')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Numérotation des ordres de réparation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.repair_order_number_seq;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tables
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Un passage de véhicule à l'atelier, de l'accueil à la livraison.
 *
 * Le véhicule est volontairement DÉNORMALISÉ (plaque, marque, modèle sur l'OR
 * lui-même) : un garage reçoit beaucoup de véhicules de passage, et imposer la
 * création d'une fiche véhicule avant de pouvoir noter une panne ferait
 * abandonner l'outil dès le premier client pressé. Le client, lui, peut être
 * rattaché au fichier clients (`customer_id`) pour suivre son historique.
 */
CREATE TABLE IF NOT EXISTS public.repair_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  order_number text NOT NULL,

  -- Client : fiche du carnet, ou simple nom/téléphone pour un client de passage.
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,

  -- Véhicule
  vehicle_plate text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year text,
  vehicle_mileage integer CHECK (vehicle_mileage IS NULL OR vehicle_mileage >= 0),

  -- Atelier
  reported_issue text,
  diagnosis text,
  status text NOT NULL DEFAULT 'reception'
    CHECK (status IN ('reception', 'diagnostic', 'in_progress', 'ready', 'delivered', 'cancelled')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  received_at timestamptz NOT NULL DEFAULT now(),
  /** Date promise au client — c'est elle qui fait revenir ou fuir un client. */
  promised_at timestamptz,
  delivered_at timestamptz,

  /** Vente générée à la facturation. NULL tant que l'OR n'est pas facturé. */
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,

  notes text,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.repair_orders IS
  'Ordre de réparation (module Garage) : un passage de véhicule à l''atelier. '
  'Facturé via bill_repair_order, qui crée une vente normale.';
COMMENT ON COLUMN public.repair_orders.status IS
  'reception → diagnostic → in_progress → ready → delivered. cancelled = abandonné.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_orders_number
  ON public.repair_orders(company_id, order_number);
CREATE INDEX IF NOT EXISTS idx_repair_orders_company ON public.repair_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_repair_orders_store ON public.repair_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_repair_orders_status
  ON public.repair_orders(company_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_orders_customer ON public.repair_orders(customer_id);
-- Retrouver l'historique d'un véhicule par sa plaque (recherche la plus fréquente).
CREATE INDEX IF NOT EXISTS idx_repair_orders_plate
  ON public.repair_orders(company_id, vehicle_plate);

/**
 * Une ligne d'ordre de réparation.
 *
 * `kind = 'part'`  : pièce du catalogue → `product_id` obligatoire, sort du stock
 *                    à la facturation.
 * `kind = 'labor'` : main-d'œuvre. `product_id` facultatif : le garage peut
 *                    facturer une prestation de son catalogue (« Vidange »,
 *                    « Diagnostic ») pour la retrouver dans ses rapports, ou
 *                    saisir un libellé libre. Aucun mouvement de stock.
 */
CREATE TABLE IF NOT EXISTS public.repair_order_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  repair_order_id uuid NOT NULL REFERENCES public.repair_orders(id) ON DELETE CASCADE,

  kind text NOT NULL CHECK (kind IN ('part', 'labor')),
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  label text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(18, 4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  position integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Une pièce vient forcément du catalogue : sans produit, pas de stock à sortir.
  CONSTRAINT repair_order_lines_part_needs_product
    CHECK (kind <> 'part' OR product_id IS NOT NULL)
);

COMMENT ON TABLE public.repair_order_lines IS
  'Lignes d''un ordre de réparation : pièces (catalogue, déstockées à la '
  'facturation) et main-d''œuvre (libellé libre ou prestation du catalogue).';

CREATE INDEX IF NOT EXISTS idx_repair_order_lines_order
  ON public.repair_order_lines(repair_order_id, position);
CREATE INDEX IF NOT EXISTS idx_repair_order_lines_company
  ON public.repair_order_lines(company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Numéro d'OR attribué automatiquement
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.repair_orders_set_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR TRIM(NEW.order_number) = '' THEN
    NEW.order_number := 'OR-' || nextval('public.repair_order_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repair_orders_set_number ON public.repair_orders;
CREATE TRIGGER repair_orders_set_number
  BEFORE INSERT ON public.repair_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.repair_orders_set_number();

CREATE OR REPLACE FUNCTION public.repair_orders_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS repair_orders_touch_updated_at ON public.repair_orders;
CREATE TRIGGER repair_orders_touch_updated_at
  BEFORE UPDATE ON public.repair_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.repair_orders_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.repair_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_orders_select" ON public.repair_orders;
CREATE POLICY "repair_orders_select" ON public.repair_orders FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "repair_orders_insert" ON public.repair_orders;
CREATE POLICY "repair_orders_insert" ON public.repair_orders FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR public.user_has_company_permission(company_id, 'repairs.manage')
  )
);

DROP POLICY IF EXISTS "repair_orders_update" ON public.repair_orders;
CREATE POLICY "repair_orders_update" ON public.repair_orders FOR UPDATE USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR public.user_has_company_permission(company_id, 'repairs.manage')
  )
) WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- Suppression réservée au propriétaire : un OR facturé porte la trace d'un
-- véhicule sorti de l'atelier, ce n'est pas un brouillon qu'on efface.
DROP POLICY IF EXISTS "repair_orders_delete" ON public.repair_orders;
CREATE POLICY "repair_orders_delete" ON public.repair_orders FOR DELETE USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (public.is_super_admin() OR public.user_is_company_owner(company_id))
  AND sale_id IS NULL
);

DROP POLICY IF EXISTS "repair_order_lines_select" ON public.repair_order_lines;
CREATE POLICY "repair_order_lines_select" ON public.repair_order_lines FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "repair_order_lines_write" ON public.repair_order_lines;
CREATE POLICY "repair_order_lines_write" ON public.repair_order_lines FOR ALL USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR public.user_has_company_permission(company_id, 'repairs.manage')
  )
) WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR public.user_has_company_permission(company_id, 'repairs.manage')
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Facturation : l'OR devient une vente normale
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Produit « service » de l'entreprise, créé une seule fois, sur lequel sont
 * imputées les lignes de main-d'œuvre saisies en texte libre. Il n'est jamais
 * déstocké (voir `bill_repair_order`) et reste modifiable comme tout produit.
 */
CREATE OR REPLACE FUNCTION public.repair_labor_product_id(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.products
  WHERE company_id = p_company_id
    AND name = 'Main-d''œuvre atelier'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.products (company_id, name, unit, purchase_price, sale_price, stock_min, is_active)
  VALUES (p_company_id, 'Main-d''œuvre atelier', 'h', 0, 0, 0, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.repair_labor_product_id IS
  'Produit support des lignes de main-d''œuvre libres d''un ordre de réparation. '
  'Créé à la première facturation, jamais déstocké.';

/**
 * Facture un ordre de réparation : crée une vente réelle (donc chiffre d'affaires,
 * marge, crédit et rapports cohérents), décrémente le stock des PIÈCES uniquement,
 * puis marque l'OR livré.
 *
 * Volontairement calqué sur `create_sale_with_stock` : mêmes contrôles d'accès,
 * même garde de stock, mêmes écritures (`sale_items`, `stock_movements`,
 * `sale_payments`). Seule différence : les lignes de main-d'œuvre ne touchent pas
 * au stock.
 */
CREATE OR REPLACE FUNCTION public.bill_repair_order(
  p_repair_order_id uuid,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_discount numeric DEFAULT 0,
  p_document_type public.document_type DEFAULT 'a4_invoice'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.repair_orders%ROWTYPE;
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal numeric := 0;
  v_total numeric;
  v_line public.repair_order_lines%ROWTYPE;
  v_labor_product_id uuid;
  v_product_id uuid;
  v_row_count int;
  v_product_name text;
BEGIN
  SELECT * INTO v_order FROM public.repair_orders WHERE id = p_repair_order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Ordre de réparation introuvable';
  END IF;

  IF NOT (v_order.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise non autorisée';
  END IF;
  IF NOT (
    public.is_super_admin()
    OR public.user_is_company_owner(v_order.company_id)
    OR public.user_has_company_permission(v_order.company_id, 'repairs.manage')
  ) THEN
    RAISE EXCEPTION 'Accès refusé : droit « Gérer les réparations » requis';
  END IF;
  IF NOT public.has_store_access(v_order.store_id, v_order.company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée';
  END IF;

  IF v_order.sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cet ordre de réparation est déjà facturé';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Un ordre de réparation annulé ne peut pas être facturé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.repair_order_lines WHERE repair_order_id = p_repair_order_id) THEN
    RAISE EXCEPTION 'Aucune ligne à facturer : ajoutez les pièces et la main-d''œuvre';
  END IF;

  -- 1. Stock : uniquement les pièces, et avant toute écriture d'argent.
  FOR v_line IN
    SELECT * FROM public.repair_order_lines
    WHERE repair_order_id = p_repair_order_id AND kind = 'part'
  LOOP
    -- Même règle qu'en caisse : un article réservé au dépôt ne se vend pas ici.
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_line.product_id
        AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only')
    ) THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_line.product_id;
      RAISE EXCEPTION 'Article réservé au dépôt magasin, pas à la vente : %',
        COALESCE(v_product_name, v_line.label);
    END IF;

    UPDATE public.store_inventory
    SET quantity = quantity - v_line.quantity,
        updated_at = now()
    WHERE store_id = v_order.store_id
      AND product_id = v_line.product_id
      AND quantity >= v_line.quantity;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_line.product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%"', COALESCE(v_product_name, v_line.label);
    END IF;
  END LOOP;

  -- 2. Total.
  SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_subtotal
  FROM public.repair_order_lines
  WHERE repair_order_id = p_repair_order_id;
  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  v_sale_number := 'S-' || nextval('public.sale_number_seq');

  INSERT INTO public.sales (
    company_id, store_id, customer_id, sale_number, status,
    subtotal, discount, tax, total, created_by, sale_mode, document_type
  )
  VALUES (
    v_order.company_id, v_order.store_id, v_order.customer_id, v_sale_number, 'completed',
    v_subtotal, COALESCE(p_discount, 0), 0, v_total, auth.uid(),
    'invoice_pos'::public.sale_mode, COALESCE(p_document_type, 'a4_invoice'::public.document_type)
  )
  RETURNING id INTO v_sale_id;

  -- 3. Lignes de vente (+ mouvements de stock pour les seules pièces).
  FOR v_line IN
    SELECT * FROM public.repair_order_lines
    WHERE repair_order_id = p_repair_order_id
    ORDER BY position, created_at
  LOOP
    IF v_line.product_id IS NOT NULL THEN
      v_product_id := v_line.product_id;
    ELSE
      IF v_labor_product_id IS NULL THEN
        v_labor_product_id := public.repair_labor_product_id(v_order.company_id);
      END IF;
      v_product_id := v_labor_product_id;
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
    VALUES (v_sale_id, v_product_id, v_line.quantity, v_line.unit_price, 0,
            v_line.quantity * v_line.unit_price);

    IF v_line.kind = 'part' THEN
      INSERT INTO public.stock_movements (
        store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes
      )
      VALUES (
        v_order.store_id, v_line.product_id, 'sale_out', -v_line.quantity, 'sale', v_sale_id,
        auth.uid(), 'Réparation ' || v_order.order_number
      );
    END IF;
  END LOOP;

  -- 4. Règlements (aucun = facture entièrement à crédit, comme une vente normale).
  INSERT INTO public.sale_payments (sale_id, method, amount, reference)
  SELECT v_sale_id,
         (elem->>'method')::payment_method,
         (elem->>'amount')::numeric,
         elem->>'reference'
  FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb)) AS elem
  WHERE (elem->>'amount')::numeric > 0;

  -- 5. L'OR est livré et porte sa facture.
  UPDATE public.repair_orders
  SET sale_id = v_sale_id,
      status = 'delivered',
      delivered_at = COALESCE(delivered_at, now())
  WHERE id = p_repair_order_id;

  RETURN v_sale_id;
END;
$$;

COMMENT ON FUNCTION public.bill_repair_order IS
  'Facture un ordre de réparation : crée une vente normale (CA, marge, crédit, '
  'rapports), déstocke les pièces uniquement, marque l''OR livré.';

REVOKE ALL ON FUNCTION public.bill_repair_order(uuid, jsonb, numeric, public.document_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bill_repair_order(uuid, jsonb, numeric, public.document_type) TO authenticated;
REVOKE ALL ON FUNCTION public.repair_labor_product_id(uuid) FROM PUBLIC;
