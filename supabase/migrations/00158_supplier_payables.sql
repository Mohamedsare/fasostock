-- FasoStock — Espace Fournisseurs : gestion complète des DETTES FOURNISSEURS
-- (« ce que JE dois à mes fournisseurs » — comptes fournisseurs / accounts payable).
--
-- Problème métier : aujourd'hui la page Fournisseurs n'est qu'un carnet d'adresses.
-- Le gérant sait ce que ses clients lui doivent (module Crédit) mais pas ce que LUI
-- doit à ses fournisseurs. Il perd l'échéancier, paie en retard, ou paie deux fois.
--
-- Modèle d'argent — volontairement simple, explicite et auditable :
--
--   DETTE      = `supplier_invoices` : une ligne = une facture / un bon / une ardoise.
--                Trois origines (`source`) :
--                  'purchase' → miroir automatique d'un achat validé (module Achats) ;
--                  'manual'   → facture ou dette saisie à la main ;
--                  'opening'  → solde de départ (dette existante à la mise en service).
--   RÈGLEMENT  = `supplier_payments` : un versement fait au fournisseur.
--   IMPUTATION = `supplier_payment_allocations` : quelle part de quel versement solde
--                quelle facture. Écrite UNE FOIS au moment du versement (choix manuel
--                ou FIFO sur les factures ouvertes) — jamais recalculée globalement,
--                donc jamais de « dérive » d'un historique déjà remis au fournisseur.
--
--   solde fournisseur = Σ factures non annulées − Σ imputations
--   avance / crédit   = Σ versements − Σ imputations   (versé sans facture en face)
--
-- Cohérence avec le module Achats et la Comptabilité :
--   * un achat validé crée / met à jour automatiquement sa facture fournisseur ;
--   * un `purchase_payments` (règlement saisi dans Achats) est reflété automatiquement
--     en `supplier_payments` imputé sur la facture de cet achat ;
--   * inversement, un règlement saisi ICI et imputé sur une facture d'achat écrit aussi
--     la ligne `purchase_payments` correspondante (marquée `supplier_payment_id`, donc
--     jamais re-reflétée) : l'écriture SYSCOHADA 401 Fournisseurs reste juste.
--
-- Droits : réutilise `suppliers.view` (lecture) et `suppliers.manage` (écriture).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fiche fournisseur enrichie
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS bank_details text,
  ADD COLUMN IF NOT EXISTS category text,
  /** Délai de règlement accordé par le fournisseur (jours). 0 = comptant. */
  ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 0
    CHECK (payment_terms_days >= 0),
  /** Encours maximum autorisé (0 = pas de plafond suivi). */
  ADD COLUMN IF NOT EXISTS credit_limit numeric(14,2) NOT NULL DEFAULT 0
    CHECK (credit_limit >= 0),
  /** Dette déjà existante à la mise en service — matérialisée en facture 'opening'. */
  ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) NOT NULL DEFAULT 0
    CHECK (opening_balance >= 0);

COMMENT ON COLUMN public.suppliers.payment_terms_days IS
  'Délai de paiement accordé (jours). Sert à calculer l''échéance des factures.';
COMMENT ON COLUMN public.suppliers.credit_limit IS
  'Encours fournisseur maximum souhaité. 0 = non suivi. Alerte visuelle si dépassé.';
COMMENT ON COLUMN public.suppliers.opening_balance IS
  'Dette de départ (reprise d''antériorité). Génère une facture source = ''opening''.';

