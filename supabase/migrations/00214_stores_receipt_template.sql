-- Mise en forme du ticket thermique par boutique : « classic » (historique) ou « moderne ».
-- Choisie depuis la page Boutiques (dialogue « Caisse rapide — format ticket »), à côté
-- de la largeur 58/80 mm. NULL => valeur par défaut applicative (classic), donc aucune
-- boutique existante ne voit son ticket changer.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS receipt_template text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_receipt_template_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_receipt_template_check
      CHECK (receipt_template IS NULL OR receipt_template IN ('classic', 'moderne'));
  END IF;
END $$;

COMMENT ON COLUMN public.stores.receipt_template IS
  'Mise en forme du ticket thermique de cette boutique : classic ou moderne. NULL = classic.';
