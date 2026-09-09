-- FasoStock — Restaurant : la livraison, et la caisse qu'on ouvre le matin et
-- qu'on compte le soir.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- DEUX ENDROITS OÙ L'ARGENT S'ÉVAPORE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 1. LE LIVREUR. Il part avec trois commandes et de la monnaie. Il revient une
--    heure plus tard avec de l'argent, un client qui n'était pas là, et une
--    commande dont personne ne sait si elle a été payée. Aujourd'hui, tout ça tient
--    dans sa tête et dans celle du gérant — jusqu'au jour où les deux ne disent plus
--    la même chose.
--
-- 2. LA CAISSE. À la fermeture, le patron compte. Il trouve 184 200. Le logiciel dit
--    qu'il a été encaissé 191 000 en espèces. Où sont les 6 800 ? Sans fond de
--    caisse enregistré le matin, sans sorties notées dans la journée, la question
--    n'a même pas de réponse possible — et donc personne ne la pose, et l'écart
--    devient la norme.
--
-- Ce fichier ne réinvente rien : `cash_register_sessions` et `cash_movements`
-- existent depuis la première migration et n'ont jamais été utilisées par
-- l'application. On leur donne enfin des RPC et un écran.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Les zones de livraison
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * « Zone 1 — Ouaga 2000 : 1 000 F, 25 min ». Le prix de la course et le délai
 * annoncé au client, décidés une fois pour toutes plutôt que négociés à chaque
 * commande par un serveur qui ne connaît pas la ville.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_delivery_zones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  /** Ce que la course coûte au client. S'ajoute à l'addition comme une ligne à part. */
  fee numeric(18,4) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  /** Délai annoncé, en minutes — sert à dire « dans 30 minutes » au téléphone. */
  eta_minutes integer NOT NULL DEFAULT 30 CHECK (eta_minutes > 0 AND eta_minutes <= 600),
  /** Montant minimum de commande pour livrer cette zone (0 = pas de minimum). */
  min_order numeric(18,4) NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  /** Quartiers couverts, en clair : « Ouaga 2000, Bassinko, Kossodo ». */
  note text,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_restaurant_delivery_zones_company
  ON public.restaurant_delivery_zones (company_id, position, name);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Les livreurs
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * `user_id` est FACULTATIF, et c'est le point important : la plupart des livreurs
 * d'un maquis ne sont pas des utilisateurs de l'application. Ce sont des jeunes du
 * quartier avec une moto et un téléphone. Exiger un compte pour pouvoir leur
 * confier une commande reviendrait à ne jamais s'en servir.
 */
CREATE TABLE IF NOT EXISTS public.restaurant_couriers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  /** `moto` | `velo` | `voiture` | `pied`. */
  vehicle text NOT NULL DEFAULT 'moto'
    CHECK (vehicle IN ('moto', 'velo', 'voiture', 'pied')),
  plate text,
  /** Compte applicatif du livreur, quand il en a un. */
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_restaurant_couriers_company
  ON public.restaurant_couriers (company_id, is_active, name);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. La course, portée par la commande
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Ces colonnes vivent sur `restaurant_orders` plutôt que dans une table « courses »
 * séparée : une commande en livraison A une course, exactement une, et jamais sans
 * elle. Une table de plus n'aurait apporté qu'une jointure obligatoire sur l'écran
 * le plus consulté du service.
 *
 * `delivery_state` suit le trajet réel :
 *   `pending`   — à préparer, aucun livreur désigné
 *   `assigned`  — confié à un livreur, pas encore parti
 *   `on_route`  — parti
 *   `delivered` — remis au client
 *   `failed`    — client absent, adresse fausse, refus. La marchandise revient, et
 *                 c'est une information qu'on veut pouvoir compter.
 */
