-- FasoStock — « Caisse à deux » : un vendeur prépare, un caissier encaisse.
--
-- Le cas, très courant dès qu'une boutique dépasse une personne : à l'heure de pointe,
-- une seule caisse tenue par une seule personne fait la queue. Le patron met alors un
-- deuxième employé « pour aider » — mais aider à quoi ? Aujourd'hui l'application ne
-- sait faire qu'une chose : une personne, un panier, un encaissement, du début à la fin.
-- Les deux employés se disputent donc le même téléphone, ou bien le deuxième note sur
-- un papier et ressaisit après — c'est-à-dire deux fois le travail et une source d'erreur.
--
-- La façon dont ces boutiques s'organisent réellement, elle, est connue :
--   • quelqu'un est DANS le magasin, près des rayons, avec le client : il constitue le panier ;
--   • quelqu'un est À LA CAISSE, avec l'argent, la monnaie, le TPE, le téléphone mobile
--     money : il encaisse et rend la monnaie.
-- C'est le partage naturel — celui des supermarchés, des quincailleries, des pharmacies
-- à forte affluence. Une seule chose manque pour le supporter : le PASSAGE DE RELAIS
-- entre les deux, c'est-à-dire un panier qui voyage du premier au second.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QU'ON NE FAIT PAS, ET POURQUOI
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. On ne crée PAS une vente « en attente de paiement ». Une vente en base, dans cette
--    application, veut dire : argent encaissé, stock sorti, chiffre d'affaires compté,
--    ligne dans la caisse du jour. Un panier envoyé à la caisse n'est RIEN de tout cela :
--    le client peut se raviser devant le caissier, le caissier peut refuser. Créer une
--    vente à l'envoi puis l'annuler à chaque renoncement salirait l'historique des ventes
--    et les rapports du propriétaire avec des ventes fantômes.
--
-- 2. On ne RÉSERVE PAS le stock à l'envoi. Ce serait la mauvaise réponse au bon problème :
--    un panier abandonné (le client part sans payer) laisserait des articles bloqués,
--    invisibles à la vente, jusqu'à ce que quelqu'un pense à faire le ménage. Le stock est
--    donc décrémenté à l'ENCAISSEMENT, exactement comme aujourd'hui, par le même RPC
--    `create_sale_with_stock`. Conséquence assumée et dite au caissier : entre l'envoi et
--    l'encaissement, un article peut être vendu par quelqu'un d'autre — l'encaissement
--    échouera alors avec « Stock insuffisant », au comptoir, pendant que la marchandise
--    est encore là et que la correction est possible. C'est le bon endroit pour échouer.
--
-- 3. On ne crée PAS de rôle « vendeur » et de rôle « caissier ». Le commerçant fait
--    tourner ses employés : celui qui encaisse le matin est en rayon l'après-midi. Toute
--    personne qui a le droit de vendre (`sales.create`) peut donc faire les deux, dans les
--    deux sens, sans réglage. Le module ajoute une possibilité, il n'enlève aucun droit.
--
-- Ce qui manque est donc une seule chose : un PANIER EN TRANSIT, avec son auteur, son
-- destinataire éventuel, et son issue. C'est `pos_handoffs` (+ ses lignes).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE CYCLE DE VIE, EN TROIS ÉTATS
-- ─────────────────────────────────────────────────────────────────────────────
--   pending    le panier attend un caissier. C'est le seul état « vivant ».
--   paid       encaissé : `sale_id` pointe la vente réelle qui vient d'être créée.
--   cancelled  abandonné (client parti, erreur de saisie, refus du caissier) — avec motif.
--
-- Aucun retour en arrière : `paid` et `cancelled` sont définitifs. Un encaissement qui
-- part de `pending` et n'y revient jamais est ce qui garantit qu'un panier ne peut pas
-- être encaissé deux fois, même si deux caissiers appuient en même temps (verrou de ligne
-- + garde d'état dans `checkout_pos_handoff`).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Le drapeau d'activation (entreprise, réglé par le PROPRIÉTAIRE)
-- ─────────────────────────────────────────────────────────────────────────────
-- Désactivé par défaut. Une boutique tenue par une seule personne n'a rien à gagner à voir
-- un bouton « envoyer à la caisse » : ce serait un détour de plus vers le même geste.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS dual_cashier_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.dual_cashier_enabled IS
  'Module « Caisse à deux » : un vendeur prépare le panier, un second employé confirme et '
  'encaisse depuis la page Encaissement. Désactivé par défaut, activé par le PROPRIÉTAIRE '
  'dans Paramètres (RPC company_set_dual_cashier_enabled).';

-- Garde des drapeaux propriétaire posée en 00167, étendue en 00173, 00174 puis 00182 :
-- cinquième drapeau, même règle, même trigger.
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_enforce_owner_flags_trigger ON public.companies;
CREATE TRIGGER companies_enforce_owner_flags_trigger
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE PROCEDURE public.companies_enforce_owner_flags();

CREATE OR REPLACE FUNCTION public.company_set_dual_cashier_enabled(
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
    RAISE EXCEPTION 'Seul le propriétaire peut activer ou désactiver la caisse à deux.';
  END IF;
  UPDATE public.companies
  SET dual_cashier_enabled = COALESCE(p_enabled, false)
  WHERE id = p_company_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.company_set_dual_cashier_enabled(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Numérotation : le numéro que les deux employés se disent à voix haute
-- ─────────────────────────────────────────────────────────────────────────────
-- « Bon B-42 ! » — c'est ce numéro, court et lisible de loin, qui fait le lien entre le
-- vendeur, le client qui traverse le magasin, et le caissier. D'où une séquence dédiée
-- plutôt que l'UUID : personne ne crie un UUID.
CREATE SEQUENCE IF NOT EXISTS public.pos_handoff_number_seq;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tables
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Un panier envoyé par un vendeur au caissier — le « bon de caisse ».
 *
 * Les montants sont recalculés à l'encaissement à partir des lignes : ceux stockés ici
 * servent l'affichage de la file d'attente (voir le total sans charger les lignes) et
 * la lecture de l'historique. Ils ne font foi pour aucune écriture comptable.
 */
CREATE TABLE IF NOT EXISTS public.pos_handoffs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  /** « B-42 » — le numéro qu'on annonce au client et au caissier. */
  handoff_number text NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),

  /** Client déjà rattaché par le vendeur (facultatif) ; le caissier peut le changer. */
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,

  subtotal numeric(18, 4) NOT NULL DEFAULT 0,
  discount numeric(18, 4) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total numeric(18, 4) NOT NULL DEFAULT 0,

  /** Mot du vendeur au caissier : « le monsieur en boubou bleu », « il paie en Wave ». */
  note text,
  /** Pharmacie : n° d'ordonnance saisi en rayon, reporté sur la vente à l'encaissement. */
  prescription_number text,

  /** Le bon rejoue la caisse d'où il vient : ticket thermique ou facture A4. */
  sale_mode public.sale_mode NOT NULL DEFAULT 'quick_pos',
  document_type public.document_type NOT NULL DEFAULT 'thermal_receipt',

  /**
   * Idempotence de l'envoi, même principe que `sale_sync_idempotency` (00061).
   *
   * Le cas se produit tous les jours ici : le vendeur touche « envoyer », la 3G lâche
   * pendant la réponse, il croit l'envoi raté et rappuie. Sans cette clé, le caissier
   * verrait DEUX bons identiques et encaisserait le client deux fois s'il ne s'en
   * aperçoit pas. Avec elle, le second appel retrouve le bon déjà créé et renvoie son
   * numéro — le vendeur voit « B-42 » et non « B-43 ».
   */
  client_request_id uuid,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  /**
   * « Je m'en occupe » : un caissier s'attribue le bon pour que son collègue ne le prenne
   * pas en même temps. Pur confort d'affichage — ce n'est PAS ce qui empêche le double
   * encaissement (c'est le verrou de `checkout_pos_handoff` qui s'en charge). N'importe
   * qui peut donc reprendre un bon attribué : sinon un caissier parti déjeuner
   * bloquerait la file.
   */
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,

  /** Vente réelle créée à l'encaissement. NULL tant que le bon n'est pas payé. */
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,

  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  /** Pourquoi le bon n'a pas abouti — c'est ce que le propriétaire lira le soir. */
  cancel_reason text
);

-- Rejeu de cette migration sur une base où la table existe déjà : `CREATE TABLE IF NOT
-- EXISTS` ci-dessus ne fait alors RIEN, colonne comprise. On ajoute donc explicitement
-- celle qui est arrivée après la première version du fichier.
ALTER TABLE public.pos_handoffs
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

COMMENT ON TABLE public.pos_handoffs IS
  'Panier en transit entre le vendeur qui l''a constitué et le caissier qui l''encaisse '
  '(module « Caisse à deux »). Ce n''est PAS une vente : ni stock sorti, ni chiffre '
  'd''affaires, tant que checkout_pos_handoff n''a pas créé la vente réelle.';
COMMENT ON COLUMN public.pos_handoffs.status IS
  'pending = attend un caissier (seul état vivant) ; paid = encaissé (voir sale_id) ; '
  'cancelled = abandonné. paid et cancelled sont définitifs.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_handoffs_number
  ON public.pos_handoffs(company_id, handoff_number);
-- La requête de la page Encaissement, jouée toutes les quelques secondes : les bons en
-- attente d'une boutique. Index partiel — la file vivante est minuscule (quelques lignes)
-- au milieu d'un historique qui, lui, grossit tous les jours.
CREATE INDEX IF NOT EXISTS idx_pos_handoffs_pending
  ON public.pos_handoffs(company_id, store_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pos_handoffs_history
  ON public.pos_handoffs(company_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_handoffs_author
  ON public.pos_handoffs(created_by, created_at DESC);
-- Index partiel unique : c'est LUI qui rend le renvoi inoffensif. Les bons anciens, créés
-- sans clé, ne s'y trouvent pas et ne se gênent donc pas entre eux.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_handoffs_client_request
  ON public.pos_handoffs(company_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

/**
 * Une ligne du bon.
 *
 * `label` est une COPIE du nom du produit au moment de l'envoi, et non un simple lien :
 * le caissier doit lire ce que le vendeur a scanné, même si le produit est renommé ou
 * retiré du catalogue entre-temps. `product_id` reste la référence qui sert au déstockage.
 */
CREATE TABLE IF NOT EXISTS public.pos_handoff_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  handoff_id uuid NOT NULL REFERENCES public.pos_handoffs(id) ON DELETE CASCADE,

  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  label text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(18, 4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  /**
   * Remise de ligne — reprise telle quelle de la caisse : elle absorbe l'arrondi d'un
   * conditionnement (carton, paquet) pour que le total de la ligne soit le prix exact
   * annoncé au client. Même sens que `sale_items.discount`.
   */
  discount numeric(18, 4) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  position integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pos_handoff_items IS
  'Lignes d''un bon de caisse. `label` est figé à l''envoi pour que le caissier lise ce '
  'que le vendeur a scanné, même si le produit change de nom ensuite.';

CREATE INDEX IF NOT EXISTS idx_pos_handoff_items_handoff
  ON public.pos_handoff_items(handoff_id, position);
CREATE INDEX IF NOT EXISTS idx_pos_handoff_items_company
  ON public.pos_handoff_items(company_id);

-- Numéro attribué en base : deux vendeurs qui envoient à la même seconde ne peuvent pas
-- produire le même « B-42 ». Un numéro calculé côté application le pourrait.
CREATE OR REPLACE FUNCTION public.pos_handoffs_set_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.handoff_number IS NULL OR btrim(NEW.handoff_number) = '' THEN
    NEW.handoff_number := 'B-' || nextval('public.pos_handoff_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_handoffs_set_number_trigger ON public.pos_handoffs;
CREATE TRIGGER pos_handoffs_set_number_trigger
  BEFORE INSERT ON public.pos_handoffs
  FOR EACH ROW
  EXECUTE PROCEDURE public.pos_handoffs_set_number();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Lecture : tout membre de l'entreprise. La file d'attente est un objet d'équipe — la
-- masquer à celui qui ne l'a pas créée serait exactement contraire au but.
-- Écriture : passe par les RPC ci-dessous (elles seules posent auteur, horodatage et
-- transitions d'état). Les policies restent néanmoins strictes : un client qui écrirait
-- en direct devrait de toute façon avoir le droit de vendre.
ALTER TABLE public.pos_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_handoff_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_handoffs_select" ON public.pos_handoffs;
CREATE POLICY "pos_handoffs_select" ON public.pos_handoffs FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "pos_handoffs_insert" ON public.pos_handoffs;
CREATE POLICY "pos_handoffs_insert" ON public.pos_handoffs FOR INSERT WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR public.user_has_company_permission(company_id, 'sales.create')
  )
);

DROP POLICY IF EXISTS "pos_handoffs_update" ON public.pos_handoffs;
CREATE POLICY "pos_handoffs_update" ON public.pos_handoffs FOR UPDATE USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR public.user_has_company_permission(company_id, 'sales.create')
  )
) WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
);

-- Suppression réservée au propriétaire : un bon encaissé porte la trace de qui a préparé
-- et de qui a pris l'argent. Ce n'est pas un brouillon.
DROP POLICY IF EXISTS "pos_handoffs_delete" ON public.pos_handoffs;
CREATE POLICY "pos_handoffs_delete" ON public.pos_handoffs FOR DELETE USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (public.is_super_admin() OR public.user_is_company_owner(company_id))
  AND sale_id IS NULL
);

DROP POLICY IF EXISTS "pos_handoff_items_select" ON public.pos_handoff_items;
CREATE POLICY "pos_handoff_items_select" ON public.pos_handoff_items FOR SELECT USING (
  public.is_super_admin() OR company_id IN (SELECT * FROM public.current_user_company_ids())
);

DROP POLICY IF EXISTS "pos_handoff_items_write" ON public.pos_handoff_items;
CREATE POLICY "pos_handoff_items_write" ON public.pos_handoff_items FOR ALL USING (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR public.user_has_company_permission(company_id, 'sales.create')
  )
) WITH CHECK (
  company_id IN (SELECT * FROM public.current_user_company_ids())
  AND (
    public.is_super_admin()
    OR public.user_is_company_owner(company_id)
    OR public.user_has_company_permission(company_id, 'sales.create')
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Garde commune : « ai-je le droit de manipuler les bons de cette entreprise ? »
-- ─────────────────────────────────────────────────────────────────────────────
-- Vendre et encaisser sont le même droit (`sales.create`), volontairement : le commerçant
-- fait tourner ses employés d'un poste à l'autre dans la journée, et un droit de plus à
-- accorder serait un droit oublié le jour où l'un remplace l'autre.
CREATE OR REPLACE FUNCTION public.can_handle_pos_handoffs(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR public.user_is_company_owner(p_company_id)
      OR public.user_has_company_permission(p_company_id, 'sales.create');
$$;

COMMENT ON FUNCTION public.can_handle_pos_handoffs(uuid) IS
  'Droit d''envoyer un panier à la caisse ET de l''encaisser : le même (sales.create), '
  'pour que deux employés puissent échanger leurs postes sans réglage.';

GRANT EXECUTE ON FUNCTION public.can_handle_pos_handoffs(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Envoyer un panier à la caisse
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Crée le bon et ses lignes en une transaction.
 *
 * Contrôle de stock volontairement AVERTISSEUR et non bloquant côté écriture : on refuse
 * les quantités absurdes (≤ 0) et les articles réservés au dépôt, mais on ne verrouille
 * rien. Le vrai contrôle de stock a lieu à l'encaissement, là où la marchandise part.
 */
-- `CREATE OR REPLACE` ne remplace QUE la fonction de signature identique : ajouter un
-- paramètre crée une SURCHARGE et laisse l'ancienne en place. Deux `create_pos_handoff`
-- cohabiteraient alors, dont une joignable sans clé d'idempotence et restée ouverte à
-- PUBLIC. On supprime donc explicitement la version à 9 arguments, comme 00177 l'a fait
-- pour `create_sale_with_stock`.
DROP FUNCTION IF EXISTS public.create_pos_handoff(
  uuid, uuid, jsonb, uuid, numeric, text, text, public.sale_mode, public.document_type
);

CREATE OR REPLACE FUNCTION public.create_pos_handoff(
  p_company_id uuid,
  p_store_id uuid,
  p_items jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_discount numeric DEFAULT 0,
  p_note text DEFAULT NULL,
  p_prescription_number text DEFAULT NULL,
  p_sale_mode public.sale_mode DEFAULT 'quick_pos',
  p_document_type public.document_type DEFAULT 'thermal_receipt',
  p_client_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handoff_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price numeric;
  v_disc numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_pos int := 0;
  v_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_company_id IS NULL OR NOT (p_company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise invalide ou non autorisée';
  END IF;
  IF NOT public.has_store_access(p_store_id, p_company_id) THEN
    RAISE EXCEPTION 'Accès refusé : boutique non autorisée pour cette entreprise';
  END IF;
  IF NOT public.can_handle_pos_handoffs(p_company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''envoyer un panier à la caisse.';
  END IF;

  -- Module coupé : on refuse la CRÉATION seulement. L'encaissement d'un bon déjà envoyé
  -- reste possible (voir `checkout_pos_handoff`) — sinon couper le module en pleine
  -- journée laisserait des clients qui attendent devant une caisse qui ne peut plus rien.
  IF NOT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = p_company_id AND dual_cashier_enabled = true
  ) THEN
    RAISE EXCEPTION 'La caisse à deux n''est pas activée pour cette entreprise.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide : rien à envoyer à la caisse.';
  END IF;

  /*
   * Renvoi après une coupure réseau : le bon existe déjà, on rend le même. Le verrou
   * consultatif sérialise deux appels simultanés portant la même clé — sans lui, les
   * deux passeraient la lecture avant que l'un des deux n'ait inséré.
   */
  IF p_client_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      abs(hashtext(p_company_id::text)),
      abs(hashtext(p_client_request_id::text))
    );
    SELECT id INTO v_handoff_id
    FROM public.pos_handoffs
    WHERE company_id = p_company_id
      AND client_request_id = p_client_request_id;
    IF v_handoff_id IS NOT NULL THEN
      RETURN v_handoff_id;
    END IF;
  END IF;

  INSERT INTO public.pos_handoffs (
    company_id, store_id, customer_id, subtotal, discount, total,
    note, prescription_number, sale_mode, document_type, client_request_id, created_by
  )
  VALUES (
    p_company_id, p_store_id, p_customer_id, 0, GREATEST(0, COALESCE(p_discount, 0)), 0,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    NULLIF(btrim(COALESCE(p_prescription_number, '')), ''),
    COALESCE(p_sale_mode, 'quick_pos'::public.sale_mode),
    COALESCE(p_document_type, 'thermal_receipt'::public.document_type),
    p_client_request_id,
    auth.uid()
  )
  RETURNING id INTO v_handoff_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_disc := GREATEST(0, COALESCE((v_item->>'discount')::numeric, 0));

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un article du panier.';
    END IF;

    SELECT p.name INTO v_label
    FROM public.products p
    WHERE p.id = v_product_id
      AND p.company_id = p_company_id
      AND COALESCE(p.product_scope, 'both') IN ('both', 'boutique_only');

    IF v_label IS NULL THEN
      RAISE EXCEPTION 'Article introuvable ou réservé au dépôt magasin : %', v_product_id;
    END IF;

    v_pos := v_pos + 1;
    INSERT INTO public.pos_handoff_items (
      company_id, handoff_id, product_id, label, quantity, unit_price, discount, position
    )
    VALUES (
      p_company_id, v_handoff_id, v_product_id, v_label, v_qty, v_unit_price, v_disc, v_pos
    );

    v_subtotal := v_subtotal + (v_qty * v_unit_price - v_disc);
  END LOOP;

  v_total := GREATEST(0, v_subtotal - GREATEST(0, COALESCE(p_discount, 0)));

  UPDATE public.pos_handoffs
  SET subtotal = v_subtotal,
      total = v_total
  WHERE id = v_handoff_id;

  RETURN v_handoff_id;
END;
$$;

COMMENT ON FUNCTION public.create_pos_handoff IS
  'Envoie un panier à la caisse (module « Caisse à deux »). Ne touche ni au stock ni aux '
  'ventes : le bon n''est qu''un panier en transit.';

REVOKE ALL ON FUNCTION public.create_pos_handoff(
  uuid, uuid, jsonb, uuid, numeric, text, text, public.sale_mode, public.document_type, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pos_handoff(
  uuid, uuid, jsonb, uuid, numeric, text, text, public.sale_mode, public.document_type, uuid
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. « Je m'en occupe » / « je relâche »
-- ─────────────────────────────────────────────────────────────────────────────
-- Confort d'équipe, pas verrou : deux caissiers voient la même file, celui qui prend le
-- bon le signale à l'autre. Reprendre le bon d'un collègue est autorisé et normal (il
-- s'est absenté, il est occupé) — l'écran dit alors clairement à qui il était attribué.
CREATE OR REPLACE FUNCTION public.claim_pos_handoff(
  p_handoff_id uuid,
  p_claim boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_store uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT company_id, store_id, status INTO v_company, v_store, v_status
  FROM public.pos_handoffs WHERE id = p_handoff_id;

  IF v_company IS NULL THEN RAISE EXCEPTION 'Bon de caisse introuvable.'; END IF;
  IF NOT public.has_store_access(v_store, v_company) THEN
    RAISE EXCEPTION 'Ce bon n''est pas dans vos boutiques.';
  END IF;
  IF NOT public.can_handle_pos_handoffs(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser.';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'Ce bon vient d''être encaissé.';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Ce bon a été annulé.';
  END IF;

  IF COALESCE(p_claim, true) THEN
    UPDATE public.pos_handoffs
    SET claimed_by = auth.uid(), claimed_at = now()
    WHERE id = p_handoff_id;
  ELSE
    UPDATE public.pos_handoffs
    SET claimed_by = NULL, claimed_at = NULL
    WHERE id = p_handoff_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.claim_pos_handoff(uuid, boolean) IS
  'Signale à l''équipe que ce bon est pris en charge. Indicatif : n''empêche pas un '
  'collègue de le reprendre, et n''est pas ce qui protège du double encaissement.';

REVOKE ALL ON FUNCTION public.claim_pos_handoff(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pos_handoff(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Abandonner un bon
-- ─────────────────────────────────────────────────────────────────────────────
-- Le client se ravise, le vendeur s'est trompé de bon, le caissier refuse : le bon meurt,
-- avec un motif. Rien à défaire par ailleurs — aucun stock n'avait bougé.
CREATE OR REPLACE FUNCTION public.cancel_pos_handoff(
  p_handoff_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_store uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT company_id, store_id, status INTO v_company, v_store, v_status
  FROM public.pos_handoffs WHERE id = p_handoff_id FOR UPDATE;

  IF v_company IS NULL THEN RAISE EXCEPTION 'Bon de caisse introuvable.'; END IF;
  IF NOT public.has_store_access(v_store, v_company) THEN
    RAISE EXCEPTION 'Ce bon n''est pas dans vos boutiques.';
  END IF;
  IF NOT public.can_handle_pos_handoffs(v_company) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''annuler un bon de caisse.';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'Ce bon est déjà encaissé : annulez la vente depuis la page Ventes.';
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN; -- déjà annulé : l'appel est sans effet, pas une erreur à afficher au caissier
  END IF;

  UPDATE public.pos_handoffs
  SET status = 'cancelled',
      cancelled_by = auth.uid(),
      cancelled_at = now(),
      cancel_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_handoff_id;
END;
$$;

COMMENT ON FUNCTION public.cancel_pos_handoff(uuid, text) IS
  'Abandonne un bon de caisse en attente, avec motif. Sans effet sur le stock : rien '
  'n''avait été réservé.';

REVOKE ALL ON FUNCTION public.cancel_pos_handoff(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_pos_handoff(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Encaisser : le bon devient une vente réelle
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Le cœur du module. Trois exigences, dans cet ordre :
 *
 *  1. UN SEUL ENCAISSEMENT. `FOR UPDATE` sérialise deux caissiers qui appuient en même
 *     temps ; le second trouve `status = 'paid'` et reçoit un refus explicite plutôt que
 *     de créer une deuxième vente et de sortir le stock deux fois.
 *
 *  2. UNE VENTE ORDINAIRE. On n'écrit pas nous-mêmes dans `sales` : on appelle
 *     `create_sale_with_stock`, le même RPC que la caisse. Le bon ne crée donc pas un
 *     deuxième chemin de vente à maintenir — mêmes contrôles de stock, mêmes mouvements,
 *     mêmes écritures de règlement, mêmes rapports. Le jour où la vente change, elle
 *     change ici aussi, sans que personne ait à y penser.
 *
 *  3. LA TRACE DES DEUX PERSONNES. `pos_handoffs.created_by` (qui a préparé) et
 *     `paid_by` (qui a encaissé) racontent le binôme. `sales.created_by` reste, lui,
 *     celui qui a encaissé : c'est la convention de toute l'application (la vente
 *     appartient à celui qui a pris l'argent) et les rapports existants n'ont pas à
 *     apprendre un cas particulier.
 */
CREATE OR REPLACE FUNCTION public.checkout_pos_handoff(
  p_handoff_id uuid,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_discount numeric DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_credit_due_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_h public.pos_handoffs%ROWTYPE;
  v_items jsonb;
  v_discount numeric;
  v_customer uuid;
  v_sale_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT * INTO v_h FROM public.pos_handoffs WHERE id = p_handoff_id FOR UPDATE;

  IF v_h.id IS NULL THEN RAISE EXCEPTION 'Bon de caisse introuvable.'; END IF;
  IF NOT (v_h.company_id IN (SELECT * FROM public.current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé : entreprise non autorisée';
  END IF;
  IF NOT public.has_store_access(v_h.store_id, v_h.company_id) THEN
    RAISE EXCEPTION 'Ce bon n''est pas dans vos boutiques.';
  END IF;
  IF NOT public.can_handle_pos_handoffs(v_h.company_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''encaisser.';
  END IF;

  IF v_h.status = 'paid' THEN
    RAISE EXCEPTION 'Ce bon vient d''être encaissé par quelqu''un d''autre.';
  END IF;
  IF v_h.status = 'cancelled' THEN
    RAISE EXCEPTION 'Ce bon a été annulé : demandez au vendeur de le renvoyer.';
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'product_id', i.product_id,
             'quantity', i.quantity,
             'unit_price', i.unit_price,
             'discount', i.discount
           )
           ORDER BY i.position, i.created_at
         )
    INTO v_items
  FROM public.pos_handoff_items i
  WHERE i.handoff_id = p_handoff_id;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Ce bon ne contient aucun article.';
  END IF;

  -- Remise : celle du vendeur par défaut, celle du caissier si elle est fournie (le
  -- patron accorde souvent le geste commercial au moment de payer, pas en rayon).
  v_discount := GREATEST(0, COALESCE(p_discount, v_h.discount, 0));
  -- Client : le caissier peut en rattacher un que le vendeur n'avait pas saisi — c'est
  -- indispensable pour une vente à crédit, décidée au comptoir.
  v_customer := COALESCE(p_customer_id, v_h.customer_id);

  -- Notation nommée (`=>`) et non positionnelle : la signature de
  -- `create_sale_with_stock` a déjà changé deux fois (00061, 00177) en gagnant des
  -- paramètres à la fin. Nommer les arguments met cet appel à l'abri de la prochaine.
  v_sale_id := public.create_sale_with_stock(
    p_company_id => v_h.company_id,
    p_store_id => v_h.store_id,
    p_customer_id => v_customer,
    p_created_by => auth.uid(),
    p_items => v_items,
    p_payments => COALESCE(p_payments, '[]'::jsonb),
    p_discount => v_discount,
    p_sale_mode => v_h.sale_mode,
    p_document_type => v_h.document_type
  );

  -- Échéance de crédit et n° d'ordonnance : mêmes colonnes que la caisse ordinaire.
  IF p_credit_due_at IS NOT NULL THEN
    UPDATE public.sales SET credit_due_at = p_credit_due_at WHERE id = v_sale_id;
  END IF;
  IF v_h.prescription_number IS NOT NULL THEN
    UPDATE public.sales SET prescription_number = v_h.prescription_number WHERE id = v_sale_id;
  END IF;

  UPDATE public.pos_handoffs
  SET status = 'paid',
      sale_id = v_sale_id,
      paid_by = auth.uid(),
      paid_at = now(),
      customer_id = v_customer,
      discount = v_discount,
      total = GREATEST(0, subtotal - v_discount)
  WHERE id = p_handoff_id;

  RETURN v_sale_id;
END;
$$;

COMMENT ON FUNCTION public.checkout_pos_handoff IS
  'Encaisse un bon de caisse : crée la vente réelle via create_sale_with_stock (stock, '
  'CA, rapports identiques à la caisse), puis marque le bon payé. Verrou de ligne : un '
  'bon ne peut être encaissé qu''une fois.';

REVOKE ALL ON FUNCTION public.checkout_pos_handoff(uuid, jsonb, numeric, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkout_pos_handoff(uuid, jsonb, numeric, uuid, timestamptz) TO authenticated;
