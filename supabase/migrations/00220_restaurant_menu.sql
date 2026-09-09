-- FasoStock — Restaurant : la carte, les options, la fiche technique, le gaspillage.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POURQUOI UN PLAT N'EST PAS UN PRODUIT DE BOUTIQUE
-- ═════════════════════════════════════════════════════════════════════════════
-- Un sac de riz se vend tel quel : un nom, un prix, une quantité en stock. Un
-- « poulet braisé » ne se vend jamais tel quel. Il se vend :
--
--   • à une station de production — le grill, pas la cuisine, pas le bar. Le bon
--     doit tomber devant la bonne personne, sinon il attend derrière quinze plats
--     qui ne le concernent pas ;
--   • avec des choix — « demi ou entier », « frites ou attiéké », « + fromage » —
--     qui changent le prix et ce que la cuisine doit faire ;
--   • en s'épuisant sans que le stock ne bouge : il n'y a plus de poisson ce soir,
--     mais l'application ne le sait pas parce que le poisson n'a jamais été compté
--     à l'unité. Il faut pouvoir le RETIRER DE LA CARTE en un geste, à 21 h, sans
--     rien supprimer ;
--   • en consommant des ingrédients qui, eux, sont bien en stock. Un poulet braisé,
--     c'est un poulet, de l'huile, des épices — et c'est le seul moyen de savoir ce
--     qu'il coûte VRAIMENT et si son prix de vente tient.
--
-- Ce fichier ajoute ces quatre choses, sans toucher à `products`. La table
-- `products` reste le catalogue commun à tous les métiers, et elle est désormais
-- protégée en écriture (00217) : un serveur ne doit pas pouvoir modifier un prix
-- parce qu'il a retiré le poisson de la carte.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Les stations de production
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * « Cuisine », « Grill », « Bar », « Pâtisserie ». Chaque station a son écran KDS.
 *
 * Une station SANS écran (`kds_enabled = false`) est le cas du bar dans un petit
 * maquis : le serveur prend la bière lui-même au frigo. Les articles de cette
 * station ne partent pas en cuisine, ils sont servis directement — c'est ce que
 * lit `restaurant_send_to_kitchen(p_direct_serve_ids)`.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_stations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  /** Couleur de la colonne KDS et de la puce sur la carte. */
  color text,
  position integer NOT NULL DEFAULT 0,
  /** `false` = pas d'écran : le serveur sert directement (bar, frigo, comptoir). */
  kds_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_restaurant_stations_company
  ON public.restaurant_stations (company_id, position, name);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La fiche « carte » d'un article
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Ce que `products` ne sait pas dire d'un plat. Une ligne par article de la carte,
 * créée à la demande — un article sans ligne ici reste vendable, il est simplement
 * traité avec les valeurs par défaut (station : aucune, donc service direct).
 *
 * `is_available` est LA colonne du service. Elle est fausse dix fois par semaine et
 * redevient vraie le lendemain matin : plus de poisson, plus de dolo, le four est
 * cassé. Elle ne touche ni au stock, ni au prix, ni à `products.is_active` — un
 * article retiré de la carte ce soir doit revenir demain sans qu'on le recrée.
 *
 * `course` sert au tri du bon cuisine et de l'addition : les entrées d'abord, les
 * boissons à part. C'est du texte libre contrôlé plutôt qu'un enum — une maison
 * peut avoir des « accompagnements » ou des « suppléments » qui ne rentrent dans
 * aucune liste fermée.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_menu_items (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  station_id uuid REFERENCES public.restaurant_stations(id) ON DELETE SET NULL,

  /** `starter` | `main` | `side` | `dessert` | `drink` | `other`. */
  course text NOT NULL DEFAULT 'main'
    CHECK (course IN ('starter', 'main', 'side', 'dessert', 'drink', 'other')),

  /** Temps de préparation annoncé, en minutes. Sert au KDS (« en retard ») et à la salle. */
  prep_minutes integer CHECK (prep_minutes IS NULL OR (prep_minutes >= 0 AND prep_minutes <= 600)),

  /** Retiré de la carte pour le service en cours. Se remet en un geste. */
  is_available boolean NOT NULL DEFAULT true,
  /** Pourquoi il est retiré : « plus de poisson ». S'affiche au serveur. */
  unavailable_reason text,
  unavailable_since timestamptz,

  /** Ordre d'apparition dans sa catégorie sur la caisse. */
  position integer NOT NULL DEFAULT 0,
  /** Mis en avant : les six articles qui font 70 % du chiffre, en tête de caisse. */
  is_featured boolean NOT NULL DEFAULT false,

  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_restaurant_menu_items_company
  ON public.restaurant_menu_items (company_id, course, position);
CREATE INDEX IF NOT EXISTS idx_restaurant_menu_items_station
  ON public.restaurant_menu_items (station_id) WHERE station_id IS NOT NULL;
-- Le serveur veut d'abord savoir ce qui MANQUE : la liste courte, tout de suite.
CREATE INDEX IF NOT EXISTS idx_restaurant_menu_items_unavailable
  ON public.restaurant_menu_items (company_id) WHERE is_available = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Les options : variantes et suppléments
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Un seul mécanisme pour les deux, parce que c'est la même chose vue de deux côtés :
 *
 *   « Taille »        min 1, max 1  → une VARIANTE (il faut choisir, une seule)
 *   « Accompagnement » min 1, max 1 → une variante aussi
 *   « Suppléments »   min 0, max 5  → des SUPPLÉMENTS (facultatifs, cumulables)
 *
 * Deux tables auraient dupliqué l'écran de saisie, l'écran de caisse, le calcul du
 * prix et l'impression du bon — pour une différence qui tient dans deux entiers.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_modifier_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  /** Ce que lit le serveur en caisse : « Quelle cuisson ? ». */
  prompt text,
  min_select integer NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select integer NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT restaurant_modifier_groups_bounds CHECK (min_select <= max_select)
);

