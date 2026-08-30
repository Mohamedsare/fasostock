-- FasoStock — Fermer l'écriture directe sur les tables d'argent des deux nouveaux
-- modules. Désormais : on passe par la RPC, ou on ne passe pas.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUI RESTAIT OUVERT
-- ═════════════════════════════════════════════════════════════════════════════
-- 00211 et 00213 ont posé des policies d'écriture correctement gardées : appartenance
-- à l'entreprise ET `can_manage_partner_offtakes` / `can_manage_shipments`. C'est déjà
-- bien au-dessus du défaut historique corrigé en 00207.
--
-- Mais une policy RLS autorise ou refuse une LIGNE, jamais une COLONNE. Un employé à
-- qui le propriétaire a confié le module pouvait donc, avec le jeton que l'application
-- lui remet à sa propre connexion, écrire en REST ce que l'écran ne lui propose nulle
-- part :
--
--   UPDATE partner_offtakes SET amount_paid = total_amount WHERE id = '…';
--       → la créance du partenaire est soldée. Aucun règlement en face, aucune trace
--         dans `partner_offtake_payments`, et les totaux de la page deviennent faux.
--
--   UPDATE shipments SET shipping_reimbursed = shipping_cost WHERE id = '…';
--       → les frais avancés apparaissent remboursés. C'est exactement l'argent que le
--         module a été écrit pour ne plus perdre.
--
--   INSERT INTO partner_offtake_items (…) VALUES (…);
--       → des lignes sans rapport avec le bon, ou un bon sans mouvement de stock.
--
-- Aucun de ces gestes n'est un abus de droit : ce sont des écritures que le droit
-- accordé rend légitimes aux yeux de PostgreSQL, et illégitimes aux yeux du commerçant.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POURQUOI ON PEUT SIMPLEMENT LES RETIRER
-- ═════════════════════════════════════════════════════════════════════════════
-- Les six fonctions d'écriture sont `SECURITY DEFINER` (vérifié : `prosecdef` vaut vrai
-- pour les six). Elles s'exécutent donc avec les droits du propriétaire de la fonction
-- et ne sont PAS soumises à la RLS de l'appelant. Retirer les policies d'écriture ne
-- leur enlève rien.
--
-- Et l'application n'écrit jamais en direct sur ces cinq tables : chaque création,
-- chaque règlement, chaque changement d'état passe par
-- `create_partner_offtake`, `add_partner_offtake_payment`, `cancel_partner_offtake`,
-- `create_shipment`, `add_shipment_reimbursement` ou `set_shipment_status` — lesquelles
-- vérifient le droit, l'appartenance de chaque produit, la cohérence des montants, et
-- écrivent le mouvement de stock dans la même transaction.
--
-- Le résultat est une garantie qu'une policy ne pouvait pas donner : les totaux d'un
-- bon ne peuvent plus diverger de ses lignes, et une créance ne peut plus s'effacer
-- sans règlement en face.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUI N'EST PAS TOUCHÉ
-- ═════════════════════════════════════════════════════════════════════════════
--   • La LECTURE. Les policies `SELECT` restent identiques : l'écran doit continuer
--     d'afficher ce que l'entreprise a le droit de voir.
--   • Les deux JOURNAUX de relance (`credit_reminders`, `shipment_reminders`). Ce sont
--     des tables d'ajout seul, écrites en direct par l'application, sans montant qui
--     fasse autorité — et leurs policies exigent déjà `sent_by = auth.uid()`, donc
--     personne ne signe une relance du nom d'un collègue. Les fermer obligerait à
--     écrire une RPC pour journaliser un message WhatsApp : du cérémonial sans gain.
--   • La SUPPRESSION, qui n'a jamais été ouverte sur aucune de ces tables. Un
--     enlèvement s'annule (`cancel_partner_offtake`, qui remet le stock), il ne
--     s'efface pas.

-- ---------------------------------------------------------------------------
-- Enlèvements partenaires
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_offtakes_insert" ON public.partner_offtakes;
DROP POLICY IF EXISTS "partner_offtakes_update" ON public.partner_offtakes;
DROP POLICY IF EXISTS "partner_offtake_items_insert" ON public.partner_offtake_items;
DROP POLICY IF EXISTS "partner_offtake_payments_insert" ON public.partner_offtake_payments;

-- ---------------------------------------------------------------------------
-- Expéditions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "shipments_insert" ON public.shipments;
DROP POLICY IF EXISTS "shipments_update" ON public.shipments;
DROP POLICY IF EXISTS "shipment_reimbursements_insert" ON public.shipment_reimbursements;

COMMENT ON TABLE public.partner_offtakes IS
  'Bons d''enlèvement partenaires. ÉCRITURE RÉSERVÉE AUX RPC SECURITY DEFINER '
  '(create_partner_offtake / add_partner_offtake_payment / cancel_partner_offtake) : '
  'aucune policy INSERT/UPDATE/DELETE, pour que les totaux ne puissent pas diverger '
  'des lignes ni une créance s''effacer sans règlement.';

COMMENT ON TABLE public.shipments IS
  'Expéditions et frais de transport avancés. ÉCRITURE RÉSERVÉE AUX RPC SECURITY '
  'DEFINER (create_shipment / add_shipment_reimbursement / set_shipment_status) : '
  'aucune policy INSERT/UPDATE/DELETE, pour que des frais ne puissent pas être '
  'déclarés remboursés sans versement en face.';
