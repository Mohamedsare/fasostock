-- FasoStock — Approvisionnement : refermer `quick_supply_restore_for_sale_item`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUI ÉTAIT OUVERT
-- ─────────────────────────────────────────────────────────────────────────────
-- `quick_supply_restore_for_sale_item(uuid)` (00193, réécrite en 00195) rend au lot les
-- unités d'une ligne de vente qui s'en va. Elle est `SECURITY DEFINER` — donc elle
-- travaille SANS les politiques RLS, c'est tout son intérêt : elle doit pouvoir toucher
-- des lots que l'utilisateur courant n'a pas le droit d'écrire lui-même.
--
-- Mais elle était aussi `GRANT EXECUTE … TO authenticated`, et son corps ne vérifie rien :
-- ni l'entreprise de la ligne, ni la boutique, ni une permission. Toute personne
-- connectée, à n'importe quelle entreprise de la plateforme, pouvait donc l'appeler par
-- `POST /rest/v1/rpc/…` avec un identifiant de ligne de vente et, sans autre formalité :
--
--   * regonfler `quick_supply_items.remaining_quantity` — la marchandise se remet à
--     exister dans un lot, et la caisse la revend au prix de ce lot ;
--   * effacer des lignes de `quick_supply_consumptions` — la trace de ce qui a été
--     consommé disparaît, et la restitution devient rejouable autant de fois qu'on veut.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI ON RETIRE LE DROIT PLUTÔT QUE D'AJOUTER UNE GARDE
-- ─────────────────────────────────────────────────────────────────────────────
-- Parce que personne ne l'appelle depuis l'extérieur, et que personne ne le doit. Ses
-- deux seuls appelants sont internes :
--
--   * `quick_supply_restore_on_sale_item_delete()`, le trigger `BEFORE DELETE` sur
--     `sale_items` ;
--   * `cancel_sale_restore_stock(uuid)`, l'annulation d'une vente.
--
-- Tous deux sont `SECURITY DEFINER` : à l'intérieur, l'utilisateur effectif est le
-- PROPRIÉTAIRE de la fonction, pas l'employé qui a cliqué. Le contrôle d'`EXECUTE` s'y
-- fait donc sur ce propriétaire, et retirer le droit à `authenticated` ne les gêne pas
-- d'un iota. Chacun porte déjà ses propres vérifications, à l'endroit où elles ont un
-- sens — sur la vente, pas sur la ligne isolée.
--
-- Ajouter une garde à l'intérieur reviendrait à écrire une troisième fois le même
-- contrôle pour défendre une porte qui n'a aucune raison d'exister. La refermer est plus
-- court, et surtout ça ne peut pas se démoder : une garde, ça s'oublie à la prochaine
-- réécriture de la fonction ; un droit jamais accordé, non.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- REJEU
-- ─────────────────────────────────────────────────────────────────────────────
-- Entièrement idempotente. `REVOKE` sur un droit déjà retiré ne fait rien et ne se
-- plaint pas. Rien n'est créé, rien n'est supprimé, aucune donnée n'est touchée.

REVOKE EXECUTE ON FUNCTION public.quick_supply_restore_for_sale_item(uuid)
  FROM authenticated;

-- `anon` et PUBLIC n'ont jamais rien reçu ici ; on le pose noir sur blanc pour que l'état
-- attendu se lise dans le fichier plutôt que de se déduire de trois migrations.
REVOKE ALL ON FUNCTION public.quick_supply_restore_for_sale_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quick_supply_restore_for_sale_item(uuid) FROM anon;

COMMENT ON FUNCTION public.quick_supply_restore_for_sale_item(uuid) IS
  'Rend au lot les unités d''une ligne de vente qui disparaît. USAGE INTERNE : appelée '
  'seulement par le trigger BEFORE DELETE sur sale_items et par cancel_sale_restore_stock, '
  'qui portent les contrôles de droits. Volontairement NON exécutable par authenticated — '
  'elle est SECURITY DEFINER et ne vérifie ni entreprise ni permission (00198).';
