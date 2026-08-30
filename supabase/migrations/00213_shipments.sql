-- FasoStock — « Expéditions » : la marchandise qui part en province, et les frais qu'on avance.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LE COMMERCE QUI N'ÉTAIT PAS ÉCRIT
-- ═════════════════════════════════════════════════════════════════════════════
-- Un grossiste de Ouagadougou vend à des boutiquiers de Fada, de Dori, de Gaoua. Ils
-- n'entrent jamais dans son magasin : ils appellent, ils commandent, ils envoient
-- l'argent. Lui prépare, facture, sort la marchandise, l'emmène à la gare routière et
-- la confie au car. Le colis part avec un bordereau ; le client le retire à l'arrivée.
--
-- Cette partie-là, l'application la couvre déjà : la facture est une vente, le stock
-- est sorti, la créance est suivie.
--
-- CE QUI N'ÉTAIT NULLE PART, C'EST L'ARGENT DU TRANSPORT.
--
--   « J'ai payé 4 500 au car pour le colis de Fada. Le client doit me les rendre. »
--
-- Ce montant n'est pas dans la facture — il n'était pas connu quand elle a été faite.
-- Ce n'est pas une dépense de la maison — il est censé revenir. Ce n'est pas non plus
-- une vente. C'est une AVANCE, faite vingt fois par semaine, de trois à dix mille francs
-- chacune, et qui ne se réclame jamais parce qu'elle est trop petite pour qu'on y pense
-- et trop fréquente pour qu'on s'en souvienne. Au bout d'un mois, c'est le bénéfice
-- d'une journée qui est parti à la gare routière.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LES TROIS DÉCISIONS DE CE FICHIER
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 1. L'EXPÉDITION NE TOUCHE PAS AU STOCK. Jamais. La marchandise est déjà sortie —
--    par la vente (ou par l'enlèvement partenaire de 00211) à laquelle l'expédition se
--    rattache. Déduire une seconde fois serait créer un manquant fantôme à chaque
--    colis. C'est le piège évident du module, et il est fermé par construction : aucune
--    fonction de ce fichier n'écrit dans `store_inventory` ni dans `stock_movements`.
--
-- 2. LES FRAIS SE SUIVENT À PART, avec leur propre reste dû. Les verser dans la
--    créance de la facture mélangerait deux choses de nature différente : le client
--    peut avoir soldé sa marchandise et ne pas avoir rendu le transport. Confondre les
--    deux, c'est soit relancer quelqu'un qui ne doit rien, soit oublier ce qu'il doit.
--
-- 3. LA RELANCE EST UNE PIÈCE DU MODULE, PAS UN ACCESSOIRE. Un frais d'expédition ne
--    se réclame pas en face à face : le client est à 200 km. Il se réclame par message,
--    poliment, et il faut se souvenir de ce qu'on a déjà envoyé — sinon on redemande
--    trois fois en deux jours, ou jamais.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Numérotation
-- ─────────────────────────────────────────────────────────────────────────────
-- « EXP-128 » : la référence qu'on lit au téléphone au transporteur et au client.
CREATE SEQUENCE IF NOT EXISTS public.shipment_number_seq;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. L'expédition
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  shipment_number text NOT NULL,

  /**
   * LE DOCUMENT EXPÉDIÉ. Les deux liens sont facultatifs, et c'est délibéré.
   *
   * Le cas ordinaire est une facture (`sale_id`) ou un enlèvement partenaire
   * (`offtake_id`). Mais le commerçant expédie aussi, parfois, sans document préalable
   * — un dépannage, un échange, un colis rattrapé le lendemain. Exiger un lien ferait
   * abandonner la saisie au moment où le car s'en va, et c'est justement à ce moment-là
   * que les frais se perdent.
   *
   * `ON DELETE SET NULL` : une vente annulée puis effacée ne doit pas emporter la trace
   * des 4 500 F payés au transporteur — l'argent, lui, est bien sorti.
   */
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  offtake_id uuid REFERENCES public.partner_offtakes(id) ON DELETE SET NULL,

  /** Le destinataire. Le nom est obligatoire : un colis sans nom ne se réclame pas. */
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  recipient_name text NOT NULL,
  recipient_phone text,
  /** Où il va : « Fada N'Gourma », « Dori », « Gaoua ». */
  destination text NOT NULL,

  /** Par qui : « Rakieta », « STAF », « le car de 6 h », « Moussa (taxi-brousse) ». */
  carrier text,
  carrier_phone text,
  /** Numéro de bordereau / de colis remis par le transporteur. */
  tracking_ref text,
  /** Nombre de colis, et de quoi les reconnaître à l'arrivée. */
  package_count integer NOT NULL DEFAULT 1 CHECK (package_count > 0),
  package_note text,

  /**
   * Valeur de la marchandise expédiée, pour mémoire. Recopiée depuis la facture quand
   * il y en a une — mais recopiée, pas jointe : la facture peut être corrigée, et ce
   * qui est parti dans le colis, lui, ne change pas.
   */
  goods_amount numeric(18, 4) NOT NULL DEFAULT 0 CHECK (goods_amount >= 0),

  /**
   * ── LE CŒUR DU MODULE ──
   * `shipping_cost` : ce qui a été payé au transporteur.
   * `shipping_paid_by` : qui l'a payé. `company` = la maison a avancé, donc à réclamer.
   *   `customer` = le client a payé à l'arrivée, donc rien à réclamer — la ligne existe
   *   quand même, parce que savoir ce que coûte Dori se lit sur l'ensemble des colis.
   * `shipping_reimbursed` : cumul remboursé, tenu par les RPC, jamais écrit à la main.
   */
  shipping_cost numeric(18, 4) NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  shipping_paid_by text NOT NULL DEFAULT 'company'
    CHECK (shipping_paid_by IN ('company', 'customer')),
  shipping_reimbursed numeric(18, 4) NOT NULL DEFAULT 0 CHECK (shipping_reimbursed >= 0),

  /**
   * `preparing` (préparé, pas encore parti) → `shipped` (confié au transporteur) →
   * `delivered` (retiré par le client). `cancelled` : le colis n'est jamais parti.
   *
   * Volontairement court. Un état de plus, c'est un état que personne ne met à jour —
   * et une liste où tout reste bloqué au premier statut ne sert plus à rien.
   */
  status text NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'shipped', 'delivered', 'cancelled')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  /** Arrivée annoncée par le transporteur — sert à savoir quand s'inquiéter. */
  expected_at date,

  note text,

  client_request_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shipments IS
  'Expédition vers un client éloigné : transporteur, colis, statut, et surtout les FRAIS '
  'D''EXPÉDITION avancés par la maison et leur remboursement. Ne touche jamais au stock '
  '— la marchandise est sortie par la vente ou l''enlèvement auquel l''expédition se rattache.';
