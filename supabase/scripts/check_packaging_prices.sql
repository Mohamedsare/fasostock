-- FasoStock — Repérer les conditionnements dont le PRIX A ÉTÉ SAISI À L'ENVERS.
--
-- Rappel : `product_packagings.price` est le prix du LOT ENTIER (le carton complet).
-- Saisir à la place le prix de gros À LA PIÈCE fait vendre le lot moins cher qu'une
-- seule pièce — ex. « Sachet » de 25 pce à 1 250 FCFA alors que la pièce vaut 1 500.
--
-- Le formulaire refuse désormais ces saisies ; ce script sert aux données déjà en base.
-- À exécuter dans le SQL Editor de Supabase (rôle service → ignore la RLS).

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 — DIAGNOSTIC (ne modifie rien). Deux anomalies :
--   • lot_moins_cher_qu_une_piece : le lot entier coûte ≤ le prix d'une pièce
--   • vente_a_perte               : le lot revient, à la pièce, sous le prix d'achat
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  c.name                                        AS entreprise,
  p.name                                        AS produit,
  pp.label                                      AS conditionnement,
  pp.factor                                     AS nb_pieces,
  pp.price                                      AS prix_lot_saisi,
  CEIL(pp.price / pp.factor)                    AS revient_a_la_piece,
  p.sale_price                                  AS prix_piece,
  p.purchase_price                              AS prix_achat,
  ROUND(pp.price * pp.factor)                   AS prix_lot_si_saisie_a_l_envers,
  CASE
    WHEN p.sale_price > 0 AND pp.price <= p.sale_price THEN 'lot_moins_cher_qu_une_piece'
    ELSE 'vente_a_perte'
  END                                           AS anomalie
FROM public.product_packagings pp
JOIN public.products p  ON p.id = pp.product_id
JOIN public.companies c ON c.id = pp.company_id
WHERE p.deleted_at IS NULL
  AND pp.price IS NOT NULL
  AND pp.factor >= 2
  AND (
    (p.sale_price > 0 AND pp.price <= p.sale_price)
    OR (p.purchase_price > 0 AND CEIL(pp.price / pp.factor) < p.purchase_price)
  )
ORDER BY c.name, p.name, pp.label;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 — (OPTIONNEL) CORRECTION en masse : on considère que le montant saisi
-- était le prix À LA PIÈCE et on le multiplie par le nombre de pièces.
--
-- ⚠ À ne lancer QU'APRÈS avoir relu la liste ci-dessus : si un prix a été saisi
-- non pas à l'envers mais simplement trop bas, cette requête le multiplierait
-- aussi. En cas de doute, corrigez produit par produit depuis la fiche produit.
-- Décommentez pour appliquer.
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE public.product_packagings pp
-- SET price = ROUND(pp.price * pp.factor)
-- FROM public.products p
-- WHERE p.id = pp.product_id
--   AND p.deleted_at IS NULL
--   AND pp.price IS NOT NULL
--   AND pp.factor >= 2
--   AND p.sale_price > 0
--   AND pp.price <= p.sale_price;
