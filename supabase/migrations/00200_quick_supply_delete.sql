-- FasoStock — Suppression d'un arrivage par le SUPER ADMIN.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI CETTE PORTE, ET POURQUOI ELLE EST ÉTROITE
-- ─────────────────────────────────────────────────────────────────────────────
-- 00193 ne donnait AUCUNE policy DELETE sur `quick_supplies`, volontairement : un
-- arrivage a fait bouger du stock réel, et se tromper se corrige par un inventaire —
-- tracé — plutôt qu'en effaçant la preuve. Ça reste vrai pour le commerçant.
--
-- Mais le super admin, lui, a un besoin que cette règle ne couvre pas : nettoyer. Les
-- arrivages de démonstration saisis pour montrer le module à un client, les essais
-- faits pendant une mise en route, les doublons d'un employé qui découvre l'écran.
-- Sans porte de sortie, ces lignes restent à vie dans l'historique du commerçant — et
-- pire, leurs LOTS continuent d'imposer un prix en caisse jusqu'à épuisement.
--
-- La porte est donc ouverte au seul super admin, et à personne d'autre : ni le
-- propriétaire, ni un employé, quel que soit son droit d'approvisionnement.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE STOCK : UN CHOIX, JAMAIS UNE SURPRISE
-- ─────────────────────────────────────────────────────────────────────────────
-- Supprimer un arrivage pose une question à laquelle il n'existe pas de bonne réponse
-- par défaut :
--
--   • Un arrivage de DÉMONSTRATION a fait entrer du stock qui n'existe pas dans le
--     magasin. Le supprimer sans retirer ce stock laisse le commerçant avec un
--     inventaire faux, qu'il ne découvrira qu'au comptage.
--   • Un arrivage RÉEL, saisi il y a deux mois, correspond à de la marchandise bien
--     présente en rayon. Lui retirer son stock casserait un inventaire juste.
--
-- Le même geste, deux conséquences opposées — et seul l'humain devant l'écran sait
-- laquelle s'applique. `p_revert_stock` porte donc ce choix, et l'écran le pose
-- explicitement, avec le nombre d'unités concernées écrit dans la question.
--
-- Ce qui est retiré, le cas échéant, ce sont les unités ENCORE DANS LE LOT
-- (`remaining_quantity`) : celles déjà vendues sont parties depuis longtemps, et
-- vouloir les reprendre creuserait un trou dans un stock déjà juste.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUI N'EST JAMAIS EFFACÉ
-- ─────────────────────────────────────────────────────────────────────────────
-- Les `stock_movements` de l'entrée d'origine restent. Ils appartiennent à l'historique
-- des mouvements (page Magasin), pas à celui des arrivages, et ils disent une chose qui
-- est vraie : ce jour-là, de la marchandise est entrée. Un retrait de stock ajoute donc
-- un mouvement de plus — il ne supprime pas le précédent. Le stock d'une boutique doit
-- pouvoir s'expliquer ligne à ligne, y compris quand c'est nous qui l'avons corrigé.
--
-- `sale_items.unit_cost` reste également : les ventes déjà faites ont réellement coûté
-- ce prix-là, et réécrire une marge passée fausserait des rapports déjà lus.

CREATE OR REPLACE FUNCTION public.delete_quick_supply(
  p_supply_id uuid,
  p_revert_stock boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_store uuid;
  v_number text;
  r RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  -- Le seul contrôle qui compte. Ni le propriétaire ni `quick_supply.create` n'ouvrent
  -- cette porte : effacer une entrée de stock n'est pas une opération de commerce.
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur FasoStock peut supprimer un arrivage.';
  END IF;

  SELECT company_id, store_id, supply_number
    INTO v_company, v_store, v_number
  FROM public.quick_supplies
  WHERE id = p_supply_id
  FOR UPDATE;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Arrivage introuvable.';
  END IF;

  IF COALESCE(p_revert_stock, false) THEN
    FOR r IN
      SELECT product_id, remaining_quantity
      FROM public.quick_supply_items
      WHERE supply_id = p_supply_id AND remaining_quantity > 0
      FOR UPDATE
    LOOP
      -- `GREATEST(0, …)` : entre l'arrivage et sa suppression, un inventaire a pu
      -- corriger le stock à la baisse. On ne descend jamais sous zéro — un stock
      -- négatif est une donnée que plus aucun écran ne sait présenter honnêtement.
      UPDATE public.store_inventory
      SET quantity = GREATEST(0, quantity - r.remaining_quantity),
          updated_at = now()
      WHERE store_id = v_store AND product_id = r.product_id;

      -- Le retrait est tracé comme tout le reste : la page Magasin doit pouvoir dire
      -- pourquoi le stock a baissé, et de la main de qui.
      INSERT INTO public.stock_movements (
        store_id, product_id, type, quantity, reference_type, reference_id, created_by, notes
      )
      VALUES (
        v_store, r.product_id, 'adjustment', -r.remaining_quantity,
        'quick_supply_deleted', p_supply_id, v_uid,
        'Suppression de l''arrivage ' || COALESCE(v_number, '')
      );
    END LOOP;
  END IF;

  -- La cascade emporte les lignes (`quick_supply_items`) et, par elles, les liens de
  -- consommation (`quick_supply_consumptions`). Les lots cessent donc immédiatement
  -- d'imposer leur prix en caisse — c'est le premier effet attendu d'une suppression.
  DELETE FROM public.quick_supplies WHERE id = p_supply_id;
END;
$$;

COMMENT ON FUNCTION public.delete_quick_supply(uuid, boolean) IS
  'Supprime un arrivage (super admin uniquement). p_revert_stock retire du stock les '
  'unités encore dans le lot, avec un mouvement tracé. Les mouvements d''entrée '
  'd''origine et les coûts figés sur les ventes ne sont jamais effacés.';

REVOKE ALL ON FUNCTION public.delete_quick_supply(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_quick_supply(uuid, boolean) TO authenticated;