CREATE INDEX IF NOT EXISTS idx_suppliers_company_active
  ON public.suppliers(company_id, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tables du grand livre fournisseur
-- ─────────────────────────────────────────────────────────────────────────────

/** Une dette envers un fournisseur : facture, bon de livraison, ardoise, solde initial. */
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,

  /** Achat d'origine quand la dette vient du module Achats (miroir automatique). */
  purchase_id uuid UNIQUE REFERENCES public.purchases(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('purchase', 'manual', 'opening')),

  invoice_number text,
  label text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  /** Date à laquelle le fournisseur attend son argent. Pilote tout l'échéancier. */
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  /** Maintenu par trigger depuis `supplier_payment_allocations`. Ne jamais écrire à la main. */
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partially_paid', 'paid', 'cancelled')),

  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.supplier_invoices IS
  'Dette envers un fournisseur (facture, ardoise, solde de départ, ou miroir d''un achat). '
  'Reste à payer = amount − paid_amount tant que status <> ''cancelled''.';

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_company
  ON public.supplier_invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier
  ON public.supplier_invoices(supplier_id, due_date);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_due
  ON public.supplier_invoices(company_id, due_date)
  WHERE status IN ('open', 'partially_paid');

/** Un versement fait au fournisseur (espèces, mobile money, virement…). */
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,

  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method payment_method NOT NULL DEFAULT 'cash',
  paid_at timestamptz NOT NULL DEFAULT now(),
  reference text,
  notes text,

  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'purchase')),
  /** Renseigné quand le versement est le miroir d'un règlement saisi dans Achats. */
  purchase_payment_id uuid UNIQUE,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.supplier_payments IS
  'Versement au fournisseur. La part non imputée (amount − Σ allocations) est une '
  'AVANCE utilisable sur une future facture.';

