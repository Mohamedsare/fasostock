-- FasoStock — Les index qui rendent la pagination tenable dans trois ans.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUI A CHANGÉ CÔTÉ APPLICATION
-- ═════════════════════════════════════════════════════════════════════════════
-- `/enlevements` et `/expeditions` chargeaient l'historique d'un seul bloc, borné par
-- un `.limit()` fixe (60 et 80). Deux défauts, et le second est le grave :
--
--   • le volume : un grossiste qui expédie dix colis par jour envoie 3 650 lignes par
--     an à un téléphone pour en afficher vingt ;
--   • le PLAFOND SILENCIEUX : passé la 80ᵉ expédition, les plus anciennes cessaient
--     simplement d'exister à l'écran. Pas de message, pas de « page suivante ». Sur un
--     suivi de frais avancés, un colis devenu invisible est de l'argent qu'on ne
--     réclamera jamais.
--
-- Les deux écrans paginent désormais côté serveur, vingt lignes à la fois, avec le
-- tri `(created_at DESC, id DESC)`.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POURQUOI LES INDEX EXISTANTS NE SUFFISENT PAS
-- ═════════════════════════════════════════════════════════════════════════════
-- 00211 et 00213 ont posé `(company_id, store_id, created_at DESC)`. Cet index sert
-- parfaitement la vue d'UNE boutique. Il ne sert PAS la vue « toutes boutiques », qui
-- est le cas du propriétaire — donc de celui qui consulte le plus : `store_id` étant la
-- deuxième colonne, PostgreSQL ne peut pas s'en servir pour ordonner par `created_at`
-- à travers plusieurs boutiques. Il lit toutes les lignes de l'entreprise et les trie.
--
-- Invisible sur cent lignes. À dix mille, chaque changement de page relit et retrie
-- l'historique complet — et la page 40 coûte autant que la page 1.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POURQUOI `id DESC` DANS L'INDEX
-- ═════════════════════════════════════════════════════════════════════════════
-- Le tri de l'application porte sur `(created_at DESC, id DESC)`, et non sur la seule
-- date. La raison est fonctionnelle : plusieurs colis partent dans la même minute pour
-- le même car, plusieurs bons se soldent d'affilée pour la même tournée de partenaires.
-- Sur `created_at` seul, l'ordre relatif de ces lignes est INDÉTERMINÉ d'une requête à
-- l'autre — une ligne peut alors apparaître sur deux pages pendant qu'une autre
-- n'apparaît sur aucune. C'est le mode de défaillance classique de la pagination par
-- décalage, et il fait disparaître des créances.
--
-- L'index doit donc porter la même paire, sans quoi le départage se paierait par un
-- tri à chaque page.
--
-- Aucune donnée n'est modifiée ici : uniquement des index. `IF NOT EXISTS` partout,
-- la migration se rejoue sans effet.

-- ─────────────────────────────────────────────────────────────────────────────
-- Vue « toutes boutiques » — celle du propriétaire
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_partner_offtakes_company_page
  ON public.partner_offtakes (company_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_shipments_company_page
  ON public.shipments (company_id, created_at DESC, id DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Vue d'une boutique — celle du vendeur
-- ─────────────────────────────────────────────────────────────────────────────
-- Les index `(company_id, store_id, created_at DESC)` de 00211 / 00213 restent en
-- place : ils servent encore les lectures qui ne trient pas sur `id`. On ajoute ici la
-- variante qui couvre le tri complet de la pagination.
CREATE INDEX IF NOT EXISTS idx_partner_offtakes_store_page
  ON public.partner_offtakes (company_id, store_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_shipments_store_page
  ON public.shipments (company_id, store_id, created_at DESC, id DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Les lignes filles, lues par lots d'identifiants
-- ─────────────────────────────────────────────────────────────────────────────
-- Chaque page d'historique récupère ensuite les articles de ses vingt bons, et les
-- relances de ses vingt colis, en une requête groupée (`fetchByChunks` → `IN (...)`).
-- Sans index sur la clé étrangère, ce groupage devient un parcours complet de la table
-- fille à chaque page.
CREATE INDEX IF NOT EXISTS idx_partner_offtake_items_offtake
  ON public.partner_offtake_items (offtake_id);

CREATE INDEX IF NOT EXISTS idx_shipment_reminders_shipment
  ON public.shipment_reminders (shipment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shipment_reimbursements_shipment
  ON public.shipment_reimbursements (shipment_id, created_at DESC);

COMMENT ON INDEX public.idx_partner_offtakes_company_page IS
  'Pagination de /enlevements en vue « toutes boutiques » : couvre le tri '
  '(created_at DESC, id DESC) sans passe de tri.';
COMMENT ON INDEX public.idx_shipments_company_page IS
  'Pagination de /expeditions en vue « toutes boutiques » : couvre le tri '
  '(created_at DESC, id DESC) sans passe de tri.';
