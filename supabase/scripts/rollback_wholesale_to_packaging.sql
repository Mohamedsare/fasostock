-- FasoStock — ANNULATION du backfill « prix gros → conditionnement Carton ».
-- Supprime UNIQUEMENT les conditionnements créés par backfill_wholesale_to_packaging.sql,
-- reconstruits à l'identique : label 'Carton', sans code-barres, factor = wholesale_qty
-- et price = ROUND(wholesale_price × wholesale_qty). Les cartons créés à la main
-- (avec code-barres, autre prix ou autre facteur) ne sont PAS touchés.
-- Prérequis : les champs wholesale_price / wholesale_qty n'ont pas été remis à 0
-- (l'Étape 2 du script de backfill était commentée).

-- ── APERÇU (lancez ce SELECT seul d'abord pour vérifier ce qui sera supprimé) ──
SELECT p.name,
       pp.factor AS nb_pieces,
       pp.price  AS prix_carton_cree
FROM public.product_packagings pp
JOIN public.products p ON p.id = pp.product_id
WHERE pp.label = 'Carton'
  AND pp.barcode IS NULL
  AND pp.factor = p.wholesale_qty
  AND pp.price = ROUND(p.wholesale_price * p.wholesale_qty)
  AND p.wholesale_qty >= 2
  AND p.wholesale_price > 0
ORDER BY p.name;

-- ── SUPPRESSION ──
DELETE FROM public.product_packagings pp
USING public.products p
WHERE pp.product_id = p.id
  AND pp.label = 'Carton'
  AND pp.barcode IS NULL
  AND pp.factor = p.wholesale_qty
  AND pp.price = ROUND(p.wholesale_price * p.wholesale_qty)
  AND p.wholesale_qty >= 2
  AND p.wholesale_price > 0;