DO $$ BEGIN
  CREATE TYPE public.restaurant_delivery_state AS ENUM
    ('pending', 'assigned', 'on_route', 'delivered', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.restaurant_orders
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES public.restaurant_delivery_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS courier_id uuid REFERENCES public.restaurant_couriers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_state public.restaurant_delivery_state,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_failure_reason text;

-- Le tableau de suivi : « qu'est-ce qui est dehors, en ce moment ».
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_delivery
  ON public.restaurant_orders (store_id, delivery_state, opened_at DESC)
  WHERE service_type = 'delivery';
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_courier
  ON public.restaurant_orders (courier_id, opened_at DESC)
  WHERE courier_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.restaurant_delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_couriers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_delivery_zones_select" ON public.restaurant_delivery_zones;
CREATE POLICY "restaurant_delivery_zones_select" ON public.restaurant_delivery_zones FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
DROP POLICY IF EXISTS "restaurant_delivery_zones_write" ON public.restaurant_delivery_zones;
CREATE POLICY "restaurant_delivery_zones_write" ON public.restaurant_delivery_zones FOR ALL
  USING (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_configure_restaurant(company_id)
  )
  WITH CHECK (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_configure_restaurant(company_id)
  );

DROP POLICY IF EXISTS "restaurant_couriers_select" ON public.restaurant_couriers;
CREATE POLICY "restaurant_couriers_select" ON public.restaurant_couriers FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);
/*
 * Créer un livreur est un geste de SERVICE, pas de configuration : à 20 h, le
 * neveu du patron prend une moto pour dépanner. Si seul le gérant peut l'inscrire,
 * la commande partira sans livreur enregistré et le suivi ne servira à rien.
 */
