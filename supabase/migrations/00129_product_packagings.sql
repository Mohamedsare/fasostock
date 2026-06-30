-- Conditionnements multiples par produit (pièce / paquet / carton …).
-- Objectif : à la caisse rapide, scanner le code-barres d'un paquet ou d'un
-- carton ajoute automatiquement le bon NOMBRE DE PIÈCES au panier, au prix du
-- conditionnement. Le stock reste géré en UNITÉ DE BASE (la pièce) : aucune
-- conversion manuelle. Le code-barres « pièce » reste la colonne products.barcode.
--
-- 100 % additif : nouvelle table, aucune table existante modifiée.

CREATE TABLE IF NOT EXISTS public.product_packagings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Libellé du conditionnement (ex. « Paquet », « Carton »).
  label TEXT NOT NULL,
  -- Code-barres propre au conditionnement (GTIN du paquet/carton). NULL possible.
  barcode TEXT,
  -- Nombre d'unités de base (pièces) contenues. ≥ 1 (1 = équivaut à la pièce).
  factor INTEGER NOT NULL DEFAULT 1 CHECK (factor >= 1),
  -- Prix de vente du conditionnement (FCFA). NULL = factor × prix unitaire pièce.
  price NUMERIC CHECK (price IS NULL OR price >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_packagings_company ON public.product_packagings(company_id);
CREATE INDEX IF NOT EXISTS idx_product_packagings_product ON public.product_packagings(product_id);
-- Unicité du code-barres de conditionnement au sein d'une entreprise (scan fiable).
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_packagings_company_barcode
  ON public.product_packagings(company_id, barcode)
  WHERE barcode IS NOT NULL AND length(btrim(barcode)) > 0;

COMMENT ON TABLE public.product_packagings IS 'Conditionnements (paquet/carton) d''un produit : code-barres + nb de pièces + prix. Le stock reste en pièces.';
COMMENT ON COLUMN public.product_packagings.factor IS 'Nombre d''unités de base (pièces) contenues dans le conditionnement.';
COMMENT ON COLUMN public.product_packagings.price IS 'Prix de vente du conditionnement ; NULL = factor × prix unitaire pièce.';

-- updated_at auto (réutilise le trigger générique du schéma initial).
DROP TRIGGER IF EXISTS set_updated_at ON public.product_packagings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_packagings
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ===== RLS : même périmètre que public.products (par entreprise) =====
ALTER TABLE public.product_packagings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_packagings_all" ON public.product_packagings FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
) WITH CHECK (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
