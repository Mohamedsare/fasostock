-- FasoStock — Restaurant : le service en salle, la cuisine, et ce qui se passe
-- AVANT que l'argent ne change de main.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUE LE LOGICIEL NE SAVAIT PAS FAIRE
-- ═════════════════════════════════════════════════════════════════════════════
-- Jusqu'ici, une vente naît au moment du paiement : le caissier compose un panier,
-- encaisse, imprime. C'est exact pour une boutique — le client paie puis emporte.
--
-- Un maquis ne marche pas comme ça. Le client s'assoit à la table 7. Il commande
-- une brochette et deux bières. Vingt minutes plus tard il rajoute du poulet. Ses
-- amis arrivent, commandent aussi. À 23 h, quelqu'un demande « l'addition de la 7 ».
-- Entre l'arrivée et le paiement, il s'est passé une heure et demie pendant
-- lesquelles il existait une commande RÉELLE — de la marchandise engagée, de la
-- cuisine occupée, un serveur responsable — que rien n'enregistrait.
--
-- Le carnet du serveur, c'est ça. Et c'est là que l'argent se perd : la ligne
-- oubliée au moment de l'addition, la table qui part sans payer, la bière servie
-- et jamais notée, le plat refait parce que la cuisine n'a pas su qu'il était prêt.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LA DÉCISION CENTRALE DE CE FICHIER
-- ═════════════════════════════════════════════════════════════════════════════
--
--   LA COMMANDE EST LE SERVICE. LA VENTE RESTE L'ARGENT.
--
-- `restaurant_orders` n'est pas une deuxième table de ventes. C'est le carnet du
-- serveur : qui est à quelle table, ce qui a été demandé, ce que la cuisine a
-- envoyé. Elle ne touche NI au stock, NI au chiffre d'affaires, NI au crédit.
--
-- Au moment de l'addition, la commande est encaissée par la caisse rapide
-- ordinaire (`create_sale_with_stock`), exactement comme n'importe quelle vente :
-- le stock sort là, le CA se compte là, les rapports et la comptabilité ne voient
-- rien de nouveau. La commande garde simplement le `sale_id` de la vente produite.
--
-- Pourquoi cette séparation plutôt qu'un `sales.status = 'draft'` étendu :
--
--  1. UNE COMMANDE OUVERTE N'EST PAS UNE VENTE. Elle peut être annulée sans laisser
--     de trace comptable, transférée d'une table à l'autre, partagée en deux
--     additions. Une vente, même brouillon, porte déjà un numéro, une créance
--     possible, une place dans les rapports. Mélanger les deux, c'est soit polluer
--     le chiffre d'affaires avec des tables qui n'ont pas encore payé, soit
--     interdire au serveur les gestes ordinaires de son métier.
--
--  2. LE STOCK NE SORT QU'UNE FOIS. Déduire à la commande obligerait à remettre en
--     stock à chaque annulation, à chaque transfert, à chaque correction de ligne —
--     dix écritures de mouvement pour une table de quatre. En sortant au paiement,
--     par le chemin déjà éprouvé de la caisse, il n'y a rien à réconcilier.
--
--  3. LA CUISINE A SON PROPRE RYTHME. Une ligne de commande a un état (envoyée, en
--     préparation, prête, servie) qui n'a aucun sens sur une ligne de vente. Le KDS
--     lit et écrit cet état ; la vente ne le connaît jamais.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Qui a le droit de tenir le carnet
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Prendre une commande, c'est le geste du serveur — pas celui du gérant. Le droit
 * se calque donc sur `sales.create` (celui qui tient la caisse rapide), élargi au
 * propriétaire et au gérant qui doivent pouvoir corriger une table sans avoir à
 * s'attribuer un rôle de service.
 *
 * Volontairement PAS un nouveau droit à cocher : un restaurant qui embauche un
 * serveur lui donne déjà « créer une vente ». Lui demander de cocher une seconde
 * case pour que le même serveur puisse prendre une commande n'apporterait aucune
 * sécurité — seulement un appel au support le soir de l'ouverture.
 */
