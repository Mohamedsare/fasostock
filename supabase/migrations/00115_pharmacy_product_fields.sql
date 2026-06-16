-- Champs métier additionnels pour les produits (pharmacie / parapharmacie).
-- 100 % additif : colonnes NULLABLES, aucune colonne existante modifiée ni supprimée.
-- Visibles côté app uniquement quand business_type_slug = 'pharmacie'.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dci TEXT,
  ADD COLUMN IF NOT EXISTS dosage_form TEXT,
  ADD COLUMN IF NOT EXISTS therapeutic_class TEXT,
  ADD COLUMN IF NOT EXISTS laboratory TEXT,
  ADD COLUMN IF NOT EXISTS prescription_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storage_conditions TEXT;

COMMENT ON COLUMN public.products.dci IS 'Pharmacie : Dénomination Commune Internationale / molécule (ex. Paracétamol).';
COMMENT ON COLUMN public.products.dosage_form IS 'Pharmacie : forme galénique et dosage (ex. Comprimé 500 mg).';
COMMENT ON COLUMN public.products.therapeutic_class IS 'Pharmacie : classe thérapeutique (ex. Antalgique).';
COMMENT ON COLUMN public.products.laboratory IS 'Pharmacie : laboratoire fabricant / titulaire AMM.';
COMMENT ON COLUMN public.products.prescription_required IS 'Pharmacie : délivrance soumise à ordonnance.';
COMMENT ON COLUMN public.products.storage_conditions IS 'Pharmacie : conditions de conservation (ex. < 25 °C).';
