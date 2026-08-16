-- FasoStock — Approvisionnement : les prix de l'arrivage deviennent un LOT.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI CE FICHIER EXISTE
-- ─────────────────────────────────────────────────────────────────────────────
-- `00193_quick_supply.sql` a été appliquée, PUIS retravaillée en profondeur : la règle
-- de prix du module a changé. Le CLI Supabase indexant les migrations par leur préfixe
-- de version, `00193` est déjà inscrite comme faite et ne sera jamais rejouée — les
-- modifications ne peuvent donc arriver que par un nouveau numéro. C'est celui-ci.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUI CHANGE, ET POURQUOI
-- ─────────────────────────────────────────────────────────────────────────────
-- Première version : les prix saisis à l'arrivage ÉCRASAIENT ceux de la fiche produit.
-- C'était faux. Les prix d'un arrivage sont des prix de circonstance — le grossiste
-- habituel était fermé, le voisin a profité de l'urgence, le carton était abîmé et
-- négocié. Les recopier dans `products` laisse un achat de dépannage redéfinir la
-- valeur d'une référence pour TOUTE la boutique : la marge de tout le stock déjà
-- présent devient fausse, les rapports du mois avec, et le caissier lit demain un prix
-- que personne n'a décidé.
--
-- La règle devient donc celle du LOT, au sens propre :
--
--   « J'ai payé le sucre 650 au lieu de 600 parce que mon grossiste était fermé.
--     Je vends CES douze sacs-là à 800. Quand ils sont finis, on revient à 750. »
--
--   1. La caisse vend au prix de l'arrivage TANT QU'IL EN RESTE.
--   2. La marge se calcule sur le coût RÉELLEMENT payé pour ces unités-là.
--   3. Le lot épuisé, tout revient au catalogue — sans intervention.
--   4. `products.purchase_price` / `products.sale_price` ne sont JAMAIS touchés.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE FICHIER EST CONVERGENT
-- ─────────────────────────────────────────────────────────────────────────────
-- Il amène la base à l'état cible, qu'elle ait reçu la PREMIÈRE version de 00193
-- (anciennes colonnes de prix, fonction de reprix, écrasement du catalogue) ou la
-- version finale. Sur une base neuve — qui aura joué 00193 dans sa forme actuelle —
-- chaque instruction ci-dessous est un non-événement. C'est voulu : personne ne devrait
-- avoir à se souvenir de quelle variante tourne chez quel client.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Les colonnes du lot
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.quick_supply_items
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.quick_supply_items
  ADD COLUMN IF NOT EXISTS remaining_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE public.quick_supply_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric(18, 4) NOT NULL DEFAULT 0;
ALTER TABLE public.quick_supply_items
  ADD COLUMN IF NOT EXISTS unit_sale_price numeric(18, 4);
ALTER TABLE public.quick_supply_items
  ADD COLUMN IF NOT EXISTS catalogue_purchase_price numeric(18, 4);
ALTER TABLE public.quick_supply_items
  ADD COLUMN IF NOT EXISTS catalogue_sale_price numeric(18, 4);

/*
 * Reprise des anciennes colonnes, si la base a reçu la première version de 00193.
 *
 * Les noms d'alors — `purchase_price`, `sale_price`, `previous_*` — disaient « prix du
 * produit ». Les nouveaux disent « prix de cet arrivage » et « photo du catalogue ».
 * Ce n'est pas cosmétique : c'est précisément la distinction que le module doit tenir,
 * et la porter dans les noms est ce qui empêche de la reperdre à la prochaine lecture.
 */
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quick_supply_items'
      AND column_name = 'purchase_price'
  ) THEN
    UPDATE public.quick_supply_items
    SET unit_cost = COALESCE(purchase_price, 0)
    WHERE unit_cost = 0;
    ALTER TABLE public.quick_supply_items DROP COLUMN purchase_price;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quick_supply_items'
      AND column_name = 'sale_price'
  ) THEN
    UPDATE public.quick_supply_items
    SET unit_sale_price = sale_price
    WHERE unit_sale_price IS NULL;
    ALTER TABLE public.quick_supply_items DROP COLUMN sale_price;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quick_supply_items'
      AND column_name = 'previous_purchase_price'
  ) THEN
    UPDATE public.quick_supply_items
    SET catalogue_purchase_price = previous_purchase_price
    WHERE catalogue_purchase_price IS NULL;
    ALTER TABLE public.quick_supply_items DROP COLUMN previous_purchase_price;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quick_supply_items'
      AND column_name = 'previous_sale_price'
  ) THEN
    UPDATE public.quick_supply_items
    SET catalogue_sale_price = previous_sale_price
    WHERE catalogue_sale_price IS NULL;
    ALTER TABLE public.quick_supply_items DROP COLUMN previous_sale_price;
  END IF;
