-- Magasin (dépôt central) par entreprise : stock, mouvements, entrées manuelles, sorties liées aux ventes validées.
-- Accès données + RPC réservés au rôle owner actif sur l'entreprise.

CREATE OR REPLACE FUNCTION public.user_is_company_owner(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid()
      AND ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  );
$$;

COMMENT ON FUNCTION public.user_is_company_owner(uuid) IS 'True si l''utilisateur courant est propriétaire (owner) actif de l''entreprise.';

GRANT EXECUTE ON FUNCTION public.user_is_company_owner(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.warehouse_inventory (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  avg_unit_cost numeric(18,4),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, product_id)
);

CREATE INDEX idx_warehouse_inventory_company ON public.warehouse_inventory (company_id);

CREATE TABLE public.warehouse_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_kind text NOT NULL CHECK (movement_kind IN ('entry', 'exit')),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,4),
  packaging_type text NOT NULL DEFAULT 'unite',
  packs_quantity numeric(12,4) NOT NULL DEFAULT 1 CHECK (packs_quantity > 0),
  reference_type text NOT NULL DEFAULT 'manual',
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_warehouse_movements_company_created ON public.warehouse_movements (company_id, created_at DESC);
CREATE INDEX idx_warehouse_movements_company_product ON public.warehouse_movements (company_id, product_id);

COMMENT ON TABLE public.warehouse_inventory IS 'Stock central (magasin) par entreprise — unités catalogue (pièces).';
COMMENT ON TABLE public.warehouse_movements IS 'Historique entrées/sorties dépôt ; sortie vente liée à une vente status completed.';

-- ---------------------------------------------------------------------------
-- RLS : lecture owner uniquement ; pas d''INSERT/UPDATE direct sur inventory (RPC seulement).
-- ---------------------------------------------------------------------------

ALTER TABLE public.warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouse_inventory_select_owner ON public.warehouse_inventory
  FOR SELECT TO authenticated
  USING (public.user_is_company_owner(company_id));

CREATE POLICY warehouse_movements_select_owner ON public.warehouse_movements
  FOR SELECT TO authenticated
  USING (public.user_is_company_owner(company_id));

GRANT SELECT ON public.warehouse_inventory TO authenticated;
GRANT SELECT ON public.warehouse_movements TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC : entrée manuelle (réception au dépôt, conditionnement tracé).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.warehouse_register_manual_entry(
  p_company_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_packaging_type text,
  p_packs_quantity numeric DEFAULT 1,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_q integer;
  v_old_cost numeric;
  v_pc numeric;
  v_new_avg numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une entrée magasin.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantité invalide';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Prix d''achat unitaire invalide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Produit introuvable pour cette entreprise';
  END IF;

  SELECT COALESCE(wi.quantity, 0), wi.avg_unit_cost
  INTO v_old_q, v_old_cost
  FROM public.warehouse_inventory wi
  WHERE wi.company_id = p_company_id AND wi.product_id = p_product_id;

  IF v_old_q IS NULL THEN
    v_old_q := 0;
  END IF;

  v_pc := p_unit_cost;
  IF v_old_q = 0 THEN
    v_new_avg := v_pc;
  ELSE
    v_new_avg := (v_old_q * COALESCE(v_old_cost, v_pc) + p_quantity * v_pc)::numeric / (v_old_q + p_quantity);
  END IF;

  INSERT INTO public.warehouse_movements (
    company_id, product_id, movement_kind, quantity, unit_cost,
    packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    p_company_id, p_product_id, 'entry', p_quantity, p_unit_cost,
    COALESCE(NULLIF(trim(p_packaging_type), ''), 'unite'),
    COALESCE(p_packs_quantity, 1),
    'manual', NULL, p_notes, v_uid
  );

  INSERT INTO public.warehouse_inventory (company_id, product_id, quantity, avg_unit_cost, updated_at)
  VALUES (p_company_id, p_product_id, p_quantity, v_new_avg, now())
  ON CONFLICT (company_id, product_id) DO UPDATE
  SET quantity = public.warehouse_inventory.quantity + p_quantity,
      avg_unit_cost = v_new_avg,
      updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.warehouse_register_manual_entry IS 'Entrée stock magasin (owner) : quantité en unités, conditionnement informatif, CMP mis à jour.';

GRANT EXECUTE ON FUNCTION public.warehouse_register_manual_entry(uuid, uuid, integer, numeric, text, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC : sortie liée à une vente déjà validée (facture / vente complétée).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.warehouse_register_exit_for_sale(
  p_company_id uuid,
  p_sale_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sale record;
  v_item record;
  v_wh_q integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.user_is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut enregistrer une sortie magasin.';
  END IF;

  SELECT id, company_id, status INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente introuvable';
  END IF;
  IF v_sale.company_id <> p_company_id THEN
    RAISE EXCEPTION 'La vente n''appartient pas à cette entreprise';
  END IF;
  IF v_sale.status IS DISTINCT FROM 'completed'::public.sale_status THEN
    RAISE EXCEPTION 'La vente doit être validée (statut complété) pour autoriser une sortie magasin';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouse_movements wm
    WHERE wm.company_id = p_company_id
      AND wm.reference_type = 'sale'
      AND wm.reference_id = p_sale_id
      AND wm.movement_kind = 'exit'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Une sortie magasin existe déjà pour cette vente';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    SELECT COALESCE(wi.quantity, 0) INTO v_wh_q
    FROM public.warehouse_inventory wi
    WHERE wi.company_id = p_company_id AND wi.product_id = v_item.product_id;

    IF v_wh_q IS NULL OR v_wh_q < v_item.quantity THEN
      RAISE EXCEPTION 'Stock magasin insuffisant pour le produit % (demandé: %, disponible: %)',
        v_item.product_id, v_item.quantity, COALESCE(v_wh_q, 0);
    END IF;

    INSERT INTO public.warehouse_movements (
      company_id, product_id, movement_kind, quantity, unit_cost,
      packaging_type, packs_quantity, reference_type, reference_id, notes, created_by
    ) VALUES (
      p_company_id, v_item.product_id, 'exit', v_item.quantity, NULL,
      'unite', 1, 'sale', p_sale_id, NULL, v_uid
    );

    UPDATE public.warehouse_inventory wi
    SET quantity = wi.quantity - v_item.quantity,
        updated_at = now()
    WHERE wi.company_id = p_company_id AND wi.product_id = v_item.product_id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.warehouse_register_exit_for_sale IS 'Sortie magasin (owner) pour une vente completed ; une seule fois par vente.';

GRANT EXECUTE ON FUNCTION public.warehouse_register_exit_for_sale(uuid, uuid) TO authenticated;
