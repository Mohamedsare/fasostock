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
--   traçable (`stock_movements` type `purchase_in`, auteur renseigné), enregistrer le
--   prix payé et le prix de vente prévu POUR CET ARRIVAGE, et, si besoin, CRÉER le
--   produit qui n'existait pas encore au catalogue.
--
-- IL NE TOUCHE PAS AUX PRIX DU CATALOGUE. C'est la règle centrale, et elle mérite d'être
--   dite ici : les prix d'un arrivage sont des prix de circonstance (le grossiste
--   habituel était fermé, le voisin a profité de l'urgence, le carton était abîmé). Les
--   recopier dans `products` laisserait un achat de dépannage redéfinir la valeur d'une
--   référence pour toute la boutique — faussant d'un coup la marge de tout le stock déjà
--   présent, les rapports du mois, et le prix que le caissier lira demain. Les deux jeux
--   de prix cohabitent donc sans jamais se mélanger (voir `quick_supply_items`).
--   Exception unique et inévitable : un produit CRÉÉ par l'arrivage n'a pas de prix
--   catalogue — ceux saisis deviennent les siens, sinon il entre en stock invendable.
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
--
-- Le fait que l'arrivage ne touche à aucun prix du catalogue règle du même coup la
-- question qui inquiétait : l'employé saisit les prix de SON arrivage, il ne peut pas
-- rebaisser le prix du sac de riz de toute la boutique avant de se servir. Aucun droit
-- supplémentaire n'est donc à arbitrer sur les prix — il n'y a plus rien à protéger de
-- ce côté-là.
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
-- 2. Le droit étroit
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permissions (id, key) VALUES (uuid_generate_v4(), 'quick_supply.create')
ON CONFLICT (key) DO NOTHING;

-- Volontairement accordé à AUCUN rôle : faire entrer de la marchandise engage le stock
-- et le prix de revient. Le propriétaire (reconnu partout par `user_is_company_owner`,
-- sans passer par les permissions) l'a de fait ; il l'ouvre nommément à qui il veut.
--
-- NOTE — « masquer Aide / Notifications du menu d'un employé » n'est PAS ici, et c'est
-- délibéré. Ce serait une permission accordée à tous les rôles, donc absente tant que
-- la migration n'est pas jouée : entre le déploiement du code et le passage de cette
-- migration, les deux pages disparaîtraient du menu de TOUS les utilisateurs, y compris
-- du propriétaire. Masquer une entrée de menu est un confort d'affichage, pas une
-- frontière de sécurité : ça n'a pas à pouvoir casser quoi que ce soit. C'est donc rangé
-- dans `company_settings` (clé `employee_hidden_pages`), table qui existe depuis 00001 —
-- valeur absente = rien de masqué, exactement le comportement d'aujourd'hui.

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
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX JEUX DE PRIX QU'IL NE FAUT SURTOUT PAS MÉLANGER
 * ─────────────────────────────────────────────────────────────────────────────
 * Les prix saisis à l'arrivage NE SONT PAS les prix du catalogue, et ne les remplacent
 * jamais. C'est la règle centrale de ce module, et elle est inscrite ici, dans les noms
 * des colonnes, pour qu'on ne puisse pas s'y tromper en relisant le code :
 *
 *   unit_cost         ce que le commerçant a PAYÉ pour cet arrivage-ci, chez ce
 *                     vendeur-là, ce jour-là. Un prix de circonstance : le grossiste
 *                     habituel était fermé, le voisin a profité de l'urgence, le
 *                     carton était abîmé et négocié. Il décrit UNE caisse de
 *                     marchandise, pas la valeur du produit.
 *
 *   unit_sale_price   le prix auquel le commerçant compte écouler CETTE marchandise-là.
 *                     Là encore, propre à l'arrivage.
 *
 *   catalogue_purchase_price / catalogue_sale_price
 *                     PHOTO des vrais prix du produit à l'instant de l'arrivage. Ils ne
 *                     servent qu'à la comparaison (« payé 11 500, le catalogue dit
 *                     9 000 »). Ce sont des témoins, jamais des valeurs de travail.
 *
 * `products.purchase_price` et `products.sale_price` — les VRAIS prix, ceux de la caisse
 * et des rapports — ne sont touchés par aucune des deux, à une exception près et une
 * seule : un produit CRÉÉ par l'arrivage n'a pas de prix catalogue, il faut bien lui en
 * donner un, sinon il entre en stock invendable.
 */
