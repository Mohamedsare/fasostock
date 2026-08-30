-- FasoStock — « Enlèvements partenaires » : la marchandise qu'un confrère vient prendre.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LE GESTE, ET POURQUOI IL N'ÉTAIT NULLE PART
-- ═════════════════════════════════════════════════════════════════════════════
-- L'Approvisionnement (00193) écrit un sens de circulation : le commerçant traverse le
-- marché, prend dix cartons chez un confrère, revient, et vend. Ce fichier écrit
-- L'AUTRE SENS, celui qu'aucune page ne couvrait :
--
--   « Ali est passé ce matin, il a pris quinze cartons de savon. Il a laissé
--     50 000, il paiera le reste vendredi. »
--
-- Ce n'est ni une vente au comptoir, ni un client de passage. C'est un confrère qui
-- s'approvisionne, à un prix de confrère, souvent à crédit, et à qui l'on remet un
-- papier. Aujourd'hui ce geste se note sur un cahier, ou dans une vente forcée au POS
-- avec « Ali » créé en client — ce qui gonfle le chiffre d'affaires du comptoir, mélange
-- deux métiers dans les mêmes rapports, et ne donne aucun état de ce qui est sorti.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUE LE MODULE FAIT — ET CE QU'IL NE FAIT PAS
-- ═════════════════════════════════════════════════════════════════════════════
-- IL FAIT : sortir la marchandise du stock de la boutique (avec le mouvement tracé et
--   son auteur), écrire ce qui a été pris, à quel prix, ce qui a été payé, ce qui reste
--   dû et pour quand, et garder de quoi rééditer le bon de livraison / la facture à
--   remettre au partenaire.
--
-- IL NE CRÉE PAS DE VENTE. C'est la décision structurante de ce fichier, et elle mérite
--   d'être défendue : une vente FasoStock est un encaissement au comptoir, avec sa
--   numérotation, ses rapports, sa marge, son ticket. Y verser les enlèvements
--   mélangerait le détail et le gros dans le même chiffre d'affaires — précisément ce
--   que le commerçant cherche à séparer quand il demande cette page. Les deux métiers
--   se lisent donc côte à côte, jamais empilés.
--
--   Conséquence assumée : le montant d'un enlèvement n'apparaît pas dans le CA du
--   tableau de bord. Le module tient son propre compte (sorti / encaissé / dû), et
--   c'est ce que le propriétaire vient y chercher.
--
-- IL NE TOUCHE À AUCUN PRIX DU CATALOGUE. Même règle qu'en 00193 : le prix consenti à
--   un confrère est un prix de circonstance, il n'a rien à redéfinir pour le comptoir.
--   `unit_price` vit sur la ligne d'enlèvement ; `catalogue_sale_price` en garde la
--   photo à côté, pour comparaison seule.
--
-- IL NE REMPLACE PAS LE PRIX DE GROS DU CATALOGUE (`products.wholesale_price`), qui
--   reste ce que la CAISSE applique quand un client achète en quantité. Ici, c'est un
--   prix négocié partenaire par partenaire, sur un bon qui n'est pas un ticket.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Numérotation
-- ─────────────────────────────────────────────────────────────────────────────
-- « E-42 » : la référence courte qu'on retrouve le soir, et qu'on lit au téléphone.
-- Attribuée en base — deux saisies à la même seconde ne peuvent pas la partager.
CREATE SEQUENCE IF NOT EXISTS public.partner_offtake_number_seq;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tables
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Un enlèvement : ce qu'un partenaire a emporté, en une fois.
 *
 * `partner_name` est un TEXTE LIBRE, et `customer_id` reste facultatif. C'est le même
 * arbitrage qu'en 00193 : obliger à créer une fiche avant de pouvoir noter ce qui sort
 * ferait abandonner la saisie au moment où le camion attend. Le commerçant qui suit
 * vraiment ses partenaires les rattache à une fiche client, et retrouve alors
 * l'historique complet — mais il le fait quand il veut, pas pendant le chargement.
 */
