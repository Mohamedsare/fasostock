-- Option par boutique : activer la remise en caisse (POS). Par défaut désactivé.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pos_discount_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.pos_discount_enabled IS 'When true, the POS cart shows a discount (remise) field for this store.';
