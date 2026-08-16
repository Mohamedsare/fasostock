-- FasoStock — Module « Devis & Factures » : le papier qu'on donne AVANT de vendre.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE MANQUE
-- ─────────────────────────────────────────────────────────────────────────────
-- L'application sait très bien écrire ce qui S'EST PASSÉ : une vente encaissée, un
-- ticket, une facture A4 imprimée après coup. Elle ne sait pas écrire ce qui N'EST
-- PAS ENCORE ARRIVÉ — et c'est pourtant le premier papier que réclament les clients
-- qui font vivre une entreprise :
--
--   * une ONG, une mairie, une société demandent un DEVIS avant d'engager la dépense.
--     Sans devis, le commerçant ne concourt même pas ;
--   * l'acheteur professionnel exige une FACTURE en bonne et due forme, avec ses
--     coordonnées, une référence de commande, une échéance de règlement et, souvent,
--     la TVA — pas un ticket de caisse ;
--   * entre les deux, il y a l'attente : le devis part, le client réfléchit, revient
--     trois semaines plus tard. Pendant tout ce temps, ce document n'est ni une vente
--     ni rien du tout. Aujourd'hui il vit sur un cahier, ou dans un fichier Word
--     retapé à chaque fois — avec les erreurs de prix que cela suppose.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUE CE MODULE AJOUTE
-- ─────────────────────────────────────────────────────────────────────────────
-- Un seul objet, `sale_documents`, qui prend deux visages selon `kind` :
--
--   'quote'   — le DEVIS. Une proposition de prix, valable jusqu'à une date. Il
--               n'engage rien : aucun stock ne bouge, aucun chiffre d'affaires
--               n'est compté. Il s'envoie, se fait accepter ou refuser, et périme.
--   'invoice' — la FACTURE. Tant qu'elle est en brouillon, c'est encore du papier
--               (une proforma). Quand le commerçant l'ÉMET, elle devient une VENTE
--               RÉELLE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA RÈGLE CENTRALE : PAS DE CIRCUIT D'ARGENT PARALLÈLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Émettre une facture n'invente pas une comptabilité à côté : `sale_document_issue`
-- crée une vraie ligne dans `sales`, avec ses `sale_items`, ses `sale_payments` et
-- ses `stock_movements`. Le chiffre d'affaires, la marge, le crédit client, les
-- rapports et le tableau de bord restent une seule et même vérité — exactement le
-- choix déjà fait pour les ordres de réparation (00190).
--
-- Corollaire assumé : un DEVIS ne compte JAMAIS nulle part. Ni en chiffre d'affaires,
-- ni en stock réservé, ni en créance. Un devis accepté mais non facturé n'est pas de
-- l'argent — et le jour où le client se désiste, il n'y a rien à défaire.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LES MONTANTS NE SE CALCULENT PAS DANS LE NAVIGATEUR
-- ─────────────────────────────────────────────────────────────────────────────
-- Le total d'une ligne est une colonne GÉNÉRÉE, les totaux du document sont posés par
-- trigger. Un document imprimé est un engagement : son total ne doit pas dépendre de
-- ce qu'un navigateur a bien voulu envoyer. L'écran affiche donc un aperçu, la base
-- tranche — et le PDF (`sale_document_pdf_data`) relit la base, jamais le formulaire.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ACTIVATION
-- ─────────────────────────────────────────────────────────────────────────────
-- DÉSACTIVÉ PAR DÉFAUT, ouvert par le PROPRIÉTAIRE dans Paramètres
-- (`companies.sale_documents_enabled`), comme les Emplacements (00167), le Prix de
-- revient (00174), la Caisse à deux (00191) et l'Approvisionnement (00193). Une
-- boutique de quartier qui vend au comptant ne verra jamais cette page.
--
-- 100 % additif : aucune table existante n'est modifiée.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drapeau d'activation (entreprise, réglé par le PROPRIÉTAIRE)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sale_documents_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.sale_documents_enabled IS
  'Module « Devis & Factures » (page /factures-devis). Désactivé par défaut, activé '
  'par le PROPRIÉTAIRE dans Paramètres (RPC company_set_sale_documents_enabled).';

-- Garde des drapeaux propriétaire posée en 00167, étendue en 00173, 00174, 00182,
-- 00191 puis 00193 : septième drapeau, même règle, même trigger.
CREATE OR REPLACE FUNCTION public.companies_enforce_owner_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.product_locations_enabled IS DISTINCT FROM OLD.product_locations_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver le module Emplacements.';
  END IF;

  IF NEW.product_aliases_enabled IS DISTINCT FROM OLD.product_aliases_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les autres noms de produits.';
  END IF;

  IF NEW.landed_cost_enabled IS DISTINCT FROM OLD.landed_cost_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver le module Prix de revient.';
  END IF;

  IF NEW.custom_expenses_enabled IS DISTINCT FROM OLD.custom_expenses_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut personnaliser les dépenses.';
  END IF;

  IF NEW.dual_cashier_enabled IS DISTINCT FROM OLD.dual_cashier_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver la caisse à deux.';
  END IF;

  IF NEW.quick_supply_enabled IS DISTINCT FROM OLD.quick_supply_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver l''approvisionnement.';
  END IF;

  IF NEW.sale_documents_enabled IS DISTINCT FROM OLD.sale_documents_enabled
     AND NOT public.is_super_admin()
     AND NOT public.user_is_company_owner(NEW.id)
  THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les devis et factures.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_owner_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_owner_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.companies_enforce_owner_flags();

