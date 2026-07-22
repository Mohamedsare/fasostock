-- FasoStock — Conversion du « prix gros / seuil gros » en conditionnement « Carton ».
-- Pour chaque produit ayant les deux champs renseignés :
--   • crée un conditionnement label = 'Carton'
--   • factor (nb de pièces) = wholesale_qty  (le seuil / nombre de pièces du gros)
--   • price (prix du pack)  = wholesale_price × wholesale_qty  (prix gros unitaire × pièces)
--
-- À exécuter dans le SQL Editor de Supabase (rôle service → ignore la RLS).
-- Idempotent : on n'insère pas si le produit a déjà un conditionnement de même `factor`.
-- Seuls les produits avec wholesale_qty >= 2 et wholesale_price > 0 sont concernés
-- (un « carton » d'1 pièce n'aurait pas de sens).

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 0 — APERÇU (recommandé) : lancez d'abord CE SELECT seul pour vérifier
-- ce qui sera créé, sans rien modifier.
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT p.id, p.name,
--        p.wholesale_qty                       AS carton_nb_pieces,
--        p.wholesale_price                     AS prix_gros_unitaire,
--        ROUND(p.wholesale_price * p.wholesale_qty) AS prix_carton
-- FROM public.products p
-- WHERE p.deleted_at IS NULL
--   AND p.wholesale_qty >= 2
--   AND p.wholesale_price > 0
--   AND NOT EXISTS (
--     SELECT 1 FROM public.product_packagings pp
--     WHERE pp.product_id = p.id AND pp.factor = p.wholesale_qty
--   )
-- ORDER BY p.name;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 — CONVERSION : crée les conditionnements « Carton ».
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.product_packagings
  (company_id, product_id, label, barcode, factor, price, position)
SELECT
  p.company_id,
  p.id,
  'Carton',
  NULL,
  p.wholesale_qty,
  ROUND(p.wholesale_price * p.wholesale_qty),
  COALESCE(
    (SELECT MAX(pp2.position) + 1
     FROM public.product_packagings pp2
     WHERE pp2.product_id = p.id),
    0
  )
FROM public.products p
WHERE p.deleted_at IS NULL
  AND p.wholesale_qty >= 2
  AND p.wholesale_price > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.product_packagings pp
    WHERE pp.product_id = p.id AND pp.factor = p.wholesale_qty
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 — (OPTIONNEL) Désactiver l'ancien prix gros dégressif.
-- Sinon, en plus du carton, le prix gros s'appliquerait TOUJOURS automatiquement
-- quand on ajoute >= wholesale_qty pièces en vrac (double comportement).
-- Décommentez pour « remplacer » vraiment le prix gros par le conditionnement.
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE public.products
-- SET wholesale_price = 0, wholesale_qty = 0
-- WHERE deleted_at IS NULL AND wholesale_qty >= 2 AND wholesale_price > 0;
