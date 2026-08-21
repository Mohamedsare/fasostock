-- FasoStock — Renommer un produit pendant un inventaire renomme aussi la ligne de comptage.
--
-- Les sessions d'inventaire (boutique et dépôt) figent le nom du produit au démarrage
-- (`product_name`), pour que l'historique d'une session validée reste lisible même si le
-- catalogue bouge ensuite. Effet de bord : pendant le comptage, une correction de nom
-- (faute de frappe, libellé précisé sur l'étiquette) ne se voyait pas dans la liste —
-- la personne qui compte cherchait le nouveau nom et ne trouvait rien.
--
-- Règle retenue : le nom suit le produit TANT QUE la session est ouverte ; une fois la
-- session clôturée ou annulée, son snapshot est figé pour de bon (l'historique ne se
-- réécrit pas).

CREATE OR REPLACE FUNCTION public.sync_open_inventory_session_product_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Inventaire boutique — on part des sessions ouvertes de l'entreprise : l'index unique
  -- (session_id, product_id) rend la mise à jour ponctuelle, sans balayer la table.
  UPDATE public.inventory_session_items it
  SET product_name = NEW.name
  WHERE it.product_id = NEW.id
    AND it.product_name IS DISTINCT FROM NEW.name
    AND it.session_id IN (
      SELECT s.id
      FROM public.inventory_sessions s
      JOIN public.stores st ON st.id = s.store_id
      WHERE s.status = 'open'
        AND st.company_id = NEW.company_id
    );

  -- Inventaire dépôt (magasin) — même règle.
  UPDATE public.warehouse_inventory_session_items it
  SET product_name = NEW.name
  WHERE it.product_id = NEW.id
    AND it.product_name IS DISTINCT FROM NEW.name
    AND it.session_id IN (
      SELECT s.id
      FROM public.warehouse_inventory_sessions s
      WHERE s.status = 'open'
        AND s.company_id = NEW.company_id
    );

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.sync_open_inventory_session_product_name() IS
  'Propage le renommage d''un produit aux lignes de comptage des sessions d''inventaire OUVERTES (boutique + dépôt).';

DROP TRIGGER IF EXISTS trg_products_sync_inventory_session_name ON public.products;
CREATE TRIGGER trg_products_sync_inventory_session_name
AFTER UPDATE OF name ON public.products
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name)
EXECUTE FUNCTION public.sync_open_inventory_session_product_name();

REVOKE ALL ON FUNCTION public.sync_open_inventory_session_product_name() FROM PUBLIC;
