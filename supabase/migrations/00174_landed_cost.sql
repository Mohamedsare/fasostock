-- FasoStock — Module « Prix de revient » : ce que la marchandise coûte VRAIMENT, une fois arrivée.
--
-- Problème : le commerçant paie sa facture fournisseur, puis le transport, puis la douane,
-- puis la manutention. Le prix marqué sur la facture n'est donc PAS son prix d'achat. Tant
-- que ces frais ne sont pas répartis sur chaque article, la marge affichée est fausse — et
-- il peut vendre à perte sans jamais le voir.
--
-- Deuxième problème, plus vicieux : les frais CHANGENT d'un arrivage à l'autre (carburant,
-- taux de douane, transporteur). Le même article ne revient donc pas au même prix qu'il y a
-- deux mois. Écraser bêtement le prix d'achat mélange l'ancien stock (payé moins cher) et le
-- nouveau (payé plus cher) : la marge du mois devient un mensonge.
--
-- Réponse du module — un ARRIVAGE (`cost_batches`) est une feuille de calcul complète :
--
--   1. `cost_batch_items`   — ce qu'on a commandé : produit, quantité, prix fournisseur.
--   2. `cost_batch_charges` — ce qui s'y ajoute : transport, douane, manutention, assurance…
--                             chaque frais choisit SA clé de répartition (à la valeur, à la
--                             quantité, au poids, au volume, ou à la main).
--   3. `cost_batch_compute` — LE calcul, côté serveur, source unique de vérité : frais
--                             répartis au franc près, coût de revient unitaire, coût retenu
--                             (moyenne pondérée avec l'ancien stock, ou dernier coût), marge
--                             appliquée, prix de vente conseillé arrondi.
--   4. `cost_batch_apply`   — l'application ATOMIQUE : entrée de stock (si l'arrivage n'a pas
--                             déjà été saisi dans Achats), mise à jour des prix, et surtout
--                             PHOTO de l'ancien prix (`prev_*` + `product_price_changes`) pour
--                             pouvoir revenir en arrière et pour savoir, plus tard, à quel
--                             coût telle période a été vendue.
--
-- « Ne pas confondre l'ancien stock et le nouveau » se joue au point 3 : par défaut le coût
-- retenu est la MOYENNE PONDÉRÉE (12 en stock à 1 200 F + 50 arrivés à 1 450 F ⇒ 1 402 F),
-- pas le dernier prix. Le commerçant voit les deux chiffres à l'écran et tranche lui-même.
--
-- Rien n'est écrasé en silence : tant qu'un arrivage est en `draft`, AUCUN prix ni stock ne
-- bouge. C'est une simulation. L'application est un acte explicite, réversible sur les prix.
--
-- Activation : DÉSACTIVÉ PAR DÉFAUT, ouvert par le PROPRIÉTAIRE dans Paramètres
-- (`companies.landed_cost_enabled`), comme les Emplacements (00167) et les Autres noms (00173).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drapeau d'activation (entreprise, réglé par le propriétaire)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS landed_cost_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.landed_cost_enabled IS
  'Module « Prix de revient » (répartition des frais d''approche sur les articles d''un '
  'arrivage). Désactivé par défaut, activé par le PROPRIÉTAIRE dans Paramètres '
  '(RPC company_set_landed_cost_enabled).';

-- Garde des drapeaux propriétaire posé en 00167, étendu en 00173 : on lui ajoute ce
-- troisième drapeau — même règle, même endroit, aucune duplication de trigger.
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_owner_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_owner_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.companies_enforce_owner_flags();

CREATE OR REPLACE FUNCTION public.company_set_landed_cost_enabled(
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
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver le module Prix de revient.';
  END IF;
  UPDATE public.companies
  SET landed_cost_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.company_set_landed_cost_enabled(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Permission dédiée (owner par défaut, accordable à un employé)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key)
VALUES (uuid_generate_v4(), 'landed_cost.manage')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cost_batches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  /** Nom parlant donné par le commerçant : « Conteneur Lomé février ». */
  label text NOT NULL DEFAULT '',
  /** Référence fournisseur / n° de facture. */
  reference text,

  /**
   * `draft`   — simulation pure : ni stock ni prix touchés, on peut tout changer.
   * `applied` — prix (et éventuellement stock) appliqués, photo de l'ancien conservée.
   * `cancelled` — abandonné ; conservé pour l'historique, plus modifiable.
   */
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'cancelled')),

  /**
   * `receive`      — l'arrivage n'a pas été saisi ailleurs : c'est LUI qui entre le stock.
   * `prices_only`  — le stock est déjà entré (module Achats, inventaire) : on ne recalcule
   *                  QUE les prix. Évite tout double comptage de quantités.
   */
  stock_mode text NOT NULL DEFAULT 'receive'
    CHECK (stock_mode IN ('receive', 'prices_only')),

  /**
   * Coût retenu comme nouveau prix d'achat du catalogue :
   * `weighted_average` — moyenne pondérée ancien stock + arrivage (défaut, honnête) ;
   * `last_cost`        — coût de revient du seul arrivage (le stock ancien est ignoré).
   */
  costing_method text NOT NULL DEFAULT 'weighted_average'
    CHECK (costing_method IN ('weighted_average', 'last_cost')),

  /** Clé de répartition par défaut des frais (chaque frais peut en choisir une autre). */
  allocation_method text NOT NULL DEFAULT 'value'
    CHECK (allocation_method IN ('value', 'quantity', 'weight', 'volume', 'manual')),

  /** Achat en devise (Ghana, Togo, Chine…) : montants saisis en `currency_code`, convertis par `exchange_rate`. */
  currency_code text NOT NULL DEFAULT 'XOF',
  exchange_rate numeric(18,6) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),

  /** Arrondi commercial du prix de vente conseillé (0 = aucun ; 5, 25, 50, 100, 500 F). */
  rounding int NOT NULL DEFAULT 0 CHECK (rounding >= 0 AND rounding <= 10000),

  /** Marge par défaut du lot ; chaque ligne peut la surcharger. */
  margin_mode text NOT NULL DEFAULT 'markup_percent'
    CHECK (margin_mode IN ('markup_percent', 'margin_percent', 'amount', 'fixed_price')),
  margin_value numeric(18,4) NOT NULL DEFAULT 0,

  ordered_at date,
  received_at date,
  notes text,

  applied_at timestamptz,
  applied_by uuid REFERENCES auth.users(id),
  /** Non nul si les prix appliqués ont été remis à leur valeur d'avant. */
  prices_reverted_at timestamptz,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.cost_batches IS
  'Arrivage fournisseur : marchandise + frais d''approche. En `draft` c''est une simulation '
  '(rien n''est touché) ; `cost_batch_apply` l''applique de façon atomique.';