CREATE TABLE IF NOT EXISTS public.quick_supply_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supply_id uuid NOT NULL REFERENCES public.quick_supplies(id) ON DELETE CASCADE,

  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  label text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),

  /** Prix payé pour CET arrivage. N'est pas le prix d'achat du produit. */
  unit_cost numeric(18, 4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  /** Prix de vente prévu pour CETTE marchandise. N'est pas le prix de vente du produit. */
  unit_sale_price numeric(18, 4) CHECK (unit_sale_price IS NULL OR unit_sale_price >= 0),

  /** Témoins : les vrais prix du catalogue au moment de l'arrivage (comparaison seule). */
  catalogue_purchase_price numeric(18, 4),
  catalogue_sale_price numeric(18, 4),

  /** Le produit a-t-il été créé par cet arrivage ? Sert au contrôle du propriétaire. */
  product_created boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quick_supply_items IS
  'Lignes d''un arrivage express. `unit_cost` / `unit_sale_price` sont les prix DE '
  'L''ARRIVAGE et ne remplacent jamais ceux du catalogue ; `catalogue_*` en garde la '
  'photo au même instant, pour comparaison.';
COMMENT ON COLUMN public.quick_supply_items.unit_cost IS
  'Prix payé pour cet arrivage précis. À ne pas confondre avec products.purchase_price.';
COMMENT ON COLUMN public.quick_supply_items.unit_sale_price IS
  'Prix de vente prévu pour cette marchandise. À ne pas confondre avec products.sale_price.';

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
  v_unit_cost numeric;
  v_unit_sale numeric;
  v_unit text;
  v_barcode text;
  v_cat_purchase numeric;
  v_cat_sale numeric;
  v_created boolean;
  v_scope text;
  v_pos int := 0;
  v_units int := 0;
  v_total numeric := 0;
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
    v_unit_cost := GREATEST(0, COALESCE((v_item->>'unit_cost')::numeric, 0));
    v_unit_sale := NULLIF(v_item->>'unit_sale_price', '')::numeric;
    v_created := false;
    v_cat_purchase := NULL;
    v_cat_sale := NULL;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un article de l''arrivage.';
    END IF;
    IF v_unit_sale IS NOT NULL AND v_unit_sale < 0 THEN
      RAISE EXCEPTION 'Prix de vente invalide pour un article de l''arrivage.';
    END IF;

    IF v_product_id IS NULL THEN
      -- ── Produit à créer ────────────────────────────────────────────────────
      v_label := NULLIF(btrim(COALESCE(v_item->>'label', '')), '');
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'Nom manquant pour un nouvel article.';
      END IF;
      IF v_unit_sale IS NULL OR v_unit_sale <= 0 THEN
        RAISE EXCEPTION 'Prix de vente obligatoire pour le nouvel article « % ».', v_label;
      END IF;
      v_unit := COALESCE(NULLIF(btrim(COALESCE(v_item->>'unit', '')), ''), 'pce');
      v_barcode := NULLIF(btrim(COALESCE(v_item->>'barcode', '')), '');

      INSERT INTO public.products (
        company_id, name, unit, barcode, purchase_price, sale_price, product_scope, is_active
      )
      VALUES (
        p_company_id, v_label, v_unit, v_barcode, v_unit_cost, v_unit_sale, 'both', true
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
        INTO v_label, v_cat_purchase, v_cat_sale, v_scope
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
       * ON NE TOUCHE À AUCUN PRIX DU CATALOGUE. Ni le prix d'achat, ni le prix de vente.
       *
       * C'est la règle du module, et elle mérite d'être défendue ici plutôt que dans une
       * note : les prix d'un arrivage sont des prix de circonstance. Le grossiste
       * habituel était fermé, le voisin a profité de l'urgence, le carton était abîmé et
       * négocié. Les recopier dans la fiche produit reviendrait à laisser un achat de
       * dépannage redéfinir la valeur d'une référence pour toute la boutique — et donc
       * fausser, d'un coup, la marge affichée sur tout le stock déjà là, les rapports du
       * mois, et le prix que le caissier lira demain.
       *
       * Les prix saisis restent donc sur la ligne d'arrivage, à côté de la photo des
       * vrais prix. Le propriétaire voit l'écart, et décide — ou non — de répercuter.
       */
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
    /*
     * La ligne EST le lot : `remaining_quantity` part de la quantité entrée et se vide
     * au fil des ventes. `store_id` est recopié ici pour que la caisse retrouve ses
     * lots sans jointure — c'est la requête la plus chaude du module.
     *
     * `unit_sale_price` peut être NULL sur un produit existant : le commerçant n'a
     * alors rien voulu changer, et cette marchandise se vendra au prix du catalogue.
     * Le lot existe quand même — il porte le COÛT, dont la marge a besoin.
     */
    INSERT INTO public.quick_supply_items (
      company_id, supply_id, store_id, product_id, label, quantity, remaining_quantity,
      unit_cost, unit_sale_price, catalogue_purchase_price, catalogue_sale_price,
      product_created, position
    )
    VALUES (
      p_company_id, v_supply_id, p_store_id, v_product_id, v_label, v_qty, v_qty,
      v_unit_cost, v_unit_sale, v_cat_purchase, v_cat_sale,
      v_created, v_pos
    );

    v_units := v_units + v_qty;
    v_total := v_total + (v_qty * v_unit_cost);
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
  'lot au prix de l''arrivage (+ création des produits manquants), en une seule '
  'transaction. Ne touche à aucun prix du catalogue, et ne crée ni achat, ni dette, '
  'ni dépense.';

REVOKE ALL ON FUNCTION public.create_quick_supply(
  uuid, uuid, jsonb, text, numeric, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_quick_supply(
  uuid, uuid, jsonb, text, numeric, text, uuid
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. LE LOT : « ce stock-là se vend à SON prix, tant qu'il en reste »
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * Ce que le commerçant décrit est un lot, au sens propre : une caisse de marchandise
 * achetée à un prix, destinée à être écoulée à un autre, et qui a une fin.
 *
 *   « J'ai payé le sucre 650 au lieu de 600 parce que mon grossiste était fermé.
 *     Je vends CES douze sacs-là à 800. Quand ils sont finis, on revient à 750. »
 *
 * Trois conséquences, et il faut les tenir toutes les trois, sinon le module ment :
 *
 *  1. LA CAISSE VEND AU PRIX DU LOT tant qu'il en reste. Sinon le prix saisi à
 *     l'arrivage ne servirait à rien.
 *  2. LA MARGE UTILISE LE COÛT DU LOT. Sinon le patron verrait un bénéfice calculé
 *     sur 600 alors qu'il a payé 650 — un chiffre faux, et faux dans le sens qui
 *     rassure, c'est-à-dire le pire.
 *  3. QUAND LE LOT EST ÉPUISÉ, TOUT REVIENT AU CATALOGUE. Sans intervention, sans
 *     que personne ait à y penser.
 *
 * FIFO : le plus ancien lot part le premier. C'est l'ordre dans lequel la marchandise
 * sort réellement d'un rayon, et le seul qui ne laisse pas un vieux lot dormir
 * indéfiniment derrière un neuf.
 */

-- La boutique, recopiée sur la ligne : la caisse interroge les lots à chaque ouverture
-- de l'écran, et une jointure de plus sur ce chemin-là se paie en millisecondes visibles.
ALTER TABLE public.quick_supply_items
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

/**
 * Ce qu'il reste du lot. Décrémenté à chaque vente, restitué à chaque annulation.
 *
 * Ce n'est PAS le stock : le stock vit dans `store_inventory` et se fait aussi corriger
 * par les inventaires, les pertes, les transferts — qui, eux, ne touchent pas aux lots.
 * Les deux peuvent donc diverger, et c'est assumé : le lot répond à « à quel prix ? »,
 * pas à « combien en ai-je ? ». Le lecteur de prix borne d'ailleurs le restant au stock
 * réel, pour qu'un lot fantôme ne fasse jamais prix.
 */
ALTER TABLE public.quick_supply_items
  ADD COLUMN IF NOT EXISTS remaining_quantity integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quick_supply_items.remaining_quantity IS
  'Unités du lot pas encore vendues. Décrémenté FIFO par les ventes, restitué aux '
  'annulations. Distinct du stock (store_inventory), que les inventaires corrigent aussi.';

-- La requête de la caisse : les lots vivants d'une boutique. Index partiel — les lots
-- ouverts sont une poignée de lignes au milieu d'un historique qui grossit chaque jour.
CREATE INDEX IF NOT EXISTS idx_quick_supply_items_open_lots
  ON public.quick_supply_items(store_id, product_id, created_at)
  WHERE remaining_quantity > 0;

/**
 * Quelles unités de quelle vente sont sorties de quel lot.
 *
 * On pourrait s'en passer et « deviner » à l'annulation — ce serait une erreur. Une
 * vente annulée puis supprimée restituerait deux fois, et un lot remonterait au-dessus
 * de ce qui est réellement entré. Le lien explicite rend la restitution EXACTE et
 * IDEMPOTENTE : on rend ce qui est écrit, puis on efface le lien ; le rejouer ne rend
 * rien de plus.
 *
 * Il donne en prime la réponse à la question que le propriétaire finit toujours par
 * poser : « ces cinq sacs vendus hier, ils venaient de quel arrivage ? »
 */
CREATE TABLE IF NOT EXISTS public.quick_supply_consumptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  supply_item_id uuid NOT NULL REFERENCES public.quick_supply_items(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  /** Coût unitaire du lot au moment de la sortie — figé, comme tout ce qui est comptable. */
  unit_cost numeric(18, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quick_supply_consumptions IS
  'Quelles unités vendues sont sorties de quel lot d''arrivage. Rend la restitution '
  'exacte et idempotente à l''annulation, et trace l''origine de la marchandise vendue.';

CREATE INDEX IF NOT EXISTS idx_quick_supply_consumptions_sale_item
  ON public.quick_supply_consumptions(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_quick_supply_consumptions_supply_item
  ON public.quick_supply_consumptions(supply_item_id);

ALTER TABLE public.quick_supply_consumptions ENABLE ROW LEVEL SECURITY;

-- Lecture pour les membres de l'entreprise (via le lot dont elle dépend). Écriture :
-- par les triggers seuls, qui sont SECURITY DEFINER — aucune policy d'écriture, donc
-- aucune écriture directe possible depuis un client.
DROP POLICY IF EXISTS "quick_supply_consumptions_select" ON public.quick_supply_consumptions;
CREATE POLICY "quick_supply_consumptions_select" ON public.quick_supply_consumptions FOR SELECT USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.quick_supply_items qsi
    WHERE qsi.id = supply_item_id
      AND qsi.company_id IN (SELECT * FROM public.current_user_company_ids())
  )
);

/** Coût unitaire réellement supporté sur une ligne de vente. NULL = pas de lot, coût catalogue. */
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric(18, 4);

COMMENT ON COLUMN public.sale_items.unit_cost IS
  'Coût unitaire réel de la ligne quand la marchandise vient d''un lot '
  'd''approvisionnement (moyenne pondérée si plusieurs lots). NULL = aucun lot : les '
  'rapports retombent sur products.purchase_price, comportement historique inchangé.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Le prix en vigueur pour une boutique
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Pour chaque produit ayant un lot ouvert : le prix auquel il doit se vendre ici et
 * maintenant, et le coût correspondant.
 *
 * Une seule requête pour toute la boutique — la caisse la joue à l'ouverture et la
 * superpose à son catalogue, exactement comme elle le fait déjà des promotions.
 *
 * `remaining` est borné par le STOCK RÉEL : un lot que l'inventaire a contredit (la
 * marchandise a disparu, ou elle a été comptée autrement) ne doit pas continuer à
 * imposer son prix sur du stock qui vient d'ailleurs.
 */
CREATE OR REPLACE FUNCTION public.quick_supply_store_lot_prices(p_store_id uuid)
RETURNS TABLE (
  product_id uuid,
  supply_item_id uuid,
  unit_sale_price numeric,
  unit_cost numeric,
  remaining integer,
  supply_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lots AS (
    SELECT DISTINCT ON (i.product_id)
      i.product_id AS lot_product_id,
      i.id AS lot_item_id,
      i.unit_sale_price AS lot_sale_price,
      i.unit_cost AS lot_cost,
      i.remaining_quantity AS lot_remaining,
      s.supply_number AS lot_number
    FROM public.quick_supply_items i
    JOIN public.quick_supplies s ON s.id = i.supply_id
    WHERE i.store_id = p_store_id
      AND i.remaining_quantity > 0
    -- Le plus ancien d'abord : c'est le lot qui doit partir en premier.
    ORDER BY i.product_id, i.created_at, i.position
  )
  SELECT
    l.lot_product_id,
    l.lot_item_id,
    l.lot_sale_price,
    l.lot_cost,
    LEAST(l.lot_remaining, GREATEST(0, COALESCE(si.quantity, 0)))::integer,
    l.lot_number
  FROM lots l
  LEFT JOIN public.store_inventory si
    ON si.store_id = p_store_id AND si.product_id = l.lot_product_id
  WHERE LEAST(l.lot_remaining, GREATEST(0, COALESCE(si.quantity, 0))) > 0
    AND public.has_store_access(
          p_store_id,
          (SELECT s2.company_id FROM public.stores s2 WHERE s2.id = p_store_id)
        );
$$;

COMMENT ON FUNCTION public.quick_supply_store_lot_prices(uuid) IS
  'Prix et coût en vigueur pour chaque produit ayant un lot d''arrivage ouvert dans '
  'cette boutique (FIFO, restant borné par le stock réel). Lu par la caisse.';

REVOKE ALL ON FUNCTION public.quick_supply_store_lot_prices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quick_supply_store_lot_prices(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Consommation et restitution — branchées sur les lignes de vente
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * Pourquoi des TRIGGERS plutôt qu'un ajout dans `create_sale_with_stock` : il existe
 * plusieurs chemins pour vendre (caisse rapide, facture A4, bon de la caisse à deux,
 * resynchronisation hors ligne, modification d'une vente). Les brancher un par un,
 * c'est en oublier un — et un chemin oublié laisse un lot qui ne se vide jamais, donc
 * un prix qui ne redevient jamais celui du catalogue. Le trigger, lui, tient la porte
 * par laquelle ils passent tous : `sale_items`.
 */
CREATE OR REPLACE FUNCTION public.quick_supply_consume_for_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_left int;
  v_take int;
  v_from_lots int := 0;
  v_cost_total numeric := 0;
  v_catalogue_cost numeric := 0;
  r RECORD;
BEGIN
  SELECT store_id INTO v_store FROM public.sales WHERE id = NEW.sale_id;
  IF v_store IS NULL OR NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RETURN NEW;
  END IF;

  v_left := NEW.quantity;

  FOR r IN
    SELECT id, remaining_quantity, unit_cost
    FROM public.quick_supply_items
    WHERE store_id = v_store
      AND product_id = NEW.product_id
      AND remaining_quantity > 0
    ORDER BY created_at, position
    -- Deux caisses qui vendent le même article à la même seconde ne doivent pas se
    -- servir deux fois dans le même lot.
    FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, r.remaining_quantity);

    UPDATE public.quick_supply_items
    SET remaining_quantity = remaining_quantity - v_take
    WHERE id = r.id;

    INSERT INTO public.quick_supply_consumptions (
      sale_item_id, supply_item_id, quantity, unit_cost
    )
    VALUES (NEW.id, r.id, v_take, COALESCE(r.unit_cost, 0));

    v_cost_total := v_cost_total + v_take * COALESCE(r.unit_cost, 0);
    v_from_lots := v_from_lots + v_take;
    v_left := v_left - v_take;
  END LOOP;

  IF v_from_lots = 0 THEN
    -- Aucun lot : on n'écrit rien. `unit_cost` reste NULL et les rapports gardent
    -- très exactement le comportement qu'ils ont toujours eu.
    RETURN NEW;
  END IF;

  /*
   * Ligne à cheval : les cinq derniers sacs du lot, plus sept du stock ordinaire. Le
   * coût de la ligne est la moyenne pondérée des deux — c'est le seul chiffre qui rende
   * la marge juste, et il évite de couper la ligne de vente en deux, ce que le client
   * ne comprendrait pas sur son ticket.
   */
  IF v_left > 0 THEN
    SELECT COALESCE(p.purchase_price, 0) INTO v_catalogue_cost
    FROM public.products p WHERE p.id = NEW.product_id;
    v_cost_total := v_cost_total + v_left * COALESCE(v_catalogue_cost, 0);
  END IF;

  UPDATE public.sale_items
  SET unit_cost = v_cost_total / NEW.quantity
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.quick_supply_consume_for_sale_item() IS
  'Sort la marchandise vendue des lots d''arrivage (FIFO) et fige le coût réel de la '
  'ligne. Sans lot ouvert : ne fait rien, sale_items.unit_cost reste NULL.';

-- AFTER : la ligne existe (son `id` est référencé par la consommation), et une vente
-- refusée plus loin dans la transaction annule tout, lots compris.
DROP TRIGGER IF EXISTS quick_supply_consume_trigger ON public.sale_items;
CREATE TRIGGER quick_supply_consume_trigger
  AFTER INSERT ON public.sale_items
  FOR EACH ROW
  EXECUTE PROCEDURE public.quick_supply_consume_for_sale_item();

/**
 * Restitution : la marchandise revient, le lot se remplit à nouveau.
 *
 * Idempotent par construction — on rend ce qui est ÉCRIT dans les liens, puis on efface
 * les liens. Une vente annulée puis supprimée ne restitue donc pas deux fois.
 */
CREATE OR REPLACE FUNCTION public.quick_supply_restore_for_sale_item(p_sale_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.id, c.supply_item_id, c.quantity
    FROM public.quick_supply_consumptions c
    WHERE c.sale_item_id = p_sale_item_id
  LOOP
    UPDATE public.quick_supply_items
    -- Plafonné à la quantité entrée : un lot ne peut pas contenir plus que ce qui est
    -- arrivé, quelle qu'ait été la suite d'annulations.
    SET remaining_quantity = LEAST(quantity, remaining_quantity + r.quantity)
    WHERE id = r.supply_item_id;

    DELETE FROM public.quick_supply_consumptions WHERE id = r.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.quick_supply_restore_for_sale_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quick_supply_restore_for_sale_item(uuid) TO authenticated;

/*
 * Ligne de vente supprimée — cas réel : la modification d'une vente déjà encaissée
 * efface les lignes et les réécrit. Sans ce trigger, chaque correction reconsommerait
 * le lot sans jamais le rendre, et il se viderait tout seul.
 *
 * `BEFORE DELETE` : après, la cascade aurait déjà emporté les liens et il n'y aurait
 * plus rien à rendre.
 */
CREATE OR REPLACE FUNCTION public.quick_supply_restore_on_sale_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.quick_supply_restore_for_sale_item(OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS quick_supply_restore_trigger ON public.sale_items;
CREATE TRIGGER quick_supply_restore_trigger
  BEFORE DELETE ON public.sale_items
  FOR EACH ROW
  EXECUTE PROCEDURE public.quick_supply_restore_on_sale_item_delete();

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Annulation d'une vente : rendre aussi les lots
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * `cancel_sale_restore_stock` (00023, corrigée en 00168) remet le stock et passe la
 * vente en `cancelled` — mais ne SUPPRIME pas les lignes. Sans l'ajout ci-dessous, la
 * marchandise reviendrait en stock tout en restant décomptée du lot : les unités
 * rendues se revendraient au prix du catalogue, et le lot s'éteindrait sans avoir été
 * vendu. On reprend donc la fonction à l'identique — même corps qu'en 00168 — avec la
 * seule restitution des lots en plus.
 */
CREATE OR REPLACE FUNCTION public.cancel_sale_restore_stock(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_item record;
  v_row_count int;
  v_uid uuid := auth.uid();
BEGIN
  SELECT id, store_id, status INTO v_sale
  FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente non trouvée';
  END IF;
  IF v_sale.status != 'completed' THEN
    RAISE EXCEPTION 'Vente déjà annulée ou non complétée';
  END IF;

  -- Restaurer le stock pour chaque ligne (atomique: UPDATE quantity = quantity + qty)
  FOR v_item IN
    SELECT id, product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    UPDATE public.store_inventory
    SET quantity = quantity + v_item.quantity,
        updated_at = now()
    WHERE store_id = v_sale.store_id AND product_id = v_item.product_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
      VALUES (v_sale.store_id, v_item.product_id, v_item.quantity, 0);
    END IF;

    INSERT INTO public.stock_movements (store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes)
    VALUES (v_sale.store_id, v_item.product_id, 'return_in', v_item.quantity, 'sale', p_sale_id, v_uid, 'Annulation vente');

    -- Ajout 00193 : la marchandise retourne aussi dans le lot d'où elle venait.
    PERFORM public.quick_supply_restore_for_sale_item(v_item.id);
  END LOOP;

  UPDATE public.sales SET status = 'cancelled' WHERE id = p_sale_id;
END;
$$;