CREATE INDEX IF NOT EXISTS idx_supplier_payments_company
  ON public.supplier_payments(company_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier
  ON public.supplier_payments(supplier_id, paid_at DESC);

/** Quelle part de quel versement solde quelle facture. */
CREATE TABLE IF NOT EXISTS public.supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.supplier_payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_alloc_invoice
  ON public.supplier_payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_alloc_payment
  ON public.supplier_payment_allocations(payment_id);

/** Lien retour Achats → grand livre fournisseur (évite le double comptage). */
ALTER TABLE public.purchase_payments
  ADD COLUMN IF NOT EXISTS supplier_payment_id uuid;

COMMENT ON COLUMN public.purchase_payments.supplier_payment_id IS
  'Non NULL quand la ligne a été créée depuis l''espace Fournisseurs : le miroir '
  'purchase_payments → supplier_payments doit alors être ignoré.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Maintien de `paid_amount` / `status` des factures
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fs_supplier_invoice_refresh(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid numeric(14,2);
  v_amount numeric(14,2);
  v_cancelled boolean;
BEGIN
  SELECT amount, status = 'cancelled'
    INTO v_amount, v_cancelled
    FROM public.supplier_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.supplier_payment_allocations WHERE invoice_id = p_invoice_id;

  UPDATE public.supplier_invoices
     SET paid_amount = v_paid,
         status = CASE
           WHEN v_cancelled THEN 'cancelled'
           WHEN v_paid >= v_amount AND v_amount > 0 THEN 'paid'
           WHEN v_amount = 0 THEN 'paid'
           WHEN v_paid > 0 THEN 'partially_paid'
           ELSE 'open'
         END,
         updated_at = now()
   WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fs_supplier_alloc_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.fs_supplier_invoice_refresh(OLD.invoice_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.fs_supplier_invoice_refresh(NEW.invoice_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS supplier_alloc_touch ON public.supplier_payment_allocations;
CREATE TRIGGER supplier_alloc_touch
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.fs_supplier_alloc_touch();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Miroir automatique : Achats → dettes fournisseurs
-- ─────────────────────────────────────────────────────────────────────────────

/** Un achat validé devient une facture fournisseur ; un brouillon / annulé n'en est pas une. */
CREATE OR REPLACE FUNCTION public.fs_sync_purchase_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_terms integer;
  v_invoice_id uuid;
BEGIN
  IF NEW.status IN ('confirmed', 'partially_received', 'received') THEN
    SELECT COALESCE(payment_terms_days, 0) INTO v_terms
      FROM public.suppliers WHERE id = NEW.supplier_id;

    INSERT INTO public.supplier_invoices (
      company_id, supplier_id, store_id, purchase_id, source,
      invoice_number, label, invoice_date, due_date, amount, created_by
    )
    VALUES (
      NEW.company_id, NEW.supplier_id, NEW.store_id, NEW.id, 'purchase',
      NEW.reference, 'Achat ' || COALESCE(NEW.reference, ''),
      NEW.created_at::date,
      NEW.created_at::date + COALESCE(v_terms, 0),
      NEW.total, NEW.created_by
    )
    ON CONFLICT (purchase_id) DO UPDATE
      SET amount = EXCLUDED.amount,
          supplier_id = EXCLUDED.supplier_id,
          store_id = EXCLUDED.store_id,
          invoice_number = EXCLUDED.invoice_number,
          status = CASE WHEN supplier_invoices.status = 'cancelled'
                        THEN 'open' ELSE supplier_invoices.status END,
          updated_at = now()
    RETURNING id INTO v_invoice_id;

    IF v_invoice_id IS NULL THEN
      SELECT id INTO v_invoice_id FROM public.supplier_invoices WHERE purchase_id = NEW.id;
    END IF;
    IF v_invoice_id IS NOT NULL THEN
      PERFORM public.fs_supplier_invoice_refresh(v_invoice_id);
    END IF;

  ELSE
    -- brouillon repassé / annulé : la dette n'existe plus.
    UPDATE public.supplier_invoices
       SET status = 'cancelled', updated_at = now()
     WHERE purchase_id = NEW.id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS supplier_sync_purchase_invoice ON public.purchases;
CREATE TRIGGER supplier_sync_purchase_invoice
  AFTER INSERT OR UPDATE OF status, total, supplier_id, reference ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.fs_sync_purchase_invoice();

/** Un règlement saisi dans Achats devient un versement fournisseur imputé sur cet achat. */
CREATE OR REPLACE FUNCTION public.fs_sync_purchase_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_supplier uuid;
  v_store uuid;
  v_invoice uuid;
  v_payment uuid;
  v_open numeric(14,2);
  v_alloc numeric(14,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.supplier_payments
     WHERE purchase_payment_id = OLD.id AND source = 'purchase';
    RETURN NULL;
  END IF;

  -- Ligne créée depuis l'espace Fournisseurs : déjà comptée, ne pas refléter.
  IF NEW.supplier_payment_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT company_id, supplier_id, store_id
    INTO v_company, v_supplier, v_store
    FROM public.purchases WHERE id = NEW.purchase_id;
  IF v_company IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.supplier_payments (
    company_id, supplier_id, store_id, amount, method, paid_at,
    reference, source, purchase_payment_id
  )
  VALUES (
    v_company, v_supplier, v_store, NEW.amount, NEW.method, NEW.paid_at,
    'Achat', 'purchase', NEW.id
  )
  ON CONFLICT (purchase_payment_id) DO UPDATE
    SET amount = EXCLUDED.amount,
        method = EXCLUDED.method,
        paid_at = EXCLUDED.paid_at
  RETURNING id INTO v_payment;

  SELECT id INTO v_invoice FROM public.supplier_invoices WHERE purchase_id = NEW.purchase_id;
  IF v_invoice IS NULL OR v_payment IS NULL THEN RETURN NULL; END IF;

  -- Imputation directe sur la facture de cet achat, plafonnée au reste dû.
  SELECT GREATEST(i.amount - COALESCE((
           SELECT SUM(a.amount) FROM public.supplier_payment_allocations a
            WHERE a.invoice_id = i.id AND a.payment_id <> v_payment), 0), 0)
    INTO v_open
    FROM public.supplier_invoices i WHERE i.id = v_invoice;

  v_alloc := LEAST(NEW.amount, v_open);

  DELETE FROM public.supplier_payment_allocations
   WHERE payment_id = v_payment AND invoice_id = v_invoice;

  IF v_alloc > 0 THEN
    INSERT INTO public.supplier_payment_allocations
      (company_id, supplier_id, payment_id, invoice_id, amount)
    VALUES (v_company, v_supplier, v_payment, v_invoice, v_alloc);
  ELSE
    PERFORM public.fs_supplier_invoice_refresh(v_invoice);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS supplier_sync_purchase_payment ON public.purchase_payments;
CREATE TRIGGER supplier_sync_purchase_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_payments
  FOR EACH ROW EXECUTE FUNCTION public.fs_sync_purchase_payment();

/** Solde de départ saisi sur la fiche fournisseur → facture 'opening'. */
CREATE OR REPLACE FUNCTION public.fs_sync_supplier_opening()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.supplier_invoices
   WHERE supplier_id = NEW.id AND source = 'opening' LIMIT 1;

  IF COALESCE(NEW.opening_balance, 0) <= 0 THEN
    IF v_id IS NOT NULL THEN
      UPDATE public.supplier_invoices SET status = 'cancelled', amount = 0, updated_at = now()
       WHERE id = v_id;
    END IF;
    RETURN NULL;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.supplier_invoices (
      company_id, supplier_id, source, label, invoice_date, due_date, amount
    ) VALUES (
      NEW.company_id, NEW.id, 'opening', 'Solde de départ',
      NEW.created_at::date, NEW.created_at::date, NEW.opening_balance
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.supplier_invoices
       SET amount = NEW.opening_balance,
           status = CASE WHEN status = 'cancelled' THEN 'open' ELSE status END,
           updated_at = now()
     WHERE id = v_id;
  END IF;

  PERFORM public.fs_supplier_invoice_refresh(v_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS supplier_sync_opening ON public.suppliers;
CREATE TRIGGER supplier_sync_opening
  AFTER INSERT OR UPDATE OF opening_balance ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fs_sync_supplier_opening();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — lecture pour les membres de l'entreprise, écriture par RPC
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_invoices_select" ON public.supplier_invoices;
CREATE POLICY "supplier_invoices_select" ON public.supplier_invoices FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "supplier_payments_select" ON public.supplier_payments;
CREATE POLICY "supplier_payments_select" ON public.supplier_payments FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "supplier_alloc_select" ON public.supplier_payment_allocations;
CREATE POLICY "supplier_alloc_select" ON public.supplier_payment_allocations FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Droit effectif
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_suppliers(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_company_owner(p_company_id)
     OR ('suppliers.manage' = ANY(public.get_my_permission_keys(p_company_id)));
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_suppliers(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC — factures (dettes) saisies à la main
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.supplier_invoice_save(
  p_id uuid,
  p_company_id uuid,
  p_supplier_id uuid,
  p_store_id uuid,
  p_invoice_number text,
  p_label text,
  p_invoice_date date,
  p_due_date date,
  p_amount numeric,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_source text;
BEGIN
  IF NOT public.can_manage_suppliers(p_company_id) THEN
    RAISE EXCEPTION 'Droit « suppliers.manage » requis.';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Montant invalide.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers
                  WHERE id = p_supplier_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Fournisseur introuvable.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.supplier_invoices (
      company_id, supplier_id, store_id, source, invoice_number, label,
      invoice_date, due_date, amount, notes, created_by
    ) VALUES (
      p_company_id, p_supplier_id, p_store_id, 'manual',
      NULLIF(btrim(COALESCE(p_invoice_number, '')), ''),
      NULLIF(btrim(COALESCE(p_label, '')), ''),
      COALESCE(p_invoice_date, CURRENT_DATE),
      COALESCE(p_due_date, p_invoice_date, CURRENT_DATE),
      p_amount,
      NULLIF(btrim(COALESCE(p_notes, '')), ''),
      auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    SELECT source INTO v_source FROM public.supplier_invoices
     WHERE id = p_id AND company_id = p_company_id;
    IF v_source IS NULL THEN
      RAISE EXCEPTION 'Facture introuvable.';
    END IF;
    IF v_source = 'purchase' THEN
      RAISE EXCEPTION 'Cette dette provient d''un achat : modifiez-la depuis le module Achats.';
    END IF;

    UPDATE public.supplier_invoices
       SET supplier_id = p_supplier_id,
           store_id = p_store_id,
           invoice_number = NULLIF(btrim(COALESCE(p_invoice_number, '')), ''),
           label = NULLIF(btrim(COALESCE(p_label, '')), ''),
           invoice_date = COALESCE(p_invoice_date, invoice_date),
           due_date = COALESCE(p_due_date, due_date),
           amount = p_amount,
           notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
           updated_at = now()
     WHERE id = p_id;
    v_id := p_id;
  END IF;

  PERFORM public.fs_supplier_invoice_refresh(v_id);
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.supplier_invoice_save(
  uuid, uuid, uuid, uuid, text, text, date, date, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_invoice_cancel(p_id uuid, p_cancel boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.supplier_invoices WHERE id = p_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Facture introuvable.'; END IF;
  IF NOT public.can_manage_suppliers(v_company) THEN
    RAISE EXCEPTION 'Droit « suppliers.manage » requis.';
  END IF;

  UPDATE public.supplier_invoices
     SET status = CASE WHEN p_cancel THEN 'cancelled' ELSE 'open' END, updated_at = now()
   WHERE id = p_id;
  PERFORM public.fs_supplier_invoice_refresh(p_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.supplier_invoice_cancel(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_invoice_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_source text;
  v_paid numeric;
BEGIN
  SELECT company_id, source, paid_amount INTO v_company, v_source, v_paid
    FROM public.supplier_invoices WHERE id = p_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Facture introuvable.'; END IF;
  IF NOT public.can_manage_suppliers(v_company) THEN
    RAISE EXCEPTION 'Droit « suppliers.manage » requis.';
  END IF;
  IF v_source = 'purchase' THEN
    RAISE EXCEPTION 'Dette issue d''un achat : supprimez ou annulez l''achat.';
  END IF;
  IF COALESCE(v_paid, 0) > 0 THEN
    RAISE EXCEPTION 'Des règlements sont imputés sur cette dette : annulez-la plutôt.';
  END IF;

  DELETE FROM public.supplier_invoices WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.supplier_invoice_delete(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC — enregistrer un règlement au fournisseur
--    p_allocations : [{"invoice_id": "...", "amount": 1234}] ; NULL ⇒ FIFO
--    sur les factures ouvertes (les plus anciennes échéances d'abord).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  p_company_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'cash',
  p_paid_at timestamptz DEFAULT now(),
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_allocations jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment uuid;
  v_left numeric(14,2);
  v_take numeric(14,2);
  v_open numeric(14,2);
  r RECORD;
BEGIN
  IF NOT public.can_manage_suppliers(p_company_id) THEN
    RAISE EXCEPTION 'Droit « suppliers.manage » requis.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant du règlement doit être supérieur à 0.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.suppliers
                  WHERE id = p_supplier_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'Fournisseur introuvable.';
  END IF;

  INSERT INTO public.supplier_payments (
    company_id, supplier_id, store_id, amount, method, paid_at, reference, notes,
    source, created_by
  ) VALUES (
    p_company_id, p_supplier_id, p_store_id, p_amount,
    COALESCE(NULLIF(btrim(COALESCE(p_method, '')), ''), 'cash')::payment_method,
    COALESCE(p_paid_at, now()),
    NULLIF(btrim(COALESCE(p_reference, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    'manual', auth.uid()
  ) RETURNING id INTO v_payment;

  v_left := p_amount;

  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array' THEN
    -- Imputation choisie explicitement par l'utilisateur.
    FOR r IN
      SELECT (e ->> 'invoice_id')::uuid AS invoice_id,
             GREATEST(COALESCE((e ->> 'amount')::numeric, 0), 0) AS amount
        FROM jsonb_array_elements(p_allocations) e
    LOOP
      CONTINUE WHEN r.invoice_id IS NULL OR r.amount <= 0 OR v_left <= 0;

      SELECT GREATEST(i.amount - i.paid_amount, 0) INTO v_open
        FROM public.supplier_invoices i
       WHERE i.id = r.invoice_id
         AND i.company_id = p_company_id
         AND i.supplier_id = p_supplier_id
         AND i.status <> 'cancelled';
      CONTINUE WHEN v_open IS NULL OR v_open <= 0;

      v_take := LEAST(r.amount, v_open, v_left);
      IF v_take > 0 THEN
        INSERT INTO public.supplier_payment_allocations
          (company_id, supplier_id, payment_id, invoice_id, amount)
        VALUES (p_company_id, p_supplier_id, v_payment, r.invoice_id, v_take);
        v_left := v_left - v_take;
      END IF;
    END LOOP;
  ELSE
    -- FIFO : on solde d'abord ce qui est dû depuis le plus longtemps.
    FOR r IN
      SELECT id, GREATEST(amount - paid_amount, 0) AS due
        FROM public.supplier_invoices
       WHERE company_id = p_company_id
         AND supplier_id = p_supplier_id
         AND status IN ('open', 'partially_paid')
       ORDER BY due_date ASC, invoice_date ASC, created_at ASC
    LOOP
      EXIT WHEN v_left <= 0;
      CONTINUE WHEN r.due <= 0;
      v_take := LEAST(r.due, v_left);
      INSERT INTO public.supplier_payment_allocations
        (company_id, supplier_id, payment_id, invoice_id, amount)
      VALUES (p_company_id, p_supplier_id, v_payment, r.id, v_take);
      v_left := v_left - v_take;
    END LOOP;
  END IF;

  -- Les imputations qui portent sur une dette issue d'un achat sont répercutées
  -- dans `purchase_payments` : la comptabilité (401 Fournisseurs) reste juste.
  FOR r IN
    SELECT i.purchase_id, a.amount
      FROM public.supplier_payment_allocations a
      JOIN public.supplier_invoices i ON i.id = a.invoice_id
     WHERE a.payment_id = v_payment AND i.purchase_id IS NOT NULL
  LOOP
    INSERT INTO public.purchase_payments (purchase_id, amount, method, paid_at, supplier_payment_id)
    VALUES (
      r.purchase_id, r.amount,
      COALESCE(NULLIF(btrim(COALESCE(p_method, '')), ''), 'cash')::payment_method,
      COALESCE(p_paid_at, now()), v_payment
    );
  END LOOP;

  RETURN v_payment;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(
  uuid, uuid, numeric, text, timestamptz, text, text, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_supplier_payment(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_source text;
  v_invoices uuid[];
BEGIN
  SELECT company_id, source INTO v_company, v_source
    FROM public.supplier_payments WHERE id = p_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Règlement introuvable.'; END IF;
  IF NOT public.can_manage_suppliers(v_company) THEN
    RAISE EXCEPTION 'Droit « suppliers.manage » requis.';
  END IF;
  IF v_source = 'purchase' THEN
    RAISE EXCEPTION 'Ce règlement a été saisi dans le module Achats : supprimez-le là-bas.';
  END IF;

  SELECT array_agg(invoice_id) INTO v_invoices
    FROM public.supplier_payment_allocations WHERE payment_id = p_id;

  DELETE FROM public.purchase_payments WHERE supplier_payment_id = p_id;
  DELETE FROM public.supplier_payments WHERE id = p_id;

  IF v_invoices IS NOT NULL THEN
    PERFORM public.fs_supplier_invoice_refresh(i) FROM unnest(v_invoices) AS i;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_supplier_payment(uuid) TO authenticated;

/** Applique l'avance disponible (versements non imputés) sur les factures ouvertes. */
CREATE OR REPLACE FUNCTION public.supplier_apply_credit(
  p_company_id uuid,
  p_supplier_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied numeric(14,2) := 0;
  v_take numeric(14,2);
  pay RECORD;
  inv RECORD;
  v_pay_left numeric(14,2);
BEGIN
  IF NOT public.can_manage_suppliers(p_company_id) THEN
    RAISE EXCEPTION 'Droit « suppliers.manage » requis.';
  END IF;

  FOR pay IN
    SELECT p.id,
           p.amount - COALESCE((SELECT SUM(a.amount)
                                  FROM public.supplier_payment_allocations a
                                 WHERE a.payment_id = p.id), 0) AS remaining
      FROM public.supplier_payments p
     WHERE p.company_id = p_company_id AND p.supplier_id = p_supplier_id
     ORDER BY p.paid_at ASC, p.created_at ASC
  LOOP
    v_pay_left := pay.remaining;
    CONTINUE WHEN v_pay_left <= 0;

    FOR inv IN
      SELECT id, GREATEST(amount - paid_amount, 0) AS due
        FROM public.supplier_invoices
       WHERE company_id = p_company_id AND supplier_id = p_supplier_id
         AND status IN ('open', 'partially_paid')
       ORDER BY due_date ASC, invoice_date ASC, created_at ASC
    LOOP
      EXIT WHEN v_pay_left <= 0;
      CONTINUE WHEN inv.due <= 0;
      v_take := LEAST(inv.due, v_pay_left);

      INSERT INTO public.supplier_payment_allocations
        (company_id, supplier_id, payment_id, invoice_id, amount)
      VALUES (p_company_id, p_supplier_id, pay.id, inv.id, v_take)
      ON CONFLICT (payment_id, invoice_id) DO UPDATE
        SET amount = supplier_payment_allocations.amount + EXCLUDED.amount;

      v_pay_left := v_pay_left - v_take;
      v_applied := v_applied + v_take;
    END LOOP;
  END LOOP;

  RETURN v_applied;
END;
$$;
GRANT EXECUTE ON FUNCTION public.supplier_apply_credit(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPC de lecture — situation de chaque fournisseur en une requête
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.supplier_payables_overview(p_company_id uuid)
RETURNS TABLE (
  supplier_id uuid,
  total_due numeric,
  total_paid numeric,
  balance numeric,
  credit_available numeric,
  overdue_amount numeric,
  due_soon_amount numeric,
  open_invoices integer,
  overdue_invoices integer,
  oldest_due_date date,
  next_due_date date,
  last_payment_at timestamptz,
  last_invoice_date date,
  purchases_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH inv AS (
    SELECT i.supplier_id,
           SUM(i.amount) AS total_due,
           SUM(i.paid_amount) AS total_paid,
           SUM(GREATEST(i.amount - i.paid_amount, 0)) AS balance,
           SUM(CASE WHEN i.due_date < CURRENT_DATE
                    THEN GREATEST(i.amount - i.paid_amount, 0) ELSE 0 END) AS overdue_amount,
           SUM(CASE WHEN i.due_date >= CURRENT_DATE AND i.due_date <= CURRENT_DATE + 7
                    THEN GREATEST(i.amount - i.paid_amount, 0) ELSE 0 END) AS due_soon_amount,
           COUNT(*) FILTER (WHERE i.amount - i.paid_amount > 0)::int AS open_invoices,
           COUNT(*) FILTER (WHERE i.amount - i.paid_amount > 0
                              AND i.due_date < CURRENT_DATE)::int AS overdue_invoices,
           MIN(i.due_date) FILTER (WHERE i.amount - i.paid_amount > 0) AS oldest_due_date,
           MIN(i.due_date) FILTER (WHERE i.amount - i.paid_amount > 0
                                     AND i.due_date >= CURRENT_DATE) AS next_due_date,
           MAX(i.invoice_date) AS last_invoice_date,
           COUNT(*) FILTER (WHERE i.source = 'purchase')::int AS purchases_count
      FROM public.supplier_invoices i
     WHERE i.company_id = p_company_id AND i.status <> 'cancelled'
     GROUP BY i.supplier_id
  ),
  pay AS (
    SELECT p.supplier_id,
           SUM(p.amount) AS paid_total,
           MAX(p.paid_at) AS last_payment_at,
           SUM(p.amount) - COALESCE(SUM((SELECT COALESCE(SUM(a.amount), 0)
                                           FROM public.supplier_payment_allocations a
                                          WHERE a.payment_id = p.id)), 0) AS credit_available
      FROM public.supplier_payments p
     WHERE p.company_id = p_company_id
     GROUP BY p.supplier_id
  )
  SELECT s.id,
         COALESCE(inv.total_due, 0),
         COALESCE(inv.total_paid, 0),
         COALESCE(inv.balance, 0),
         GREATEST(COALESCE(pay.credit_available, 0), 0),
         COALESCE(inv.overdue_amount, 0),
         COALESCE(inv.due_soon_amount, 0),
         COALESCE(inv.open_invoices, 0),
         COALESCE(inv.overdue_invoices, 0),
         inv.oldest_due_date,
         inv.next_due_date,
         pay.last_payment_at,
         inv.last_invoice_date,
         COALESCE(inv.purchases_count, 0)
    FROM public.suppliers s
    LEFT JOIN inv ON inv.supplier_id = s.id
    LEFT JOIN pay ON pay.supplier_id = s.id
   WHERE s.company_id = p_company_id
     AND (public.is_super_admin()
          OR s.company_id IN (SELECT * FROM public.current_user_company_ids()));
$$;
GRANT EXECUTE ON FUNCTION public.supplier_payables_overview(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Reprise de l'existant : achats déjà validés et règlements déjà saisis
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.supplier_invoices (
  company_id, supplier_id, store_id, purchase_id, source,
  invoice_number, label, invoice_date, due_date, amount, created_by, created_at
)
SELECT p.company_id, p.supplier_id, p.store_id, p.id, 'purchase',
       p.reference, 'Achat ' || COALESCE(p.reference, ''),
       p.created_at::date,
       p.created_at::date + COALESCE(s.payment_terms_days, 0),
       p.total, p.created_by, p.created_at
  FROM public.purchases p
  JOIN public.suppliers s ON s.id = p.supplier_id
 WHERE p.status IN ('confirmed', 'partially_received', 'received')
ON CONFLICT (purchase_id) DO NOTHING;

INSERT INTO public.supplier_payments (
  company_id, supplier_id, store_id, amount, method, paid_at,
  reference, source, purchase_payment_id, created_at
)
SELECT p.company_id, p.supplier_id, p.store_id, pp.amount, pp.method, pp.paid_at,
       'Achat', 'purchase', pp.id, pp.created_at
  FROM public.purchase_payments pp
  JOIN public.purchases p ON p.id = pp.purchase_id
 WHERE pp.supplier_payment_id IS NULL
ON CONFLICT (purchase_payment_id) DO NOTHING;

-- Imputation des règlements repris sur la facture de leur achat, plafonnée au dû.
WITH ranked AS (
  SELECT sp.id AS payment_id,
         si.id AS invoice_id,
         sp.company_id,
         sp.supplier_id,
         sp.amount,
         si.amount AS invoice_amount,
         SUM(sp.amount) OVER (
           PARTITION BY si.id ORDER BY sp.paid_at, sp.created_at, sp.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS cumulative
    FROM public.supplier_payments sp
    JOIN public.purchase_payments pp ON pp.id = sp.purchase_payment_id
    JOIN public.supplier_invoices si ON si.purchase_id = pp.purchase_id
   WHERE sp.source = 'purchase'
)
INSERT INTO public.supplier_payment_allocations
  (company_id, supplier_id, payment_id, invoice_id, amount)
SELECT company_id, supplier_id, payment_id, invoice_id,
       LEAST(amount, GREATEST(invoice_amount - (cumulative - amount), 0))
  FROM ranked
 WHERE LEAST(amount, GREATEST(invoice_amount - (cumulative - amount), 0)) > 0
ON CONFLICT (payment_id, invoice_id) DO NOTHING;

-- Recalage final des statuts (les triggers ont déjà fait l'essentiel).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.supplier_invoices LOOP
    PERFORM public.fs_supplier_invoice_refresh(r.id);
  END LOOP;
END;
$$;
