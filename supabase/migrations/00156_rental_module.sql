-- FasoStock — Module « Location » (gestion locative immobilière).
--
-- Métier : le gérant possède des maisons / villas / appartements / boutiques qu'il met
-- en location et veut suivre ça EN PARALLÈLE de son commerce, dans la même application :
--   * ses BIENS (`rental_properties`) et leurs LOTS louables (`rental_units`) ;
--   * ses LOCATAIRES (`rental_tenants`) ;
--   * les CONTRATS DE BAIL (`rental_leases`) : loyer mensuel, caution, période ;
--   * les ÉCHÉANCES mensuelles générées automatiquement (`rental_invoices`) ;
--   * les ENCAISSEMENTS (`rental_payments`) avec TICKET THERMIQUE 58 / 80 mm remis
--     au locataire, exactement comme un ticket de caisse ;
--   * les CHARGES du bailleur (`rental_charges`) : réparations, eau, taxes… pour
--     connaître le revenu net de chaque bien.
--
-- Module TOTALEMENT indépendant du stock / des ventes : aucune table existante n'est
-- modifiée en dehors de l'ajout du drapeau d'activation sur `stores`. Désactivé par
-- défaut : tant que le super admin ne l'active pas pour une boutique, rien ne change
-- dans l'application (page masquée, RPC refusées).
--
-- Modèle d'argent (volontairement simple et auditable) :
--   dû        = Σ échéances non annulées
--   encaissé  = Σ paiements de nature 'rent'
--   solde     = dû − encaissé      (> 0 : le locataire doit ; < 0 : il a payé d'avance)
-- Les allocations (`rental_payment_allocations`) ne servent qu'à dire QUELS MOIS sont
-- soldés : elles sont recalculées en FIFO à chaque mouvement, donc jamais incohérentes.
-- La caution ('deposit') n'entre pas dans le solde de loyer : elle est détenue et rendue.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Activation par boutique (super admin)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS rental_module_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.rental_module_enabled IS
  'Module Location (gestion locative immobilière) — activable par boutique par le '
  'super admin depuis Admin › Paramètres. Défaut désactivé.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Permission dédiée
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'rental.manage')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Séquences de numérotation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.rental_lease_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.rental_receipt_number_seq;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tables
-- ─────────────────────────────────────────────────────────────────────────────

/** Un bien immobilier : une maison, une villa, un immeuble, une boutique… */
CREATE TABLE IF NOT EXISTS public.rental_properties (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  name text NOT NULL,
  kind text NOT NULL DEFAULT 'house'
    CHECK (kind IN ('house', 'villa', 'apartment', 'building', 'studio', 'room',
                    'shop', 'office', 'warehouse', 'land', 'other')),
  address text,
  city text,
  district text,
  description text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_properties IS
  'Bien immobilier mis en location (module Location). Contient un ou plusieurs lots '
  'louables (`rental_units`).';

CREATE INDEX IF NOT EXISTS idx_rental_properties_company ON public.rental_properties(company_id);
CREATE INDEX IF NOT EXISTS idx_rental_properties_store ON public.rental_properties(store_id);

/** Un lot louable : la maison entière, un appartement, une chambre, un magasin… */
CREATE TABLE IF NOT EXISTS public.rental_units (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.rental_properties(id) ON DELETE CASCADE,

  label text NOT NULL,
  floor text,
  rooms integer CHECK (rooms IS NULL OR rooms >= 0),
  bathrooms integer CHECK (bathrooms IS NULL OR bathrooms >= 0),
  surface_m2 numeric(10,2) CHECK (surface_m2 IS NULL OR surface_m2 > 0),
  /** Loyer de référence (proposé à la création d'un bail ; le bail fait foi ensuite). */
  base_rent numeric(14,2) NOT NULL DEFAULT 0 CHECK (base_rent >= 0),
  /** Caution de référence (souvent 2 à 3 mois de loyer). */
  base_deposit numeric(14,2) NOT NULL DEFAULT 0 CHECK (base_deposit >= 0),
  description text,
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (property_id, label)
);

COMMENT ON TABLE public.rental_units IS
  'Lot louable d''un bien : appartement, chambre, magasin… Un bien « maison simple » '
  'n''a qu''un seul lot.';

CREATE INDEX IF NOT EXISTS idx_rental_units_property ON public.rental_units(property_id);
CREATE INDEX IF NOT EXISTS idx_rental_units_company ON public.rental_units(company_id);

/** Le locataire (fiche indépendante des clients du commerce). */
CREATE TABLE IF NOT EXISTS public.rental_tenants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  full_name text NOT NULL,
  phone text,
  phone2 text,
  email text,
  id_type text,
  id_number text,
  profession text,
  employer text,
  emergency_name text,
  emergency_phone text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_tenants_company ON public.rental_tenants(company_id);

/** Contrat de bail : qui loue quoi, à quel loyer, depuis quand. */
CREATE TABLE IF NOT EXISTS public.rental_leases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.rental_properties(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.rental_units(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.rental_tenants(id) ON DELETE RESTRICT,

  lease_number text NOT NULL UNIQUE,
  start_date date NOT NULL,
  /** Fin prévue (bail à durée déterminée). NULL = reconduction tacite. */
  end_date date,
  rent_amount numeric(14,2) NOT NULL CHECK (rent_amount > 0),
  /** Caution convenue (montant total, pas un nombre de mois). */
  deposit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  /** Périodicité de facturation. Les échéances sont ancrées sur `start_date`. */
  frequency text NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
  /** Jours de tolérance après le début de période avant de compter le retard. */
  grace_days integer NOT NULL DEFAULT 0 CHECK (grace_days BETWEEN 0 AND 28),

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'terminated')),
  ended_at date,
  end_reason text,
  notes text,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR end_date >= start_date)
);

COMMENT ON TABLE public.rental_leases IS
  'Bail : un locataire occupe un lot à un loyer donné. Les échéances mensuelles sont '
  'générées à partir de `start_date` (module Location).';