END;
$$;

-- La boutique de la ligne, recopiée depuis l'arrivage : la caisse cherche ses lots par
-- boutique, et une jointure de plus sur ce chemin-là se paie en millisecondes visibles.
UPDATE public.quick_supply_items i
SET store_id = s.store_id
FROM public.quick_supplies s
WHERE s.id = i.supply_id AND i.store_id IS NULL;

/*
 * Les arrivages DÉJÀ SAISIS ne deviennent pas des lots (`remaining_quantity` reste à 0).
 *
 * Ils ont été enregistrés sous l'ancienne règle : leurs prix sont partis dans la fiche
 * produit et s'appliquent donc déjà, en caisse, à tout le stock. Les transformer en lots
 * appliquerait le même prix une seconde fois, par-dessus lui-même — et surtout, personne
 * ne sait combien de ces unités ont déjà été vendues. Mieux vaut un historique honnête
 * qu'un stock reconstitué à la louche.
 */

CREATE INDEX IF NOT EXISTS idx_quick_supply_items_open_lots
  ON public.quick_supply_items(store_id, product_id, created_at)
  WHERE remaining_quantity > 0;

COMMENT ON TABLE public.quick_supply_items IS
  'Lignes d''un arrivage express. `unit_cost` / `unit_sale_price` sont les prix DE '
  'L''ARRIVAGE et ne remplacent jamais ceux du catalogue ; `catalogue_*` en garde la '
  'photo au même instant, pour comparaison.';
COMMENT ON COLUMN public.quick_supply_items.unit_cost IS
  'Prix payé pour cet arrivage précis. À ne pas confondre avec products.purchase_price.';
COMMENT ON COLUMN public.quick_supply_items.unit_sale_price IS
  'Prix de vente prévu pour cette marchandise. À ne pas confondre avec products.sale_price.';
COMMENT ON COLUMN public.quick_supply_items.remaining_quantity IS
  'Unités du lot pas encore vendues. Décrémenté FIFO par les ventes, restitué aux '
  'annulations. Distinct du stock (store_inventory), que les inventaires corrigent aussi.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Ce qui n'a plus lieu d'être
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * `can_reprice_on_quick_supply` gardait le droit de modifier le prix de vente d'un
 * produit existant depuis l'arrivage. Puisque l'arrivage ne modifie plus aucun prix du
 * catalogue, il n'y a plus rien à garder : la question a disparu avec la règle. Et c'est
 * la meilleure nouvelle pour le propriétaire qui confie la réception à un caissier —
 * celui-ci fixe le prix d'une caisse de marchandise, pas celui du magasin.
 */
DROP FUNCTION IF EXISTS public.can_reprice_on_quick_supply(uuid);

/*
 * `help.view` et `notifications.view` : la première version de 00193 les créait pour
 * permettre au propriétaire de masquer ces pages du menu d'un employé. Mauvaise idée —
 * une permission accordée à tous les rôles est absente tant que la migration n'est pas
 * jouée, et les deux pages disparaissaient alors du menu de TOUT LE MONDE, propriétaire
 * compris, entre le déploiement du code et le passage de la migration. Masquer une
 * entrée de menu est un confort d'affichage : ça ne doit pas pouvoir casser quoi que ce
 * soit. C'est passé dans `company_settings` (clé `employee_hidden_pages`), sans
 * migration. On retire donc les clés devenues orphelines — plus aucun code ne les lit.
 */