DROP POLICY IF EXISTS "restaurant_couriers_write" ON public.restaurant_couriers;
CREATE POLICY "restaurant_couriers_write" ON public.restaurant_couriers FOR ALL
  USING (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_serve_restaurant(company_id)
  )
  WITH CHECK (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_serve_restaurant(company_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Confier une commande à un livreur, et suivre la course
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Un seul RPC pour tout le trajet : désigner, faire partir, marquer remis ou échoué.
 * Le découper en quatre aurait donné quatre boutons qui font la même chose à un
 * champ près.
 *
 * `failed` exige un motif : « client absent » et « adresse fausse » ne se corrigent
 * pas de la même façon, et sans le motif on ne corrige rien du tout.
 */
CREATE OR REPLACE FUNCTION public.restaurant_set_delivery(
  p_order_id uuid,
  p_state text,
  p_courier_id uuid DEFAULT NULL,
  p_zone_id uuid DEFAULT NULL,
  p_fee numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_company uuid;
  v_service public.restaurant_service_type;
  v_state public.restaurant_delivery_state;
BEGIN
  SELECT company_id, service_type INTO v_company, v_service
    FROM public.restaurant_orders WHERE id = p_order_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de suivre cette livraison.' USING ERRCODE = '42501';
  END IF;
  IF v_service <> 'delivery' THEN
    RAISE EXCEPTION 'Cette commande n''est pas une livraison.' USING ERRCODE = '23514';
  END IF;

  v_state := p_state::public.restaurant_delivery_state;

  IF v_state = 'failed' AND COALESCE(btrim(COALESCE(p_reason, '')), '') = '' THEN
    RAISE EXCEPTION 'Indiquez pourquoi la livraison a échoué.' USING ERRCODE = '23514';
  END IF;
  IF v_state IN ('assigned', 'on_route') AND p_courier_id IS NULL THEN
    -- Sauf si un livreur est déjà désigné sur la commande.
    IF NOT EXISTS (
      SELECT 1 FROM public.restaurant_orders
      WHERE id = p_order_id AND courier_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Choisissez le livreur.' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.restaurant_orders
     SET delivery_state = v_state,
         courier_id = COALESCE(p_courier_id, courier_id),
         zone_id = COALESCE(p_zone_id, zone_id),
         delivery_fee = COALESCE(GREATEST(0, p_fee), delivery_fee),
         dispatched_at = CASE WHEN v_state = 'on_route' THEN COALESCE(dispatched_at, now())
                              ELSE dispatched_at END,
         delivered_at = CASE WHEN v_state = 'delivered' THEN now() ELSE delivered_at END,
         delivery_failure_reason = CASE WHEN v_state = 'failed' THEN btrim(p_reason)
                                        ELSE NULL END,
         updated_at = now()
   WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. La caisse : ouvrir le matin
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Le fond de caisse. Sans lui, aucun contrôle du soir n'est possible : on ne peut
 * pas savoir combien il DEVRAIT y avoir si on ne sait pas combien il y avait au
 * départ.
 *
 * Une seule session ouverte par boutique, garantie par index partiel — deux
 * sessions ouvertes rendraient les deux clôtures fausses.
 */
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_open_per_store
  ON public.cash_register_sessions (store_id) WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.restaurant_open_cash_session(
  p_company_id uuid,
  p_store_id uuid,
  p_opening_amount numeric
) RETURNS uuid AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
BEGIN
  IF NOT public.can_serve_restaurant(p_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''ouvrir la caisse.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Cette boutique ne vous est pas assignée.' USING ERRCODE = '42501';
  END IF;

  -- Déjà ouverte : on rend la session en cours. Deux caissiers qui touchent
  -- « Ouvrir » à la suite ne doivent pas voir d'erreur.
  SELECT id INTO v_existing FROM public.cash_register_sessions
    WHERE store_id = p_store_id AND status = 'open';
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  INSERT INTO public.cash_register_sessions (store_id, opened_by, opening_amount)
  VALUES (p_store_id, auth.uid(), GREATEST(0, COALESCE(p_opening_amount, 0)))
  RETURNING id INTO v_id;

  INSERT INTO public.cash_movements (session_id, type, amount, created_by, notes)
  VALUES (v_id, 'opening', GREATEST(0, COALESCE(p_opening_amount, 0)), auth.uid(),
          'Fond de caisse');

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Entrées et sorties d'espèces en cours de journée
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Le patron prend 20 000 dans la caisse pour acheter du charbon. Le serveur rend la
 * monnaie d'un client parti sans manger. Ces gestes-là existent tous les jours et
 * ne laissent aucune trace — puis ils deviennent « l'écart de caisse ».
 *
 * `withdrawal` et `expense` sont saisis en positif et stockés en négatif : on ne
 * demande pas à un caissier de taper un signe moins.
 */
CREATE OR REPLACE FUNCTION public.restaurant_cash_movement(
  p_session_id uuid,
  p_type text,
  p_amount numeric,
  p_notes text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_company uuid;
  v_status text;
  v_signed numeric(18,4);
  v_id uuid;
BEGIN
  SELECT s.company_id, crs.status INTO v_company, v_status
    FROM public.cash_register_sessions crs
    JOIN public.stores s ON s.id = crs.store_id
   WHERE crs.id = p_session_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Session de caisse introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de toucher à la caisse.' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Cette caisse est déjà clôturée.' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Indiquez un montant.' USING ERRCODE = '23514';
  END IF;
  IF p_type NOT IN ('deposit', 'withdrawal', 'expense', 'adjustment') THEN
    RAISE EXCEPTION 'Type de mouvement inconnu.' USING ERRCODE = '23514';
  END IF;

  v_signed := CASE WHEN p_type IN ('withdrawal', 'expense')
                   THEN -abs(p_amount) ELSE abs(p_amount) END;

  INSERT INTO public.cash_movements (session_id, type, amount, created_by, notes)
  VALUES (p_session_id, p_type::public.cash_movement_type, v_signed, auth.uid(),
          NULLIF(btrim(COALESCE(p_notes, '')), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Clôturer : ce qu'on a compté face à ce qui devrait y être
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * LE MOMENT DE VÉRITÉ, et le seul calcul de ce fichier qui doit être irréprochable.
 *
 *   attendu = fond de caisse
 *           + ventes ENCAISSÉES EN ESPÈCES pendant la session
 *           + dépôts − retraits − dépenses
 *
 * « en espèces » seulement : l'Orange Money encaissé pendant la journée n'est pas
 * dans le tiroir, et l'y compter ferait apparaître un manquant tous les soirs.
 *
 * On lit `sale_payments.method = 'cash'` des ventes de la boutique sur la fenêtre de
 * la session — c'est la même source que les rapports, donc les deux ne peuvent pas
 * diverger.
 *
 * L'écart est ENREGISTRÉ, jamais corrigé en silence. Une caisse qui « tombe juste »
 * tous les soirs parce que le logiciel a ajusté la différence ne sert à rien.
 */
CREATE OR REPLACE FUNCTION public.restaurant_close_cash_session(
  p_session_id uuid,
  p_counted_amount numeric,
  p_notes text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_company uuid;
  v_store uuid;
  v_status text;
  v_opened timestamptz;
  v_opening numeric(18,4);
  v_cash_sales numeric(18,4);
  v_movements numeric(18,4);
  v_expected numeric(18,4);
  v_counted numeric(18,4);
  v_variance numeric(18,4);
BEGIN
  SELECT s.company_id, crs.store_id, crs.status, crs.opened_at, crs.opening_amount
    INTO v_company, v_store, v_status, v_opened, v_opening
    FROM public.cash_register_sessions crs
    JOIN public.stores s ON s.id = crs.store_id
   WHERE crs.id = p_session_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Session de caisse introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.can_serve_restaurant(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de clôturer la caisse.' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Cette caisse est déjà clôturée.' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(sp.amount), 0) INTO v_cash_sales
    FROM public.sale_payments sp
    JOIN public.sales sa ON sa.id = sp.sale_id
   WHERE sa.store_id = v_store
     AND sa.status <> 'cancelled'
     AND sp.method = 'cash'
     AND sp.created_at >= v_opened;

  -- `opening` est déjà porté par `opening_amount` : on ne le compte pas deux fois.
  SELECT COALESCE(SUM(amount), 0) INTO v_movements
    FROM public.cash_movements
   WHERE session_id = p_session_id AND type <> 'opening';

  v_expected := v_opening + v_cash_sales + v_movements;
  v_counted := GREATEST(0, COALESCE(p_counted_amount, 0));
  v_variance := v_counted - v_expected;

  UPDATE public.cash_register_sessions
     SET status = 'closed', closed_at = now(),
         closing_amount = v_counted, updated_at = now()
   WHERE id = p_session_id;

  INSERT INTO public.cash_movements (session_id, type, amount, created_by, notes)
  VALUES (p_session_id, 'closing', v_counted, auth.uid(),
          NULLIF(btrim(COALESCE(p_notes, '')), ''));

  RETURN jsonb_build_object(
    'opening', v_opening,
    'cash_sales', v_cash_sales,
    'movements', v_movements,
    'expected', v_expected,
    'counted', v_counted,
    'variance', v_variance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

/**
 * L'état de la caisse À TOUT MOMENT, sans la clôturer. C'est ce que le patron
 * regarde à 18 h pour savoir s'il peut sortir de l'argent — et c'est exactement le
 * même calcul que la clôture, écrit une seule fois pour qu'ils ne divergent jamais.
 */
CREATE OR REPLACE FUNCTION public.restaurant_cash_session_state(
  p_session_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_company uuid;
  v_store uuid;
  v_opened timestamptz;
  v_closed timestamptz;
  v_opening numeric(18,4);
  v_cash_sales numeric(18,4);
  v_movements numeric(18,4);
BEGIN
  SELECT s.company_id, crs.store_id, crs.opened_at, crs.closed_at, crs.opening_amount
    INTO v_company, v_store, v_opened, v_closed, v_opening
    FROM public.cash_register_sessions crs
    JOIN public.stores s ON s.id = crs.store_id
   WHERE crs.id = p_session_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Session de caisse introuvable.' USING ERRCODE = '23503';
  END IF;
  IF v_company NOT IN (SELECT * FROM public.current_user_company_ids())
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Session de caisse introuvable.' USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(SUM(sp.amount), 0) INTO v_cash_sales
    FROM public.sale_payments sp
    JOIN public.sales sa ON sa.id = sp.sale_id
   WHERE sa.store_id = v_store
     AND sa.status <> 'cancelled'
     AND sp.method = 'cash'
     AND sp.created_at >= v_opened
     AND (v_closed IS NULL OR sp.created_at <= v_closed);

  SELECT COALESCE(SUM(amount), 0) INTO v_movements
    FROM public.cash_movements
   WHERE session_id = p_session_id AND type NOT IN ('opening', 'closing');

  RETURN jsonb_build_object(
    'opening', v_opening,
    'cash_sales', v_cash_sales,
    'movements', v_movements,
    'expected', v_opening + v_cash_sales + v_movements
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Droits d'exécution
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.restaurant_set_delivery(uuid, text, uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_open_cash_session(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_cash_movement(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_close_cash_session(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurant_cash_session_state(uuid) TO authenticated;
