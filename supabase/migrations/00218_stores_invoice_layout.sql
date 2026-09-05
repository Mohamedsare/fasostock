-- 00218 — Mise en page des documents de vente, décidée par le propriétaire.
--
-- Une seule colonne JSONB par boutique : { "hidden": ["a4.logo", …], "labels": { … } }.
-- NULL (le défaut) = document rendu exactement comme avant cette migration : toutes
-- les boutiques existantes gardent donc leur facture et leur ticket au pixel près,
-- sans aucune reprise de données.

alter table public.stores
  add column if not exists invoice_layout jsonb;

comment on column public.stores.invoice_layout is
  'Éléments masqués et libellés remplacés sur la facture A4 et le ticket thermique. NULL = mise en page d''origine.';