-- Un lot ne peut pas être loué deux fois en même temps.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_leases_active_unit
  ON public.rental_leases(unit_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_rental_leases_company ON public.rental_leases(company_id);
CREATE INDEX IF NOT EXISTS idx_rental_leases_store ON public.rental_leases(store_id);
CREATE INDEX IF NOT EXISTS idx_rental_leases_tenant ON public.rental_leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rental_leases_property ON public.rental_leases(property_id);

/** Échéance de loyer d'une période (générée automatiquement, jamais saisie à la main). */
CREATE TABLE IF NOT EXISTS public.rental_invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL REFERENCES public.rental_leases(id) ON DELETE CASCADE,

  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  amount_due numeric(14,2) NOT NULL CHECK (amount_due >= 0),
  label text,

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'paid', 'cancelled')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (lease_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_rental_invoices_lease ON public.rental_invoices(lease_id);
CREATE INDEX IF NOT EXISTS idx_rental_invoices_company ON public.rental_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_rental_invoices_due ON public.rental_invoices(due_date);

/** Encaissement : loyer, caution, charge refacturée… Chaque ligne a son ticket. */
CREATE TABLE IF NOT EXISTS public.rental_payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL REFERENCES public.rental_leases(id) ON DELETE CASCADE,

  kind text NOT NULL DEFAULT 'rent'
    CHECK (kind IN ('rent', 'deposit', 'deposit_refund', 'charge', 'other')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method public.payment_method,
  paid_at timestamptz NOT NULL DEFAULT now(),
  reference text,
  note text,
  /** Numéro imprimé sur le ticket remis au locataire. */
  receipt_number text UNIQUE,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rental_payments IS
  'Encaissement locatif. Lignes immuables (piste d''audit) : corriger par suppression '
  'tracée ou par une écriture inverse.';

CREATE INDEX IF NOT EXISTS idx_rental_payments_lease ON public.rental_payments(lease_id);
CREATE INDEX IF NOT EXISTS idx_rental_payments_company ON public.rental_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_rental_payments_paid_at ON public.rental_payments(paid_at);

/** Quel paiement solde quelle échéance (recalculé en FIFO — usage affichage). */
CREATE TABLE IF NOT EXISTS public.rental_payment_allocations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.rental_payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.rental_invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_rental_alloc_invoice ON public.rental_payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_rental_alloc_payment ON public.rental_payment_allocations(payment_id);

/** Charge du bailleur sur un bien (réparation, eau, électricité, taxe…). */
CREATE TABLE IF NOT EXISTS public.rental_charges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.rental_properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.rental_units(id) ON DELETE SET NULL,

  label text NOT NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('repair', 'water', 'electricity', 'tax', 'agency',
                        'cleaning', 'security', 'other')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  spent_on date NOT NULL DEFAULT CURRENT_DATE,
  method public.payment_method,
  note text,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_charges_property ON public.rental_charges(property_id);
CREATE INDEX IF NOT EXISTS idx_rental_charges_company ON public.rental_charges(company_id);
CREATE INDEX IF NOT EXISTS idx_rental_charges_date ON public.rental_charges(spent_on);

-- updated_at automatique (fonction existante).
DROP TRIGGER IF EXISTS rental_properties_set_updated_at ON public.rental_properties;
CREATE TRIGGER rental_properties_set_updated_at
  BEFORE UPDATE ON public.rental_properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS rental_units_set_updated_at ON public.rental_units;
CREATE TRIGGER rental_units_set_updated_at
  BEFORE UPDATE ON public.rental_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS rental_tenants_set_updated_at ON public.rental_tenants;
CREATE TRIGGER rental_tenants_set_updated_at
  BEFORE UPDATE ON public.rental_tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS rental_leases_set_updated_at ON public.rental_leases;
CREATE TRIGGER rental_leases_set_updated_at
  BEFORE UPDATE ON public.rental_leases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS rental_invoices_set_updated_at ON public.rental_invoices;
CREATE TRIGGER rental_invoices_set_updated_at
  BEFORE UPDATE ON public.rental_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS : lecture réservée aux membres de l'entreprise ; écritures par RPC
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.rental_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_properties_select" ON public.rental_properties;
CREATE POLICY "rental_properties_select" ON public.rental_properties FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "rental_units_select" ON public.rental_units;
CREATE POLICY "rental_units_select" ON public.rental_units FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "rental_tenants_select" ON public.rental_tenants;
CREATE POLICY "rental_tenants_select" ON public.rental_tenants FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "rental_leases_select" ON public.rental_leases;
CREATE POLICY "rental_leases_select" ON public.rental_leases FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "rental_invoices_select" ON public.rental_invoices;
CREATE POLICY "rental_invoices_select" ON public.rental_invoices FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "rental_payments_select" ON public.rental_payments;
CREATE POLICY "rental_payments_select" ON public.rental_payments FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "rental_alloc_select" ON public.rental_payment_allocations;
CREATE POLICY "rental_alloc_select" ON public.rental_payment_allocations FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "rental_charges_select" ON public.rental_charges;
CREATE POLICY "rental_charges_select" ON public.rental_charges FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Helpers d'accès
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_rental(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_company_owner(p_company_id)
     OR ('rental.manage' = ANY(public.get_my_permission_keys(p_company_id)));
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_rental(uuid) TO authenticated;

/** Contrôles communs d'écriture : entreprise autorisée + droit + boutique + module actif. */
CREATE OR REPLACE FUNCTION public.rental_assert_write(p_company_id uuid, p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.can_manage_rental(p_company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour gérer la location.';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès à cette boutique refusé.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.company_id = p_company_id AND s.rental_module_enabled = true
  ) THEN
    RAISE EXCEPTION 'Le module Location n''est pas activé pour cette boutique.';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_assert_write(uuid, uuid) TO authenticated;

/** Même contrôle à partir d'un bail. Retourne la ligne du bail. */
CREATE OR REPLACE FUNCTION public.rental_assert_lease(p_lease_id uuid)
RETURNS public.rental_leases
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease public.rental_leases;
BEGIN
  SELECT * INTO v_lease FROM public.rental_leases WHERE id = p_lease_id;
  IF v_lease.id IS NULL THEN RAISE EXCEPTION 'Bail introuvable'; END IF;
  PERFORM public.rental_assert_write(v_lease.company_id, v_lease.store_id);
  RETURN v_lease;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_assert_lease(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Calculs de solde
-- ─────────────────────────────────────────────────────────────────────────────

/** Solde de loyer d'un bail : > 0 le locataire doit, < 0 il a payé d'avance. */
CREATE OR REPLACE FUNCTION public.rental_lease_balance(p_lease_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT SUM(i.amount_due) FROM public.rental_invoices i
      WHERE i.lease_id = p_lease_id AND i.status <> 'cancelled'
    ), 0)
    - COALESCE((
      SELECT SUM(p.amount) FROM public.rental_payments p
      WHERE p.lease_id = p_lease_id AND p.kind = 'rent'
    ), 0);
$$;
GRANT EXECUTE ON FUNCTION public.rental_lease_balance(uuid) TO authenticated;

/**
 * Recalcule QUELS MOIS sont soldés : les paiements de loyer, du plus ancien au plus
 * récent, épongent les échéances de la plus ancienne à la plus récente (FIFO).
 * Idempotent — rejoué à chaque encaissement, suppression ou génération d'échéance.
 */
CREATE OR REPLACE FUNCTION public.rental_lease_reallocate(p_lease_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_inv_ids uuid[];
  v_inv_need numeric[];
  v_pay_ids uuid[];
  v_pay_left numeric[];
  v_take numeric;
  i integer;
  j integer := 1;
  n_inv integer;
  n_pay integer;
BEGIN
  SELECT company_id INTO v_company FROM public.rental_leases WHERE id = p_lease_id;
  IF v_company IS NULL THEN RETURN; END IF;
  -- Fonction SECURITY DEFINER exposée à `authenticated` : on revérifie l'accès même
  -- si tous les appelants internes l'ont déjà fait.
  IF NOT (v_company IN (SELECT * FROM public.current_user_company_ids()))
     OR NOT public.can_manage_rental(v_company) THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  DELETE FROM public.rental_payment_allocations a
   USING public.rental_payments p
   WHERE a.payment_id = p.id AND p.lease_id = p_lease_id;

  SELECT array_agg(t.id ORDER BY t.period_start, t.created_at),
         array_agg(t.amount_due ORDER BY t.period_start, t.created_at)
    INTO v_inv_ids, v_inv_need
    FROM public.rental_invoices t
   WHERE t.lease_id = p_lease_id AND t.status <> 'cancelled';

  SELECT array_agg(t.id ORDER BY t.paid_at, t.created_at),
         array_agg(t.amount ORDER BY t.paid_at, t.created_at)
    INTO v_pay_ids, v_pay_left
    FROM public.rental_payments t
   WHERE t.lease_id = p_lease_id AND t.kind = 'rent';

  n_inv := COALESCE(array_length(v_inv_ids, 1), 0);
  n_pay := COALESCE(array_length(v_pay_ids, 1), 0);

  IF n_inv > 0 AND n_pay > 0 THEN
    FOR i IN 1..n_inv LOOP
      WHILE v_inv_need[i] > 0.005 AND j <= n_pay LOOP
        IF v_pay_left[j] <= 0.005 THEN
          j := j + 1;
          CONTINUE;
        END IF;
        v_take := LEAST(v_inv_need[i], v_pay_left[j]);
        INSERT INTO public.rental_payment_allocations (company_id, payment_id, invoice_id, amount)
        VALUES (v_company, v_pay_ids[j], v_inv_ids[i], v_take)
        ON CONFLICT (payment_id, invoice_id)
        DO UPDATE SET amount = rental_payment_allocations.amount + EXCLUDED.amount;
        v_inv_need[i] := v_inv_need[i] - v_take;
        v_pay_left[j] := v_pay_left[j] - v_take;
      END LOOP;
    END LOOP;
  END IF;

  UPDATE public.rental_invoices inv
     SET status = CASE
           WHEN (
             SELECT COALESCE(SUM(a.amount), 0)
             FROM public.rental_payment_allocations a
             WHERE a.invoice_id = inv.id
           ) >= inv.amount_due - 0.005 THEN 'paid'
           ELSE 'open'
         END,
         updated_at = now()
   WHERE inv.lease_id = p_lease_id AND inv.status <> 'cancelled';
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_lease_reallocate(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Génération des échéances
--
-- Les périodes sont ancrées sur la date de début du bail : un bail du 15/03 produit
-- 15/03→14/04, 15/04→14/05… (pratique locale : « le loyer tombe le 15 »). On génère
-- toutes les périodes commencées jusqu'à `p_up_to` (par défaut aujourd'hui) : jamais
-- de facturation d'un mois futur non commencé.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_lease_generate(p_lease_id uuid, p_up_to date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease public.rental_leases;
  v_step interval;
  v_cursor date;
  v_limit date;
  v_end date;
  v_created integer := 0;
  v_guard integer := 0;
BEGIN
  SELECT * INTO v_lease FROM public.rental_leases WHERE id = p_lease_id;
  IF v_lease.id IS NULL THEN RETURN 0; END IF;
  -- Fonction SECURITY DEFINER exposée à `authenticated` : contrôle d'accès systématique.
  IF NOT (v_lease.company_id IN (SELECT * FROM public.current_user_company_ids()))
     OR NOT public.can_manage_rental(v_lease.company_id) THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  v_step := CASE v_lease.frequency
              WHEN 'quarterly' THEN interval '3 months'
              WHEN 'yearly' THEN interval '1 year'
              ELSE interval '1 month'
            END;

  v_limit := COALESCE(p_up_to, CURRENT_DATE);
  -- Un bail clos ne produit plus d'échéance après sa date de fin effective.
  v_end := COALESCE(v_lease.ended_at, v_lease.end_date);
  IF v_end IS NOT NULL AND v_end < v_limit THEN
    v_limit := v_end;
  END IF;

  v_cursor := v_lease.start_date;
  WHILE v_cursor <= v_limit AND v_guard < 600 LOOP
    v_guard := v_guard + 1;
    INSERT INTO public.rental_invoices (
      company_id, lease_id, period_start, period_end, due_date, amount_due, label
    ) VALUES (
      v_lease.company_id,
      v_lease.id,
      v_cursor,
      (v_cursor + v_step - interval '1 day')::date,
      (v_cursor + make_interval(days => v_lease.grace_days))::date,
      v_lease.rent_amount,
      -- FM : supprime le remplissage par espaces de `Month` (« Juillet 2026 »).
      to_char(v_cursor, 'FMTMMonth YYYY')
    )
    ON CONFLICT (lease_id, period_start) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1; END IF;
    v_cursor := (v_cursor + v_step)::date;
  END LOOP;

  IF v_created > 0 THEN
    PERFORM public.rental_lease_reallocate(p_lease_id);
  END IF;
  RETURN v_created;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_lease_generate(uuid, date) TO authenticated;

/** Génère les échéances dues de TOUS les baux actifs (bouton « Mettre à jour »). */
CREATE OR REPLACE FUNCTION public.rental_invoices_generate(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_up_to date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_total integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.can_manage_rental(p_company_id) THEN
    RAISE EXCEPTION 'Droit insuffisant pour gérer la location.';
  END IF;

  FOR r IN
    SELECT l.id
    FROM public.rental_leases l
    WHERE l.company_id = p_company_id
      AND l.status = 'active'
      AND (p_store_id IS NULL OR l.store_id = p_store_id)
  LOOP
    v_total := v_total + public.rental_lease_generate(r.id, p_up_to);
  END LOOP;

  RETURN v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_invoices_generate(uuid, uuid, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPC d'écriture — biens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_property_save(
  p_id uuid,
  p_company_id uuid,
  p_store_id uuid,
  p_name text,
  p_kind text,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  PERFORM public.rental_assert_write(p_company_id, p_store_id);
  IF v_name = '' THEN RAISE EXCEPTION 'Nom du bien requis'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.rental_properties (
      company_id, store_id, name, kind, address, city, district, description, notes,
      is_active, created_by
    ) VALUES (
      p_company_id, p_store_id, v_name, COALESCE(NULLIF(btrim(p_kind), ''), 'house'),
      NULLIF(btrim(p_address), ''), NULLIF(btrim(p_city), ''), NULLIF(btrim(p_district), ''),
      NULLIF(btrim(p_description), ''), NULLIF(btrim(p_notes), ''),
      COALESCE(p_is_active, true), auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rental_properties SET
      name = v_name,
      kind = COALESCE(NULLIF(btrim(p_kind), ''), kind),
      address = NULLIF(btrim(p_address), ''),
      city = NULLIF(btrim(p_city), ''),
      district = NULLIF(btrim(p_district), ''),
      description = NULLIF(btrim(p_description), ''),
      notes = NULLIF(btrim(p_notes), ''),
      is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Bien introuvable.'; END IF;
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_property_save(
  uuid, uuid, uuid, text, text, text, text, text, text, text, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.rental_property_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop public.rental_properties;
  v_active integer;
BEGIN
  SELECT * INTO v_prop FROM public.rental_properties WHERE id = p_id;
  IF v_prop.id IS NULL THEN RAISE EXCEPTION 'Bien introuvable'; END IF;
  PERFORM public.rental_assert_write(v_prop.company_id, v_prop.store_id);

  SELECT COUNT(*) INTO v_active
  FROM public.rental_leases l
  WHERE l.property_id = p_id AND l.status = 'active';
  IF v_active > 0 THEN
    RAISE EXCEPTION 'Ce bien a % bail(baux) en cours : clôturez-les avant de le supprimer.', v_active;
  END IF;

  IF EXISTS (SELECT 1 FROM public.rental_payments pay
             JOIN public.rental_leases l ON l.id = pay.lease_id
             WHERE l.property_id = p_id) THEN
    RAISE EXCEPTION 'Des encaissements existent sur ce bien : il ne peut plus être supprimé (archivez-le à la place).';
  END IF;

  DELETE FROM public.rental_properties WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_property_delete(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RPC d'écriture — lots
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_unit_save(
  p_id uuid,
  p_property_id uuid,
  p_label text,
  p_base_rent numeric,
  p_base_deposit numeric DEFAULT 0,
  p_floor text DEFAULT NULL,
  p_rooms integer DEFAULT NULL,
  p_bathrooms integer DEFAULT NULL,
  p_surface_m2 numeric DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop public.rental_properties;
  v_id uuid;
  v_label text := btrim(COALESCE(p_label, ''));
BEGIN
  SELECT * INTO v_prop FROM public.rental_properties WHERE id = p_property_id;
  IF v_prop.id IS NULL THEN RAISE EXCEPTION 'Bien introuvable'; END IF;
  PERFORM public.rental_assert_write(v_prop.company_id, v_prop.store_id);
  IF v_label = '' THEN RAISE EXCEPTION 'Libellé du lot requis (ex. « Appartement A1 »)'; END IF;
  IF p_base_rent IS NULL OR p_base_rent < 0 THEN RAISE EXCEPTION 'Loyer de référence invalide'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.rental_units (
      company_id, property_id, label, floor, rooms, bathrooms, surface_m2,
      base_rent, base_deposit, description, is_active
    ) VALUES (
      v_prop.company_id, p_property_id, v_label, NULLIF(btrim(p_floor), ''),
      p_rooms, p_bathrooms, p_surface_m2,
      p_base_rent, COALESCE(p_base_deposit, 0), NULLIF(btrim(p_description), ''),
      COALESCE(p_is_active, true)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rental_units SET
      label = v_label,
      floor = NULLIF(btrim(p_floor), ''),
      rooms = p_rooms,
      bathrooms = p_bathrooms,
      surface_m2 = p_surface_m2,
      base_rent = p_base_rent,
      base_deposit = COALESCE(p_base_deposit, 0),
      description = NULLIF(btrim(p_description), ''),
      is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_id AND property_id = p_property_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Lot introuvable.'; END IF;
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_unit_save(
  uuid, uuid, text, numeric, numeric, text, integer, integer, numeric, text, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.rental_unit_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit public.rental_units;
  v_prop public.rental_properties;
BEGIN
  SELECT * INTO v_unit FROM public.rental_units WHERE id = p_id;
  IF v_unit.id IS NULL THEN RAISE EXCEPTION 'Lot introuvable'; END IF;
  SELECT * INTO v_prop FROM public.rental_properties WHERE id = v_unit.property_id;
  PERFORM public.rental_assert_write(v_prop.company_id, v_prop.store_id);

  IF EXISTS (SELECT 1 FROM public.rental_leases l WHERE l.unit_id = p_id) THEN
    RAISE EXCEPTION 'Ce lot a un historique de bail : il ne peut plus être supprimé (désactivez-le à la place).';
  END IF;

  DELETE FROM public.rental_units WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_unit_delete(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RPC d'écriture — locataires
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_tenant_save(
  p_id uuid,
  p_company_id uuid,
  p_store_id uuid,
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_phone2 text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_id_type text DEFAULT NULL,
  p_id_number text DEFAULT NULL,
  p_profession text DEFAULT NULL,
  p_employer text DEFAULT NULL,
  p_emergency_name text DEFAULT NULL,
  p_emergency_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := btrim(COALESCE(p_full_name, ''));
BEGIN
  PERFORM public.rental_assert_write(p_company_id, p_store_id);
  IF v_name = '' THEN RAISE EXCEPTION 'Nom du locataire requis'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.rental_tenants (
      company_id, full_name, phone, phone2, email, id_type, id_number, profession,
      employer, emergency_name, emergency_phone, address, notes, is_active, created_by
    ) VALUES (
      p_company_id, v_name, NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_phone2), ''),
      NULLIF(btrim(p_email), ''), NULLIF(btrim(p_id_type), ''), NULLIF(btrim(p_id_number), ''),
      NULLIF(btrim(p_profession), ''), NULLIF(btrim(p_employer), ''),
      NULLIF(btrim(p_emergency_name), ''), NULLIF(btrim(p_emergency_phone), ''),
      NULLIF(btrim(p_address), ''), NULLIF(btrim(p_notes), ''),
      COALESCE(p_is_active, true), auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rental_tenants SET
      full_name = v_name,
      phone = NULLIF(btrim(p_phone), ''),
      phone2 = NULLIF(btrim(p_phone2), ''),
      email = NULLIF(btrim(p_email), ''),
      id_type = NULLIF(btrim(p_id_type), ''),
      id_number = NULLIF(btrim(p_id_number), ''),
      profession = NULLIF(btrim(p_profession), ''),
      employer = NULLIF(btrim(p_employer), ''),
      emergency_name = NULLIF(btrim(p_emergency_name), ''),
      emergency_phone = NULLIF(btrim(p_emergency_phone), ''),
      address = NULLIF(btrim(p_address), ''),
      notes = NULLIF(btrim(p_notes), ''),
      is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Locataire introuvable.'; END IF;
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_tenant_save(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.rental_tenant_delete(p_id uuid, p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.rental_tenants;
BEGIN
  SELECT * INTO v_tenant FROM public.rental_tenants WHERE id = p_id;
  IF v_tenant.id IS NULL THEN RAISE EXCEPTION 'Locataire introuvable'; END IF;
  PERFORM public.rental_assert_write(v_tenant.company_id, p_store_id);

  IF EXISTS (SELECT 1 FROM public.rental_leases l WHERE l.tenant_id = p_id) THEN
    RAISE EXCEPTION 'Ce locataire a un historique de bail : désactivez sa fiche au lieu de la supprimer.';
  END IF;

  DELETE FROM public.rental_tenants WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_tenant_delete(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. RPC d'écriture — baux
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_lease_save(
  p_id uuid,
  p_company_id uuid,
  p_store_id uuid,
  p_unit_id uuid,
  p_tenant_id uuid,
  p_start_date date,
  p_rent_amount numeric,
  p_deposit_amount numeric DEFAULT 0,
  p_end_date date DEFAULT NULL,
  p_frequency text DEFAULT 'monthly',
  p_grace_days integer DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_property uuid;
  v_unit public.rental_units;
BEGIN
  PERFORM public.rental_assert_write(p_company_id, p_store_id);

  SELECT * INTO v_unit FROM public.rental_units WHERE id = p_unit_id AND company_id = p_company_id;
  IF v_unit.id IS NULL THEN RAISE EXCEPTION 'Lot introuvable dans cette entreprise.'; END IF;
  v_property := v_unit.property_id;

  IF NOT EXISTS (SELECT 1 FROM public.rental_tenants t
                 WHERE t.id = p_tenant_id AND t.company_id = p_company_id) THEN
    RAISE EXCEPTION 'Locataire introuvable dans cette entreprise.';
  END IF;
  IF p_start_date IS NULL THEN RAISE EXCEPTION 'Date de début requise'; END IF;
  IF p_rent_amount IS NULL OR p_rent_amount <= 0 THEN RAISE EXCEPTION 'Loyer invalide'; END IF;
  IF p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'La fin du bail est antérieure à son début.';
  END IF;

  IF p_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.rental_leases l
               WHERE l.unit_id = p_unit_id AND l.status = 'active') THEN
      RAISE EXCEPTION 'Ce lot est déjà occupé : clôturez le bail en cours avant d''en créer un nouveau.';
    END IF;

    INSERT INTO public.rental_leases (
      company_id, store_id, property_id, unit_id, tenant_id, lease_number,
      start_date, end_date, rent_amount, deposit_amount, frequency, grace_days,
      notes, created_by
    ) VALUES (
      p_company_id, p_store_id, v_property, p_unit_id, p_tenant_id,
      'BAIL-' || nextval('public.rental_lease_number_seq'),
      p_start_date, p_end_date, p_rent_amount, COALESCE(p_deposit_amount, 0),
      COALESCE(NULLIF(btrim(p_frequency), ''), 'monthly'),
      LEAST(28, GREATEST(0, COALESCE(p_grace_days, 0))),
      NULLIF(btrim(p_notes), ''), auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rental_leases SET
      tenant_id = p_tenant_id,
      start_date = p_start_date,
      end_date = p_end_date,
      rent_amount = p_rent_amount,
      deposit_amount = COALESCE(p_deposit_amount, 0),
      frequency = COALESCE(NULLIF(btrim(p_frequency), ''), frequency),
      grace_days = LEAST(28, GREATEST(0, COALESCE(p_grace_days, 0))),
      notes = NULLIF(btrim(p_notes), '')
    WHERE id = p_id AND company_id = p_company_id AND unit_id = p_unit_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Bail introuvable (le lot d''un bail existant ne peut pas être changé).';
    END IF;

    -- Le loyer ou la périodicité a pu changer : on remet les échéances OUVERTES au
    -- nouveau montant (les mois déjà soldés gardent leur montant historique).
    UPDATE public.rental_invoices
       SET amount_due = p_rent_amount, updated_at = now()
     WHERE lease_id = v_id AND status = 'open';
  END IF;

  PERFORM public.rental_lease_generate(v_id, NULL);
  PERFORM public.rental_lease_reallocate(v_id);
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_lease_save(
  uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, date, text, integer, text
) TO authenticated;

/** Clôture d'un bail (départ du locataire). Le lot redevient disponible. */
CREATE OR REPLACE FUNCTION public.rental_lease_end(
  p_lease_id uuid,
  p_ended_at date DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_status text DEFAULT 'ended'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease public.rental_leases;
  v_end date := COALESCE(p_ended_at, CURRENT_DATE);
BEGIN
  v_lease := public.rental_assert_lease(p_lease_id);
  IF v_lease.status <> 'active' THEN RAISE EXCEPTION 'Ce bail est déjà clôturé.'; END IF;
  IF v_end < v_lease.start_date THEN
    RAISE EXCEPTION 'La date de sortie est antérieure au début du bail.';
  END IF;

  -- Échéances des périodes commencées après la sortie : annulées (jamais dues).
  UPDATE public.rental_invoices
     SET status = 'cancelled', updated_at = now()
   WHERE lease_id = p_lease_id AND period_start > v_end AND status <> 'paid';

  UPDATE public.rental_leases
     SET status = CASE WHEN p_status = 'terminated' THEN 'terminated' ELSE 'ended' END,
         ended_at = v_end,
         end_reason = NULLIF(btrim(p_reason), '')
   WHERE id = p_lease_id;

  PERFORM public.rental_lease_reallocate(p_lease_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_lease_end(uuid, date, text, text) TO authenticated;

/** Réactive un bail clôturé par erreur. */
CREATE OR REPLACE FUNCTION public.rental_lease_reopen(p_lease_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease public.rental_leases;
BEGIN
  v_lease := public.rental_assert_lease(p_lease_id);
  IF v_lease.status = 'active' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.rental_leases l
             WHERE l.unit_id = v_lease.unit_id AND l.status = 'active') THEN
    RAISE EXCEPTION 'Le lot est déjà occupé par un autre bail actif.';
  END IF;

  UPDATE public.rental_leases
     SET status = 'active', ended_at = NULL, end_reason = NULL
   WHERE id = p_lease_id;

  UPDATE public.rental_invoices SET status = 'open', updated_at = now()
   WHERE lease_id = p_lease_id AND status = 'cancelled';

  PERFORM public.rental_lease_generate(p_lease_id, NULL);
  PERFORM public.rental_lease_reallocate(p_lease_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_lease_reopen(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rental_lease_delete(p_lease_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease public.rental_leases;
BEGIN
  v_lease := public.rental_assert_lease(p_lease_id);
  IF NOT public.user_is_company_owner(v_lease.company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut supprimer un bail.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rental_payments p WHERE p.lease_id = p_lease_id) THEN
    RAISE EXCEPTION 'Des encaissements sont rattachés à ce bail : il ne peut pas être supprimé (clôturez-le).';
  END IF;

  DELETE FROM public.rental_leases WHERE id = p_lease_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_lease_delete(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. RPC d'écriture — encaissements (avec numéro de ticket)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_payment_add(
  p_lease_id uuid,
  p_amount numeric,
  p_method public.payment_method DEFAULT 'cash',
  p_kind text DEFAULT 'rent',
  p_paid_at timestamptz DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS TABLE (payment_id uuid, receipt_number text, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease public.rental_leases;
  v_kind text := COALESCE(NULLIF(btrim(p_kind), ''), 'rent');
  v_id uuid;
  v_receipt text;
BEGIN
  v_lease := public.rental_assert_lease(p_lease_id);
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Montant invalide.'; END IF;
  IF v_kind NOT IN ('rent', 'deposit', 'deposit_refund', 'charge', 'other') THEN
    RAISE EXCEPTION 'Nature de paiement inconnue.';
  END IF;

  v_receipt := 'LOC-' || nextval('public.rental_receipt_number_seq');

  INSERT INTO public.rental_payments (
    company_id, lease_id, kind, amount, method, paid_at, reference, note,
    receipt_number, created_by
  ) VALUES (
    v_lease.company_id, p_lease_id, v_kind, p_amount,
    COALESCE(p_method, 'cash'::public.payment_method),
    COALESCE(p_paid_at, now()),
    NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''), v_receipt, auth.uid()
  )
  RETURNING id INTO v_id;

  IF v_kind = 'rent' THEN
    -- Un règlement peut couvrir plusieurs mois d'un coup : on s'assure que les
    -- échéances dues existent avant de les solder.
    PERFORM public.rental_lease_generate(p_lease_id, NULL);
    PERFORM public.rental_lease_reallocate(p_lease_id);
  END IF;

  RETURN QUERY SELECT v_id, v_receipt, public.rental_lease_balance(p_lease_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_payment_add(
  uuid, numeric, public.payment_method, text, timestamptz, text, text
) TO authenticated;

/** Suppression d'un encaissement saisi par erreur (propriétaire uniquement). */
CREATE OR REPLACE FUNCTION public.rental_payment_delete(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.rental_payments;
  v_lease public.rental_leases;
BEGIN
  SELECT * INTO v_pay FROM public.rental_payments WHERE id = p_payment_id;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'Encaissement introuvable'; END IF;
  v_lease := public.rental_assert_lease(v_pay.lease_id);
  IF NOT public.user_is_company_owner(v_lease.company_id) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut supprimer un encaissement.';
  END IF;

  DELETE FROM public.rental_payments WHERE id = p_payment_id;
  PERFORM public.rental_lease_reallocate(v_pay.lease_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_payment_delete(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. RPC d'écriture — charges du bailleur
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_charge_save(
  p_id uuid,
  p_property_id uuid,
  p_label text,
  p_amount numeric,
  p_category text DEFAULT 'other',
  p_spent_on date DEFAULT NULL,
  p_unit_id uuid DEFAULT NULL,
  p_method public.payment_method DEFAULT 'cash',
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop public.rental_properties;
  v_id uuid;
  v_label text := btrim(COALESCE(p_label, ''));
BEGIN
  SELECT * INTO v_prop FROM public.rental_properties WHERE id = p_property_id;
  IF v_prop.id IS NULL THEN RAISE EXCEPTION 'Bien introuvable'; END IF;
  PERFORM public.rental_assert_write(v_prop.company_id, v_prop.store_id);
  IF v_label = '' THEN RAISE EXCEPTION 'Libellé de la charge requis'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.rental_charges (
      company_id, store_id, property_id, unit_id, label, category, amount,
      spent_on, method, note, created_by
    ) VALUES (
      v_prop.company_id, v_prop.store_id, p_property_id, p_unit_id, v_label,
      COALESCE(NULLIF(btrim(p_category), ''), 'other'), p_amount,
      COALESCE(p_spent_on, CURRENT_DATE), COALESCE(p_method, 'cash'::public.payment_method),
      NULLIF(btrim(p_note), ''), auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.rental_charges SET
      unit_id = p_unit_id,
      label = v_label,
      category = COALESCE(NULLIF(btrim(p_category), ''), category),
      amount = p_amount,
      spent_on = COALESCE(p_spent_on, spent_on),
      method = COALESCE(p_method, method),
      note = NULLIF(btrim(p_note), '')
    WHERE id = p_id AND property_id = p_property_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Charge introuvable.'; END IF;
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_charge_save(
  uuid, uuid, text, numeric, text, date, uuid, public.payment_method, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.rental_charge_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.rental_charges;
BEGIN
  SELECT * INTO v_charge FROM public.rental_charges WHERE id = p_id;
  IF v_charge.id IS NULL THEN RAISE EXCEPTION 'Charge introuvable'; END IF;
  PERFORM public.rental_assert_write(v_charge.company_id, v_charge.store_id);
  DELETE FROM public.rental_charges WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rental_charge_delete(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. RPC de lecture — baux avec agrégats (écran principal)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_leases_list(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  lease_number text,
  store_id uuid,
  property_id uuid,
  property_name text,
  property_kind text,
  property_address text,
  unit_id uuid,
  unit_label text,
  tenant_id uuid,
  tenant_name text,
  tenant_phone text,
  start_date date,
  end_date date,
  ended_at date,
  end_reason text,
  rent_amount numeric,
  deposit_amount numeric,
  frequency text,
  grace_days integer,
  status text,
  notes text,
  created_at timestamptz,
  total_due numeric,
  total_paid numeric,
  balance numeric,
  deposit_paid numeric,
  invoice_count bigint,
  unpaid_count bigint,
  late_count bigint,
  next_due_date date,
  paid_through date,
  last_payment_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id, l.lease_number, l.store_id,
    l.property_id, pr.name, pr.kind, pr.address,
    l.unit_id, u.label,
    l.tenant_id, t.full_name, t.phone,
    l.start_date, l.end_date, l.ended_at, l.end_reason,
    l.rent_amount, l.deposit_amount, l.frequency, l.grace_days,
    l.status, l.notes, l.created_at,
    COALESCE(inv.total_due, 0) AS total_due,
    COALESCE(pay.rent_paid, 0) AS total_paid,
    COALESCE(inv.total_due, 0) - COALESCE(pay.rent_paid, 0) AS balance,
    COALESCE(pay.deposit_paid, 0) AS deposit_paid,
    COALESCE(inv.invoice_count, 0) AS invoice_count,
    COALESCE(inv.unpaid_count, 0) AS unpaid_count,
    COALESCE(inv.late_count, 0) AS late_count,
    inv.next_due_date,
    inv.paid_through,
    pay.last_payment_at
  FROM public.rental_leases l
  JOIN public.rental_properties pr ON pr.id = l.property_id
  JOIN public.rental_units u ON u.id = l.unit_id
  JOIN public.rental_tenants t ON t.id = l.tenant_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(i.amount_due) FILTER (WHERE i.status <> 'cancelled') AS total_due,
      COUNT(*) FILTER (WHERE i.status <> 'cancelled') AS invoice_count,
      COUNT(*) FILTER (WHERE i.status = 'open') AS unpaid_count,
      COUNT(*) FILTER (WHERE i.status = 'open' AND i.due_date < CURRENT_DATE) AS late_count,
      MIN(i.due_date) FILTER (WHERE i.status = 'open') AS next_due_date,
      MAX(i.period_end) FILTER (WHERE i.status = 'paid') AS paid_through
    FROM public.rental_invoices i
    WHERE i.lease_id = l.id
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT
      SUM(p.amount) FILTER (WHERE p.kind = 'rent') AS rent_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.kind = 'deposit'), 0)
        - COALESCE(SUM(p.amount) FILTER (WHERE p.kind = 'deposit_refund'), 0) AS deposit_paid,
      MAX(p.paid_at) AS last_payment_at
    FROM public.rental_payments p
    WHERE p.lease_id = l.id
  ) pay ON true
  WHERE l.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_rental(p_company_id)
    AND (p_store_id IS NULL OR l.store_id = p_store_id)
  ORDER BY
    CASE l.status WHEN 'active' THEN 0 ELSE 1 END,
    (COALESCE(inv.total_due, 0) - COALESCE(pay.rent_paid, 0)) DESC,
    pr.name, u.label;
$$;
GRANT EXECUTE ON FUNCTION public.rental_leases_list(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. RPC de lecture — biens avec occupation et rendement
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_properties_list(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  store_id uuid,
  name text,
  kind text,
  address text,
  city text,
  district text,
  description text,
  notes text,
  is_active boolean,
  created_at timestamptz,
  units_count bigint,
  occupied_count bigint,
  vacant_count bigint,
  monthly_expected numeric,
  monthly_potential numeric,
  outstanding numeric,
  charges_total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pr.id, pr.store_id, pr.name, pr.kind, pr.address, pr.city, pr.district,
    pr.description, pr.notes, pr.is_active, pr.created_at,
    COALESCE(u.units_count, 0) AS units_count,
    COALESCE(u.occupied_count, 0) AS occupied_count,
    COALESCE(u.units_count, 0) - COALESCE(u.occupied_count, 0) AS vacant_count,
    COALESCE(u.monthly_expected, 0) AS monthly_expected,
    COALESCE(u.monthly_potential, 0) AS monthly_potential,
    COALESCE(bal.outstanding, 0) AS outstanding,
    COALESCE(ch.charges_total, 0) AS charges_total
  FROM public.rental_properties pr
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS units_count,
      COUNT(*) FILTER (WHERE act.id IS NOT NULL) AS occupied_count,
      COALESCE(SUM(act.rent_amount), 0) AS monthly_expected,
      COALESCE(SUM(COALESCE(act.rent_amount, un.base_rent)), 0) AS monthly_potential
    FROM public.rental_units un
    LEFT JOIN LATERAL (
      SELECT l.id, l.rent_amount FROM public.rental_leases l
      WHERE l.unit_id = un.id AND l.status = 'active' LIMIT 1
    ) act ON true
    WHERE un.property_id = pr.id AND un.is_active = true
  ) u ON true
  LEFT JOIN LATERAL (
    SELECT SUM(
      COALESCE((SELECT SUM(i.amount_due) FROM public.rental_invoices i
                WHERE i.lease_id = l.id AND i.status <> 'cancelled'), 0)
      - COALESCE((SELECT SUM(p.amount) FROM public.rental_payments p
                  WHERE p.lease_id = l.id AND p.kind = 'rent'), 0)
    ) AS outstanding
    FROM public.rental_leases l
    WHERE l.property_id = pr.id
  ) bal ON true
  LEFT JOIN LATERAL (
    SELECT SUM(c.amount) AS charges_total
    FROM public.rental_charges c
    WHERE c.property_id = pr.id
  ) ch ON true
  WHERE pr.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_rental(p_company_id)
    AND (p_store_id IS NULL OR pr.store_id = p_store_id)
  ORDER BY pr.is_active DESC, pr.name;
$$;
GRANT EXECUTE ON FUNCTION public.rental_properties_list(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. RPC de lecture — lots d'une entreprise (avec occupant courant)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_units_list(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  property_id uuid,
  property_name text,
  label text,
  floor text,
  rooms integer,
  bathrooms integer,
  surface_m2 numeric,
  base_rent numeric,
  base_deposit numeric,
  description text,
  is_active boolean,
  active_lease_id uuid,
  tenant_name text,
  current_rent numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    un.id, un.property_id, pr.name, un.label, un.floor, un.rooms, un.bathrooms,
    un.surface_m2, un.base_rent, un.base_deposit, un.description, un.is_active,
    act.lease_id, act.tenant_name, act.rent_amount
  FROM public.rental_units un
  JOIN public.rental_properties pr ON pr.id = un.property_id
  LEFT JOIN LATERAL (
    SELECT l.id AS lease_id, l.rent_amount, t.full_name AS tenant_name
    FROM public.rental_leases l
    JOIN public.rental_tenants t ON t.id = l.tenant_id
    WHERE l.unit_id = un.id AND l.status = 'active'
    LIMIT 1
  ) act ON true
  WHERE un.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_rental(p_company_id)
    AND (p_store_id IS NULL OR pr.store_id = p_store_id)
  ORDER BY pr.name, un.label;
$$;
GRANT EXECUTE ON FUNCTION public.rental_units_list(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. RPC de lecture — locataires
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_tenants_list(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  phone2 text,
  email text,
  id_type text,
  id_number text,
  profession text,
  employer text,
  emergency_name text,
  emergency_phone text,
  address text,
  notes text,
  is_active boolean,
  created_at timestamptz,
  active_leases bigint,
  total_balance numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id, t.full_name, t.phone, t.phone2, t.email, t.id_type, t.id_number,
    t.profession, t.employer, t.emergency_name, t.emergency_phone, t.address,
    t.notes, t.is_active, t.created_at,
    COALESCE(agg.active_leases, 0) AS active_leases,
    COALESCE(agg.total_balance, 0) AS total_balance
  FROM public.rental_tenants t
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE l.status = 'active') AS active_leases,
      SUM(
        COALESCE((SELECT SUM(i.amount_due) FROM public.rental_invoices i
                  WHERE i.lease_id = l.id AND i.status <> 'cancelled'), 0)
        - COALESCE((SELECT SUM(p.amount) FROM public.rental_payments p
                    WHERE p.lease_id = l.id AND p.kind = 'rent'), 0)
      ) AS total_balance
    FROM public.rental_leases l
    WHERE l.tenant_id = t.id
  ) agg ON true
  WHERE t.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_rental(p_company_id)
  ORDER BY t.is_active DESC, t.full_name;
$$;
GRANT EXECUTE ON FUNCTION public.rental_tenants_list(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. RPC de lecture — échéancier et encaissements d'un bail
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_lease_schedule(p_lease_id uuid)
RETURNS TABLE (
  id uuid,
  period_start date,
  period_end date,
  due_date date,
  amount_due numeric,
  amount_paid numeric,
  label text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, i.period_start, i.period_end, i.due_date, i.amount_due,
    COALESCE((SELECT SUM(a.amount) FROM public.rental_payment_allocations a
              WHERE a.invoice_id = i.id), 0) AS amount_paid,
    i.label, i.status
  FROM public.rental_invoices i
  JOIN public.rental_leases l ON l.id = i.lease_id
  WHERE i.lease_id = p_lease_id
    AND l.company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_rental(l.company_id)
  ORDER BY i.period_start;
$$;
GRANT EXECUTE ON FUNCTION public.rental_lease_schedule(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rental_lease_payments(p_lease_id uuid)
RETURNS TABLE (
  id uuid,
  kind text,
  amount numeric,
  method public.payment_method,
  paid_at timestamptz,
  reference text,
  note text,
  receipt_number text,
  created_at timestamptz,
  created_by_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.kind, p.amount, p.method, p.paid_at, p.reference, p.note,
    p.receipt_number, p.created_at,
    COALESCE(NULLIF(btrim(prof.full_name), ''), u.email::text) AS created_by_name
  FROM public.rental_payments p
  JOIN public.rental_leases l ON l.id = p.lease_id
  LEFT JOIN public.profiles prof ON prof.id = p.created_by
  LEFT JOIN auth.users u ON u.id = p.created_by
  WHERE p.lease_id = p_lease_id
    AND l.company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_rental(l.company_id)
  ORDER BY p.paid_at DESC, p.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.rental_lease_payments(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. RPC de lecture — charges
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_charges_list(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  property_id uuid,
  property_name text,
  unit_id uuid,
  unit_label text,
  label text,
  category text,
  amount numeric,
  spent_on date,
  method public.payment_method,
  note text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.property_id, pr.name, c.unit_id, un.label, c.label, c.category,
    c.amount, c.spent_on, c.method, c.note, c.created_at
  FROM public.rental_charges c
  JOIN public.rental_properties pr ON pr.id = c.property_id
  LEFT JOIN public.rental_units un ON un.id = c.unit_id
  WHERE c.company_id = p_company_id
    AND p_company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_rental(p_company_id)
    AND (p_store_id IS NULL OR c.store_id = p_store_id)
    AND (p_from IS NULL OR c.spent_on >= p_from)
    AND (p_to IS NULL OR c.spent_on <= p_to)
  ORDER BY c.spent_on DESC, c.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.rental_charges_list(uuid, uuid, date, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 21. RPC de lecture — indicateurs du mois (tableau de bord Location)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_stats(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_month date DEFAULT NULL
)
RETURNS TABLE (
  month_start date,
  properties_count bigint,
  units_count bigint,
  occupied_units bigint,
  vacant_units bigint,
  active_leases bigint,
  tenants_count bigint,
  expected_month numeric,
  collected_month numeric,
  charges_month numeric,
  outstanding_total numeric,
  late_leases bigint,
  deposits_held numeric,
  collected_year numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      date_trunc('month', COALESCE(p_month, CURRENT_DATE))::date AS m_start,
      (date_trunc('month', COALESCE(p_month, CURRENT_DATE)) + interval '1 month')::date AS m_end,
      date_trunc('year', COALESCE(p_month, CURRENT_DATE))::date AS y_start,
      (date_trunc('year', COALESCE(p_month, CURRENT_DATE)) + interval '1 year')::date AS y_end
  ),
  ok AS (
    SELECT p_company_id IN (SELECT * FROM public.current_user_company_ids())
       AND public.can_manage_rental(p_company_id) AS allowed
  ),
  props AS (
    SELECT pr.id FROM public.rental_properties pr, ok
    WHERE pr.company_id = p_company_id AND ok.allowed
      AND (p_store_id IS NULL OR pr.store_id = p_store_id)
  ),
  units AS (
    SELECT un.id FROM public.rental_units un
    WHERE un.property_id IN (SELECT id FROM props) AND un.is_active = true
  ),
  leases AS (
    SELECT l.* FROM public.rental_leases l
    WHERE l.property_id IN (SELECT id FROM props)
  )
  SELECT
    (SELECT m_start FROM bounds),
    (SELECT COUNT(*) FROM props),
    (SELECT COUNT(*) FROM units),
    (SELECT COUNT(*) FROM leases WHERE status = 'active'),
    (SELECT COUNT(*) FROM units) - (SELECT COUNT(*) FROM leases WHERE status = 'active'),
    (SELECT COUNT(*) FROM leases WHERE status = 'active'),
    (SELECT COUNT(DISTINCT tenant_id) FROM leases),
    -- Attendu : échéances dont la période démarre dans le mois observé.
    COALESCE((
      SELECT SUM(i.amount_due) FROM public.rental_invoices i, bounds b
      WHERE i.lease_id IN (SELECT id FROM leases) AND i.status <> 'cancelled'
        AND i.period_start >= b.m_start AND i.period_start < b.m_end
    ), 0),
    COALESCE((
      SELECT SUM(p.amount) FROM public.rental_payments p, bounds b
      WHERE p.lease_id IN (SELECT id FROM leases) AND p.kind = 'rent'
        AND p.paid_at >= b.m_start AND p.paid_at < b.m_end
    ), 0),
    COALESCE((
      SELECT SUM(c.amount) FROM public.rental_charges c, bounds b
      WHERE c.property_id IN (SELECT id FROM props)
        AND c.spent_on >= b.m_start AND c.spent_on < b.m_end
    ), 0),
    COALESCE((
      SELECT SUM(
        COALESCE((SELECT SUM(i.amount_due) FROM public.rental_invoices i
                  WHERE i.lease_id = l.id AND i.status <> 'cancelled'), 0)
        - COALESCE((SELECT SUM(p.amount) FROM public.rental_payments p
                    WHERE p.lease_id = l.id AND p.kind = 'rent'), 0)
      ) FROM leases l
    ), 0),
    (SELECT COUNT(*) FROM leases l
      WHERE EXISTS (SELECT 1 FROM public.rental_invoices i
                    WHERE i.lease_id = l.id AND i.status = 'open' AND i.due_date < CURRENT_DATE)),
    COALESCE((
      SELECT COALESCE(SUM(p.amount) FILTER (WHERE p.kind = 'deposit'), 0)
           - COALESCE(SUM(p.amount) FILTER (WHERE p.kind = 'deposit_refund'), 0)
      FROM public.rental_payments p WHERE p.lease_id IN (SELECT id FROM leases)
    ), 0),
    COALESCE((
      SELECT SUM(p.amount) FROM public.rental_payments p, bounds b
      WHERE p.lease_id IN (SELECT id FROM leases) AND p.kind = 'rent'
        AND p.paid_at >= b.y_start AND p.paid_at < b.y_end
    ), 0);
$$;
GRANT EXECUTE ON FUNCTION public.rental_stats(uuid, uuid, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 22. RPC de lecture — données du ticket thermique (source unique, non falsifiable)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rental_receipt_data(p_payment_id uuid)
RETURNS TABLE (
  payment_id uuid,
  kind text,
  amount numeric,
  method public.payment_method,
  paid_at timestamptz,
  reference text,
  note text,
  receipt_number text,
  cashier_name text,
  lease_id uuid,
  lease_number text,
  tenant_name text,
  tenant_phone text,
  property_name text,
  property_address text,
  unit_label text,
  rent_amount numeric,
  balance_after numeric,
  periods_covered text,
  paid_through date,
  next_due_date date,
  company_name text,
  store_name text,
  store_address text,
  store_phone text,
  store_logo_url text,
  paper_width_mm smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.kind, p.amount, p.method, p.paid_at, p.reference, p.note, p.receipt_number,
    COALESCE(NULLIF(btrim(prof.full_name), ''), u.email::text) AS cashier_name,
    l.id, l.lease_number, t.full_name, t.phone,
    pr.name, pr.address, un.label, l.rent_amount,
    -- Solde du bail à l'instant du ticket (échéances émises − loyers encaissés jusqu'ici).
    (
      COALESCE((SELECT SUM(i.amount_due) FROM public.rental_invoices i
                WHERE i.lease_id = l.id AND i.status <> 'cancelled'
                  AND i.period_start <= p.paid_at::date), 0)
      - COALESCE((SELECT SUM(x.amount) FROM public.rental_payments x
                  WHERE x.lease_id = l.id AND x.kind = 'rent'
                    AND (x.paid_at < p.paid_at OR (x.paid_at = p.paid_at AND x.id = p.id))), 0)
    ) AS balance_after,
    -- Mois effectivement soldés par CE règlement (ce que le locataire vient d'acheter).
    (
      SELECT string_agg(lbl, ', ' ORDER BY ps)
      FROM (
        SELECT i.period_start AS ps,
               COALESCE(NULLIF(btrim(i.label), ''), to_char(i.period_start, 'MM/YYYY')) AS lbl
        FROM public.rental_payment_allocations a
        JOIN public.rental_invoices i ON i.id = a.invoice_id
        WHERE a.payment_id = p.id
      ) s
    ) AS periods_covered,
    (SELECT MAX(i.period_end) FROM public.rental_invoices i
      WHERE i.lease_id = l.id AND i.status = 'paid') AS paid_through,
    (SELECT MIN(i.due_date) FROM public.rental_invoices i
      WHERE i.lease_id = l.id AND i.status = 'open') AS next_due_date,
    c.name, st.name, st.address, st.phone, st.logo_url, st.receipt_paper_width_mm
  FROM public.rental_payments p
  JOIN public.rental_leases l ON l.id = p.lease_id
  JOIN public.rental_properties pr ON pr.id = l.property_id
  JOIN public.rental_units un ON un.id = l.unit_id
  JOIN public.rental_tenants t ON t.id = l.tenant_id
  JOIN public.companies c ON c.id = l.company_id
  JOIN public.stores st ON st.id = l.store_id
  LEFT JOIN public.profiles prof ON prof.id = p.created_by
  LEFT JOIN auth.users u ON u.id = p.created_by
  WHERE p.id = p_payment_id
    AND l.company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_rental(l.company_id);
$$;
GRANT EXECUTE ON FUNCTION public.rental_receipt_data(uuid) TO authenticated;