CREATE INDEX IF NOT EXISTS idx_cost_batches_company ON public.cost_batches(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_batches_store ON public.cost_batches(store_id);
CREATE INDEX IF NOT EXISTS idx_cost_batches_supplier ON public.cost_batches(supplier_id);

CREATE TABLE IF NOT EXISTS public.cost_batch_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.cost_batches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,

  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  /** Prix fournisseur unitaire, DANS LA DEVISE DU LOT (hors frais). */
  unit_price numeric(18,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),

  /** Bases de répartition facultatives (renseignées seulement si un frais s'y réfère). */
  weight_kg numeric(18,3) CHECK (weight_kg IS NULL OR weight_kg >= 0),
  volume_m3 numeric(18,4) CHECK (volume_m3 IS NULL OR volume_m3 >= 0),
  /** Clé manuelle (poids relatif choisi à la main) pour la répartition `manual`. */
  manual_share numeric(18,4) CHECK (manual_share IS NULL OR manual_share >= 0),

  /** Marge de la ligne — NULL = celle du lot. */
  margin_mode text CHECK (margin_mode IS NULL OR margin_mode IN ('markup_percent', 'margin_percent', 'amount', 'fixed_price')),
  margin_value numeric(18,4),

  /** Le commerçant peut refuser de toucher au prix de vente de CETTE ligne. */
  apply_sale_price boolean NOT NULL DEFAULT true,

  /** Photo prise au moment de `cost_batch_apply` — permet le retour en arrière. */
  prev_purchase_price numeric(18,4),
  prev_sale_price numeric(18,4),
  prev_quantity numeric(18,3),
  applied_purchase_price numeric(18,4),
  applied_sale_price numeric(18,4),

  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, product_id)
);
COMMENT ON TABLE public.cost_batch_items IS
  'Ligne d''arrivage : produit commandé, quantité, prix fournisseur, et marge souhaitée. '
  'Les colonnes `prev_*` gardent la photo des prix d''avant l''application.';
