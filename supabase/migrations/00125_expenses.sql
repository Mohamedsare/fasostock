-- Gestion des dépenses (charges) : argent qui sort SANS entrée de stock.
-- Distinct des achats (qui réapprovisionnent le stock). 100 % additif : nouvelle
-- table dédiée, aucune table existante modifiée.

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Boutique de rattachement (NULL = charge globale entreprise).
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  -- Clé de catégorie applicative (loyer, salaires, transport…). Texte libre côté DB.
  category TEXT NOT NULL DEFAULT 'autre',
  -- Intitulé court de la dépense (ex. « Loyer juin », « Carburant moto »).
  label TEXT,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  -- Mode de règlement (cash, mobile_money, card, bank, credit).
  payment_method TEXT NOT NULL DEFAULT 'cash',
  -- Bénéficiaire / fournisseur de la charge.
  payee TEXT,
  reference TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company_date
  ON public.expenses(company_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_company_category
  ON public.expenses(company_id, category);

COMMENT ON TABLE public.expenses IS 'Dépenses / charges (sorties d''argent sans entrée de stock). Distinct de purchases.';
COMMENT ON COLUMN public.expenses.category IS 'Clé de catégorie applicative (loyer, salaires, transport, etc.).';
COMMENT ON COLUMN public.expenses.store_id IS 'Boutique de rattachement (NULL = charge globale entreprise).';

-- updated_at auto (trigger générique du schéma initial).
DROP TRIGGER IF EXISTS set_updated_at ON public.expenses;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ===== RLS : périmètre par entreprise (comme product_batches). L'app gère view/manage. =====
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_all" ON public.expenses FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
) WITH CHECK (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- ===== Permissions : owner par défaut ; accordables aux autres via la gestion des droits. =====
INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'expenses.view'),
  (uuid_generate_v4(), 'expenses.manage')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key IN ('expenses.view', 'expenses.manage')
ON CONFLICT DO NOTHING;