CREATE OR REPLACE FUNCTION public.company_set_sale_documents_enabled(
  p_company_id uuid,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF NOT (public.is_super_admin() OR public.user_is_company_owner(p_company_id)) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver les devis et factures.';
  END IF;
  UPDATE public.companies
  SET sale_documents_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.company_set_sale_documents_enabled(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_set_sale_documents_enabled(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Permission dédiée
-- ─────────────────────────────────────────────────────────────────────────────
-- Volontairement distincte de `sales.create` : établir un devis pour une mairie n'est
-- pas tenir la caisse, et beaucoup de patrons veulent que leur commercial chiffre sans
-- pouvoir encaisser. Aucun rôle ne la reçoit d'office — le propriétaire l'accorde
-- nommément depuis la page Employés.
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'sale_documents.manage')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Numérotation
-- ─────────────────────────────────────────────────────────────────────────────
-- Deux séries distinctes : un client comprend « DEV-14 » et « FAC-14 », il ne
-- comprendrait pas que son devis et sa facture portent des numéros mélangés.
CREATE SEQUENCE IF NOT EXISTS public.sale_document_quote_seq;
CREATE SEQUENCE IF NOT EXISTS public.sale_document_invoice_seq;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tables
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Un document commercial : devis ou facture.
 *
 * Le client est DÉNORMALISÉ (nom, téléphone, adresse recopiés sur le document) en
 * plus du lien `customer_id`. Deux raisons, et la seconde est la vraie :
 *   1. beaucoup de devis partent pour un prospect qui n'est pas encore au fichier
 *      clients — l'exiger ferait abandonner l'outil ;
 *   2. un document imprimé doit garder POUR TOUJOURS l'adresse qui y figurait. Si
 *      la fiche client déménage en mars, le devis de janvier ne doit pas se mettre
 *      à mentir sur ce qui a été envoyé.
 */
CREATE TABLE IF NOT EXISTS public.sale_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  kind text NOT NULL CHECK (kind IN ('quote', 'invoice')),
  number text NOT NULL,

  /**
   * Devis  : draft → sent → accepted / refused / expired, puis converted.
   * Facture: draft → issued (vente créée). cancelled à tout moment avant émission.
   */
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'refused', 'expired', 'converted', 'issued', 'cancelled')),

  -- Destinataire
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_phone text,
  customer_email text,
  customer_address text,
  /** Numéro IFU / RCCM du client — exigé par les acheteurs institutionnels. */
  customer_tax_id text,

  /** Objet du document (« Fourniture de mobilier de bureau »). */
  subject text,
  /** Référence côté client (n° de bon de commande, d'appel d'offres…). */
  client_reference text,

  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  /** Devis : date de fin de validité. Passée, le document se marque « expiré ». */
  valid_until date,
  /** Facture : échéance de règlement annoncée au client. */
  due_date date,

  -- Montants : POSÉS PAR LA BASE (voir triggers). Jamais écrits par le navigateur.
  subtotal numeric(18, 2) NOT NULL DEFAULT 0,
  discount_kind text NOT NULL DEFAULT 'amount' CHECK (discount_kind IN ('amount', 'percent')),
  discount_value numeric(18, 4) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  discount numeric(18, 2) NOT NULL DEFAULT 0,
  /** Taux de TVA en pourcentage (18 = 18 %). 0 = pas de TVA, cas le plus courant. */
  tax_rate numeric(6, 3) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax numeric(18, 2) NOT NULL DEFAULT 0,
  total numeric(18, 2) NOT NULL DEFAULT 0,

  /** Note libre imprimée sous le tableau (délai de livraison, garantie…). */
  notes text,
  /** Conditions générales imprimées en pied de document. */
  terms text,

  -- Traçabilité des passages d'un document à l'autre
  /** Devis d'origine, quand ce document est la facture issue d'une conversion. */
  source_document_id uuid REFERENCES public.sale_documents(id) ON DELETE SET NULL,
  /** Vente réelle créée à l'émission de la facture. NULL tant que non émise. */
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,

  sent_at timestamptz,
  decided_at timestamptz,
  issued_at timestamptz,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Un devis ne porte pas de vente : seule une facture émise en crée une.
  CONSTRAINT sale_documents_quote_has_no_sale
    CHECK (kind = 'invoice' OR sale_id IS NULL),
  -- Les statuts ne se mélangent pas entre les deux visages du document.
  CONSTRAINT sale_documents_status_matches_kind CHECK (
    (kind = 'quote'   AND status IN ('draft', 'sent', 'accepted', 'refused', 'expired', 'converted', 'cancelled'))
    OR
    (kind = 'invoice' AND status IN ('draft', 'sent', 'issued', 'cancelled'))
  )
);

