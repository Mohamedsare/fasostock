-- Prix / quantité seuil pour vente au détail vs gros (caisse : PU = gros si qté >= seuil).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(18,4) NOT NULL DEFAULT 0
    CHECK (wholesale_price >= 0),
  ADD COLUMN IF NOT EXISTS wholesale_qty INTEGER NOT NULL DEFAULT 0
    CHECK (wholesale_qty >= 0);

COMMENT ON COLUMN public.products.wholesale_price IS 'Prix unitaire gros (FCFA). Utilisé en caisse si quantité ligne >= wholesale_qty (> 0).';
COMMENT ON COLUMN public.products.wholesale_qty IS 'Seuil : si quantité dans le panier >= ce nombre (et > 0), appliquer wholesale_price. 0 = pas de palier gros.';
