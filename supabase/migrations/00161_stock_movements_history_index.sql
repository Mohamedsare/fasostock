-- ============================================================================
-- 00161 — Historique des mouvements de stock : index de pagination
--
-- Symptôme corrigé : l'onglet « Historique mouvements » (page Stock) renvoyait
-- « canceling statement due to statement timeout » (Postgres 57014) sur les
-- boutiques à fort volume.
--
-- Cause : la requête filtre sur `store_id` et trie sur `created_at DESC`, alors
-- que les deux colonnes n'étaient indexées que SÉPARÉMENT
-- (`idx_stock_movements_store`, `idx_stock_movements_created`, 00001). Postgres
-- devait donc lire toutes les lignes de la boutique puis les trier, en évaluant
-- la policy RLS `stock_movements_all` (EXISTS + fonctions) sur chacune.
--
-- Avec cet index composite, la lecture d'une page (LIMIT 20) devient un simple
-- parcours d'index déjà trié : ~20 évaluations de policy au lieu de N.
-- L'ordre DESC est explicite pour couvrir le tri de la page sans étape de tri.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_stock_movements_store_created
  ON public.stock_movements (store_id, created_at DESC);

-- Idem pour le filtre « par produit » de l'historique (recherche produit).
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_product_created
  ON public.stock_movements (store_id, product_id, created_at DESC);

-- `idx_stock_movements_created` (created_at seul) est conservé : il sert les
-- lectures inter-boutiques (dashboard, notifications propriétaire).