CREATE INDEX IF NOT EXISTS idx_cost_batch_items_batch ON public.cost_batch_items(batch_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cost_batch_items_product ON public.cost_batch_items(product_id);

CREATE TABLE IF NOT EXISTS public.cost_batch_charges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.cost_batches(id) ON DELETE CASCADE,

  label text NOT NULL,
  /** Nature du frais — sert aux libellés, aux icônes et plus tard à la comptabilité. */
  kind text NOT NULL DEFAULT 'autre'
    CHECK (kind IN ('transport', 'douane', 'manutention', 'assurance', 'taxe', 'magasinage', 'commission', 'emballage', 'autre')),
  /** Montant DANS LA DEVISE DU LOT. */
  amount numeric(18,4) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  /** Clé de répartition propre au frais — NULL = celle du lot. */
  allocation_method text
    CHECK (allocation_method IS NULL OR allocation_method IN ('value', 'quantity', 'weight', 'volume', 'manual')),

  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.cost_batch_charges IS
  'Frais d''approche d''un arrivage (transport, douane, manutention…). Chaque frais peut '
  'avoir sa propre clé de répartition : la douane à la valeur, le camion au poids.';
CREATE INDEX IF NOT EXISTS idx_cost_batch_charges_batch ON public.cost_batch_charges(batch_id, sort_order);

-- Rattrapage : une première version de cette migration nommait la colonne `position`,
-- refusée par PostgreSQL comme paramètre de sortie de fonction (mot réservé). Si les
-- tables ont été créées avant l'échec, on renomme au lieu de laisser deux colonnes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cost_batch_items' AND column_name = 'position'
  ) THEN
    ALTER TABLE public.cost_batch_items RENAME COLUMN "position" TO sort_order;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cost_batch_charges' AND column_name = 'position'
  ) THEN
    ALTER TABLE public.cost_batch_charges RENAME COLUMN "position" TO sort_order;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.product_price_changes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  /** Boutique de l'arrivage à l'origine du changement (les prix, eux, restent au catalogue). */
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.cost_batches(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'cost_batch'
    CHECK (source IN ('cost_batch', 'cost_batch_revert')),
  old_purchase_price numeric(18,4),
  new_purchase_price numeric(18,4),
  old_sale_price numeric(18,4),
  new_sale_price numeric(18,4),
  /** Stock détenu au moment du changement — pour relire l'historique sans le réinventer. */
  stock_at_change numeric(18,3),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.product_price_changes IS
  'Journal des changements de prix d''un produit : qui, quand, depuis quel arrivage, et '
  'quelle était la valeur d''avant. C''est ce qui permet de ne pas confondre l''ancien '
  'stock et le nouveau quand on relit une marge passée.';
CREATE INDEX IF NOT EXISTS idx_product_price_changes_product
  ON public.product_price_changes(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_price_changes_batch
  ON public.product_price_changes(batch_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.cost_batches;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cost_batches
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.cost_batch_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cost_batch_items
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.cost_batch_charges;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cost_batch_charges
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — lecture par les membres de l'entreprise, écriture par RPC uniquement
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cost_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_batch_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_price_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_batches_select" ON public.cost_batches;
CREATE POLICY "cost_batches_select" ON public.cost_batches FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "cost_batch_items_select" ON public.cost_batch_items;
CREATE POLICY "cost_batch_items_select" ON public.cost_batch_items FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "cost_batch_charges_select" ON public.cost_batch_charges;
CREATE POLICY "cost_batch_charges_select" ON public.cost_batch_charges FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "product_price_changes_select" ON public.product_price_changes;
CREATE POLICY "product_price_changes_select" ON public.product_price_changes FOR SELECT USING (
  is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Gardes communes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.landed_cost_module_enabled(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT c.landed_cost_enabled FROM public.companies c WHERE c.id = p_company_id),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION public.landed_cost_module_enabled(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_landed_cost(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_company_owner(p_company_id)
     OR ('landed_cost.manage' = ANY(public.get_my_permission_keys(p_company_id)));
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_landed_cost(uuid) TO authenticated;

/** Boutique → entreprise, après vérification : appartenance, module ouvert, droit. */
CREATE OR REPLACE FUNCTION public.landed_cost_guard_store(p_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  SELECT s.company_id INTO v_company FROM public.stores s WHERE s.id = p_store_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Boutique introuvable'; END IF;
  IF NOT (v_company IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Boutique non autorisée';
  END IF;
  IF NOT public.landed_cost_module_enabled(v_company) THEN
    RAISE EXCEPTION 'Le module Prix de revient n''est pas activé pour cette entreprise.';
  END IF;
  IF NOT public.can_manage_landed_cost(v_company) THEN
    RAISE EXCEPTION 'Droit insuffisant pour gérer les arrivages et les prix de revient.';
  END IF;
  RETURN v_company;
END;
$$;
GRANT EXECUTE ON FUNCTION public.landed_cost_guard_store(uuid) TO authenticated;

/** Même garde, à partir d'un arrivage. `p_require_draft` refuse de modifier un lot appliqué. */
CREATE OR REPLACE FUNCTION public.landed_cost_guard_batch(
  p_batch_id uuid,
  p_require_draft boolean DEFAULT true
)
RETURNS public.cost_batches
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cost_batches;
BEGIN
  SELECT * INTO v_batch FROM public.cost_batches WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN RAISE EXCEPTION 'Arrivage introuvable.'; END IF;
  PERFORM public.landed_cost_guard_store(v_batch.store_id);
  IF COALESCE(p_require_draft, true) AND v_batch.status <> 'draft' THEN
    RAISE EXCEPTION 'Cet arrivage est % : il n''est plus modifiable.',
      CASE v_batch.status WHEN 'applied' THEN 'déjà appliqué' ELSE 'annulé' END;
  END IF;
  RETURN v_batch;
END;
$$;
GRANT EXECUTE ON FUNCTION public.landed_cost_guard_batch(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Outils de calcul
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Arrondi commercial. `p_step = 0` → au franc près (2 décimales conservées pour les
 * coûts) ; sinon au multiple le plus proche (5, 25, 50, 100, 500 F — les pièces réelles).
 */
CREATE OR REPLACE FUNCTION public.landed_cost_round(p_value numeric, p_step int)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    WHEN COALESCE(p_step, 0) <= 0 THEN round(p_value, 2)
    ELSE round(p_value / p_step) * p_step
  END;
$$;

/**
 * Prix de vente à partir d'un coût et d'une marge.
 *   markup_percent — coût majoré de X %          (« j'ajoute 25 % »)
 *   margin_percent — X % du PRIX DE VENTE        (« je veux 25 % de marque »)
 *   amount         — coût + X francs
 *   fixed_price    — prix imposé, la marge suit
 * Une marque ≥ 100 % est mathématiquement impossible : on la ramène à 99,99 % plutôt
 * que de lever une exception au milieu d'un calcul de tableau.
 */
CREATE OR REPLACE FUNCTION public.landed_cost_sale_price(
  p_cost numeric,
  p_mode text,
  p_value numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(p_mode, 'markup_percent')
    WHEN 'markup_percent' THEN COALESCE(p_cost, 0) * (1 + COALESCE(p_value, 0) / 100.0)
    WHEN 'margin_percent' THEN
      COALESCE(p_cost, 0) / (1 - LEAST(GREATEST(COALESCE(p_value, 0), -1000), 99.99) / 100.0)
    WHEN 'amount' THEN COALESCE(p_cost, 0) + COALESCE(p_value, 0)
    WHEN 'fixed_price' THEN GREATEST(COALESCE(p_value, 0), 0)
    ELSE COALESCE(p_cost, 0)
  END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. LE calcul — source unique de vérité (écran ET application)
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Détail chiffré d'un arrivage, ligne par ligne. L'écran l'affiche, `cost_batch_apply`
 * l'exécute : impossible que ce qui est validé diffère de ce qui était montré.
 *
 * Répartition des frais — chaque frais choisit sa clé (valeur d'achat, quantité, poids,
 * volume, clé manuelle) :
 *   • si la base demandée est vide (poids jamais saisis, par exemple), on retombe sur la
 *     quantité, puis sur un partage égal — un frais n'est JAMAIS perdu ni jeté au hasard ;
 *   • le reste d'arrondi va à la ligne la plus grosse, pour que la somme répartie égale
 *     le total des frais au centime près. Sinon le pied de tableau mentirait.
 *
 * Coût retenu (`retained_cost`) = ce qui deviendra le prix d'achat du catalogue :
 * moyenne pondérée avec le stock déjà détenu (défaut), ou coût du seul arrivage.
 * Les deux chiffres sont renvoyés : l'écran montre l'écart, le commerçant tranche.
 */
CREATE OR REPLACE FUNCTION public.cost_batch_compute(p_batch_id uuid)
RETURNS TABLE (
  item_id uuid,
  product_id uuid,
  product_name text,
  unit text,
  sort_order int,
  quantity numeric,
  /** Prix fournisseur unitaire converti en CFA. */
  unit_price numeric,
  goods_total numeric,
  allocated_charges numeric,
  landed_total numeric,
  /** Coût de revient unitaire de CET arrivage (marchandise + frais répartis). */
  unit_landed_cost numeric,
  /** Stock déjà détenu (toutes boutiques de l'entreprise) avant l'arrivage. */
  stock_before numeric,
  current_purchase_price numeric,
  current_sale_price numeric,
  /** Coût moyen pondéré ancien stock + arrivage — renvoyé même en mode `last_cost`. */
  weighted_cost numeric,
  /** Coût effectivement retenu comme nouveau prix d'achat (selon `costing_method`). */
  retained_cost numeric,
  margin_mode text,
  margin_value numeric,
  suggested_sale_price numeric,
  /** Marge unitaire en francs, et en % du prix de vente conseillé (taux de marque). */
  margin_amount numeric,
  margin_rate numeric,
  apply_sale_price boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cost_batches;
  v_rate numeric;
BEGIN
  SELECT * INTO v_batch FROM public.cost_batches WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN RAISE EXCEPTION 'Arrivage introuvable.'; END IF;
  IF NOT public.is_super_admin()
     AND NOT (v_batch.company_id IN (SELECT * FROM public.current_user_company_ids()))
  THEN
    RAISE EXCEPTION 'Arrivage non autorisé.';
  END IF;

  v_rate := COALESCE(v_batch.exchange_rate, 1);

  RETURN QUERY
  WITH items AS (
    SELECT
      i.id,
      i.product_id AS pid,
      p.name AS pname,
      COALESCE(p.unit, 'pce') AS punit,
      i.sort_order AS pos,
      i.quantity AS qty,
      round(i.unit_price * v_rate, 4) AS unit_price_cfa,
      round(i.quantity * i.unit_price * v_rate, 4) AS goods,
      COALESCE(i.weight_kg, 0) * i.quantity AS weight_base,
      COALESCE(i.volume_m3, 0) * i.quantity AS volume_base,
      COALESCE(i.manual_share, 0) AS manual_base,
      COALESCE(p.purchase_price, 0) AS cur_purchase,
      COALESCE(p.sale_price, 0) AS cur_sale,
      COALESCE(i.margin_mode, v_batch.margin_mode) AS m_mode,
      COALESCE(i.margin_value, v_batch.margin_value) AS m_value,
      i.apply_sale_price AS apply_sale,
      COALESCE((
        SELECT sum(si.quantity)
        FROM public.store_inventory si
        JOIN public.stores s ON s.id = si.store_id
        WHERE si.product_id = i.product_id AND s.company_id = v_batch.company_id
      ), 0)::numeric AS stock_now
    FROM public.cost_batch_items i
    JOIN public.products p ON p.id = i.product_id
    WHERE i.batch_id = p_batch_id
  ),
  -- Bases totales, une fois pour toutes : elles servent de dénominateur ET de test
  -- pour savoir si la clé demandée est exploitable.
  totals AS (
    SELECT
      COALESCE(sum(goods), 0) AS t_value,
      COALESCE(sum(qty), 0) AS t_qty,
      COALESCE(sum(weight_base), 0) AS t_weight,
      COALESCE(sum(volume_base), 0) AS t_volume,
      COALESCE(sum(manual_base), 0) AS t_manual,
      count(*)::numeric AS t_count
    FROM items
  ),
  -- Clé RÉELLEMENT appliquée à chaque frais, après repli éventuel.
  charges AS (
    SELECT
      c.id,
      c.amount * v_rate AS amount_cfa,
      CASE
        WHEN COALESCE(c.allocation_method, v_batch.allocation_method) = 'value'
             AND t.t_value > 0 THEN 'value'
        WHEN COALESCE(c.allocation_method, v_batch.allocation_method) = 'quantity'
             AND t.t_qty > 0 THEN 'quantity'
        WHEN COALESCE(c.allocation_method, v_batch.allocation_method) = 'weight'
             AND t.t_weight > 0 THEN 'weight'
        WHEN COALESCE(c.allocation_method, v_batch.allocation_method) = 'volume'
             AND t.t_volume > 0 THEN 'volume'
        WHEN COALESCE(c.allocation_method, v_batch.allocation_method) = 'manual'
             AND t.t_manual > 0 THEN 'manual'
        WHEN t.t_qty > 0 THEN 'quantity'
        ELSE 'equal'
      END AS eff_method
    FROM public.cost_batch_charges c
    CROSS JOIN totals t
    WHERE c.batch_id = p_batch_id AND c.amount > 0
  ),
  allocated AS (
    SELECT
      i.id AS item_id,
      COALESCE(round(sum(
        c.amount_cfa
        * CASE c.eff_method
            WHEN 'value'    THEN i.goods
            WHEN 'quantity' THEN i.qty
            WHEN 'weight'   THEN i.weight_base
            WHEN 'volume'   THEN i.volume_base
            WHEN 'manual'   THEN i.manual_base
            ELSE 1
          END
        / NULLIF(CASE c.eff_method
            WHEN 'value'    THEN t.t_value
            WHEN 'quantity' THEN t.t_qty
            WHEN 'weight'   THEN t.t_weight
            WHEN 'volume'   THEN t.t_volume
            WHEN 'manual'   THEN t.t_manual
            ELSE t.t_count
          END, 0)
      ), 4), 0) AS charges_share
    FROM items i
    LEFT JOIN charges c ON true
    CROSS JOIN totals t
    GROUP BY i.id
  ),
  -- Écart d'arrondi : donné à la ligne la plus grosse, pour que la somme répartie
  -- soit exactement le total des frais.
  charges_total AS (
    SELECT round(COALESCE(sum(amount_cfa), 0), 4) AS total FROM charges
  ),
  fix AS (
    SELECT
      (SELECT ct.total FROM charges_total ct)
        - COALESCE((SELECT sum(a.charges_share) FROM allocated a), 0) AS delta,
      (SELECT i.id FROM items i ORDER BY i.goods DESC, i.id LIMIT 1) AS top_item
  ),
  base AS (
    SELECT
      i.*,
      a.charges_share + CASE WHEN i.id = f.top_item THEN f.delta ELSE 0 END AS alloc
    FROM items i
    JOIN allocated a ON a.item_id = i.id
    CROSS JOIN fix f
  ),
  costed AS (
    SELECT
      b.*,
      (b.goods + b.alloc) AS landed,
      CASE WHEN b.qty > 0 THEN round((b.goods + b.alloc) / b.qty, 4) ELSE 0 END AS unit_cost
    FROM base b
  ),
  weighted AS (
    SELECT
      c.*,
      -- (ancien stock × ancien coût + coût total de l'arrivage) / total des unités.
      CASE
        WHEN c.stock_now > 0 AND c.cur_purchase > 0
          THEN round(
            (c.stock_now * c.cur_purchase + c.landed) / NULLIF(c.stock_now + c.qty, 0), 4)
        ELSE c.unit_cost
      END AS wac
    FROM costed c
  ),
  retained AS (
    SELECT
      w.*,
      CASE WHEN v_batch.costing_method = 'weighted_average' THEN w.wac ELSE w.unit_cost END
        AS cost_kept
    FROM weighted w
  ),
  priced AS (
    SELECT
      r.*,
      GREATEST(public.landed_cost_round(
        public.landed_cost_sale_price(r.cost_kept, r.m_mode, r.m_value),
        v_batch.rounding
      ), 0) AS sale
    FROM retained r
  )
  SELECT
    pr.id,
    pr.pid,
    pr.pname,
    pr.punit,
    pr.pos,
    pr.qty,
    pr.unit_price_cfa,
    pr.goods,
    pr.alloc,
    pr.landed,
    pr.unit_cost,
    pr.stock_now,
    pr.cur_purchase,
    pr.cur_sale,
    pr.wac,
    pr.cost_kept,
    pr.m_mode,
    pr.m_value,
    pr.sale,
    round(pr.sale - pr.cost_kept, 2),
    CASE WHEN pr.sale > 0 THEN round((pr.sale - pr.cost_kept) / pr.sale * 100, 2) ELSE 0 END,
    pr.apply_sale
  FROM priced pr
  ORDER BY pr.pos, pr.pname;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_compute(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Écriture — arrivage
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cost_batch_save(
  p_id uuid,
  p_store_id uuid,
  p_supplier_id uuid,
  p_label text,
  p_reference text,
  p_stock_mode text,
  p_costing_method text,
  p_allocation_method text,
  p_currency_code text,
  p_exchange_rate numeric,
  p_rounding int,
  p_margin_mode text,
  p_margin_value numeric,
  p_ordered_at date,
  p_received_at date,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.landed_cost_guard_store(p_store_id);
  v_id uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    PERFORM public.landed_cost_guard_batch(p_id, true);
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Fournisseur introuvable dans cette entreprise.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.cost_batches (
      company_id, store_id, supplier_id, label, reference, stock_mode, costing_method,
      allocation_method, currency_code, exchange_rate, rounding, margin_mode, margin_value,
      ordered_at, received_at, notes, created_by
    ) VALUES (
      v_company, p_store_id, p_supplier_id,
      COALESCE(NULLIF(btrim(p_label), ''), 'Arrivage du ' || to_char(now(), 'DD/MM/YYYY')),
      NULLIF(btrim(p_reference), ''),
      COALESCE(NULLIF(btrim(p_stock_mode), ''), 'receive'),
      COALESCE(NULLIF(btrim(p_costing_method), ''), 'weighted_average'),
      COALESCE(NULLIF(btrim(p_allocation_method), ''), 'value'),
      COALESCE(NULLIF(btrim(p_currency_code), ''), 'XOF'),
      COALESCE(NULLIF(p_exchange_rate, 0), 1),
      COALESCE(p_rounding, 0),
      COALESCE(NULLIF(btrim(p_margin_mode), ''), 'markup_percent'),
      COALESCE(p_margin_value, 0),
      p_ordered_at, p_received_at, NULLIF(btrim(p_notes), ''), auth.uid()
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE public.cost_batches
  SET store_id = p_store_id,
      supplier_id = p_supplier_id,
      label = COALESCE(NULLIF(btrim(p_label), ''), label),
      reference = NULLIF(btrim(p_reference), ''),
      stock_mode = COALESCE(NULLIF(btrim(p_stock_mode), ''), stock_mode),
      costing_method = COALESCE(NULLIF(btrim(p_costing_method), ''), costing_method),
      allocation_method = COALESCE(NULLIF(btrim(p_allocation_method), ''), allocation_method),
      currency_code = COALESCE(NULLIF(btrim(p_currency_code), ''), currency_code),
      exchange_rate = COALESCE(NULLIF(p_exchange_rate, 0), exchange_rate),
      rounding = COALESCE(p_rounding, rounding),
      margin_mode = COALESCE(NULLIF(btrim(p_margin_mode), ''), margin_mode),
      margin_value = COALESCE(p_margin_value, margin_value),
      ordered_at = p_ordered_at,
      received_at = p_received_at,
      notes = NULLIF(btrim(p_notes), '')
  WHERE id = p_id
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_save(uuid, uuid, uuid, text, text, text, text, text, text, numeric, int, text, numeric, date, date, text) TO authenticated;

/** Supprime un arrivage — jamais un arrivage appliqué (l'historique des prix en dépend). */
CREATE OR REPLACE FUNCTION public.cost_batch_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cost_batches := public.landed_cost_guard_batch(p_id, false);
BEGIN
  IF v_batch.status = 'applied' THEN
    RAISE EXCEPTION 'Un arrivage appliqué ne se supprime pas : il justifie les prix en cours.';
  END IF;
  DELETE FROM public.cost_batches WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_delete(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cost_batch_cancel(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.landed_cost_guard_batch(p_id, true);
  UPDATE public.cost_batches SET status = 'cancelled' WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_cancel(uuid) TO authenticated;

/**
 * Refaire le même arrivage (même fournisseur, mêmes articles, mêmes postes de frais) :
 * la commande d'après se saisit alors en changeant seulement les montants qui ont bougé.
 * Les quantités et prix sont repris, JAMAIS les photos de prix ni le statut.
 */
CREATE OR REPLACE FUNCTION public.cost_batch_duplicate(p_id uuid, p_label text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cost_batches := public.landed_cost_guard_batch(p_id, false);
  v_new uuid;
BEGIN
  INSERT INTO public.cost_batches (
    company_id, store_id, supplier_id, label, reference, stock_mode, costing_method,
    allocation_method, currency_code, exchange_rate, rounding, margin_mode, margin_value,
    notes, created_by
  )
  SELECT
    v_batch.company_id, v_batch.store_id, v_batch.supplier_id,
    COALESCE(NULLIF(btrim(p_label), ''), v_batch.label || ' (copie)'),
    NULL, v_batch.stock_mode, v_batch.costing_method, v_batch.allocation_method,
    v_batch.currency_code, v_batch.exchange_rate, v_batch.rounding,
    v_batch.margin_mode, v_batch.margin_value, v_batch.notes, auth.uid()
  RETURNING id INTO v_new;

  INSERT INTO public.cost_batch_items (
    company_id, batch_id, product_id, quantity, unit_price, weight_kg, volume_m3,
    manual_share, margin_mode, margin_value, apply_sale_price, sort_order
  )
  SELECT
    i.company_id, v_new, i.product_id, i.quantity, i.unit_price, i.weight_kg, i.volume_m3,
    i.manual_share, i.margin_mode, i.margin_value, i.apply_sale_price, i.sort_order
  FROM public.cost_batch_items i
  WHERE i.batch_id = p_id;

  INSERT INTO public.cost_batch_charges (
    company_id, batch_id, label, kind, amount, allocation_method, sort_order
  )
  SELECT c.company_id, v_new, c.label, c.kind, c.amount, c.allocation_method, c.sort_order
  FROM public.cost_batch_charges c
  WHERE c.batch_id = p_id;

  RETURN v_new;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_duplicate(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Écriture — lignes et frais
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cost_batch_item_save(
  p_id uuid,
  p_batch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_weight_kg numeric,
  p_volume_m3 numeric,
  p_manual_share numeric,
  p_margin_mode text,
  p_margin_value numeric,
  p_apply_sale_price boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cost_batches := public.landed_cost_guard_batch(p_batch_id, true);
  v_id uuid;
  v_pos int;
BEGIN
  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'La quantité doit être supérieure à zéro.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.company_id = v_batch.company_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Produit introuvable dans cette entreprise.';
  END IF;

  IF p_id IS NULL THEN
    SELECT COALESCE(max(sort_order), -1) + 1 INTO v_pos
    FROM public.cost_batch_items WHERE batch_id = p_batch_id;

    INSERT INTO public.cost_batch_items (
      company_id, batch_id, product_id, quantity, unit_price, weight_kg, volume_m3,
      manual_share, margin_mode, margin_value, apply_sale_price, sort_order
    ) VALUES (
      v_batch.company_id, p_batch_id, p_product_id, p_quantity, COALESCE(p_unit_price, 0),
      p_weight_kg, p_volume_m3, p_manual_share,
      NULLIF(btrim(p_margin_mode), ''), p_margin_value,
      COALESCE(p_apply_sale_price, true), v_pos
    )
    ON CONFLICT (batch_id, product_id) DO UPDATE
    SET quantity = EXCLUDED.quantity,
        unit_price = EXCLUDED.unit_price,
        weight_kg = EXCLUDED.weight_kg,
        volume_m3 = EXCLUDED.volume_m3,
        manual_share = EXCLUDED.manual_share,
        margin_mode = EXCLUDED.margin_mode,
        margin_value = EXCLUDED.margin_value,
        apply_sale_price = EXCLUDED.apply_sale_price
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE public.cost_batch_items
  SET product_id = p_product_id,
      quantity = p_quantity,
      unit_price = COALESCE(p_unit_price, 0),
      weight_kg = p_weight_kg,
      volume_m3 = p_volume_m3,
      manual_share = p_manual_share,
      margin_mode = NULLIF(btrim(p_margin_mode), ''),
      margin_value = p_margin_value,
      apply_sale_price = COALESCE(p_apply_sale_price, true)
  WHERE id = p_id AND batch_id = p_batch_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Ligne d''arrivage introuvable.'; END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_item_save(uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, text, numeric, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cost_batch_item_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
BEGIN
  SELECT batch_id INTO v_batch_id FROM public.cost_batch_items WHERE id = p_id;
  IF v_batch_id IS NULL THEN RAISE EXCEPTION 'Ligne d''arrivage introuvable.'; END IF;
  PERFORM public.landed_cost_guard_batch(v_batch_id, true);
  DELETE FROM public.cost_batch_items WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_item_delete(uuid) TO authenticated;

/**
 * Reprend les lignes d'un achat déjà saisi (module Achats) dans l'arrivage. Le stock
 * ayant alors déjà été entré, le lot bascule d'office en `prices_only` : impossible de
 * compter deux fois la même marchandise.
 */
CREATE OR REPLACE FUNCTION public.cost_batch_items_import_from_purchase(
  p_batch_id uuid,
  p_purchase_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cost_batches := public.landed_cost_guard_batch(p_batch_id, true);
  v_purchase record;
  v_count int := 0;
  v_pos int;
BEGIN
  SELECT id, company_id, store_id, supplier_id, status INTO v_purchase
  FROM public.purchases WHERE id = p_purchase_id;
  IF v_purchase.id IS NULL THEN RAISE EXCEPTION 'Achat introuvable.'; END IF;
  IF v_purchase.company_id <> v_batch.company_id THEN
    RAISE EXCEPTION 'Cet achat appartient à une autre entreprise.';
  END IF;

  SELECT COALESCE(max(sort_order), -1) + 1 INTO v_pos
  FROM public.cost_batch_items WHERE batch_id = p_batch_id;

  -- Un achat peut porter DEUX lignes du même produit (deux colis, deux prix). On les
  -- regroupe avant d'insérer : `ON CONFLICT DO UPDATE` refuse de toucher deux fois la
  -- même ligne dans une seule commande. Le prix retenu est la moyenne pondérée.
  INSERT INTO public.cost_batch_items (
    company_id, batch_id, product_id, quantity, unit_price, sort_order
  )
  SELECT
    v_batch.company_id,
    p_batch_id,
    g.product_id,
    g.qty,
    CASE WHEN g.qty > 0 THEN round(g.amount / g.qty, 4) ELSE 0 END,
    v_pos + (row_number() OVER (ORDER BY g.first_seen))::int - 1
  FROM (
    SELECT
      pi.product_id,
      sum(pi.quantity) AS qty,
      sum(pi.quantity * pi.unit_price) AS amount,
      min(pi.created_at) AS first_seen
    FROM public.purchase_items pi
    JOIN public.products p ON p.id = pi.product_id AND p.deleted_at IS NULL
    WHERE pi.purchase_id = p_purchase_id AND pi.quantity > 0
    GROUP BY pi.product_id
  ) g
  ON CONFLICT (batch_id, product_id) DO UPDATE
  SET quantity = public.cost_batch_items.quantity + EXCLUDED.quantity;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Le stock de cet achat est déjà entré (ou le sera par le module Achats) : on ne
  -- laisse pas l'arrivage le ré-entrer.
  UPDATE public.cost_batches
  SET stock_mode = 'prices_only',
      supplier_id = COALESCE(supplier_id, v_purchase.supplier_id),
      reference = COALESCE(reference, (SELECT reference FROM public.purchases WHERE id = p_purchase_id))
  WHERE id = p_batch_id;

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_items_import_from_purchase(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cost_batch_charge_save(
  p_id uuid,
  p_batch_id uuid,
  p_label text,
  p_kind text,
  p_amount numeric,
  p_allocation_method text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cost_batches := public.landed_cost_guard_batch(p_batch_id, true);
  v_id uuid;
  v_pos int;
BEGIN
  IF COALESCE(btrim(p_label), '') = '' THEN
    RAISE EXCEPTION 'Donnez un nom à ce frais (transport, douane…).';
  END IF;
  IF COALESCE(p_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Un frais ne peut pas être négatif.';
  END IF;

  IF p_id IS NULL THEN
    SELECT COALESCE(max(sort_order), -1) + 1 INTO v_pos
    FROM public.cost_batch_charges WHERE batch_id = p_batch_id;
    INSERT INTO public.cost_batch_charges (
      company_id, batch_id, label, kind, amount, allocation_method, sort_order
    ) VALUES (
      v_batch.company_id, p_batch_id, btrim(p_label),
      COALESCE(NULLIF(btrim(p_kind), ''), 'autre'), COALESCE(p_amount, 0),
      NULLIF(btrim(p_allocation_method), ''), v_pos
    )
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE public.cost_batch_charges
  SET label = btrim(p_label),
      kind = COALESCE(NULLIF(btrim(p_kind), ''), kind),
      amount = COALESCE(p_amount, 0),
      allocation_method = NULLIF(btrim(p_allocation_method), '')
  WHERE id = p_id AND batch_id = p_batch_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Frais introuvable.'; END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_charge_save(uuid, uuid, text, text, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cost_batch_charge_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
BEGIN
  SELECT batch_id INTO v_batch_id FROM public.cost_batch_charges WHERE id = p_id;
  IF v_batch_id IS NULL THEN RAISE EXCEPTION 'Frais introuvable.'; END IF;
  PERFORM public.landed_cost_guard_batch(v_batch_id, true);
  DELETE FROM public.cost_batch_charges WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_charge_delete(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Application atomique
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Applique l'arrivage : entrée de stock (mode `receive` uniquement), nouveaux prix
 * d'achat et de vente, photo de l'ancien état. Tout ou rien.
 *
 * Le calcul est celui de `cost_batch_compute` — jamais des montants venus du client :
 * ce qui a été montré à l'écran est exactement ce qui est écrit.
 */
CREATE OR REPLACE FUNCTION public.cost_batch_apply(p_batch_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cost_batches;
  v_row record;
  v_count int := 0;
  v_new_sale numeric;
BEGIN
  -- Verrou : deux validations simultanées ne peuvent pas doubler le stock.
  SELECT * INTO v_batch FROM public.cost_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_batch.id IS NULL THEN RAISE EXCEPTION 'Arrivage introuvable.'; END IF;
  PERFORM public.landed_cost_guard_store(v_batch.store_id);
  IF v_batch.status <> 'draft' THEN
    RAISE EXCEPTION 'Cet arrivage a déjà été %.',
      CASE v_batch.status WHEN 'applied' THEN 'appliqué' ELSE 'annulé' END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cost_batch_items WHERE batch_id = p_batch_id) THEN
    RAISE EXCEPTION 'Ajoutez au moins un produit avant d''appliquer cet arrivage.';
  END IF;

  IF v_batch.stock_mode = 'receive' AND EXISTS (
    SELECT 1 FROM public.cost_batch_items
    WHERE batch_id = p_batch_id AND quantity <> trunc(quantity)
  ) THEN
    RAISE EXCEPTION
      'Les quantités entrées en stock doivent être entières. Corrigez les lignes concernées, '
      'ou passez l''arrivage en « prix seulement ».';
  END IF;

  FOR v_row IN SELECT * FROM public.cost_batch_compute(p_batch_id) LOOP
    -- 1. Stock — seulement si l'arrivage n'a pas déjà été saisi ailleurs.
    IF v_batch.stock_mode = 'receive' THEN
      INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
      VALUES (v_batch.store_id, v_row.product_id, v_row.quantity::int, 0)
      ON CONFLICT (store_id, product_id) DO UPDATE
      SET quantity = public.store_inventory.quantity + v_row.quantity::int,
          updated_at = now();

      INSERT INTO public.stock_movements (
        store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes
      ) VALUES (
        v_batch.store_id, v_row.product_id, 'purchase_in', v_row.quantity::int,
        'cost_batch', p_batch_id, auth.uid(), v_batch.label
      );
    END IF;

    -- 2. Prix — le prix de vente n'est touché que si la ligne l'autorise.
    v_new_sale := CASE
      WHEN v_row.apply_sale_price AND v_row.suggested_sale_price > 0
        THEN v_row.suggested_sale_price
      ELSE v_row.current_sale_price
    END;

    UPDATE public.products
    SET purchase_price = GREATEST(v_row.retained_cost, 0),
        sale_price = GREATEST(v_new_sale, 0)
    WHERE id = v_row.product_id AND company_id = v_batch.company_id;

    -- 3. Photo de l'ancien état — sur la ligne (retour en arrière) et au journal (lecture).
    UPDATE public.cost_batch_items
    SET prev_purchase_price = v_row.current_purchase_price,
        prev_sale_price = v_row.current_sale_price,
        prev_quantity = v_row.stock_before,
        applied_purchase_price = GREATEST(v_row.retained_cost, 0),
        applied_sale_price = GREATEST(v_new_sale, 0)
    WHERE id = v_row.item_id;

    INSERT INTO public.product_price_changes (
      company_id, product_id, store_id, batch_id, source,
      old_purchase_price, new_purchase_price, old_sale_price, new_sale_price,
      stock_at_change, created_by
    ) VALUES (
      v_batch.company_id, v_row.product_id, v_batch.store_id, p_batch_id, 'cost_batch',
      v_row.current_purchase_price, GREATEST(v_row.retained_cost, 0),
      v_row.current_sale_price, GREATEST(v_new_sale, 0),
      v_row.stock_before, auth.uid()
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.cost_batches
  SET status = 'applied', applied_at = now(), applied_by = auth.uid()
  WHERE id = p_batch_id;

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_apply(uuid) TO authenticated;

/**
 * Remet les prix tels qu'ils étaient avant l'application. Le STOCK n'est jamais touché :
 * la marchandise, elle, est bien arrivée. Corriger une erreur de prix ne doit pas faire
 * disparaître des articles du magasin.
 *
 * Refusé si un prix a bougé depuis (autre arrivage, modification à la main) : on ne
 * réécrit pas par-dessus un travail plus récent.
 */
CREATE OR REPLACE FUNCTION public.cost_batch_revert_prices(p_batch_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.cost_batches;
  v_item record;
  v_product record;
  v_count int := 0;
BEGIN
  SELECT * INTO v_batch FROM public.cost_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_batch.id IS NULL THEN RAISE EXCEPTION 'Arrivage introuvable.'; END IF;
  PERFORM public.landed_cost_guard_store(v_batch.store_id);
  IF v_batch.status <> 'applied' THEN
    RAISE EXCEPTION 'Seul un arrivage appliqué peut être remis à ses anciens prix.';
  END IF;
  IF v_batch.prices_reverted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Les prix de cet arrivage ont déjà été remis à leur valeur d''avant.';
  END IF;

  FOR v_item IN
    SELECT * FROM public.cost_batch_items WHERE batch_id = p_batch_id
  LOOP
    SELECT purchase_price, sale_price INTO v_product
    FROM public.products WHERE id = v_item.product_id AND company_id = v_batch.company_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Un prix modifié depuis l'application n'est pas le nôtre : on le laisse tranquille.
    IF round(COALESCE(v_product.purchase_price, 0), 2)
         IS DISTINCT FROM round(COALESCE(v_item.applied_purchase_price, 0), 2)
       OR round(COALESCE(v_product.sale_price, 0), 2)
         IS DISTINCT FROM round(COALESCE(v_item.applied_sale_price, 0), 2)
    THEN
      CONTINUE;
    END IF;

    UPDATE public.products
    SET purchase_price = GREATEST(COALESCE(v_item.prev_purchase_price, purchase_price), 0),
        sale_price = GREATEST(COALESCE(v_item.prev_sale_price, sale_price), 0)
    WHERE id = v_item.product_id;

    INSERT INTO public.product_price_changes (
      company_id, product_id, store_id, batch_id, source,
      old_purchase_price, new_purchase_price, old_sale_price, new_sale_price, created_by
    ) VALUES (
      v_batch.company_id, v_item.product_id, v_batch.store_id, p_batch_id, 'cost_batch_revert',
      v_item.applied_purchase_price, v_item.prev_purchase_price,
      v_item.applied_sale_price, v_item.prev_sale_price, auth.uid()
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.cost_batches SET prices_reverted_at = now() WHERE id = p_batch_id;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cost_batch_revert_prices(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Lecture — liste et historique
-- ─────────────────────────────────────────────────────────────────────────────

/** Liste des arrivages avec leurs totaux — un seul aller-retour pour l'écran. */
CREATE OR REPLACE FUNCTION public.cost_batches_overview(
  p_company_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_limit int DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  store_id uuid,
  store_name text,
  supplier_id uuid,
  supplier_name text,
  label text,
  reference text,
  status text,
  stock_mode text,
  costing_method text,
  allocation_method text,
  currency_code text,
  exchange_rate numeric,
  rounding int,
  margin_mode text,
  margin_value numeric,
  ordered_at date,
  received_at date,
  notes text,
  items_count bigint,
  total_quantity numeric,
  goods_total numeric,
  charges_total numeric,
  landed_total numeric,
  applied_at timestamptz,
  prices_reverted_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id,
    b.store_id,
    s.name,
    b.supplier_id,
    sup.name,
    b.label,
    b.reference,
    b.status,
    b.stock_mode,
    b.costing_method,
    b.allocation_method,
    b.currency_code,
    b.exchange_rate,
    b.rounding,
    b.margin_mode,
    b.margin_value,
    b.ordered_at,
    b.received_at,
    b.notes,
    COALESCE(it.n, 0),
    COALESCE(it.qty, 0),
    COALESCE(it.goods, 0),
    COALESCE(ch.charges, 0),
    COALESCE(it.goods, 0) + COALESCE(ch.charges, 0),
    b.applied_at,
    b.prices_reverted_at,
    b.created_at
  FROM public.cost_batches b
  JOIN public.stores s ON s.id = b.store_id
  LEFT JOIN public.suppliers sup ON sup.id = b.supplier_id
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS n,
      sum(i.quantity) AS qty,
      round(sum(i.quantity * i.unit_price * b.exchange_rate), 2) AS goods
    FROM public.cost_batch_items i WHERE i.batch_id = b.id
  ) it ON true
  LEFT JOIN LATERAL (
    SELECT round(sum(c.amount * b.exchange_rate), 2) AS charges
    FROM public.cost_batch_charges c WHERE c.batch_id = b.id
  ) ch ON true
  WHERE b.company_id = p_company_id
    AND (p_company_id IN (SELECT * FROM public.current_user_company_ids())
         OR public.is_super_admin())
    AND (p_store_id IS NULL OR b.store_id = p_store_id)
  ORDER BY b.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 100), 500);
$$;
GRANT EXECUTE ON FUNCTION public.cost_batches_overview(uuid, uuid, int) TO authenticated;

/** Historique des prix d'un produit — « pourquoi ce prix a changé, et quand ». */
CREATE OR REPLACE FUNCTION public.product_price_history(
  p_product_id uuid,
  p_limit int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  source text,
  batch_id uuid,
  batch_label text,
  old_purchase_price numeric,
  new_purchase_price numeric,
  old_sale_price numeric,
  new_sale_price numeric,
  stock_at_change numeric,
  author_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.id,
    h.created_at,
    h.source,
    h.batch_id,
    b.label,
    h.old_purchase_price,
    h.new_purchase_price,
    h.old_sale_price,
    h.new_sale_price,
    h.stock_at_change,
    pr.full_name
  FROM public.product_price_changes h
  LEFT JOIN public.cost_batches b ON b.id = h.batch_id
  LEFT JOIN public.profiles pr ON pr.id = h.created_by
  WHERE h.product_id = p_product_id
    AND (h.company_id IN (SELECT * FROM public.current_user_company_ids())
         OR public.is_super_admin())
  ORDER BY h.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 30), 200);
$$;
GRANT EXECUTE ON FUNCTION public.product_price_history(uuid, int) TO authenticated;