CREATE OR REPLACE FUNCTION public.can_serve_restaurant(p_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.has_permission(p_company_id, 'sales.create')
      OR public.has_permission(p_company_id, 'sales.update')
      OR EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        JOIN public.roles r ON r.id = ucr.role_id
        WHERE ucr.user_id = auth.uid()
          AND ucr.company_id = p_company_id
          AND r.slug IN ('owner', 'manager')
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

/**
 * Dessiner la salle, créer une table, supprimer une zone : ce sont des gestes de
 * configuration, pas de service. Un serveur ne redessine pas le restaurant en
 * plein coup de feu.
 */
CREATE OR REPLACE FUNCTION public.can_configure_restaurant(p_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.has_permission(p_company_id, 'settings.manage')
      OR EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        JOIN public.roles r ON r.id = ucr.role_id
        WHERE ucr.user_id = auth.uid()
          AND ucr.company_id = p_company_id
          AND r.slug IN ('owner', 'manager')
      );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Les zones de la salle
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * « Terrasse », « Salle climatisée », « Étage », « Bar ». Un maquis d'Ouagadougou
 * n'a pas une salle mais trois espaces qui n'ont ni le même service, ni le même
 * public, ni parfois les mêmes prix. Le serveur qui prend la terrasse veut voir la
 * terrasse — pas les 40 tables de la maison.
 *
 * La zone est facultative : un petit restaurant de six tables n'a rien à ranger, et
 * on ne lui impose pas de créer une zone « Salle » pour pouvoir créer une table.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_areas (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  /** Ordre d'affichage choisi par la maison — la terrasse d'abord si c'est là que ça se passe. */
  position integer NOT NULL DEFAULT 0,
  /** Couleur du bandeau sur le plan de salle (hex court, ex. `#F97316`). */
  color text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_restaurant_areas_store
  ON public.restaurant_areas (store_id, position, name);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Les tables
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * `x` / `y` : la position sur le plan de salle, en pourcentage de la surface
 * (0 → 100). Pas en pixels : le patron dessine son plan sur un téléphone de 360 px
 * et le serveur le consulte sur une tablette de 1024 — des pixels donneraient deux
 * plans différents. Un pourcentage donne le même plan partout.
 *
 * `seats` sert à la réservation (« une table de 6 ce soir ») et au plan (une table
 * de 8 se dessine plus grande qu'une table de 2).
 *
 * PAS de colonne `status`. L'état d'une table — libre, occupée, réservée — se
 * DÉDUIT : elle est occupée s'il existe une commande ouverte dessus, réservée s'il
 * existe une réservation qui la retient à cette heure-ci. Une colonne dupliquerait
 * cette vérité et finirait par mentir : une table resterait « occupée » toute la
 * nuit parce qu'un serveur a fermé l'application avant d'encaisser.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.restaurant_areas(id) ON DELETE SET NULL,

  /** Ce que le serveur crie à la cuisine : « la 7 ». Court, unique dans la boutique. */
  label text NOT NULL,
  seats integer NOT NULL DEFAULT 4 CHECK (seats > 0 AND seats <= 60),

  /** Position sur le plan, en % de la surface. `NULL` = pas encore posée sur le plan. */
  x numeric(6,3) CHECK (x IS NULL OR (x >= 0 AND x <= 100)),
  y numeric(6,3) CHECK (y IS NULL OR (y >= 0 AND y <= 100)),
  /** `round` | `square` | `rect` — la forme dessinée, purement visuelle. */
  shape text NOT NULL DEFAULT 'round' CHECK (shape IN ('round', 'square', 'rect')),

  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Deux tables « 7 » dans la même boutique, et l'addition part à la mauvaise.
  UNIQUE (store_id, label)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_store
  ON public.restaurant_tables (store_id, is_active, label);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. La commande
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.restaurant_service_type AS ENUM ('dine_in', 'takeaway', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/**
 * `open`      — le carnet est ouvert, le serveur ajoute des lignes.
 * `paid`      — encaissée ; `sale_id` pointe la vente qui porte l'argent.
 * `cancelled` — table partie sans payer, erreur de saisie, commande annulée. Reste
 *               visible : une commande annulée à 23 h par le même serveur trois
 *               soirs de suite, c'est une information.
 *
 * Il n'y a délibérément PAS d'état « servie » au niveau de la commande : le service
 * est un fait de LIGNE (l'entrée est servie, le plat arrive). L'état global se lit
 * depuis les lignes, il ne se saisit pas deux fois.
 */
DO $$ BEGIN
  CREATE TYPE public.restaurant_order_status AS ENUM ('open', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS public.restaurant_order_number_seq;

CREATE TABLE IF NOT EXISTS public.restaurant_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  /** « CMD-412 » : ce qui est crié en cuisine et imprimé en haut du bon. */
  order_number text NOT NULL,

  service_type public.restaurant_service_type NOT NULL DEFAULT 'dine_in',
  status public.restaurant_order_status NOT NULL DEFAULT 'open',

  /**
   * La table. Obligatoire en salle par le contrôle plus bas, absente à emporter et
   * en livraison. `ON DELETE SET NULL` : supprimer une table de la salle ne doit pas
   * effacer l'historique des commandes qui s'y sont tenues.
   */
  table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  /** Le nom de la table figé au moment du service — la table peut être renommée après. */
  table_label text,

  /** Nombre de couverts : sert au ticket moyen par personne, pas au calcul. */
  covers integer NOT NULL DEFAULT 1 CHECK (covers > 0 AND covers <= 200),

  /**
   * Le client. Facultatif en salle (personne ne demande son nom à quelqu'un qui
   * commande un plat), utile à emporter et NÉCESSAIRE en livraison — c'est chez lui
   * qu'on va.
   */
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  /** Commande à emporter/livrer prise au téléphone : un nom et un numéro suffisent. */
  contact_name text,
  contact_phone text,
  delivery_address text,

  /** « Sans piment », « la dame est pressée », « anniversaire ». */
  note text,

  /**
   * LE SERVEUR RESPONSABLE. C'est lui qu'on cherche quand la table appelle, et c'est
   * sur lui que se calcule le classement des serveurs. Distinct de `created_by` :
   * une commande peut être ouverte par le gérant puis confiée à un serveur.
   */
  server_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  /** La vente qui porte l'argent. Renseignée à l'encaissement, jamais avant. */
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,

  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  /** Motif d'annulation — obligatoire côté RPC, un « annulé » muet ne s'audite pas. */
  cancel_reason text,

  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, order_number),

  -- Une commande en salle sans table, c'est une addition qu'on ne saura pas porter.
  CONSTRAINT restaurant_orders_dine_in_needs_table
    CHECK (service_type <> 'dine_in' OR table_id IS NOT NULL OR status = 'cancelled'),
  -- Une livraison sans adresse ni client, c'est un plat qui ne part nulle part.
  CONSTRAINT restaurant_orders_delivery_needs_where
    CHECK (
      service_type <> 'delivery'
      OR status = 'cancelled'
      OR customer_id IS NOT NULL
      OR COALESCE(btrim(delivery_address), '') <> ''
    )
);

/*
 * UNE SEULE COMMANDE OUVERTE PAR TABLE. Sans cette garantie, deux serveurs ouvrent
 * chacun la table 7 à trente secondes d'intervalle et la moitié des consommations
 * part sur un carnet que personne ne présentera à l'addition. C'est l'index partiel
 * qui l'impose — pas une vérification applicative, qui perd toujours la course.
 */
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_orders_open_per_table
  ON public.restaurant_orders (table_id)
  WHERE status = 'open' AND table_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_orders_store_status
  ON public.restaurant_orders (store_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_company_opened
  ON public.restaurant_orders (company_id, opened_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_server
  ON public.restaurant_orders (server_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_sale
  ON public.restaurant_orders (sale_id) WHERE sale_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Les lignes de commande, et l'état de la cuisine
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * `pending`   — noté sur le carnet, la cuisine ne l'a pas encore reçu.
 * `sent`      — envoyé en cuisine (le bon est tombé sur l'écran).
 * `preparing` — le cuisinier l'a pris.
 * `ready`     — c'est prêt, ça attend au passe. C'est L'ÉTAT QUI FAIT GAGNER DE
 *               L'ARGENT : un plat qui refroidit au passe est un plat renvoyé.
 * `served`    — porté à la table.
 * `void`      — annulé après envoi, avec motif (voir plus bas).
 *
 * Les boissons ne passent pas par la cuisine : elles sautent de `sent` à `served`,
 * décidé par l'application selon la station de production — pas par une colonne
 * de plus sur la ligne.
 */
DO $$ BEGIN
  CREATE TYPE public.restaurant_item_status AS ENUM ('pending', 'sent', 'preparing', 'ready', 'served', 'void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.restaurant_order_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.restaurant_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,

  /** Le nom figé au moment de la commande : le plat peut être renommé demain. */
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  /** Prix retenu à la commande — une promotion qui tombe à minuit ne change pas l'addition en cours. */
  unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0),

  /**
   * Suppléments et variantes choisis, figés en texte + montant. Le détail vit dans
   * `restaurant_order_item_options` (migration suivante) ; ces deux colonnes portent
   * ce qu'il faut pour afficher et facturer sans jointure, y compris si l'option a
   * été supprimée de la carte depuis.
   */
  options_label text,
  options_amount numeric(18,4) NOT NULL DEFAULT 0 CHECK (options_amount >= 0),

  /** « bien cuit », « sans oignon », « à emporter » — ce qui s'imprime sur le bon cuisine. */
  note text,

  status public.restaurant_item_status NOT NULL DEFAULT 'pending',

  /** Horodatage du parcours — c'est ce qui permet de dire « 14 min au passe ». */
  sent_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,

  /**
   * Ligne annulée APRÈS envoi en cuisine (`void`). Elle ne se supprime pas : le
   * produit a peut-être déjà été entamé, et une ligne qui disparaît du carnet est
   * exactement la façon dont une maison se fait voler. Motif obligatoire.
   */
  void_reason text,
  voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at timestamptz,

  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT restaurant_order_items_void_needs_reason
    CHECK (status <> 'void' OR COALESCE(btrim(void_reason), '') <> '')
);

CREATE INDEX IF NOT EXISTS idx_restaurant_order_items_order
  ON public.restaurant_order_items (order_id, created_at);
-- Le KDS : « tout ce qui est parti en cuisine et n'est pas encore servi », par ancienneté.
CREATE INDEX IF NOT EXISTS idx_restaurant_order_items_kitchen
  ON public.restaurant_order_items (company_id, status, sent_at)
  WHERE status IN ('sent', 'preparing', 'ready');
CREATE INDEX IF NOT EXISTS idx_restaurant_order_items_product
  ON public.restaurant_order_items (product_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Les réservations
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.restaurant_reservation_status AS ENUM ('booked', 'seated', 'honoured', 'no_show', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/**
 * « Une table de 8 samedi à 20 h au nom de M. Ouédraogo ». Tenu aujourd'hui sur un
 * cahier posé près de la caisse, qui se perd et que le serveur du soir n'a pas lu.
 *
 * `no_show` est un état à part entière, et pas un simple « annulé » : la maison qui
 * bloque sa meilleure table deux samedis de suite pour quelqu'un qui ne vient pas
 * doit pouvoir le voir avant de la bloquer une troisième fois.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_reservations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,

  guest_name text NOT NULL,
  guest_phone text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,

  party_size integer NOT NULL DEFAULT 2 CHECK (party_size > 0 AND party_size <= 200),
  /** Le moment convenu. Stocké en UTC, affiché dans le fuseau de l'entreprise (00206). */
  reserved_at timestamptz NOT NULL,
  /** Durée prévue — sert à savoir si la table est reprenable à 22 h. */
  duration_minutes integer NOT NULL DEFAULT 90 CHECK (duration_minutes BETWEEN 15 AND 600),

  status public.restaurant_reservation_status NOT NULL DEFAULT 'booked',
  note text,

  /** La commande née de la réservation — renseignée quand le groupe s'installe. */
  order_id uuid REFERENCES public.restaurant_orders(id) ON DELETE SET NULL,

  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_reservations_store_when
  ON public.restaurant_reservations (store_id, reserved_at);
CREATE INDEX IF NOT EXISTS idx_restaurant_reservations_status
  ON public.restaurant_reservations (company_id, status, reserved_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.restaurant_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_reservations ENABLE ROW LEVEL SECURITY;

-- Zones : lecture par toute la maison, écriture par ceux qui configurent.
DROP POLICY IF EXISTS "restaurant_areas_select" ON public.restaurant_areas;
CREATE POLICY "restaurant_areas_select" ON public.restaurant_areas FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "restaurant_areas_write" ON public.restaurant_areas;
CREATE POLICY "restaurant_areas_write" ON public.restaurant_areas FOR ALL
  USING (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_configure_restaurant(company_id)
  )
  WITH CHECK (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_configure_restaurant(company_id)
  );

DROP POLICY IF EXISTS "restaurant_tables_select" ON public.restaurant_tables;
CREATE POLICY "restaurant_tables_select" ON public.restaurant_tables FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "restaurant_tables_write" ON public.restaurant_tables;
CREATE POLICY "restaurant_tables_write" ON public.restaurant_tables FOR ALL
  USING (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_configure_restaurant(company_id)
  )
  WITH CHECK (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_configure_restaurant(company_id)
  );

/*
 * Commandes et lignes : LECTURE seule par policy. Toute écriture passe par les RPC
 * plus bas — règle « écriture RPC uniquement » du projet.
 *
 * La raison n'est pas théorique. Une policy garde une LIGNE, pas une COLONNE : avec
 * un UPDATE ouvert, un serveur pourrait passer `status` à `paid` et poser un
 * `sale_id` de son choix — une table encaissée sans qu'un franc soit entré. Les RPC
 * ci-dessous décident seuls des transitions.
 */
DROP POLICY IF EXISTS "restaurant_orders_select" ON public.restaurant_orders;
CREATE POLICY "restaurant_orders_select" ON public.restaurant_orders FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "restaurant_order_items_select" ON public.restaurant_order_items;
CREATE POLICY "restaurant_order_items_select" ON public.restaurant_order_items FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- Réservations : un cahier, pas de l'argent. Écriture directe pour qui sert.
DROP POLICY IF EXISTS "restaurant_reservations_select" ON public.restaurant_reservations;
CREATE POLICY "restaurant_reservations_select" ON public.restaurant_reservations FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "restaurant_reservations_write" ON public.restaurant_reservations;
CREATE POLICY "restaurant_reservations_write" ON public.restaurant_reservations FOR ALL
  USING (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_serve_restaurant(company_id)
  )
  WITH CHECK (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_serve_restaurant(company_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Ouvrir une commande
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Renvoie l'id de la commande ouverte.
 *
 * IDEMPOTENT SUR LA TABLE : si la table a déjà une commande ouverte, on la renvoie
 * au lieu d'échouer. C'est le comportement attendu par le serveur — il touche la
 * table 7, il veut « la 7 », qu'il l'ait ouverte lui-même il y a une heure ou qu'un
 * collègue s'en soit chargé. Échouer ici forcerait le serveur à comprendre une
 * erreur en plein coup de feu.
 */
CREATE OR REPLACE FUNCTION public.restaurant_open_order(
  p_company_id uuid,
  p_store_id uuid,
  p_service_type text,
  p_table_id uuid DEFAULT NULL,
  p_covers integer DEFAULT 1,
  p_customer_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_delivery_address text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_server_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
  v_label text;
  v_service public.restaurant_service_type;
BEGIN
  IF NOT public.can_serve_restaurant(p_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de prendre une commande.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Cette boutique ne vous est pas assignée.' USING ERRCODE = '42501';
  END IF;

  v_service := p_service_type::public.restaurant_service_type;

  IF v_service = 'dine_in' THEN
    IF p_table_id IS NULL THEN
      RAISE EXCEPTION 'Choisissez une table pour une commande en salle.' USING ERRCODE = '23514';
    END IF;
    SELECT label INTO v_label FROM public.restaurant_tables
      WHERE id = p_table_id AND store_id = p_store_id AND company_id = p_company_id;
    IF v_label IS NULL THEN
      RAISE EXCEPTION 'Table introuvable dans cette boutique.' USING ERRCODE = '23503';
    END IF;

    -- Déjà ouverte : on rend la commande en cours plutôt que d'échouer.
    SELECT id INTO v_existing FROM public.restaurant_orders
      WHERE table_id = p_table_id AND status = 'open';
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  INSERT INTO public.restaurant_orders (
    company_id, store_id, order_number, service_type, table_id, table_label,
    covers, customer_id, contact_name, contact_phone, delivery_address, note,
    server_id, created_by
  ) VALUES (
    p_company_id, p_store_id,
    'CMD-' || nextval('public.restaurant_order_number_seq')::text,
    v_service,
    CASE WHEN v_service = 'dine_in' THEN p_table_id ELSE NULL END,
    v_label,
    GREATEST(1, COALESCE(p_covers, 1)),
    p_customer_id,
    NULLIF(btrim(COALESCE(p_contact_name, '')), ''),
    NULLIF(btrim(COALESCE(p_contact_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_delivery_address, '')), ''),
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    COALESCE(p_server_id, auth.uid()),
    auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Ajouter des lignes à une commande ouverte
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * `p_items` : `[{product_id, quantity, unit_price, note, options_label, options_amount}]`.
 *
 * Les lignes entrent en `pending` — notées sur le carnet, pas encore parties en
 * cuisine. Le serveur peut donc corriger avant d'envoyer ; c'est `restaurant_send_to_kitchen`
 * qui rend l'envoi irréversible.
 */
CREATE OR REPLACE FUNCTION public.restaurant_add_order_items(
  p_order_id uuid,
  p_items jsonb
) RETURNS integer AS $$
DECLARE
  v_company uuid;
  v_status public.restaurant_order_status;
  v_item jsonb;
  v_count integer := 0;
  v_name text;
BEGIN
  SELECT company_id, status INTO v_company, v_status
    FROM public.restaurant_orders WHERE id = p_order_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de modifier cette commande.' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Cette commande est close : rouvrez-en une nouvelle.' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    SELECT name INTO v_name FROM public.products
      WHERE id = (v_item->>'product_id')::uuid AND company_id = v_company;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Article introuvable dans votre carte.' USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.restaurant_order_items (
      company_id, order_id, product_id, product_name, quantity, unit_price,
      options_label, options_amount, note, created_by
    ) VALUES (
      v_company, p_order_id, (v_item->>'product_id')::uuid, v_name,
      GREATEST(1, COALESCE((v_item->>'quantity')::integer, 1)),
      GREATEST(0, COALESCE((v_item->>'unit_price')::numeric, 0)),
      NULLIF(btrim(COALESCE(v_item->>'options_label', '')), ''),
      GREATEST(0, COALESCE((v_item->>'options_amount')::numeric, 0)),
      NULLIF(btrim(COALESCE(v_item->>'note', '')), ''),
      auth.uid()
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.restaurant_orders SET updated_at = now() WHERE id = p_order_id;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Corriger une ligne encore sur le carnet
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Quantité, note, ou suppression pure — mais SEULEMENT tant que la ligne est
 * `pending`. Une fois partie en cuisine, elle ne se corrige plus : elle s'annule
 * avec un motif (`restaurant_void_order_item`). C'est toute la différence entre
 * « je me suis trompé en notant » et « on a jeté un plat ».
 */
CREATE OR REPLACE FUNCTION public.restaurant_update_order_item(
  p_item_id uuid,
  p_quantity integer DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_delete boolean DEFAULT false
) RETURNS void AS $$
DECLARE
  v_company uuid;
  v_status public.restaurant_item_status;
  v_order uuid;
  v_order_status public.restaurant_order_status;
BEGIN
  SELECT i.company_id, i.status, i.order_id, o.status
    INTO v_company, v_status, v_order, v_order_status
    FROM public.restaurant_order_items i
    JOIN public.restaurant_orders o ON o.id = i.order_id
   WHERE i.id = p_item_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Ligne introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de modifier cette commande.' USING ERRCODE = '42501';
  END IF;
  IF v_order_status <> 'open' THEN
    RAISE EXCEPTION 'Cette commande est close.' USING ERRCODE = '23514';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Cet article est déjà parti en cuisine : annulez-le avec un motif.'
      USING ERRCODE = '23514';
  END IF;

  IF p_delete THEN
    DELETE FROM public.restaurant_order_items WHERE id = p_item_id;
  ELSE
    UPDATE public.restaurant_order_items
       SET quantity = COALESCE(GREATEST(1, p_quantity), quantity),
           note = CASE WHEN p_note IS NULL THEN note
                       ELSE NULLIF(btrim(p_note), '') END
     WHERE id = p_item_id;
  END IF;

  UPDATE public.restaurant_orders SET updated_at = now() WHERE id = v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Envoyer en cuisine
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Le geste qui fait tomber le bon sur l'écran de la cuisine. Passe toutes les
 * lignes `pending` de la commande en `sent` et horodate.
 *
 * `p_direct_serve_ids` : les lignes qui ne passent pas par la cuisine (bières,
 * sucreries — le serveur les prend au frigo). Elles vont directement en `served`.
 * La liste vient de l'application, qui connaît la station de production de chaque
 * article ; la base ne devine pas ce qui se cuisine.
 */
CREATE OR REPLACE FUNCTION public.restaurant_send_to_kitchen(
  p_order_id uuid,
  p_direct_serve_ids uuid[] DEFAULT NULL
) RETURNS integer AS $$
DECLARE
  v_company uuid;
  v_status public.restaurant_order_status;
  v_sent integer := 0;
BEGIN
  SELECT company_id, status INTO v_company, v_status
    FROM public.restaurant_orders WHERE id = p_order_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''envoyer cette commande.' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Cette commande est close.' USING ERRCODE = '23514';
  END IF;

  WITH moved AS (
    UPDATE public.restaurant_order_items
       SET status = CASE
             WHEN p_direct_serve_ids IS NOT NULL AND id = ANY(p_direct_serve_ids)
               THEN 'served'::public.restaurant_item_status
             ELSE 'sent'::public.restaurant_item_status
           END,
           sent_at = now(),
           served_at = CASE
             WHEN p_direct_serve_ids IS NOT NULL AND id = ANY(p_direct_serve_ids)
               THEN now() ELSE served_at
           END
     WHERE order_id = p_order_id AND status = 'pending'
     RETURNING 1
  )
  SELECT count(*) INTO v_sent FROM moved;

  UPDATE public.restaurant_orders SET updated_at = now() WHERE id = p_order_id;
  RETURN v_sent;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Faire avancer une ligne en cuisine (KDS)
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Le seul chemin autorisé est celui du service réel :
 *
 *   sent → preparing → ready → served
 *
 * On accepte les sauts en avant (le cuisinier tape « prêt » sans être passé par
 * « en préparation », c'est courant quand ça va vite), jamais les retours : une
 * ligne servie ne redevient pas « en préparation ». Sans cette règle, un écran de
 * cuisine mal touché ferait ressortir des plats déjà partis, et la salle referait
 * un plat déjà mangé.
 */
CREATE OR REPLACE FUNCTION public.restaurant_advance_item(
  p_item_id uuid,
  p_status text
) RETURNS void AS $$
DECLARE
  v_company uuid;
  v_current public.restaurant_item_status;
  v_next public.restaurant_item_status;
  v_rank_current integer;
  v_rank_next integer;
BEGIN
  SELECT company_id, status INTO v_company, v_current
    FROM public.restaurant_order_items WHERE id = p_item_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Ligne introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de toucher à la cuisine.' USING ERRCODE = '42501';
  END IF;

  v_next := p_status::public.restaurant_item_status;

  v_rank_current := CASE v_current
    WHEN 'pending' THEN 0 WHEN 'sent' THEN 1 WHEN 'preparing' THEN 2
    WHEN 'ready' THEN 3 WHEN 'served' THEN 4 ELSE 9 END;
  v_rank_next := CASE v_next
    WHEN 'pending' THEN 0 WHEN 'sent' THEN 1 WHEN 'preparing' THEN 2
    WHEN 'ready' THEN 3 WHEN 'served' THEN 4 ELSE 9 END;

  IF v_current = 'void' THEN
    RAISE EXCEPTION 'Cet article a été annulé.' USING ERRCODE = '23514';
  END IF;
  IF v_rank_next <= v_rank_current THEN
    RAISE EXCEPTION 'Un article ne revient pas en arrière.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.restaurant_order_items
     SET status = v_next,
         ready_at  = CASE WHEN v_next = 'ready'  THEN now() ELSE ready_at END,
         served_at = CASE WHEN v_next = 'served' THEN now() ELSE served_at END
   WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. Annuler une ligne déjà partie en cuisine
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Elle ne disparaît pas : elle passe en `void` avec un motif, un auteur et une
 * heure. Une ligne effaçable sans trace, c'est la porte ouverte au plat servi puis
 * retiré de l'addition — le vol le plus banal en restauration, et le seul que le
 * patron ne peut pas voir en comptant sa caisse.
 */
CREATE OR REPLACE FUNCTION public.restaurant_void_order_item(
  p_item_id uuid,
  p_reason text
) RETURNS void AS $$
DECLARE
  v_company uuid;
  v_order uuid;
  v_order_status public.restaurant_order_status;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Indiquez pourquoi cet article est annulé.' USING ERRCODE = '23514';
  END IF;

  SELECT i.company_id, i.order_id, o.status INTO v_company, v_order, v_order_status
    FROM public.restaurant_order_items i
    JOIN public.restaurant_orders o ON o.id = i.order_id
   WHERE i.id = p_item_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Ligne introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de modifier cette commande.' USING ERRCODE = '42501';
  END IF;
  IF v_order_status <> 'open' THEN
    RAISE EXCEPTION 'Cette commande est close.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.restaurant_order_items
     SET status = 'void', void_reason = btrim(p_reason),
         voided_by = auth.uid(), voided_at = now()
   WHERE id = p_item_id;

  UPDATE public.restaurant_orders SET updated_at = now() WHERE id = v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Déplacer une commande de table
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * « Ils étaient à la 3, ils sont passés à la 9 en terrasse. » Se produit dix fois
 * par service. Sans ce geste, le serveur annule et ressaisit — et perd les lignes
 * déjà en cuisine.
 */
CREATE OR REPLACE FUNCTION public.restaurant_move_order(
  p_order_id uuid,
  p_table_id uuid
) RETURNS void AS $$
DECLARE
  v_company uuid;
  v_store uuid;
  v_status public.restaurant_order_status;
  v_label text;
  v_busy uuid;
BEGIN
  SELECT company_id, store_id, status INTO v_company, v_store, v_status
    FROM public.restaurant_orders WHERE id = p_order_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de déplacer cette commande.' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Cette commande est close.' USING ERRCODE = '23514';
  END IF;

  SELECT label INTO v_label FROM public.restaurant_tables
    WHERE id = p_table_id AND store_id = v_store AND company_id = v_company;
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'Table introuvable dans cette boutique.' USING ERRCODE = '23503';
  END IF;

  SELECT id INTO v_busy FROM public.restaurant_orders
    WHERE table_id = p_table_id AND status = 'open' AND id <> p_order_id;
  IF v_busy IS NOT NULL THEN
    RAISE EXCEPTION 'La table % a déjà une commande en cours.', v_label USING ERRCODE = '23505';
  END IF;

  UPDATE public.restaurant_orders
     SET table_id = p_table_id, table_label = v_label,
         service_type = 'dine_in', updated_at = now()
   WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Modifier l'entête d'une commande ouverte
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Couverts, note, contact, serveur responsable. Volontairement SANS `status` ni
 * `sale_id` : ces deux-là ne se saisissent jamais, ils se déduisent d'un
 * encaissement ou d'une annulation.
 */
CREATE OR REPLACE FUNCTION public.restaurant_update_order(
  p_order_id uuid,
  p_covers integer DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_delivery_address text DEFAULT NULL,
  p_server_id uuid DEFAULT NULL,
  p_clear_customer boolean DEFAULT false
) RETURNS void AS $$
DECLARE
  v_company uuid;
  v_status public.restaurant_order_status;
BEGIN
  SELECT company_id, status INTO v_company, v_status
    FROM public.restaurant_orders WHERE id = p_order_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de modifier cette commande.' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Cette commande est close.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.restaurant_orders
     SET covers = COALESCE(GREATEST(1, p_covers), covers),
         note = CASE WHEN p_note IS NULL THEN note ELSE NULLIF(btrim(p_note), '') END,
         customer_id = CASE WHEN p_clear_customer THEN NULL
                            ELSE COALESCE(p_customer_id, customer_id) END,
         contact_name = CASE WHEN p_contact_name IS NULL THEN contact_name
                             ELSE NULLIF(btrim(p_contact_name), '') END,
         contact_phone = CASE WHEN p_contact_phone IS NULL THEN contact_phone
                              ELSE NULLIF(btrim(p_contact_phone), '') END,
         delivery_address = CASE WHEN p_delivery_address IS NULL THEN delivery_address
                                 ELSE NULLIF(btrim(p_delivery_address), '') END,
         server_id = COALESCE(p_server_id, server_id),
         updated_at = now()
   WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. Annuler une commande entière
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Motif obligatoire. Rien n'est supprimé : la commande et ses lignes restent
 * lisibles, ce qui permet de répondre à « pourquoi la 12 a été annulée samedi ? ».
 * Aucun stock à rendre — il n'était jamais sorti (voir l'entête du fichier).
 */
CREATE OR REPLACE FUNCTION public.restaurant_cancel_order(
  p_order_id uuid,
  p_reason text
) RETURNS void AS $$
DECLARE
  v_company uuid;
  v_status public.restaurant_order_status;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Indiquez pourquoi cette commande est annulée.' USING ERRCODE = '23514';
  END IF;

  SELECT company_id, status INTO v_company, v_status
    FROM public.restaurant_orders WHERE id = p_order_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''annuler cette commande.' USING ERRCODE = '42501';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'Cette commande est encaissée : annulez la vente correspondante.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.restaurant_orders
     SET status = 'cancelled', cancel_reason = btrim(p_reason),
         closed_at = now(), updated_at = now()
   WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. Rattacher la commande à la vente qui l'a encaissée
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Appelée APRÈS `create_sale_with_stock`, avec la vente qu'elle vient de produire.
 * C'est le seul chemin vers `status = 'paid'`, et il exige une vente qui existe,
 * qui appartient à la même entreprise, et qui n'est pas déjà attachée à une autre
 * commande — trois vérifications qui ferment la table encaissée sans argent.
 *
 * Les lignes encore en cuisine passent en `served` : le client a payé et il est
 * parti, laisser un bon ouvert au KDS ferait cuisiner dans le vide.
 */
CREATE OR REPLACE FUNCTION public.restaurant_settle_order(
  p_order_id uuid,
  p_sale_id uuid
) RETURNS void AS $$
DECLARE
  v_company uuid;
  v_status public.restaurant_order_status;
  v_sale_company uuid;
  v_taken uuid;
BEGIN
  SELECT company_id, status INTO v_company, v_status
    FROM public.restaurant_orders WHERE id = p_order_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser cette commande.' USING ERRCODE = '42501';
  END IF;
  IF v_status = 'paid' THEN
    RETURN; -- déjà encaissée : rejouer ne doit rien casser (réseau capricieux).
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cette commande a été annulée.' USING ERRCODE = '23514';
  END IF;

  SELECT company_id INTO v_sale_company FROM public.sales WHERE id = p_sale_id;
  IF v_sale_company IS NULL OR v_sale_company <> v_company THEN
    RAISE EXCEPTION 'Vente introuvable.' USING ERRCODE = '23503';
  END IF;

  SELECT id INTO v_taken FROM public.restaurant_orders
    WHERE sale_id = p_sale_id AND id <> p_order_id;
  IF v_taken IS NOT NULL THEN
    RAISE EXCEPTION 'Cette vente règle déjà une autre commande.' USING ERRCODE = '23505';
  END IF;

  UPDATE public.restaurant_order_items
     SET status = 'served', served_at = COALESCE(served_at, now())
   WHERE order_id = p_order_id AND status IN ('pending', 'sent', 'preparing', 'ready');

  UPDATE public.restaurant_orders
     SET status = 'paid', sale_id = p_sale_id, closed_at = now(), updated_at = now()
   WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. Droits d'exécution
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.can_serve_restaurant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_configure_restaurant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_open_order(uuid, uuid, text, uuid, integer, uuid, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_add_order_items(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_update_order_item(uuid, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_send_to_kitchen(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_advance_item(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_void_order_item(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_move_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_update_order(uuid, integer, text, uuid, text, text, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_cancel_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_settle_order(uuid, uuid) TO authenticated;
