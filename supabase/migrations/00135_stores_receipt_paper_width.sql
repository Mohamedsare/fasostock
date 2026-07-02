-- Format du ticket thermique (reçu) par boutique : 58 mm ou 80 mm.
-- Choisi depuis la page Boutiques (dialogue « Caisse rapide ») et pris en compte
-- par le POS Caisse rapide de cette boutique. NULL => valeur par défaut applicative (80 mm).

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS receipt_paper_width_mm smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_receipt_paper_width_mm_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_receipt_paper_width_mm_check
      CHECK (receipt_paper_width_mm IS NULL OR receipt_paper_width_mm IN (58, 80));
  END IF;
END $$;

COMMENT ON COLUMN public.stores.receipt_paper_width_mm IS
  'Largeur du ticket thermique (mm) pour le POS de cette boutique : 58 ou 80. NULL = 80 par défaut.';