COMMENT ON COLUMN public.shipments.shipping_reimbursed IS
  'Cumul des remboursements, recalculé depuis shipment_reimbursements par les RPC. '
  'Jamais écrit à la main.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_number
  ON public.shipments(company_id, shipment_number);
CREATE INDEX IF NOT EXISTS idx_shipments_store
  ON public.shipments(company_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_sale
  ON public.shipments(sale_id) WHERE sale_id IS NOT NULL;
/*
 * « Qui ne m'a pas encore rendu le transport ? » — la seule question qui rapporte de
 * l'argent, donc celle qu'on indexe. Index partiel : il ne contient que les frais
 * avancés non soldés, c'est-à-dire quelques dizaines de lignes.
 */
CREATE INDEX IF NOT EXISTS idx_shipments_fee_open
  ON public.shipments(company_id, created_at DESC)
  WHERE status <> 'cancelled'
    AND shipping_paid_by = 'company'
    AND shipping_reimbursed < shipping_cost;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_client_request
  ON public.shipments(company_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Les remboursements de frais
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Table à part, et non un simple cumul : le client de Dori rend souvent le transport
 * par petits bouts, avec son règlement de marchandise. « Il m'a rendu 2 000 mardi »
 * doit pouvoir se relire — un total seul ne raconte rien et ne se corrige pas.
 */
CREATE TABLE IF NOT EXISTS public.shipment_reimbursements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,

  amount numeric(18, 4) NOT NULL CHECK (amount > 0),
  method payment_method NOT NULL DEFAULT 'cash',
  reference text,
  note text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shipment_reimbursements IS
  'Remboursements successifs des frais d''expédition avancés. Le cumul est reporté dans '
  'shipments.shipping_reimbursed par les RPC.';

CREATE INDEX IF NOT EXISTS idx_shipment_reimbursements_shipment
  ON public.shipment_reimbursements(shipment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipment_reimbursements_company
  ON public.shipment_reimbursements(company_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. La mémoire des relances de frais
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Même raison d'être que `credit_reminders` (00212), et même refus de tout mélanger :
 * une relance de frais d'expédition n'est pas une relance de crédit. Le client peut
 * avoir soldé sa marchandise et devoir encore le transport ; lui envoyer un message
 * sur « sa dette » alors qu'il vient de tout payer est la meilleure façon de le vexer.
 */
CREATE TABLE IF NOT EXISTS public.shipment_reminders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,

  channel text NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp', 'sms', 'call', 'app')),
  /** Photo du reste dû au moment de la relance — ce qui a été annoncé au client. */
  amount_due numeric(18, 4) NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
  message text,
  note text,

  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shipment_reminders IS
  'Relances envoyées au sujet de frais d''expédition non remboursés. Distinctes des '
  'relances de crédit : marchandise soldée et transport dû sont deux situations différentes.';

CREATE INDEX IF NOT EXISTS idx_shipment_reminders_shipment
  ON public.shipment_reminders(shipment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipment_reminders_company
  ON public.shipment_reminders(company_id, created_at DESC);

-- Numéro attribué en base (jamais côté application).
CREATE OR REPLACE FUNCTION public.shipments_set_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.shipment_number IS NULL OR btrim(NEW.shipment_number) = '' THEN
    NEW.shipment_number := 'EXP-' || nextval('public.shipment_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipments_set_number_trigger ON public.shipments;
CREATE TRIGGER shipments_set_number_trigger
  BEFORE INSERT ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.shipments_set_number();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Droit effectif
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_manage_shipments(p_company_id uuid)
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
          WHERE id = p_company_id AND shipments_enabled = true
        )
        AND (
          public.user_is_company_owner(p_company_id)
          OR ('shipments.manage' = ANY(public.get_my_permission_keys(p_company_id)))
        )
      );
$$;

COMMENT ON FUNCTION public.can_manage_shipments(uuid) IS
  'Droit d''enregistrer une expédition et d''encaisser un remboursement de frais. Exige '
  'le module ouvert par le propriétaire ET le droit shipments.manage.';

GRANT EXECUTE ON FUNCTION public.can_manage_shipments(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_reimbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipments_select" ON public.shipments;
CREATE POLICY "shipments_select" ON public.shipments FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "shipments_insert" ON public.shipments;
CREATE POLICY "shipments_insert" ON public.shipments FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.can_manage_shipments(company_id)
);

/*
 * UPDATE autorisé, contrairement aux enlèvements : une expédition est un objet VIVANT.
 * Le bordereau arrive après le départ, le transporteur annonce une date, le colis est
 * retiré trois jours plus tard. Interdire la mise à jour obligerait à ressaisir
 * l'expédition entière pour cocher « livré » — donc personne ne cocherait rien.
 *
 * Rien de comptable n'est pour autant modifiable à la main : `shipping_reimbursed` est
 * recalculé par le RPC depuis les lignes de remboursement.
 */
DROP POLICY IF EXISTS "shipments_update" ON public.shipments;
CREATE POLICY "shipments_update" ON public.shipments FOR UPDATE
  USING (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_shipments(company_id)
  )
  WITH CHECK (
    company_id IN (SELECT * FROM public.current_user_company_ids())
    AND public.can_manage_shipments(company_id)
  );

DROP POLICY IF EXISTS "shipment_reimbursements_select" ON public.shipment_reimbursements;
CREATE POLICY "shipment_reimbursements_select" ON public.shipment_reimbursements FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "shipment_reimbursements_insert" ON public.shipment_reimbursements;
CREATE POLICY "shipment_reimbursements_insert" ON public.shipment_reimbursements FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.can_manage_shipments(company_id)
);

DROP POLICY IF EXISTS "shipment_reminders_select" ON public.shipment_reminders;
CREATE POLICY "shipment_reminders_select" ON public.shipment_reminders FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "shipment_reminders_insert" ON public.shipment_reminders;
CREATE POLICY "shipment_reminders_insert" ON public.shipment_reminders FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND public.can_manage_shipments(company_id)
  AND sent_by = auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Enregistrer une expédition
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_shipment(
  p_company_id uuid,
  p_store_id uuid,
  p_recipient_name text,
  p_destination text,
  p_recipient_phone text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_sale_id uuid DEFAULT NULL,
  p_offtake_id uuid DEFAULT NULL,
  p_carrier text DEFAULT NULL,
  p_carrier_phone text DEFAULT NULL,
  p_tracking_ref text DEFAULT NULL,
  p_package_count integer DEFAULT 1,
  p_package_note text DEFAULT NULL,
  p_goods_amount numeric DEFAULT 0,
  p_shipping_cost numeric DEFAULT 0,
  p_shipping_paid_by text DEFAULT 'company',
  p_expected_at date DEFAULT NULL,
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
  v_id uuid;
  v_recipient text := NULLIF(btrim(COALESCE(p_recipient_name, '')), '');
  v_destination text := NULLIF(btrim(COALESCE(p_destination, '')), '');
  v_paid_by text := CASE
    WHEN COALESCE(p_shipping_paid_by, 'company') = 'customer' THEN 'customer'
    ELSE 'company'
  END;
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
  IF NOT public.can_manage_shipments(p_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''enregistrer une expédition.';
  END IF;
  IF v_recipient IS NULL THEN
    RAISE EXCEPTION 'Indiquez à qui part le colis.';
  END IF;
  IF v_destination IS NULL THEN
    RAISE EXCEPTION 'Indiquez la destination du colis.';
  END IF;

  -- Les trois rattachements doivent appartenir à la maison : un identifiant glissé
  -- dans la requête ne doit pas relier ce colis au dossier du voisin.
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Client introuvable dans cette entreprise.';
  END IF;
  IF p_sale_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sales WHERE id = p_sale_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Facture introuvable dans cette entreprise.';
  END IF;
  IF p_offtake_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_offtakes WHERE id = p_offtake_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Enlèvement introuvable dans cette entreprise.';
  END IF;

  -- Renvoi après coupure réseau : même parade qu'en 00193 et 00211.
  IF p_client_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      abs(hashtext(p_company_id::text)),
      abs(hashtext(p_client_request_id::text))
    );
    SELECT id INTO v_id
    FROM public.shipments
    WHERE company_id = p_company_id AND client_request_id = p_client_request_id;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.shipments (
    company_id, store_id, sale_id, offtake_id, customer_id,
    recipient_name, recipient_phone, destination,
    carrier, carrier_phone, tracking_ref, package_count, package_note,
    goods_amount, shipping_cost, shipping_paid_by,
    expected_at, note, client_request_id, created_by
  )
  VALUES (
    p_company_id, p_store_id, p_sale_id, p_offtake_id, p_customer_id,
    v_recipient,
    NULLIF(btrim(COALESCE(p_recipient_phone, '')), ''),
    v_destination,
    NULLIF(btrim(COALESCE(p_carrier, '')), ''),
    NULLIF(btrim(COALESCE(p_carrier_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_tracking_ref, '')), ''),
    GREATEST(1, COALESCE(p_package_count, 1)),
    NULLIF(btrim(COALESCE(p_package_note, '')), ''),
    GREATEST(0, COALESCE(p_goods_amount, 0)),
    GREATEST(0, COALESCE(p_shipping_cost, 0)),
    v_paid_by,
    p_expected_at,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    p_client_request_id,
    v_uid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_shipment IS
  'Enregistre une expédition vers un client éloigné et les frais de transport avancés. '
  'NE TOUCHE PAS AU STOCK : la marchandise est déjà sortie par la vente ou l''enlèvement '
  'auquel l''expédition se rattache.';

REVOKE ALL ON FUNCTION public.create_shipment(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text, text, integer, text,
  numeric, numeric, text, date, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_shipment(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text, text, integer, text,
  numeric, numeric, text, date, text, uuid
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Se faire rembourser le transport
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Le cumul est RECALCULÉ depuis les lignes, jamais incrémenté — même raison qu'en
 * 00211 : un renvoi réseau ferait dériver un `+= amount`, et la dérive serait
 * silencieuse.
 */
CREATE OR REPLACE FUNCTION public.add_shipment_reimbursement(
  p_shipment_id uuid,
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
  v_cost numeric;
  v_done numeric;
  v_status text;
  v_amount numeric := ROUND(COALESCE(p_amount, 0), 4);
  v_method payment_method;
  v_remaining numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT company_id, shipping_cost, shipping_reimbursed, status
    INTO v_company_id, v_cost, v_done, v_status
  FROM public.shipments
  WHERE id = p_shipment_id
  FOR UPDATE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Expédition introuvable.';
  END IF;
  IF NOT (v_company_id IN (SELECT * FROM public.current_user_company_ids()))
     AND NOT public.is_super_admin()
  THEN
    RAISE EXCEPTION 'Expédition introuvable.';
  END IF;
  IF NOT public.can_manage_shipments(v_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser un remboursement de frais.';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cette expédition est annulée : il n''y a plus rien à rembourser.';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Montant invalide.';
  END IF;
  IF v_amount > (v_cost - v_done) + 0.005 THEN
    RAISE EXCEPTION 'Il ne reste que % de frais à rembourser sur cette expédition.',
      TO_CHAR(v_cost - v_done, 'FM999G999G999D00');
  END IF;

  BEGIN
    v_method := COALESCE(NULLIF(btrim(COALESCE(p_method, '')), ''), 'cash')::payment_method;
  EXCEPTION WHEN others THEN
    v_method := 'cash';
  END;

  INSERT INTO public.shipment_reimbursements (
    company_id, shipment_id, amount, method, reference, note, created_by
  )
  VALUES (
    v_company_id, p_shipment_id, v_amount, v_method,
    NULLIF(btrim(COALESCE(p_reference, '')), ''),
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    v_uid
  );

  UPDATE public.shipments s
  SET shipping_reimbursed = COALESCE((
        SELECT SUM(amount) FROM public.shipment_reimbursements
        WHERE shipment_id = p_shipment_id
      ), 0),
      updated_at = now()
  WHERE s.id = p_shipment_id
  RETURNING s.shipping_cost - s.shipping_reimbursed INTO v_remaining;

  RETURN v_remaining;
END;
$$;

COMMENT ON FUNCTION public.add_shipment_reimbursement(uuid, numeric, text, text, text) IS
  'Enregistre un remboursement de frais d''expédition et RECALCULE le cumul depuis les '
  'lignes. Retourne le reste dû.';

REVOKE ALL ON FUNCTION public.add_shipment_reimbursement(uuid, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_shipment_reimbursement(uuid, numeric, text, text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Faire avancer le colis
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Les horodatages sont posés en base et non par l'écran. Un `shipped_at` envoyé par le
 * navigateur porte l'heure du téléphone du vendeur — souvent fausse de plusieurs
 * heures, parfois de plusieurs jours — et c'est cette heure-là qui servirait ensuite à
 * dire « le colis a mis quatre jours ».
 */
CREATE OR REPLACE FUNCTION public.set_shipment_status(
  p_shipment_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_status text := btrim(COALESCE(p_status, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF v_status NOT IN ('preparing', 'shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Statut d''expédition inconnu.';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.shipments WHERE id = p_shipment_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Expédition introuvable.';
  END IF;
  IF NOT public.can_manage_shipments(v_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de modifier cette expédition.';
  END IF;

  UPDATE public.shipments
  SET status = v_status,
      -- `COALESCE` : on horodate le PREMIER passage. Repasser un colis en « expédié »
      -- après une correction ne doit pas réécrire la date de départ réelle.
      shipped_at = CASE
        WHEN v_status IN ('shipped', 'delivered') THEN COALESCE(shipped_at, now())
        ELSE shipped_at
      END,
      delivered_at = CASE
        WHEN v_status = 'delivered' THEN COALESCE(delivered_at, now())
        ELSE delivered_at
      END,
      updated_at = now()
  WHERE id = p_shipment_id;
END;
$$;

COMMENT ON FUNCTION public.set_shipment_status(uuid, text) IS
  'Fait avancer une expédition (préparé / expédié / livré / annulé) et horodate le '
  'premier passage EN BASE — jamais avec l''heure du téléphone.';

REVOKE ALL ON FUNCTION public.set_shipment_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_shipment_status(uuid, text) TO authenticated;
