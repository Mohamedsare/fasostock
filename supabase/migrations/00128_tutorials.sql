-- Tutoriels vidéo (YouTube) par module, gérés par le super-admin, visibles par
-- tous les utilisateurs dans la page Aide. 100 % additif.

CREATE TABLE IF NOT EXISTS public.tutorials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Clé de module applicatif (products, barcodes, sales, invoice_a4, stock,
  -- expiry, expenses, warehouse, customers, credit, reports, employees,
  -- printers, settings, ai, transfers).
  module_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  youtube_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutorials_module ON public.tutorials(module_key, sort_order);

COMMENT ON TABLE public.tutorials IS 'Tutoriels vidéo YouTube par module (gérés par le super-admin, lus par tous).';

DROP TRIGGER IF EXISTS set_updated_at ON public.tutorials;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tutorials
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.tutorials ENABLE ROW LEVEL SECURITY;

-- Lecture : tout utilisateur authentifié voit les tutos actifs ; le super-admin voit tout.
CREATE POLICY "tutorials_select" ON public.tutorials FOR SELECT TO authenticated USING (
  is_active = true OR is_super_admin()
);

-- Écriture (création / modification / suppression) : super-admin uniquement.
CREATE POLICY "tutorials_insert" ON public.tutorials FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY "tutorials_update" ON public.tutorials FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "tutorials_delete" ON public.tutorials FOR DELETE TO authenticated USING (is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutorials TO authenticated;