CREATE TABLE IF NOT EXISTS public.partner_offtakes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  /** « E-42 » — la référence courte de l'enlèvement. */
  offtake_number text NOT NULL,

  /** Qui est venu prendre. Obligatoire : un enlèvement anonyme ne se réclame pas. */
  partner_name text NOT NULL,
  /** Son téléphone — c'est par là que partiront le bon et les rappels. */
  partner_phone text,
  /** Fiche client, si le commerçant en tient une pour ce partenaire. Facultatif. */
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,

  /** Mot du vendeur : « camion de Bobo », « 2 cartons abîmés déduits ». */
  note text,

  /** Somme des (quantité × prix) des lignes — calculée en base, jamais reçue du client. */
  total_amount numeric(18, 4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  /** Ce que le partenaire a effectivement laissé. Le reste est une créance. */
  amount_paid numeric(18, 4) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  /** Quand le solde est promis. NULL = pas de date convenue. */
  due_at date,

  line_count integer NOT NULL DEFAULT 0,
  unit_count integer NOT NULL DEFAULT 0,

  /**
   * Annulation plutôt que suppression : la marchandise est SORTIE du magasin. Effacer
   * la ligne effacerait la seule trace de ce qui a quitté le rayon, et le stock
   * paraîtrait faux sans que rien ne l'explique. On garde donc le bon, marqué annulé,
   * avec qui l'a annulé et quand.
   */
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_reason text,

  /**
   * Idempotence, même principe que 00193 : la 3G lâche pendant la validation, le
   * vendeur rappuie, et sans cette clé la marchandise sortirait DEUX FOIS du stock —
   * un manquant que personne ne saura expliquer à l'inventaire.
   */
  client_request_id uuid,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.partner_offtakes IS
  'Enlèvement partenaire : marchandise emportée par un confrère (module Enlèvements). '
  'Sort du stock et ouvre une créance ; ne crée PAS de vente et n''entre donc pas dans '
  'le chiffre d''affaires du comptoir.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_offtakes_number
  ON public.partner_offtakes(company_id, offtake_number);
CREATE INDEX IF NOT EXISTS idx_partner_offtakes_store
  ON public.partner_offtakes(company_id, store_id, created_at DESC);
-- « Qui me doit encore quelque chose ? » — la question de tous les soirs.
CREATE INDEX IF NOT EXISTS idx_partner_offtakes_open
  ON public.partner_offtakes(company_id, due_at)
  WHERE cancelled_at IS NULL AND amount_paid < total_amount;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_offtakes_client_request
  ON public.partner_offtakes(company_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

/**
 * Une ligne d'enlèvement.
 *
 * `label` est une COPIE du nom au moment de la sortie : le bon remis au partenaire doit
 * rester lisible même si l'article est renommé six mois plus tard.
 *
 * `unit_cost` est la photo du prix d'ACHAT à l'instant de la sortie. Elle ne sert qu'à
 * une chose, et cette chose compte : savoir si l'on gagne encore sa vie sur le gros.
 * Sans elle, un prix partenaire consenti « pour rendre service » se révèle déficitaire
 * des mois plus tard, quand plus rien ne permet de reconstituer le coût du jour.
 */
CREATE TABLE IF NOT EXISTS public.partner_offtake_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  offtake_id uuid NOT NULL REFERENCES public.partner_offtakes(id) ON DELETE CASCADE,

  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  label text NOT NULL,
  unit text,
  quantity integer NOT NULL CHECK (quantity > 0),

  /** Prix consenti au partenaire pour CET enlèvement. Ne remplace aucun prix du catalogue. */
  unit_price numeric(18, 4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  /** Témoins au moment de la sortie : coût réel et prix comptoir (comparaison seule). */
  unit_cost numeric(18, 4),
  catalogue_sale_price numeric(18, 4),

  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.partner_offtake_items IS
  'Lignes d''un enlèvement partenaire. `unit_price` est le prix consenti à ce '
  'partenaire-là ; `catalogue_sale_price` et `unit_cost` en gardent la photo pour '
  'comparaison, et ne sont jamais réécrits dans la fiche produit.';

CREATE INDEX IF NOT EXISTS idx_partner_offtake_items_offtake
  ON public.partner_offtake_items(offtake_id, position);
CREATE INDEX IF NOT EXISTS idx_partner_offtake_items_product
  ON public.partner_offtake_items(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_offtake_items_company
  ON public.partner_offtake_items(company_id);

/**
 * Un règlement du partenaire.
 *
 * Table à part, et non un simple `amount_paid` que l'on incrémenterait : le commerçant
 * veut pouvoir dire « il a laissé 50 000 lundi, 30 000 jeudi ». Un cumul seul ne
 * raconte rien, et ne permet pas de corriger une saisie sans fausser le total.
 * `partner_offtakes.amount_paid` reste le cumul, tenu par les RPC ci-dessous — jamais
 * écrit à la main.
 */
CREATE TABLE IF NOT EXISTS public.partner_offtake_payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  offtake_id uuid NOT NULL REFERENCES public.partner_offtakes(id) ON DELETE CASCADE,

  amount numeric(18, 4) NOT NULL CHECK (amount > 0),
  method payment_method NOT NULL DEFAULT 'cash',
  /** Opérateur mobile money, numéro de bordereau… — même usage que `sale_payments.reference`. */
  reference text,
  note text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.partner_offtake_payments IS
  'Règlements successifs d''un enlèvement partenaire. Le cumul est reporté dans '
  'partner_offtakes.amount_paid par les RPC — cette colonne n''est jamais écrite à la main.';

CREATE INDEX IF NOT EXISTS idx_partner_offtake_payments_offtake
  ON public.partner_offtake_payments(offtake_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_offtake_payments_company
  ON public.partner_offtake_payments(company_id, created_at DESC);

-- Numéro attribué en base (jamais côté application).
CREATE OR REPLACE FUNCTION public.partner_offtakes_set_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.offtake_number IS NULL OR btrim(NEW.offtake_number) = '' THEN
    NEW.offtake_number := 'E-' || nextval('public.partner_offtake_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_offtakes_set_number_trigger ON public.partner_offtakes;
CREATE TRIGGER partner_offtakes_set_number_trigger
  BEFORE INSERT ON public.partner_offtakes
  FOR EACH ROW
  EXECUTE FUNCTION public.partner_offtakes_set_number();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Droit effectif
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_partner_offtakes(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR (
        EXISTS (
          SELECT 1 FROM public.companies
          WHERE id = p_company_id AND partner_offtakes_enabled = true
        )
        AND (
          public.user_is_company_owner(p_company_id)
          OR ('partner_offtakes.manage' = ANY(public.get_my_permission_keys(p_company_id)))
        )
      );
$$;

COMMENT ON FUNCTION public.can_manage_partner_offtakes(uuid) IS
  'Droit d''enregistrer et d''encaisser un enlèvement partenaire. Exige le module ouvert '
  'par le propriétaire ET le droit partner_offtakes.manage.';

GRANT EXECUTE ON FUNCTION public.can_manage_partner_offtakes(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Lecture : tout membre de l'entreprise. Le bon d'enlèvement est un objet d'équipe —
-- celui qui charge le camion doit pouvoir relire ce qui a été convenu.
-- Écriture : par les RPC uniquement (eux seuls posent le numéro, le stock, les
-- mouvements et le cumul dans la même transaction). Les policies restent néanmoins
-- fermées à qui n'a pas le droit, pour qu'une écriture directe ne contourne rien.
ALTER TABLE public.partner_offtakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_offtake_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_offtake_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_offtakes_select" ON public.partner_offtakes;
CREATE POLICY "partner_offtakes_select" ON public.partner_offtakes FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "partner_offtakes_insert" ON public.partner_offtakes;
CREATE POLICY "partner_offtakes_insert" ON public.partner_offtakes FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.can_manage_partner_offtakes(company_id)
);

DROP POLICY IF EXISTS "partner_offtakes_update" ON public.partner_offtakes;
CREATE POLICY "partner_offtakes_update" ON public.partner_offtakes FOR UPDATE
  USING (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_partner_offtakes(company_id)
  )
  WITH CHECK (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_partner_offtakes(company_id)
  );

-- Pas de DELETE : la marchandise est sortie du magasin. On annule, on n'efface pas.

DROP POLICY IF EXISTS "partner_offtake_items_select" ON public.partner_offtake_items;
CREATE POLICY "partner_offtake_items_select" ON public.partner_offtake_items FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "partner_offtake_items_insert" ON public.partner_offtake_items;
CREATE POLICY "partner_offtake_items_insert" ON public.partner_offtake_items FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.can_manage_partner_offtakes(company_id)
);

DROP POLICY IF EXISTS "partner_offtake_payments_select" ON public.partner_offtake_payments;
CREATE POLICY "partner_offtake_payments_select" ON public.partner_offtake_payments FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "partner_offtake_payments_insert" ON public.partner_offtake_payments;
CREATE POLICY "partner_offtake_payments_insert" ON public.partner_offtake_payments FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.can_manage_partner_offtakes(company_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Enregistrer l'enlèvement
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Tout, ou rien.
 *
 * Une sortie partielle est le pire résultat possible : trois articles sur cinq
 * déduits, le partenaire déjà reparti, et personne pour dire lesquels manquent. La
 * transaction unique garantit que l'écran affiche « c'est sorti » exactement quand ça
 * l'est.
 *
 * Format d'une ligne de `p_items` :
 *   { product_id, quantity, unit_price }
 *
 * Aucune création de produit ici — contrairement à l'Approvisionnement. On ne peut pas
 * sortir du stock d'un article qui n'existe pas : si le nom manque au catalogue, c'est
 * que la marchandise n'est pas en magasin.
 */
CREATE OR REPLACE FUNCTION public.create_partner_offtake(
  p_company_id uuid,
  p_store_id uuid,
  p_items jsonb,
  p_partner_name text,
  p_partner_phone text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_amount_paid numeric DEFAULT NULL,
  p_due_at date DEFAULT NULL,
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
  v_offtake_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_label text;
  v_unit text;
  v_qty int;
  v_price numeric;
  v_cost numeric;
  v_cat_sale numeric;
  v_scope text;
  v_pos int := 0;
  v_units int := 0;
  v_total numeric := 0;
  v_paid numeric;
  v_partner text := NULLIF(btrim(COALESCE(p_partner_name, '')), '');
  v_row_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_company_id IS NULL
     OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids()))
  THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée pour cette entreprise';
  END IF;
  IF NOT public.can_manage_partner_offtakes(p_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''enregistrer un enlèvement.';
  END IF;
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Indiquez qui vient prendre la marchandise.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Aucun article : rien à faire sortir du stock.';
  END IF;

  -- Fiche client fournie : elle doit être celle de la maison.
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Client introuvable dans cette entreprise.';
  END IF;

  /*
   * Renvoi après coupure réseau : l'enlèvement existe déjà, on rend le même id sans
   * rien redéduire. Le verrou consultatif sérialise deux appels simultanés portant la
   * même clé — sans lui, les deux passeraient la lecture avant que l'un n'ait inséré.
   */
  IF p_client_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      abs(hashtext(p_company_id::text)),
      abs(hashtext(p_client_request_id::text))
    );
    SELECT id INTO v_offtake_id
    FROM public.partner_offtakes
    WHERE company_id = p_company_id AND client_request_id = p_client_request_id;
    IF v_offtake_id IS NOT NULL THEN
      RETURN v_offtake_id;
    END IF;
  END IF;

  INSERT INTO public.partner_offtakes (
    company_id, store_id, partner_name, partner_phone, customer_id, note, due_at,
    client_request_id, created_by
  )
  VALUES (
    p_company_id, p_store_id, v_partner,
    NULLIF(btrim(COALESCE(p_partner_phone, '')), ''),
    p_customer_id,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    p_due_at,
    p_client_request_id,
    v_uid
  )
  RETURNING id INTO v_offtake_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_price := GREATEST(0, COALESCE((v_item->>'unit_price')::numeric, 0));

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Article manquant sur une ligne de l''enlèvement.';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un article de l''enlèvement.';
    END IF;

    SELECT p.name, p.unit, p.purchase_price, p.sale_price, COALESCE(p.product_scope, 'both')
      INTO v_label, v_unit, v_cost, v_cat_sale, v_scope
    FROM public.products p
    WHERE p.id = v_product_id
      AND p.company_id = p_company_id
      AND p.deleted_at IS NULL;

    IF v_label IS NULL THEN
      RAISE EXCEPTION 'Article introuvable dans votre catalogue.';
    END IF;
    -- Cette page sort du stock DE BOUTIQUE : un article réservé au dépôt passe par le
    -- Magasin, qui a ses propres contrôles.
    IF v_scope NOT IN ('both', 'boutique_only') THEN
      RAISE EXCEPTION 'L''article « % » est réservé au dépôt magasin.', v_label;
    END IF;

    /*
     * ── Sortie de stock ──────────────────────────────────────────────────────
     * Le `quantity >= v_qty` dans le WHERE fait le contrôle et la déduction en une
     * seule instruction : deux enlèvements simultanés sur le dernier carton ne
     * peuvent pas passer tous les deux. Un SELECT suivi d'un UPDATE laisserait, lui,
     * une fenêtre entre les deux — et un stock négatif à l'arrivée.
     */
    UPDATE public.store_inventory
    SET quantity = quantity - v_qty, updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = v_product_id
      AND quantity >= v_qty;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      RAISE EXCEPTION 'Stock insuffisant pour « % » (demandé : %).', v_label, v_qty;
    END IF;

    -- Auteur renseigné : l'historique des mouvements doit pouvoir dire qui a laissé
    -- sortir quoi. C'est la contrepartie du droit donné à un employé.
    INSERT INTO public.stock_movements (
      store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes
    )
    VALUES (
      p_store_id, v_product_id, 'sale_out', -v_qty, 'partner_offtake', v_offtake_id, v_uid,
      'Enlèvement partenaire — ' || v_partner
    );

    v_pos := v_pos + 1;
    INSERT INTO public.partner_offtake_items (
      company_id, offtake_id, product_id, label, unit, quantity,
      unit_price, unit_cost, catalogue_sale_price, position
    )
    VALUES (
      p_company_id, v_offtake_id, v_product_id, v_label, v_unit, v_qty,
      v_price, v_cost, v_cat_sale, v_pos
    );

    v_units := v_units + v_qty;
    v_total := v_total + (v_qty * v_price);
  END LOOP;

  -- Montant laissé : borné au total. Un « payé » supérieur au dû serait une erreur de
  -- frappe, et la créance passerait en négatif — un avoir fantôme que personne ne
  -- cherchera jamais.
  v_paid := LEAST(GREATEST(0, COALESCE(p_amount_paid, 0)), v_total);

  UPDATE public.partner_offtakes
  SET total_amount = v_total,
      amount_paid = v_paid,
      line_count = v_pos,
      unit_count = v_units,
      updated_at = now()
  WHERE id = v_offtake_id;

  -- L'acompte du jour est un règlement comme un autre : il doit apparaître dans
  -- l'historique, sinon le premier versement est le seul qu'on ne puisse pas relire.
  IF v_paid > 0 THEN
    INSERT INTO public.partner_offtake_payments (
      company_id, offtake_id, amount, method, note, created_by
    )
    VALUES (p_company_id, v_offtake_id, v_paid, 'cash', 'Versement à l''enlèvement', v_uid);
  END IF;

  RETURN v_offtake_id;
END;
$$;

COMMENT ON FUNCTION public.create_partner_offtake IS
  'Enregistre un enlèvement partenaire : sortie de stock boutique + mouvements tracés + '
  'lignes au prix consenti + acompte éventuel, en une seule transaction. Ne crée pas de '
  'vente et ne touche à aucun prix du catalogue.';

REVOKE ALL ON FUNCTION public.create_partner_offtake(
  uuid, uuid, jsonb, text, text, uuid, numeric, date, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_partner_offtake(
  uuid, uuid, jsonb, text, text, uuid, numeric, date, text, uuid
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Encaisser un règlement
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Le cumul est recalculé depuis les lignes, jamais incrémenté.
 *
 * `amount_paid = amount_paid + p_amount` paraît plus simple, mais un renvoi réseau ou
 * un double clic le fait dériver — et la dérive est silencieuse : le total ne
 * correspond plus à la somme des règlements, sans qu'aucune ligne ne soit fausse. En
 * recalculant, l'historique reste la seule source de vérité, et le cumul ne peut pas
 * mentir.
 */
CREATE OR REPLACE FUNCTION public.add_partner_offtake_payment(
  p_offtake_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'cash',
  p_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_total numeric;
  v_paid numeric;
  v_cancelled timestamptz;
  v_amount numeric := ROUND(COALESCE(p_amount, 0), 4);
  v_method payment_method;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT company_id, total_amount, amount_paid, cancelled_at
    INTO v_company_id, v_total, v_paid, v_cancelled
  FROM public.partner_offtakes
  WHERE id = p_offtake_id
  FOR UPDATE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Enlèvement introuvable.';
  END IF;
  IF NOT (v_company_id IN (SELECT * FROM public.current_user_company_ids()))
     AND NOT public.is_super_admin()
  THEN
    RAISE EXCEPTION 'Enlèvement introuvable.';
  END IF;
  IF NOT public.can_manage_partner_offtakes(v_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser sur un enlèvement.';
  END IF;
  IF v_cancelled IS NOT NULL THEN
    RAISE EXCEPTION 'Cet enlèvement est annulé : il n''y a plus rien à encaisser.';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Montant invalide.';
  END IF;
  IF v_amount > (v_total - v_paid) + 0.005 THEN
    RAISE EXCEPTION 'Ce partenaire ne doit plus que % — le montant saisi est supérieur.',
      TO_CHAR(v_total - v_paid, 'FM999G999G999D00');
  END IF;

  BEGIN
    v_method := COALESCE(NULLIF(btrim(COALESCE(p_method, '')), ''), 'cash')::payment_method;
  EXCEPTION WHEN others THEN
    v_method := 'cash';
  END;

  INSERT INTO public.partner_offtake_payments (
    company_id, offtake_id, amount, method, reference, note, created_by
  )
  VALUES (
    v_company_id, p_offtake_id, v_amount, v_method,
    NULLIF(btrim(COALESCE(p_reference, '')), ''),
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    v_uid
  );

  UPDATE public.partner_offtakes o
  SET amount_paid = COALESCE((
        SELECT SUM(amount) FROM public.partner_offtake_payments
        WHERE offtake_id = p_offtake_id
      ), 0),
      updated_at = now()
  WHERE o.id = p_offtake_id
  RETURNING o.total_amount - o.amount_paid INTO v_paid;

  RETURN v_paid;
END;
$$;

COMMENT ON FUNCTION public.add_partner_offtake_payment(uuid, numeric, text, text, text) IS
  'Enregistre un règlement de partenaire et RECALCULE le cumul depuis les lignes '
  '(jamais d''incrément). Retourne le reste dû.';

REVOKE ALL ON FUNCTION public.add_partner_offtake_payment(uuid, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_partner_offtake_payment(uuid, numeric, text, text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Annuler un enlèvement
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Réservé au PROPRIÉTAIRE.
 *
 * Annuler, c'est remettre en stock une marchandise partie du magasin et effacer une
 * créance. Les deux se font en un clic et ne se voient qu'à l'inventaire — c'est
 * exactement le geste qu'un commerçant ne délègue pas. Celui qui a le droit
 * d'enregistrer un enlèvement ne l'a donc pas d'en défaire un.
 *
 * Le stock est rendu par défaut (le cas ordinaire est le camion qui repart chargé, ou
 * la marchandise ramenée). `p_restore_stock = false` couvre le cas contraire : le
 * partenaire a bien emporté, mais le bon était faux — la marchandise, elle, n'est pas
 * revenue, et la remettre en stock créerait un manquant.
 */
CREATE OR REPLACE FUNCTION public.cancel_partner_offtake(
  p_offtake_id uuid,
  p_restore_stock boolean DEFAULT true,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_store_id uuid;
  v_cancelled timestamptz;
  v_number text;
  v_item record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT company_id, store_id, cancelled_at, offtake_number
    INTO v_company_id, v_store_id, v_cancelled, v_number
  FROM public.partner_offtakes
  WHERE id = p_offtake_id
  FOR UPDATE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Enlèvement introuvable.';
  END IF;
  IF NOT (public.is_super_admin() OR public.user_is_company_owner(v_company_id)) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut annuler un enlèvement.';
  END IF;
  IF v_cancelled IS NOT NULL THEN
    RETURN; -- déjà annulé : rien à refaire, et surtout pas un second retour de stock.
  END IF;

  IF COALESCE(p_restore_stock, true) THEN
    FOR v_item IN
      SELECT product_id, quantity, label
      FROM public.partner_offtake_items
      WHERE offtake_id = p_offtake_id
    LOOP
      UPDATE public.store_inventory
      SET quantity = quantity + v_item.quantity, updated_at = now()
      WHERE store_id = v_store_id AND product_id = v_item.product_id;
      IF NOT FOUND THEN
        INSERT INTO public.store_inventory (store_id, product_id, quantity, reserved_quantity)
        VALUES (v_store_id, v_item.product_id, v_item.quantity, 0)
        ON CONFLICT (store_id, product_id) DO UPDATE
          SET quantity = store_inventory.quantity + EXCLUDED.quantity,
              updated_at = now();
      END IF;

      INSERT INTO public.stock_movements (
        store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes
      )
      VALUES (
        v_store_id, v_item.product_id, 'return_in', v_item.quantity,
        'partner_offtake_cancel', p_offtake_id, v_uid,
        'Annulation enlèvement ' || COALESCE(v_number, '')
      );
    END LOOP;
  END IF;

  UPDATE public.partner_offtakes
  SET cancelled_at = now(),
      cancelled_by = v_uid,
      cancel_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
      updated_at = now()
  WHERE id = p_offtake_id;
END;
$$;

COMMENT ON FUNCTION public.cancel_partner_offtake(uuid, boolean, text) IS
  'Annule un enlèvement partenaire (propriétaire uniquement) et, par défaut, remet la '
  'marchandise en stock avec un mouvement return_in tracé. Ne supprime jamais le bon.';

REVOKE ALL ON FUNCTION public.cancel_partner_offtake(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_partner_offtake(uuid, boolean, text) TO authenticated;
