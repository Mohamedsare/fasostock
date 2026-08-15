-- FasoStock — « Approvisionnement » : l'arrivage express, saisi debout, en trente secondes.
--
-- Le geste que cette page couvre existe déjà dans toutes les boutiques du pays, et
-- l'application ne savait pas l'écrire :
--   le rayon se vide un samedi midi ; le commerçant traverse le marché, achète dix
--   cartons à un grossiste ou à un voisin, revient, pose la marchandise sur le comptoir
--   — et doit VENDRE TOUT DE SUITE, avec un client qui attend déjà devant lui.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI PAS LE MODULE ACHATS
-- ─────────────────────────────────────────────────────────────────────────────
-- Le module Achats existe et reste la bonne réponse pour l'achat organisé : un
-- fournisseur enregistré, un bon de commande, un brouillon, une confirmation, une
-- réception, une dette au 401. Cinq écrans et une notion de fournisseur — c'est-à-dire
-- exactement ce que le commerçant NE PEUT PAS faire pendant que son client attend.
-- L'approvisionnement rapide n'est pas un achat simplifié : c'est un autre moment de
-- la journée. Il n'a ni fournisseur en base (« le monsieur d'en face »), ni bon de
-- commande, ni délai. Il a une marchandise, un prix payé, et l'urgence de vendre.
--
-- Les deux coexistent donc, et rien du module Achats n'est modifié.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUE L'ARRIVAGE FAIT, ET CE QU'IL NE FAIT PAS
-- ─────────────────────────────────────────────────────────────────────────────
-- IL FAIT : entrer le stock dans la boutique (`store_inventory`), écrire le mouvement
--   traçable (`stock_movements` type `purchase_in`, auteur renseigné), mettre à jour le
--   prix d'achat du produit — c'est le coût du jour, celui qui doit servir à la marge —
--   et, si besoin, CRÉER le produit qui n'existait pas encore au catalogue.
--
-- IL NE FAIT PAS de dépense. Acheter de la marchandise n'appauvrit personne : l'argent
--   se transforme en stock, il ne disparaît pas. L'écrire dans les Dépenses compterait
--   la charge deux fois (une fois à l'achat, une fois dans la marge de la vente) et
--   fausserait le résultat du mois. Le montant payé est donc enregistré ICI, visible
--   dans l'historique des arrivages, et nulle part ailleurs.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE CAISSIER, ET LE MOINS DE DROITS POSSIBLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Le patron veut souvent qu'un employé puisse réceptionner à sa place. Mais lui donner
-- « Créer des produits » + « Ajuster le stock » + « Modifier des produits » revient à
-- lui ouvrir la fiche produit entière, donc les prix de vente de tout le magasin, et
-- l'ajustement de stock libre — le trou par lequel disparaît la marchandise.
--
-- D'où un droit unique et étroit, `quick_supply.create`, qui n'autorise QUE ce chemin :
--   • entrer des quantités reçues, par cette page, dans SA boutique ;
--   • créer un produit qui manquait, avec son prix — un produit qu'on ne peut pas
--     vendre sans prix ;
--   • rien d'autre. Pas la fiche produit, pas l'ajustement libre, pas la suppression.
-- Et surtout : le PRIX DE VENTE D'UN PRODUIT EXISTANT lui reste fermé (voir plus bas).
-- C'est la ligne de partage qui compte : un employé peut faire entrer de la marchandise,
-- il ne peut pas rebaisser le prix du sac de riz avant de se servir.
--
-- Le droit n'est donné à aucun rôle par défaut : le propriétaire l'attribue nommément,
-- employé par employé, depuis la page Employés.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Le drapeau d'activation (entreprise, réglé par le PROPRIÉTAIRE)
-- ─────────────────────────────────────────────────────────────────────────────
-- Désactivé par défaut. Beaucoup de commerces ne réapprovisionnent que par le module
-- Achats, avec de vrais fournisseurs : une entrée de menu de plus serait, pour eux,
-- une question sans objet.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS quick_supply_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.quick_supply_enabled IS
  'Module « Approvisionnement » : entrée de marchandise express en boutique (page '
  '/approvisionnement). Désactivé par défaut, activé par le PROPRIÉTAIRE dans '
  'Paramètres (RPC company_set_quick_supply_enabled).';

-- Garde des drapeaux propriétaire posée en 00167, étendue en 00173, 00174, 00182 puis
-- 00191 : sixième drapeau, même règle, même trigger.
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
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver l''approvisionnement rapide.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_owner_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_owner_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.companies_enforce_owner_flags();

CREATE OR REPLACE FUNCTION public.company_set_quick_supply_enabled(
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
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver l''approvisionnement rapide.';
  END IF;
  UPDATE public.companies
  SET quick_supply_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.company_set_quick_supply_enabled(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_set_quick_supply_enabled(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Le droit étroit — et deux droits « page » pour alléger l'écran du caissier
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key) VALUES (uuid_generate_v4(), 'quick_supply.create')
ON CONFLICT (key) DO NOTHING;

-- Volontairement accordé à AUCUN rôle : faire entrer de la marchandise engage le stock
-- et le prix de revient. Le propriétaire (reconnu partout par `user_is_company_owner`,
-- sans passer par les permissions) l'a de fait ; il l'ouvre nommément à qui il veut.

/*
 * « Aide » et « Notifications » : jusqu'ici visibles par tout le monde, sans droit
 * associé — un choix raisonnable qui ne l'est plus dès qu'on regarde le téléphone
 * d'un caissier. Sur un écran de 5 pouces, chaque entrée de menu inutile éloigne
 * celles qui servent, et le patron veut souvent que son employé voie CINQ pages, pas
 * douze. On crée donc deux droits, accordés à TOUS LES RÔLES existants : personne ne
 * perd rien aujourd'hui, et le propriétaire peut désormais les décocher pour un
 * employé donné depuis la page Employés.
 *
 * Le sens est bien « voir la page » et non « recevoir des notifications » : décocher
 * Notifications retire l'entrée de menu et l'historique, cela n'éteint pas les push
 * (chacun garde les siennes, et la RLS les borne déjà à son compte).
 */
INSERT INTO public.permissions (id, key) VALUES (uuid_generate_v4(), 'help.view')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions (id, key) VALUES (uuid_generate_v4(), 'notifications.view')
ON CONFLICT (key) DO NOTHING;

-- Rétrocompatibilité stricte : tous les rôles, y compris ceux ajoutés par la suite au
-- moment où cette migration tourne, reçoivent les deux droits.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.key IN ('help.view', 'notifications.view')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Numérotation : « A-17 », le numéro qu'on retrouve le soir
-- ─────────────────────────────────────────────────────────────────────────────
-- Le propriétaire qui contrôle sa caisse le soir cherche « l'arrivage de 14 h ». Un
-- numéro court, attribué en base (deux saisies simultanées ne peuvent pas le partager).
CREATE SEQUENCE IF NOT EXISTS public.quick_supply_number_seq;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tables
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Un arrivage : ce qui est entré en boutique, en une fois, par une personne.
 *
 * `supplier_label` est un TEXTE LIBRE et non une clé vers `suppliers` — c'est le fond
 * du sujet : « Ali du marché », « le camion de Bobo ». Obliger à créer une fiche
 * fournisseur ferait abandonner la saisie, et remplirait la base de fantômes. Le
 * commerçant qui a un vrai fournisseur passe, lui, par le module Achats.
 */
CREATE TABLE IF NOT EXISTS public.quick_supplies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  /** « A-17 » — la référence courte de l'arrivage. */
  supply_number text NOT NULL,

  /** Chez qui la marchandise a été prise. Texte libre, facultatif. */
  supplier_label text,
  /** Mot du réceptionnaire : « 2 cartons abîmés », « reste 5 000 à payer ». */
  note text,

  /** Somme des (quantité × prix d'achat) des lignes — calculée en base, jamais reçue du client. */
  total_cost numeric(18, 4) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  /**
   * Ce qui a réellement été sorti de la caisse. Peut être inférieur au coût total
   * (une partie à crédit chez le grossiste) : c'est une information de suivi, pas
   * une écriture comptable — les dettes fournisseurs se tiennent dans l'espace
   * Fournisseurs (401), sur des achats en bonne et due forme.
   */
  amount_paid numeric(18, 4) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),

  /** Nombre de lignes / d'unités entrées — pour l'historique sans relire les lignes. */
  line_count integer NOT NULL DEFAULT 0,
  unit_count integer NOT NULL DEFAULT 0,

  /**
   * Idempotence, même principe que `sale_sync_idempotency` (00061) et les bons de
   * caisse (00191). Le cas est le même ici : la 3G lâche pendant la validation, le
   * commerçant rappuie, et sans cette clé le stock entrerait DEUX FOIS. Un stock
   * faussé à la hausse est pire qu'une saisie perdue : il se découvre à l'inventaire,
   * des semaines plus tard.
   */
  client_request_id uuid,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quick_supplies IS
  'Arrivage express : marchandise achetée et entrée en boutique dans le même geste '
  '(module Approvisionnement). Ne crée ni achat, ni dette, ni dépense.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_supplies_number
  ON public.quick_supplies(company_id, supply_number);
CREATE INDEX IF NOT EXISTS idx_quick_supplies_store
  ON public.quick_supplies(company_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quick_supplies_author
  ON public.quick_supplies(created_by, created_at DESC);
-- Index partiel unique : c'est LUI qui rend le renvoi inoffensif.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_supplies_client_request
  ON public.quick_supplies(company_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

/**
 * Une ligne d'arrivage.
 *
 * `label` est une COPIE du nom au moment de l'entrée, comme pour les bons de caisse :
 * l'historique doit rester lisible même si le produit est renommé ensuite.
 *
 * `previous_purchase_price` garde l'ancien coût. C'est la ligne que le propriétaire
 * lit vraiment : « le carton est passé de 9 000 à 11 500 » — l'information qui décide
 * d'augmenter le prix de vente, et celle qui, si elle est fantaisiste, désigne l'auteur.
 */
CREATE TABLE IF NOT EXISTS public.quick_supply_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supply_id uuid NOT NULL REFERENCES public.quick_supplies(id) ON DELETE CASCADE,

  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  label text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),

  purchase_price numeric(18, 4) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  previous_purchase_price numeric(18, 4),
  /** Prix de vente appliqué au produit par cet arrivage. NULL = prix inchangé. */
  sale_price numeric(18, 4) CHECK (sale_price IS NULL OR sale_price >= 0),
  previous_sale_price numeric(18, 4),

  /** Le produit a-t-il été créé par cet arrivage ? Sert au contrôle du propriétaire. */
  product_created boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quick_supply_items IS
  'Lignes d''un arrivage express. Conserve l''ancien prix d''achat et l''ancien prix de '
  'vente : c''est ce que le propriétaire relit pour comprendre une marge qui bouge.';

CREATE INDEX IF NOT EXISTS idx_quick_supply_items_supply
  ON public.quick_supply_items(supply_id, position);
CREATE INDEX IF NOT EXISTS idx_quick_supply_items_product
  ON public.quick_supply_items(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quick_supply_items_company
  ON public.quick_supply_items(company_id);

-- Numéro attribué en base (jamais côté application : deux saisies à la même seconde
-- produiraient le même « A-17 »).
CREATE OR REPLACE FUNCTION public.quick_supplies_set_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supply_number IS NULL OR btrim(NEW.supply_number) = '' THEN
    NEW.supply_number := 'A-' || nextval('public.quick_supply_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quick_supplies_set_number_trigger ON public.quick_supplies;
CREATE TRIGGER quick_supplies_set_number_trigger
  BEFORE INSERT ON public.quick_supplies
  FOR EACH ROW
  EXECUTE PROCEDURE public.quick_supplies_set_number();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Droits effectifs
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Qui peut faire entrer de la marchandise par ce chemin.
 *
 * `get_my_permission_keys` (et non `user_has_company_permission`) : c'est la fonction
 * qui applique les SURCHARGES par utilisateur. Sans elle, un droit accordé nommément
 * par le propriétaire à un caissier — c'est-à-dire le cas d'usage central de ce
 * module — ne serait pas vu.
 */
CREATE OR REPLACE FUNCTION public.can_do_quick_supply(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR public.user_is_company_owner(p_company_id)
      OR ('quick_supply.create' = ANY(public.get_my_permission_keys(p_company_id)));
$$;

COMMENT ON FUNCTION public.can_do_quick_supply(uuid) IS
  'Droit d''enregistrer un arrivage express. Étroit par construction : n''ouvre ni la '
  'fiche produit, ni l''ajustement de stock libre.';

GRANT EXECUTE ON FUNCTION public.can_do_quick_supply(uuid) TO authenticated;

/**
 * Le prix de VENTE d'un produit déjà au catalogue est une décision commerciale du
 * patron, pas une conséquence d'une réception. Un employé à qui l'on a seulement
 * confié `quick_supply.create` ne peut donc pas le toucher : il lui faut, en plus, le
 * droit ordinaire « Modifier des produits ».
 *
 * Pour un produit qu'il CRÉE, en revanche, il faut bien fixer un prix — sinon
 * l'article entre en stock invendable, et le module rate son but.
 */
CREATE OR REPLACE FUNCTION public.can_reprice_on_quick_supply(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR public.user_is_company_owner(p_company_id)
      OR ('products.update' = ANY(public.get_my_permission_keys(p_company_id)));
$$;

GRANT EXECUTE ON FUNCTION public.can_reprice_on_quick_supply(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Lecture : tout membre de l'entreprise (l'historique des arrivages est un objet
-- d'équipe, et surtout un objet de contrôle pour le propriétaire).
-- Écriture : par le RPC uniquement — lui seul pose l'auteur, le numéro, le stock et
-- les mouvements dans la même transaction. Les policies restent néanmoins fermées à
-- qui n'a pas le droit, pour qu'une écriture directe ne contourne rien.
ALTER TABLE public.quick_supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_supply_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quick_supplies_select" ON public.quick_supplies;
CREATE POLICY "quick_supplies_select" ON public.quick_supplies FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "quick_supplies_insert" ON public.quick_supplies;
CREATE POLICY "quick_supplies_insert" ON public.quick_supplies FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.can_do_quick_supply(company_id)
);

-- Ni UPDATE ni DELETE : un arrivage a fait bouger du stock réel. Se tromper se corrige
-- par un inventaire ou un ajustement — tous deux tracés — et non en réécrivant
-- l'histoire. Le propriétaire doit pouvoir relire ce qui a été saisi, tel que saisi.

DROP POLICY IF EXISTS "quick_supply_items_select" ON public.quick_supply_items;
CREATE POLICY "quick_supply_items_select" ON public.quick_supply_items FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "quick_supply_items_insert" ON public.quick_supply_items;
CREATE POLICY "quick_supply_items_insert" ON public.quick_supply_items FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.can_do_quick_supply(company_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Enregistrer l'arrivage
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Tout, ou rien.
 *
 * Une entrée partielle est le pire résultat possible : trois produits sur cinq en
 * stock, sans que personne sache lesquels. La transaction unique du RPC garantit que
 * l'écran affiche « c'est entré » exactement quand ça l'est.
 *
 * Format d'une ligne de `p_items` :
 *   { product_id, quantity, purchase_price, sale_price? }              produit existant
 *   { label, quantity, purchase_price, sale_price, unit?, barcode? }   produit à créer
 *
 * Le produit créé l'est avec le strict nécessaire pour être vendu le jour même : nom,
 * unité, prix d'achat, prix de vente. Catégorie, marque, photo, code-barres complet —
 * tout cela se remplit plus tard, à froid, dans la fiche produit. Demander ces champs
 * au comptoir, c'est ne pas être utilisé.
 */
CREATE OR REPLACE FUNCTION public.create_quick_supply(
  p_company_id uuid,
  p_store_id uuid,
  p_items jsonb,
  p_supplier_label text DEFAULT NULL,
  p_amount_paid numeric DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_supply_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_label text;
  v_qty int;
  v_purchase numeric;
  v_sale numeric;
  v_unit text;
  v_barcode text;
  v_prev_purchase numeric;
  v_prev_sale numeric;
  v_created boolean;
  v_scope text;
  v_pos int := 0;
  v_units int := 0;
  v_total numeric := 0;
  v_can_reprice boolean;
  v_shares_catalog boolean;
  v_row_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée pour cette entreprise';
  END IF;
  IF NOT public.can_do_quick_supply(p_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''enregistrer un approvisionnement.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND quick_supply_enabled = true
  ) THEN
    RAISE EXCEPTION 'L''approvisionnement rapide n''est pas activé pour cette entreprise.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Aucun article : rien à faire entrer en stock.';
  END IF;

  /*
   * Renvoi après une coupure réseau : l'arrivage existe déjà, on rend le même id sans
   * rien réinjecter. Le verrou consultatif sérialise deux appels simultanés portant la
   * même clé — sans lui, les deux passeraient la lecture avant que l'un n'ait inséré.
   */
  IF p_client_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      abs(hashtext(p_company_id::text)),
      abs(hashtext(p_client_request_id::text))
    );
    SELECT id INTO v_supply_id
    FROM public.quick_supplies
    WHERE company_id = p_company_id AND client_request_id = p_client_request_id;
    IF v_supply_id IS NOT NULL THEN
      RETURN v_supply_id;
    END IF;
  END IF;

  v_can_reprice := public.can_reprice_on_quick_supply(p_company_id);

  SELECT COALESCE(shares_company_catalog, true) INTO v_shares_catalog
  FROM public.stores WHERE id = p_store_id;

  INSERT INTO public.quick_supplies (
    company_id, store_id, supplier_label, note, amount_paid, client_request_id, created_by
  )
  VALUES (
    p_company_id, p_store_id,
    NULLIF(btrim(COALESCE(p_supplier_label, '')), ''),
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    GREATEST(0, COALESCE(p_amount_paid, 0)),
    p_client_request_id,
    v_uid
  )
  RETURNING id INTO v_supply_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_purchase := GREATEST(0, COALESCE((v_item->>'purchase_price')::numeric, 0));
    v_sale := NULLIF(v_item->>'sale_price', '')::numeric;
    v_created := false;
    v_prev_purchase := NULL;
    v_prev_sale := NULL;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un article de l''arrivage.';
    END IF;
    IF v_sale IS NOT NULL AND v_sale < 0 THEN
      RAISE EXCEPTION 'Prix de vente invalide pour un article de l''arrivage.';
    END IF;

    IF v_product_id IS NULL THEN
      -- ── Produit à créer ────────────────────────────────────────────────────
      v_label := NULLIF(btrim(COALESCE(v_item->>'label', '')), '');
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'Nom manquant pour un nouvel article.';
      END IF;
      IF v_sale IS NULL OR v_sale <= 0 THEN
        RAISE EXCEPTION 'Prix de vente obligatoire pour le nouvel article « % ».', v_label;
      END IF;
      v_unit := COALESCE(NULLIF(btrim(COALESCE(v_item->>'unit', '')), ''), 'pce');
      v_barcode := NULLIF(btrim(COALESCE(v_item->>'barcode', '')), '');

      INSERT INTO public.products (
        company_id, name, unit, barcode, purchase_price, sale_price, product_scope, is_active
      )
      VALUES (
        p_company_id, v_label, v_unit, v_barcode, v_purchase, v_sale, 'both', true
      )
      RETURNING id INTO v_product_id;

      v_created := true;

      -- Boutique à catalogue personnalisé : sans ce lien, l'article entrerait en stock
      -- mais resterait introuvable en caisse — la marchandise est là, la vente refusée.
      IF v_shares_catalog = false THEN
        INSERT INTO public.store_products (company_id, store_id, product_id)
        VALUES (p_company_id, p_store_id, v_product_id)
        ON CONFLICT (store_id, product_id) DO NOTHING;
      END IF;
    ELSE
      -- ── Produit existant ───────────────────────────────────────────────────
      SELECT p.name, p.purchase_price, p.sale_price, COALESCE(p.product_scope, 'both')
        INTO v_label, v_prev_purchase, v_prev_sale, v_scope
      FROM public.products p
      WHERE p.id = v_product_id
        AND p.company_id = p_company_id
        AND p.deleted_at IS NULL;

      IF v_label IS NULL THEN
        RAISE EXCEPTION 'Article introuvable dans votre catalogue.';
      END IF;
      -- Cette page fait entrer du stock EN BOUTIQUE : un article réservé au dépôt
      -- passe par le Magasin, qui a ses propres contrôles.
      IF v_scope NOT IN ('both', 'boutique_only') THEN
        RAISE EXCEPTION 'L''article « % » est réservé au dépôt magasin.', v_label;
      END IF;

      /*
       * Le coût du jour remplace l'ancien : c'est lui qui doit servir à calculer la
       * marge de ce qui sera vendu maintenant. L'ancien reste lisible sur la ligne.
       *
       * Sauf s'il vaut zéro. Un champ laissé vide veut dire « je ne l'ai pas saisi »,
       * jamais « cet article ne m'a rien coûté » : écraser un prix d'achat connu par un
       * zéro ferait apparaître une marge de 100 % sur toutes les ventes suivantes, et
       * personne ne s'en apercevrait avant de lire un rapport faux. On garde donc
       * l'ancien coût, et la ligne d'arrivage en porte la trace (prix à 0).
       */
      IF v_purchase > 0 THEN
        UPDATE public.products
        SET purchase_price = v_purchase, updated_at = now()
        WHERE id = v_product_id;
      END IF;

      IF v_sale IS NOT NULL AND v_sale IS DISTINCT FROM v_prev_sale THEN
        IF NOT v_can_reprice THEN
          RAISE EXCEPTION
            'Vous ne pouvez pas changer le prix de vente de « % ». Demandez au propriétaire.',
            v_label;
        END IF;
        UPDATE public.products
        SET sale_price = v_sale, updated_at = now()
        WHERE id = v_product_id;
      ELSE
        -- Prix inchangé : on n'écrit rien sur la ligne, pour que l'historique montre
        -- les seules vraies décisions de prix.
        v_sale := NULL;
      END IF;
    END IF;

    -- ── Entrée en stock ────────────────────────────────────────────────────────
    UPDATE public.store_inventory
    SET quantity = quantity + v_qty, updated_at = now()
    WHERE store_id = p_store_id AND product_id = v_product_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      -- `ON CONFLICT` : filet contre la course entre l'UPDATE ci-dessus et une vente
      -- simultanée qui créerait la ligne d'inventaire entre les deux instructions.
      INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
      VALUES (p_store_id, v_product_id, v_qty, 0)
      ON CONFLICT (store_id, product_id) DO UPDATE
        SET quantity = store_inventory.quantity + EXCLUDED.quantity,
            updated_at = now();
    END IF;

    -- Auteur renseigné : l'historique des mouvements (page Magasin) doit pouvoir dire
    -- qui a fait entrer quoi. C'est la contrepartie du droit donné au caissier.
    INSERT INTO public.stock_movements (
      store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes
    )
    VALUES (
      p_store_id, v_product_id, 'purchase_in', v_qty, 'quick_supply', v_supply_id, v_uid,
      'Approvisionnement'
    );

    v_pos := v_pos + 1;
    INSERT INTO public.quick_supply_items (
      company_id, supply_id, product_id, label, quantity,
      purchase_price, previous_purchase_price, sale_price, previous_sale_price,
      product_created, position
    )
    VALUES (
      p_company_id, v_supply_id, v_product_id, v_label, v_qty,
      v_purchase, v_prev_purchase, v_sale, v_prev_sale,
      v_created, v_pos
    );

    v_units := v_units + v_qty;
    v_total := v_total + (v_qty * v_purchase);
  END LOOP;

  UPDATE public.quick_supplies
  SET total_cost = v_total,
      line_count = v_pos,
      unit_count = v_units,
      -- Montant payé non saisi : on retient le coût total. Le cas ordinaire est le
      -- paiement comptant, et obliger à ressaisir un chiffre déjà calculé serait un
      -- champ de plus entre le commerçant et sa vente.
      amount_paid = CASE
        WHEN COALESCE(p_amount_paid, -1) < 0 THEN v_total
        ELSE GREATEST(0, p_amount_paid)
      END
  WHERE id = v_supply_id;

  RETURN v_supply_id;
END;
$$;

COMMENT ON FUNCTION public.create_quick_supply IS
  'Enregistre un arrivage express : entrée de stock boutique + mouvements tracés + '
  'mise à jour du prix d''achat (+ création des produits manquants), en une seule '
  'transaction. Ne crée ni achat, ni dette fournisseur, ni dépense.';

REVOKE ALL ON FUNCTION public.create_quick_supply(
  uuid, uuid, jsonb, text, numeric, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_quick_supply(
  uuid, uuid, jsonb, text, numeric, text, uuid
) TO authenticated;