CREATE TABLE IF NOT EXISTS public.restaurant_modifiers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.restaurant_modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  /**
   * Ce que l'option AJOUTE au prix. Peut être 0 (« sans piment ») et ne peut pas
   * être négatif : une remise se fait sur l'addition, pas en cachette dans une
   * option — sinon un serveur crée « - 500 » et se sert.
   */
  price_delta numeric(18,4) NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
  /**
   * L'ingrédient consommé par l'option, s'il est suivi en stock (« + fromage » =
   * une portion de fromage). Facultatif : « bien cuit » ne consomme rien.
   */
  linked_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_modifiers_group
  ON public.restaurant_modifiers (group_id, position, name);

/** Quels groupes d'options s'appliquent à quel article de la carte. */
CREATE TABLE IF NOT EXISTS public.restaurant_menu_item_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.restaurant_modifier_groups(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  UNIQUE (product_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_menu_item_groups_product
  ON public.restaurant_menu_item_groups (product_id, position);

/**
 * Ce qui a été choisi sur une ligne de commande. Le libellé et le montant sont
 * FIGÉS ici comme sur la ligne : une option supprimée de la carte le mois prochain
 * ne doit pas rendre illisible une addition d'aujourd'hui.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_order_item_options (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.restaurant_order_items(id) ON DELETE CASCADE,
  modifier_id uuid REFERENCES public.restaurant_modifiers(id) ON DELETE SET NULL,
  label text NOT NULL,
  price_delta numeric(18,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_order_item_options_item
  ON public.restaurant_order_item_options (order_item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. La fiche technique (recette)
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * CE QUE COÛTE VRAIMENT UN PLAT.
 *
 * C'est le chiffre que presque aucun restaurant d'ici ne connaît, et c'est celui
 * qui décide si la maison gagne de l'argent. Le patron sait qu'un poulet braisé se
 * vend 2 500. Il ne sait pas qu'il lui coûte 1 700 depuis que le poulet a augmenté,
 * et qu'à ce prix-là il travaille pour son fournisseur.
 *
 * La recette liste les ingrédients et leur quantité PAR PORTION. Le coût se calcule
 * en lisant `products.purchase_price` de chaque ingrédient — donc il suit
 * automatiquement les prix d'achat réels, sans ressaisie.
 *
 * DÉLIBÉRÉMENT SANS DÉSTOCKAGE AUTOMATIQUE. Il serait tentant de déduire le poulet
 * et l'huile à chaque plat vendu. On ne le fait pas : personne ici ne pèse l'huile,
 * et un stock d'ingrédients faux à 15 % rendrait tout le module inutilisable en
 * trois semaines. Les ingrédients se comptent à l'inventaire ; la fiche technique
 * sert à CHIFFRER et à comparer, pas à prétendre compter.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_recipes (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  /** Nombre de portions produites par la recette telle qu'elle est écrite. */
  yield_portions numeric(12,3) NOT NULL DEFAULT 1 CHECK (yield_portions > 0),
  /** Le tour de main : ce qu'un nouveau cuisinier doit lire. */
  instructions text,
  /** Perte inévitable (épluchures, cuisson), en % — s'ajoute au coût. */
  waste_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (waste_percent >= 0 AND waste_percent <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.restaurant_recipe_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipe_product_id uuid NOT NULL REFERENCES public.restaurant_recipes(product_id) ON DELETE CASCADE,
  /** L'ingrédient — un produit ordinaire du catalogue, avec son prix d'achat. */
  ingredient_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  /** L'unité telle que la cuisine la dit : « g », « cl », « pièce », « louche ». */
  unit text NOT NULL DEFAULT 'pce',
  /**
   * Combien d'unités de recette dans UNE unité d'achat. Le riz s'achète au sac de
   * 25 kg et se dose en grammes : `units_per_purchase = 25000`. Sans ce facteur, le
   * coût d'une portion de riz serait celui d'un sac entier.
   */
  units_per_purchase numeric(14,4) NOT NULL DEFAULT 1 CHECK (units_per_purchase > 0),
  note text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (recipe_product_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_recipe_items_recipe
  ON public.restaurant_recipe_items (recipe_product_id, position);
CREATE INDEX IF NOT EXISTS idx_restaurant_recipe_items_ingredient
  ON public.restaurant_recipe_items (ingredient_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Le gaspillage
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Le plat renvoyé, la marmite brûlée, les dix bières périmées, le poisson qui a
 * tourné parce que le congélateur s'est arrêté. Dans une boutique c'est rare ; dans
 * un restaurant c'est quotidien, et c'est la deuxième cause de disparition du
 * bénéfice après le vol.
 *
 * CONTRAIREMENT à la commande, LA PERTE TOUCHE AU STOCK : la marchandise est
 * réellement partie, et si on ne la sort pas, l'inventaire de fin de mois accusera
 * un manquant que personne ne saura expliquer. Le RPC écrit donc un vrai
 * `stock_movements` de type `loss`, comme le reste de l'application.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_waste (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,

  quantity integer NOT NULL CHECK (quantity > 0),
  /** Coût unitaire figé au moment de la perte (`products.purchase_price`). */
  unit_cost numeric(18,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),

  /** `spoiled` | `broken` | `returned` | `overcooked` | `theft` | `other`. */
  reason text NOT NULL DEFAULT 'other'
    CHECK (reason IN ('spoiled', 'broken', 'returned', 'overcooked', 'theft', 'other')),
  note text,

  /** La commande d'où vient le renvoi, quand la perte a un coupable identifié. */
  order_id uuid REFERENCES public.restaurant_orders(id) ON DELETE SET NULL,

  /** `true` si le stock a bien été déduit — faux pour un ingrédient non suivi. */
  stock_deducted boolean NOT NULL DEFAULT false,

  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_waste_store_date
  ON public.restaurant_waste (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurant_waste_company_date
  ON public.restaurant_waste (company_id, created_at DESC, id DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.restaurant_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menu_item_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_order_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_waste ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  -- Lecture : toute la maison. On ne cache pas la carte à ses propres serveurs.
  FOREACH t IN ARRAY ARRAY[
    'restaurant_stations', 'restaurant_menu_items', 'restaurant_modifier_groups',
    'restaurant_modifiers', 'restaurant_menu_item_groups',
    'restaurant_order_item_options', 'restaurant_recipes', 'restaurant_recipe_items',
    'restaurant_waste'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_super_admin() '
      'OR company_id IN (SELECT * FROM public.current_user_company_ids()))',
      t || '_select', t
    );
  END LOOP;

  -- Construire la carte : configuration (propriétaire / gérant / settings.manage).
  FOREACH t IN ARRAY ARRAY[
    'restaurant_stations', 'restaurant_modifier_groups', 'restaurant_modifiers',
    'restaurant_menu_item_groups', 'restaurant_recipes', 'restaurant_recipe_items'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL '
      'USING (company_id IN (SELECT * FROM public.current_user_company_ids()) '
      '       AND public.can_configure_restaurant(company_id)) '
      'WITH CHECK (company_id IN (SELECT * FROM public.current_user_company_ids()) '
      '       AND public.can_configure_restaurant(company_id))',
      t || '_write', t
    );
  END LOOP;
END $$;

/*
 * `restaurant_menu_items` : écriture ouverte à QUI SERT, pas seulement à qui
 * configure. C'est délibéré et c'est tout l'intérêt de la table — « il n'y a plus
 * de poisson » se constate à 21 h par le serveur, pas le lendemain par le gérant.
 *
 * Le risque est borné par ce que la table CONTIENT : aucune colonne de prix, aucune
 * colonne de stock. Le pire geste possible est de retirer un plat de la carte, ce
 * qui se voit immédiatement et se défait d'un doigt.
 */
DROP POLICY IF EXISTS "restaurant_menu_items_write" ON public.restaurant_menu_items;
CREATE POLICY "restaurant_menu_items_write" ON public.restaurant_menu_items FOR ALL
  USING (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_serve_restaurant(company_id)
  )
  WITH CHECK (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_serve_restaurant(company_id)
  );

-- Options choisies : écrites par les RPC de commande, jamais à la main.
-- (pas de policy d'écriture — voir la règle « écriture RPC uniquement »)

-- Pertes : écrites par RPC (elles touchent au stock).
-- (pas de policy d'écriture)

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Retirer / remettre un article sur la carte
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Le geste le plus fréquent du module, et il doit tenir en un doigt. Crée la fiche
 * carte à la volée si elle n'existe pas — un article n'a pas besoin d'être
 * « configuré » avant de pouvoir manquer.
 */
CREATE OR REPLACE FUNCTION public.restaurant_set_availability(
  p_product_id uuid,
  p_available boolean,
  p_reason text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.products WHERE id = p_product_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Article introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de modifier la carte.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.restaurant_menu_items (
    product_id, company_id, is_available, unavailable_reason, unavailable_since, updated_by
  ) VALUES (
    p_product_id, v_company, p_available,
    CASE WHEN p_available THEN NULL ELSE NULLIF(btrim(COALESCE(p_reason, '')), '') END,
    CASE WHEN p_available THEN NULL ELSE now() END,
    auth.uid()
  )
  ON CONFLICT (product_id) DO UPDATE SET
    is_available = EXCLUDED.is_available,
    unavailable_reason = EXCLUDED.unavailable_reason,
    unavailable_since = CASE
      WHEN EXCLUDED.is_available THEN NULL
      -- Retiré une deuxième fois sans avoir été remis : garder l'heure d'origine.
      -- (nom de table nu : ON CONFLICT n'accepte pas la qualification par schéma)
      ELSE COALESCE(restaurant_menu_items.unavailable_since, now())
    END,
    updated_at = now(),
    updated_by = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Enregistrer une perte
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Sort la marchandise du stock (mouvement `loss`) et garde la trace chiffrée.
 *
 * Le stock n'est déduit QUE s'il y en a : un ingrédient jamais compté (l'huile au
 * litre) n'a pas de ligne d'inventaire, et refuser la saisie pour cette raison
 * ferait renoncer à enregistrer la perte — donc perdre l'information ET l'argent.
 * `stock_deducted` dit ensuite lequel des deux cas s'est produit.
 */
CREATE OR REPLACE FUNCTION public.restaurant_record_waste(
  p_company_id uuid,
  p_store_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_reason text,
  p_note text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_name text;
  v_cost numeric(18,4);
  v_available integer;
  v_deduct integer := 0;
  v_id uuid;
BEGIN
  IF NOT public.can_serve_restaurant(p_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''enregistrer une perte.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Cette boutique ne vous est pas assignée.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Indiquez une quantité.' USING ERRCODE = '23514';
  END IF;

  SELECT name, purchase_price INTO v_name, v_cost
    FROM public.products WHERE id = p_product_id AND company_id = p_company_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Article introuvable.' USING ERRCODE = '23503';
  END IF;

  SELECT quantity INTO v_available FROM public.store_inventory
    WHERE store_id = p_store_id AND product_id = p_product_id FOR UPDATE;

  IF v_available IS NOT NULL AND v_available > 0 THEN
    -- Jamais en dessous de zéro : `store_inventory.quantity` porte un CHECK >= 0,
    -- et une perte de 10 sur un stock de 4 ferait échouer toute la saisie.
    v_deduct := LEAST(v_available, p_quantity);
    UPDATE public.store_inventory
       SET quantity = quantity - v_deduct, updated_at = now()
     WHERE store_id = p_store_id AND product_id = p_product_id;

    INSERT INTO public.stock_movements (
      store_id, product_id, type, quantity, reference_type, created_by, notes
    ) VALUES (
      p_store_id, p_product_id, 'loss', -v_deduct, 'restaurant_waste', auth.uid(),
      NULLIF(btrim(COALESCE(p_note, '')), '')
    );
  END IF;

  INSERT INTO public.restaurant_waste (
    company_id, store_id, product_id, product_name, quantity, unit_cost,
    reason, note, order_id, stock_deducted, created_by
  ) VALUES (
    p_company_id, p_store_id, p_product_id, v_name, p_quantity, COALESCE(v_cost, 0),
    COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'other'),
    NULLIF(btrim(COALESCE(p_note, '')), ''), p_order_id, v_deduct > 0, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Poser les options choisies sur une ligne de commande
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Appelée juste après `restaurant_add_order_items`. Écrit le détail des options ET
 * recopie le résumé (`options_label`, `options_amount`) sur la ligne : la caisse et
 * le bon cuisine lisent le résumé, sans jointure, cinquante fois par service.
 */
CREATE OR REPLACE FUNCTION public.restaurant_set_item_options(
  p_item_id uuid,
  p_options jsonb
) RETURNS void AS $$
DECLARE
  v_company uuid;
  v_order_status public.restaurant_order_status;
  v_opt jsonb;
  v_labels text[] := ARRAY[]::text[];
  v_total numeric(18,4) := 0;
  v_delta numeric(18,4);
  v_label text;
BEGIN
  SELECT i.company_id, o.status INTO v_company, v_order_status
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

  DELETE FROM public.restaurant_order_item_options WHERE order_item_id = p_item_id;

  FOR v_opt IN SELECT * FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb))
  LOOP
    v_label := btrim(COALESCE(v_opt->>'label', ''));
    CONTINUE WHEN v_label = '';
    v_delta := GREATEST(0, COALESCE((v_opt->>'price_delta')::numeric, 0));

    INSERT INTO public.restaurant_order_item_options (
      company_id, order_item_id, modifier_id, label, price_delta
    ) VALUES (
      v_company, p_item_id,
      NULLIF(v_opt->>'modifier_id', '')::uuid,
      v_label, v_delta
    );

    v_labels := v_labels || v_label;
    v_total := v_total + v_delta;
  END LOOP;

  UPDATE public.restaurant_order_items
     SET options_label = NULLIF(array_to_string(v_labels, ' · '), ''),
         options_amount = v_total
   WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Droits d'exécution
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.restaurant_set_availability(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_record_waste(uuid, uuid, uuid, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_set_item_options(uuid, jsonb) TO authenticated;
