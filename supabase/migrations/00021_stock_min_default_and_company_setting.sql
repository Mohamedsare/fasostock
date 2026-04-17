-- Seuil d'alerte stock : valeur par défaut 5 pour les nouveaux produits
ALTER TABLE public.products
  ALTER COLUMN stock_min SET DEFAULT 5;

COMMENT ON COLUMN public.products.stock_min IS 'Seuil d''alerte stock (défaut 5). En dessous, le produit est considéré en alerte.';