DELETE FROM public.user_permission_overrides o
USING public.permissions p
WHERE p.id = o.permission_id AND p.key IN ('help.view', 'notifications.view');

DELETE FROM public.role_permissions rp
USING public.permissions p
WHERE p.id = rp.permission_id AND p.key IN ('help.view', 'notifications.view');

DELETE FROM public.permissions WHERE key IN ('help.view', 'notifications.view');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Le coût réel d'une ligne de vente
-- ─────────────────────────────────────────────────────────────────────────────
/*
 * Jusqu'ici la marge se calculait partout pareil : `total de la ligne −
 * products.purchase_price × quantité`. C'est juste tant qu'un produit n'a qu'un prix
 * d'achat. Les lots cassent cette hypothèse : douze sacs payés 650 chez le voisin
 * cohabitent, dans le même rayon, avec ceux payés 600 chez le grossiste.
 *
 * On fige donc le coût vraiment supporté au moment où la marchandise sort du lot.
 * NULL = vente ordinaire : les rapports retombent sur le prix catalogue, et pas un
 * centime ne bouge par rapport à aujourd'hui.
 */
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric(18, 4);

COMMENT ON COLUMN public.sale_items.unit_cost IS
  'Coût unitaire réel de la ligne quand la marchandise vient d''un lot '
  'd''approvisionnement (moyenne pondérée si plusieurs lots). NULL = aucun lot : les '
  'rapports retombent sur products.purchase_price, comportement historique inchangé.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Quelles unités vendues venaient de quel lot
-- ─────────────────────────────────────────────────────────────────────────────
/*
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Le prix en vigueur pour une boutique
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Pour chaque produit ayant un lot ouvert : le prix auquel il doit se vendre ici et
 * maintenant, et le coût correspondant. Une seule requête pour toute la boutique — la
 * caisse la joue à l'ouverture et la superpose à son catalogue, exactement comme elle
 * le fait déjà des promotions.
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
-- 6. Consommation et restitution — branchées sur les lignes de vente
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
-- 7. Annulation d'une vente : rendre aussi les lots
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

    -- Ajout 00195 : la marchandise retourne aussi dans le lot d'où elle venait.
    PERFORM public.quick_supply_restore_for_sale_item(v_item.id);
  END LOOP;

  UPDATE public.sales SET status = 'cancelled' WHERE id = p_sale_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. L'arrivage ne touche plus aux prix du catalogue
-- ─────────────────────────────────────────────────────────────────────────────
/**
 * Même signature qu'en 00193 : `CREATE OR REPLACE` remplace donc proprement la version
 * qui écrasait `products.purchase_price` et `products.sale_price`.
 *
 * Deux différences avec elle, et ce sont les seules qui comptent :
 *   • plus aucun UPDATE sur `products` (sauf création d'un produit qui n'existait pas) ;
 *   • la ligne devient un LOT (`store_id`, `remaining_quantity`).
 *
 * Format d'une ligne de `p_items` :
 *   { product_id, quantity, unit_cost, unit_sale_price? }                 produit existant
 *   { label, quantity, unit_cost, unit_sale_price, unit?, barcode? }      produit à créer
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

      /*
       * SEULE exception à « on ne touche pas au catalogue » : un produit qui n'existe
       * pas n'a pas de prix, et il faut bien lui en donner un — sinon il entre en stock
       * invendable, et le module rate son but.
       */
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
       * ON NE TOUCHE À AUCUN PRIX DU CATALOGUE. Les prix saisis restent sur la ligne
       * d'arrivage, à côté de la photo des vrais prix. Le propriétaire voit l'écart, et
       * décide — ou non — de répercuter.
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
