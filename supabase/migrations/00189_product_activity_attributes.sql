-- Champs produit propres au métier — stockage générique (JSONB).
--
-- Contexte : la pharmacie a ses colonnes dédiées (00115 : dci, dosage_form…).
-- Reproduire ce schéma pour chaque nouveau métier (boulangerie, tissus, garage,
-- station-service, hôtel…) ajouterait des dizaines de colonnes quasi toujours
-- NULL. On stocke donc les champs des AUTRES métiers dans un seul JSONB.
--
-- 100 % additif :
--   * les colonnes pharmacie existantes ne bougent pas (aucune migration de données) ;
--   * `{}` par défaut → tous les produits existants restent valides ;
--   * un métier sans champs spécifiques n'écrit jamais dans cette colonne.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS activity_attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.products.activity_attributes IS
  'Champs produit spécifiques au métier (business_type_slug), hors pharmacie qui a ses '
  'colonnes dédiées. Clés définies côté app dans lib/features/activity/activity-config.ts. '
  'Valeurs : texte, nombre en texte ou booléen. {} = aucun champ métier saisi.';

-- Recherche/filtre éventuel par attribut (ex. tissus : matière = wax).
CREATE INDEX IF NOT EXISTS idx_products_activity_attributes
  ON public.products USING GIN (activity_attributes);