COMMENT ON TABLE public.sale_documents IS
  'Devis et factures établis à l''avance. Un devis n''engage rien ; une facture '
  'ÉMISE (sale_document_issue) crée une vente réelle — pas de circuit parallèle.';
COMMENT ON COLUMN public.sale_documents.customer_name IS
  'Recopié sur le document : un papier imprimé garde l''adresse qu''il portait, '
  'même si la fiche client change plus tard.';
COMMENT ON COLUMN public.sale_documents.total IS
  'Posé par trigger à partir des lignes. Le navigateur ne fixe aucun montant.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_documents_number
  ON public.sale_documents(company_id, number);
CREATE INDEX IF NOT EXISTS idx_sale_documents_company
  ON public.sale_documents(company_id, kind, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_documents_store
  ON public.sale_documents(store_id, kind, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_documents_status
  ON public.sale_documents(company_id, status);
CREATE INDEX IF NOT EXISTS idx_sale_documents_customer
  ON public.sale_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_sale_documents_sale
  ON public.sale_documents(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_documents_source
  ON public.sale_documents(source_document_id);

/**
 * Une ligne de document.
 *
 * `product_id` est FACULTATIF, et c'est le cœur du module : une prestation
 * (« Installation sur site », « Formation 2 jours ») n'a pas de fiche produit et
 * n'aura jamais de stock. Les lignes SANS produit ne déstockent donc rien à
 * l'émission ; celles qui en portent un sortent du stock comme une vente normale.
 */
CREATE TABLE IF NOT EXISTS public.sale_document_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.sale_documents(id) ON DELETE CASCADE,

  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  label text NOT NULL,
  /** Précision imprimée en petit sous le libellé (référence, dimensions, coloris…). */
  description text,
  unit text NOT NULL DEFAULT 'u',
  quantity numeric(18, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(18, 4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  /** Remise consentie sur CETTE ligne (0–100 %). */
  discount_percent numeric(6, 3) NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 100),

  /** Total de ligne : calculé par la base, jamais reçu du navigateur. */
  total numeric(18, 2) NOT NULL
    GENERATED ALWAYS AS (round(quantity * unit_price * (1 - discount_percent / 100), 2)) STORED,

  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  /*
   * La quantité est décimale — on facture « 2,5 jours de formation » ou « 12,5 m de
   * câble » — SAUF quand la ligne sort du stock : tout l'inventaire de l'application
   * est compté en unités entières (`store_inventory.quantity` est un integer). Sans
   * cette garde, une ligne de 2,5 sacs serait arrondie en silence à l'émission, et le
   * stock ne correspondrait plus à la facture remise au client.
   */
  CONSTRAINT sale_document_lines_stock_qty_is_whole
    CHECK (product_id IS NULL OR quantity = trunc(quantity))
);

COMMENT ON TABLE public.sale_document_lines IS
  'Lignes d''un devis / d''une facture. product_id facultatif : une prestation n''a '
  'pas de stock. Seules les lignes avec produit déstockent à l''émission.';

CREATE INDEX IF NOT EXISTS idx_sale_document_lines_doc
  ON public.sale_document_lines(document_id, position);
CREATE INDEX IF NOT EXISTS idx_sale_document_lines_company
  ON public.sale_document_lines(company_id);
CREATE INDEX IF NOT EXISTS idx_sale_document_lines_product
  ON public.sale_document_lines(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Numéro attribué automatiquement
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sale_documents_set_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.number IS NULL OR TRIM(NEW.number) = '' THEN
    NEW.number := CASE NEW.kind
      WHEN 'quote' THEN 'DEV-' || nextval('public.sale_document_quote_seq')
      ELSE 'FAC-' || nextval('public.sale_document_invoice_seq')
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sale_documents_set_number ON public.sale_documents;
CREATE TRIGGER sale_documents_set_number
  BEFORE INSERT ON public.sale_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sale_documents_set_number();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Les montants, posés par la base
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Pose sous-total, remise, TVA et total. C'est LE seul endroit où ces montants
 * s'écrivent.
 *
 * Le sous-total est relu des lignes et non repris de `NEW` : la politique RLS
 * autorise le navigateur à modifier le document, il pourrait donc sinon annoncer un
 * sous-total sans rapport avec les lignes imprimées juste en dessous — et cette
 * facture-là créerait une vente d'un montant que rien ne justifie.
 *
 * BEFORE trigger, en place : aucune écriture supplémentaire, donc aucune récursion
 * possible avec le recalcul déclenché par les lignes.
 */
CREATE OR REPLACE FUNCTION public.sale_documents_compute_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_taxable numeric;
BEGIN
  NEW.subtotal := round(
    COALESCE(
      (SELECT sum(l.total) FROM public.sale_document_lines l WHERE l.document_id = NEW.id),
      0
    ),
    2
  );

  NEW.discount := CASE
    WHEN NEW.discount_kind = 'percent'
      THEN round(NEW.subtotal * LEAST(COALESCE(NEW.discount_value, 0), 100) / 100, 2)
    ELSE LEAST(round(COALESCE(NEW.discount_value, 0), 2), NEW.subtotal)
  END;

  v_taxable := GREATEST(0, NEW.subtotal - NEW.discount);
  NEW.tax := round(v_taxable * COALESCE(NEW.tax_rate, 0) / 100, 2);
  NEW.total := v_taxable + NEW.tax;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sale_documents_compute_totals ON public.sale_documents;
CREATE TRIGGER sale_documents_compute_totals
  BEFORE INSERT OR UPDATE ON public.sale_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sale_documents_compute_totals();

/**
 * Toute écriture de ligne réveille le document : le simple `updated_at` suffit à
 * déclencher `sale_documents_compute_totals`, qui relit les lignes et repose les
 * montants. Le calcul n'est donc écrit qu'à un seul endroit.
 */
CREATE OR REPLACE FUNCTION public.sale_document_lines_refresh_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_doc uuid := COALESCE(NEW.document_id, OLD.document_id);
BEGIN
  UPDATE public.sale_documents d
  SET updated_at = now()
  WHERE d.id = v_doc;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sale_document_lines_refresh_parent ON public.sale_document_lines;
CREATE TRIGGER sale_document_lines_refresh_parent
  AFTER INSERT OR UPDATE OR DELETE ON public.sale_document_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.sale_document_lines_refresh_parent();

/**
 * Un document figé ne se retouche plus.
 *
 * Une facture émise a créé une vente et sorti du stock ; un devis converti a donné
 * naissance à une facture. Les rouvrir à l'édition ferait diverger le papier remis au
 * client et ce que dit la base — précisément ce qu'un document commercial doit
 * empêcher. Pour corriger, on annule et on refait : la trace reste.
 */
CREATE OR REPLACE FUNCTION public.sale_documents_guard_locked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_TABLE_NAME = 'sale_documents' THEN
    -- Le recalcul du sous-total (déclenché par les lignes) passe ici aussi : on ne
    -- bloque que les modifications qui changent VRAIMENT le document.
    IF TG_OP = 'UPDATE'
       AND OLD.status IN ('issued', 'converted', 'cancelled')
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND (NEW.subtotal, NEW.discount_kind, NEW.discount_value, NEW.tax_rate)
           IS DISTINCT FROM (OLD.subtotal, OLD.discount_kind, OLD.discount_value, OLD.tax_rate)
    THEN
      RAISE EXCEPTION 'Ce document est figé : il ne peut plus être modifié.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO v_status
  FROM public.sale_documents
  WHERE id = COALESCE(NEW.document_id, OLD.document_id);

  IF v_status IN ('issued', 'converted', 'cancelled') THEN
    RAISE EXCEPTION 'Ce document est figé : ses lignes ne peuvent plus être modifiées.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sale_documents_guard_locked ON public.sale_documents;
CREATE TRIGGER sale_documents_guard_locked
  BEFORE UPDATE ON public.sale_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sale_documents_guard_locked();

DROP TRIGGER IF EXISTS sale_document_lines_guard_locked ON public.sale_document_lines;
CREATE TRIGGER sale_document_lines_guard_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.sale_document_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.sale_documents_guard_locked();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sale_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_document_lines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_can_manage_sale_documents(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR public.user_is_company_owner(p_company_id)
      OR public.user_has_company_permission(p_company_id, 'sale_documents.manage');
$$;

DROP POLICY IF EXISTS "sale_documents_select" ON public.sale_documents;
CREATE POLICY "sale_documents_select" ON public.sale_documents FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "sale_documents_insert" ON public.sale_documents;
CREATE POLICY "sale_documents_insert" ON public.sale_documents FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.user_can_manage_sale_documents(company_id)
);

DROP POLICY IF EXISTS "sale_documents_update" ON public.sale_documents;
CREATE POLICY "sale_documents_update" ON public.sale_documents FOR UPDATE USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.user_can_manage_sale_documents(company_id)
) WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- Suppression : réservée au propriétaire, et jamais sur un document qui a produit une
-- vente. Un numéro de facture émis ne doit pas disparaître d'une série.
DROP POLICY IF EXISTS "sale_documents_delete" ON public.sale_documents;
CREATE POLICY "sale_documents_delete" ON public.sale_documents FOR DELETE USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (public.is_super_admin() OR public.user_is_company_owner(company_id))
  AND sale_id IS NULL
  AND status <> 'converted'
);

DROP POLICY IF EXISTS "sale_document_lines_select" ON public.sale_document_lines;
CREATE POLICY "sale_document_lines_select" ON public.sale_document_lines FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "sale_document_lines_write" ON public.sale_document_lines;
CREATE POLICY "sale_document_lines_write" ON public.sale_document_lines FOR ALL USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.user_can_manage_sale_documents(company_id)
) WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.user_can_manage_sale_documents(company_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Garde d'accès partagée par les RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sale_document_require_access(p_document_id uuid)
RETURNS public.sale_documents
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.sale_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM public.sale_documents WHERE id = p_document_id;
  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Document introuvable';
  END IF;
  IF NOT (v_doc.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise non autorisée';
  END IF;
  IF NOT public.user_can_manage_sale_documents(v_doc.company_id) THEN
    RAISE EXCEPTION 'Accès refusé : droit « Gérer les devis et factures » requis';
  END IF;
  RETURN v_doc;
END;
$$;

REVOKE ALL ON FUNCTION public.sale_document_require_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sale_document_require_access(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Devis → facture
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforme un devis accepté en facture : nouveau document, nouveau numéro, mêmes
 * lignes, mêmes prix, même remise.
 *
 * Le devis n'est pas effacé : il passe en `converted` et pointe vers sa facture. Six
 * mois plus tard, quand le client contestera un prix, le commerçant pourra montrer le
 * devis d'origine — c'est tout l'intérêt d'avoir écrit la proposition.
 *
 * Les prix sont RECOPIÉS, pas relus du catalogue : un devis est un engagement de prix.
 * Si le fournisseur a augmenté entre-temps, c'est au commerçant de décider — pas au
 * logiciel de modifier en silence ce qu'il a promis par écrit.
 */
CREATE OR REPLACE FUNCTION public.sale_document_convert_to_invoice(p_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.sale_documents%ROWTYPE;
  v_new_id uuid;
BEGIN
  v_doc := public.sale_document_require_access(p_document_id);

  IF v_doc.kind <> 'quote' THEN
    RAISE EXCEPTION 'Seul un devis peut être transformé en facture';
  END IF;
  IF v_doc.status = 'converted' THEN
    RAISE EXCEPTION 'Ce devis a déjà été transformé en facture';
  END IF;
  IF v_doc.status = 'cancelled' THEN
    RAISE EXCEPTION 'Un devis annulé ne peut pas être transformé en facture';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sale_document_lines WHERE document_id = p_document_id) THEN
    RAISE EXCEPTION 'Ce devis ne contient aucune ligne à facturer';
  END IF;

  INSERT INTO public.sale_documents (
    company_id, store_id, kind, status,
    customer_id, customer_name, customer_phone, customer_email, customer_address, customer_tax_id,
    subject, client_reference, issue_date, due_date,
    discount_kind, discount_value, tax_rate,
    notes, terms, source_document_id, created_by
  )
  VALUES (
    v_doc.company_id, v_doc.store_id, 'invoice', 'draft',
    v_doc.customer_id, v_doc.customer_name, v_doc.customer_phone, v_doc.customer_email,
    v_doc.customer_address, v_doc.customer_tax_id,
    v_doc.subject, v_doc.client_reference, CURRENT_DATE, NULL,
    v_doc.discount_kind, v_doc.discount_value, v_doc.tax_rate,
    v_doc.notes, v_doc.terms, v_doc.id, auth.uid()
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.sale_document_lines (
    company_id, document_id, product_id, label, description, unit,
    quantity, unit_price, discount_percent, position
  )
  SELECT v_doc.company_id, v_new_id, l.product_id, l.label, l.description, l.unit,
         l.quantity, l.unit_price, l.discount_percent, l.position
  FROM public.sale_document_lines l
  WHERE l.document_id = p_document_id
  ORDER BY l.position, l.created_at;

  UPDATE public.sale_documents
  SET status = 'converted',
      decided_at = COALESCE(decided_at, now())
  WHERE id = p_document_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.sale_document_convert_to_invoice IS
  'Devis accepté → facture brouillon (mêmes lignes, mêmes prix). Le devis est '
  'conservé en statut « converted » et pointe vers sa facture.';

REVOKE ALL ON FUNCTION public.sale_document_convert_to_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sale_document_convert_to_invoice(uuid) TO authenticated;

/** Duplique un document à l'identique (nouveau brouillon, nouveau numéro). */
CREATE OR REPLACE FUNCTION public.sale_document_duplicate(p_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.sale_documents%ROWTYPE;
  v_new_id uuid;
BEGIN
  v_doc := public.sale_document_require_access(p_document_id);

  INSERT INTO public.sale_documents (
    company_id, store_id, kind, status,
    customer_id, customer_name, customer_phone, customer_email, customer_address, customer_tax_id,
    subject, client_reference, issue_date, valid_until,
    discount_kind, discount_value, tax_rate,
    notes, terms, created_by
  )
  VALUES (
    v_doc.company_id, v_doc.store_id, v_doc.kind, 'draft',
    v_doc.customer_id, v_doc.customer_name, v_doc.customer_phone, v_doc.customer_email,
    v_doc.customer_address, v_doc.customer_tax_id,
    v_doc.subject, v_doc.client_reference, CURRENT_DATE,
    CASE WHEN v_doc.kind = 'quote' THEN CURRENT_DATE + 30 ELSE NULL END,
    v_doc.discount_kind, v_doc.discount_value, v_doc.tax_rate,
    v_doc.notes, v_doc.terms, auth.uid()
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.sale_document_lines (
    company_id, document_id, product_id, label, description, unit,
    quantity, unit_price, discount_percent, position
  )
  SELECT v_doc.company_id, v_new_id, l.product_id, l.label, l.description, l.unit,
         l.quantity, l.unit_price, l.discount_percent, l.position
  FROM public.sale_document_lines l
  WHERE l.document_id = p_document_id
  ORDER BY l.position, l.created_at;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sale_document_duplicate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sale_document_duplicate(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Émission : la facture devient une vente réelle
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Produit support des lignes de PRESTATION (sans fiche produit) d'une facture.
 * Créé une seule fois par entreprise, jamais déstocké — même principe que le produit
 * « Main-d'œuvre atelier » du module Réparations (00190).
 */
CREATE OR REPLACE FUNCTION public.sale_document_service_product_id(p_company_id uuid)
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
    AND name = 'Prestation facturée'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.products (company_id, name, unit, purchase_price, sale_price, stock_min, is_active)
  VALUES (p_company_id, 'Prestation facturée', 'u', 0, 0, 0, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sale_document_service_product_id(uuid) FROM PUBLIC;

/**
 * Émet une facture : crée la VENTE réelle correspondante.
 *
 * Calqué sur `bill_repair_order` (00190), donc sur `create_sale_with_stock` : mêmes
 * contrôles d'accès, même garde de stock, mêmes écritures (`sale_items`,
 * `stock_movements`, `sale_payments`). Sans règlement, la facture part entièrement à
 * crédit — exactement comme une vente en caisse.
 *
 * Le stock ne bouge QUE pour les lignes rattachées à un produit du catalogue : une
 * prestation ne se déstocke pas. Et il bouge AVANT toute écriture d'argent, pour que
 * l'insuffisance de stock annule la facture entière plutôt que de laisser une vente
 * à moitié écrite.
 */
CREATE OR REPLACE FUNCTION public.sale_document_issue(
  p_document_id uuid,
  p_payments jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.sale_documents%ROWTYPE;
  v_line public.sale_document_lines%ROWTYPE;
  v_sale_id uuid;
  v_sale_number text;
  v_service_product_id uuid;
  v_product_id uuid;
  v_row_count int;
  v_product_name text;
  v_paid numeric;
BEGIN
  v_doc := public.sale_document_require_access(p_document_id);

  IF v_doc.kind <> 'invoice' THEN
    RAISE EXCEPTION 'Un devis ne s''émet pas : transformez-le d''abord en facture';
  END IF;
  IF v_doc.sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cette facture a déjà été émise';
  END IF;
  IF v_doc.status = 'cancelled' THEN
    RAISE EXCEPTION 'Une facture annulée ne peut pas être émise';
  END IF;
  IF NOT public.has_store_access(v_doc.store_id, v_doc.company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sale_document_lines WHERE document_id = p_document_id) THEN
    RAISE EXCEPTION 'Cette facture ne contient aucune ligne';
  END IF;

  -- Un solde impayé sans fiche client serait une créance que personne ne peut
  -- relancer : mieux vaut refuser ici que découvrir le trou à la fin du mois.
  SELECT COALESCE(sum((elem->>'amount')::numeric), 0) INTO v_paid
  FROM jsonb_array_elements(COALESCE(p_payments, '[]'::jsonb)) AS elem;

  IF v_paid < v_doc.total AND v_doc.customer_id IS NULL THEN
    RAISE EXCEPTION 'Rattachez une fiche client : un solde à crédit doit pouvoir être relancé';
  END IF;

  -- 1. Stock : uniquement les lignes rattachées au catalogue, avant tout le reste.
  FOR v_line IN
    SELECT * FROM public.sale_document_lines
    WHERE document_id = p_document_id AND product_id IS NOT NULL
  LOOP
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
    WHERE store_id = v_doc.store_id
      AND product_id = v_line.product_id
      AND quantity >= v_line.quantity;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_line.product_id;
      RAISE EXCEPTION 'Stock insuffisant pour "%"', COALESCE(v_product_name, v_line.label);
    END IF;
  END LOOP;

  -- 2. La vente. Les montants viennent du DOCUMENT (posés par trigger), pas du client.
  v_sale_number := 'S-' || nextval('public.sale_number_seq');

  INSERT INTO public.sales (
    company_id, store_id, customer_id, sale_number, status,
    subtotal, discount, tax, total, created_by, sale_mode, document_type
  )
  VALUES (
    v_doc.company_id, v_doc.store_id, v_doc.customer_id, v_sale_number, 'completed',
    v_doc.subtotal, v_doc.discount, v_doc.tax, v_doc.total, auth.uid(),
    'invoice_pos'::public.sale_mode, 'a4_invoice'::public.document_type
  )
  RETURNING id INTO v_sale_id;

  -- 3. Lignes de vente (+ mouvements de stock pour les seules lignes catalogue).
  FOR v_line IN
    SELECT * FROM public.sale_document_lines
    WHERE document_id = p_document_id
    ORDER BY position, created_at
  LOOP
    IF v_line.product_id IS NOT NULL THEN
      -- Ligne du catalogue : quantité entière garantie par contrainte, donc reportée
      -- telle quelle. La remise de ligne devient une remise en valeur sur la vente.
      INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
      VALUES (
        v_sale_id, v_line.product_id, v_line.quantity, v_line.unit_price,
        round(v_line.quantity * v_line.unit_price * v_line.discount_percent / 100, 2),
        v_line.total
      );
    ELSE
      /*
       * Prestation : `sale_items.quantity` est un entier, et une prestation se facture
       * volontiers en 2,5 jours. Reporter 2,5 l'arrondirait à 3 et la vente afficherait
       * un prix unitaire qui ne redonne plus le total. On écrit donc « 1 × le montant
       * de la ligne » — exact au franc près, et lisible dans le détail de la vente.
       */
      IF v_service_product_id IS NULL THEN
        v_service_product_id := public.sale_document_service_product_id(v_doc.company_id);
      END IF;
      v_product_id := v_service_product_id;

      INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, discount, total)
      VALUES (v_sale_id, v_product_id, 1, v_line.total, 0, v_line.total);
    END IF;

    IF v_line.product_id IS NOT NULL THEN
      INSERT INTO public.stock_movements (
        store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes
      )
      VALUES (
        v_doc.store_id, v_line.product_id, 'sale_out', -v_line.quantity, 'sale', v_sale_id,
        auth.uid(), 'Facture ' || v_doc.number
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

  -- 5. Le document porte sa vente et se fige.
  UPDATE public.sale_documents
  SET sale_id = v_sale_id,
      status = 'issued',
      issued_at = now()
  WHERE id = p_document_id;

  RETURN v_sale_id;
END;
$$;

COMMENT ON FUNCTION public.sale_document_issue IS
  'Émet une facture : crée une vente réelle (CA, marge, crédit, rapports), déstocke '
  'les seules lignes rattachées au catalogue, puis fige le document.';

REVOKE ALL ON FUNCTION public.sale_document_issue(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sale_document_issue(uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Changements de statut
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Fait avancer un document dans son cycle de vie (envoyé, accepté, refusé, annulé).
 *
 * Passe par un RPC plutôt que par un UPDATE direct pour deux raisons : horodater le
 * geste (`sent_at`, `decided_at`) sans faire confiance à l'horloge du téléphone, et
 * refuser les transitions qui n'ont pas de sens (accepter une facture, émettre depuis
 * ici, ressusciter un document figé).
 */
CREATE OR REPLACE FUNCTION public.sale_document_set_status(
  p_document_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.sale_documents%ROWTYPE;
BEGIN
  v_doc := public.sale_document_require_access(p_document_id);

  IF v_doc.status IN ('issued', 'converted') THEN
    RAISE EXCEPTION 'Ce document est figé : son statut ne peut plus changer.';
  END IF;
  IF p_status IN ('issued', 'converted') THEN
    RAISE EXCEPTION 'Ce statut ne se pose pas à la main.';
  END IF;
  IF v_doc.kind = 'invoice' AND p_status IN ('accepted', 'refused', 'expired') THEN
    RAISE EXCEPTION 'Ce statut ne concerne que les devis.';
  END IF;

  UPDATE public.sale_documents
  SET status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN COALESCE(sent_at, now()) ELSE sent_at END,
      decided_at = CASE
        WHEN p_status IN ('accepted', 'refused') THEN now()
        ELSE decided_at
      END
  WHERE id = p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sale_document_set_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sale_document_set_status(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Lecture : la liste, avec ce qui a réellement été encaissé
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Liste des documents d'une entreprise (ou d'une boutique), lignes comprises.
 *
 * Un seul aller-retour, et surtout : `paid_amount` vient des règlements de la VENTE,
 * pas d'une colonne recopiée sur le document. Un acompte encaissé plus tard depuis la
 * page Crédit se voit donc immédiatement ici, sans synchronisation à écrire.
 *
 * Paginé (`p_limit` / `p_offset`) : la règle des 1000 lignes de PostgREST s'applique
 * aussi à un RPC, et une entreprise qui facture tous les jours la dépasse en un an.
 */
CREATE OR REPLACE FUNCTION public.sale_documents_list(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  store_id uuid,
  kind text,
  number text,
  status text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_address text,
  customer_tax_id text,
  subject text,
  client_reference text,
  issue_date date,
  valid_until date,
  due_date date,
  subtotal numeric,
  discount_kind text,
  discount_value numeric,
  discount numeric,
  tax_rate numeric,
  tax numeric,
  total numeric,
  notes text,
  terms text,
  source_document_id uuid,
  source_document_number text,
  converted_document_id uuid,
  converted_document_number text,
  sale_id uuid,
  sale_number text,
  paid_amount numeric,
  sent_at timestamptz,
  decided_at timestamptz,
  issued_at timestamptz,
  created_at timestamptz,
  author_name text,
  items jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id, d.company_id, d.store_id, d.kind, d.number, d.status,
    d.customer_id, d.customer_name, d.customer_phone, d.customer_email,
    d.customer_address, d.customer_tax_id,
    d.subject, d.client_reference,
    d.issue_date, d.valid_until, d.due_date,
    d.subtotal, d.discount_kind, d.discount_value, d.discount,
    d.tax_rate, d.tax, d.total,
    d.notes, d.terms,
    d.source_document_id, src.number,
    conv.id, conv.number,
    d.sale_id, s.sale_number,
    COALESCE(pay.paid, 0),
    d.sent_at, d.decided_at, d.issued_at, d.created_at,
    pr.full_name,
    COALESCE(li.items, '[]'::jsonb)
  FROM public.sale_documents d
  LEFT JOIN public.sale_documents src ON src.id = d.source_document_id
  LEFT JOIN public.sale_documents conv
    ON conv.source_document_id = d.id AND d.kind = 'quote'
  LEFT JOIN public.sales s ON s.id = d.sale_id
  LEFT JOIN public.profiles pr ON pr.id = d.created_by
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(p.amount), 0) AS paid
    FROM public.sale_payments p
    WHERE p.sale_id = d.sale_id
  ) pay ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'id', l.id,
               'product_id', l.product_id,
               'label', l.label,
               'description', l.description,
               'unit', l.unit,
               'quantity', l.quantity,
               'unit_price', l.unit_price,
               'discount_percent', l.discount_percent,
               'total', l.total,
               'position', l.position
             ) ORDER BY l.position, l.created_at
           ) AS items
    FROM public.sale_document_lines l
    WHERE l.document_id = d.id
  ) li ON true
  WHERE d.company_id = p_company_id
    AND (public.is_super_admin()
         OR p_company_id IN (SELECT * FROM public.current_user_company_ids()))
    AND (p_store_id IS NULL OR d.store_id = p_store_id)
    AND (p_kind IS NULL OR d.kind = p_kind)
  ORDER BY d.issue_date DESC, d.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 100), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.sale_documents_list(uuid, uuid, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sale_documents_list(uuid, uuid, text, int, int) TO authenticated;

/**
 * Données du PDF, relues de la base.
 *
 * Le navigateur n'envoie que l'identifiant : lignes, montants et en-tête viennent
 * d'ici. Un document imprimé ne peut donc pas afficher un total que la base ne
 * reconnaît pas — même en trafiquant la requête.
 */
CREATE OR REPLACE FUNCTION public.sale_document_pdf_data(p_document_id uuid)
RETURNS TABLE (
  document_id uuid,
  kind text,
  number text,
  status text,
  issue_date date,
  valid_until date,
  due_date date,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_address text,
  customer_tax_id text,
  subject text,
  client_reference text,
  subtotal numeric,
  discount numeric,
  tax_rate numeric,
  tax numeric,
  total numeric,
  paid_amount numeric,
  notes text,
  terms text,
  source_document_number text,
  company_name text,
  store_name text,
  store_address text,
  store_phone text,
  store_logo_url text,
  store_slogan text,
  store_activity text,
  store_footer_text text,
  store_legal_info text,
  store_tax_number text,
  store_payment_terms text,
  store_primary_color text,
  store_currency text,
  signer_title text,
  signer_name text,
  author_name text,
  items jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.sale_documents%ROWTYPE;
BEGIN
  v_doc := public.sale_document_require_access(p_document_id);

  RETURN QUERY
  SELECT
    d.id, d.kind, d.number, d.status,
    d.issue_date, d.valid_until, d.due_date,
    d.customer_name, d.customer_phone, d.customer_email, d.customer_address, d.customer_tax_id,
    d.subject, d.client_reference,
    d.subtotal, d.discount, d.tax_rate, d.tax, d.total,
    COALESCE(pay.paid_sum, 0),
    d.notes, d.terms,
    src.number,
    c.name, st.name, st.address, st.phone, st.logo_url,
    st.slogan, st.activity, st.footer_text, st.legal_info, st.tax_number,
    st.payment_terms, st.primary_color, st.currency,
    st.invoice_signer_title, st.invoice_signer_name,
    pr.full_name,
    COALESCE(li.agg_items, '[]'::jsonb)
  FROM public.sale_documents d
  JOIN public.companies c ON c.id = d.company_id
  JOIN public.stores st ON st.id = d.store_id
  LEFT JOIN public.sale_documents src ON src.id = d.source_document_id
  LEFT JOIN public.profiles pr ON pr.id = d.created_by
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(p.amount), 0) AS paid_sum
    FROM public.sale_payments p WHERE p.sale_id = d.sale_id
  ) pay ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'label', l.label,
               'description', l.description,
               'unit', l.unit,
               'quantity', l.quantity,
               'unit_price', l.unit_price,
               'discount_percent', l.discount_percent,
               'total', l.total
             ) ORDER BY l.position, l.created_at
           ) AS agg_items
    FROM public.sale_document_lines l WHERE l.document_id = d.id
  ) li ON true
  WHERE d.id = v_doc.id;
END;
$$;

REVOKE ALL ON FUNCTION public.sale_document_pdf_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sale_document_pdf_data(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. Devis périmés
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Marque « expiré » tout devis dont la date de validité est passée et qui attend
 * encore une réponse.
 *
 * Appelé à l'ouverture de la page. Le calcul se fait ici et non à l'affichage pour
 * que l'état soit le même partout (écran, PDF, futur écran mobile) : un devis
 * périmé n'est pas une nuance de présentation, c'est une proposition qui n'engage
 * plus le commerçant sur ses prix.
 */
CREATE OR REPLACE FUNCTION public.sale_documents_expire_due(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())
          OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise non autorisée';
  END IF;

  UPDATE public.sale_documents
  SET status = 'expired'
  WHERE company_id = p_company_id
    AND kind = 'quote'
    AND status IN ('draft', 'sent')
    AND valid_until IS NOT NULL
    AND valid_until < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sale_documents_expire_due(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sale_documents_expire_due(uuid) TO authenticated;
