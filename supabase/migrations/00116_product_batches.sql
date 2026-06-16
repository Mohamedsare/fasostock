-- Suivi des lots + dates de péremption (pharmacie en priorité, réutilisable).
-- Couche de SUIVI & ALERTES : n'altère pas le moteur de stock existant
-- (le déstockage reste au niveau produit ; FEFO lot-par-lot = chantier séparé).
-- 100 % additif : nouvelle table, aucune table existante modifiée.

CREATE TABLE IF NOT EXISTS public.product_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- store_id optionnel : lot rattaché à une boutique précise ou global (NULL).
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  lot_number TEXT,
  expiry_date DATE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_batches_company ON public.product_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_product ON public.product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON public.product_batches(company_id, expiry_date);

COMMENT ON TABLE public.product_batches IS 'Lots & dates de péremption par produit (suivi + alertes). Déstockage non FEFO pour l''instant.';
COMMENT ON COLUMN public.product_batches.store_id IS 'Boutique de rattachement du lot (NULL = global entreprise).';
COMMENT ON COLUMN public.product_batches.lot_number IS 'Numéro de lot fabricant.';
COMMENT ON COLUMN public.product_batches.expiry_date IS 'Date de péremption (DLU).';

-- updated_at auto (réutilise le trigger générique du schéma initial).
DROP TRIGGER IF EXISTS set_updated_at ON public.product_batches;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_batches
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ===== RLS : même périmètre que public.products (par entreprise) =====
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_batches_all" ON public.product_batches FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
) WITH CHECK (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
