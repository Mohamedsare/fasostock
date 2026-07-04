-- ============================================================================
-- Module R. HUMAINE + PAIE (Burkina Faso). Employés, contrats, congés, paie.
-- Barème IUTS + taux CNSS DATA-DRIVEN (éditables) — défauts à faire valider par
-- un comptable. RLS par entreprise. N'agit que si companies.hr_module_enabled.
-- ============================================================================

-- ---------- Employés ----------
CREATE TABLE IF NOT EXISTS public.hr_employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  matricule TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('M', 'F') OR gender IS NULL),
  birth_date DATE,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  job_title TEXT,
  category TEXT,                              -- catégorie/échelon (convention collective)
  contract_type TEXT NOT NULL DEFAULT 'cdi'
    CHECK (contract_type IN ('cdi', 'cdd', 'stage', 'interim')),
  base_salary NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
  cnss_number TEXT,
  marital_status TEXT,
  dependents INTEGER NOT NULL DEFAULT 0 CHECK (dependents >= 0),  -- charges de famille (IUTS)
  phone TEXT,
  email TEXT,
  address TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  bank_account TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_employees_company ON public.hr_employees(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_employee_matricule
  ON public.hr_employees(company_id, matricule)
  WHERE matricule IS NOT NULL AND length(btrim(matricule)) > 0;

-- ---------- Contrats ----------
CREATE TABLE IF NOT EXISTS public.hr_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  contract_type TEXT NOT NULL DEFAULT 'cdi',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  base_salary NUMERIC(18, 2) NOT NULL DEFAULT 0,
  job_title TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'suspended')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_contracts_company ON public.hr_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_contracts_employee ON public.hr_contracts(employee_id);

-- ---------- Congés & absences ----------
CREATE TABLE IF NOT EXISTS public.hr_leaves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL DEFAULT 'paid'
    CHECK (leave_type IN ('paid', 'sick', 'maternity', 'unpaid', 'other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(6, 1) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_company ON public.hr_leaves(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_employee ON public.hr_leaves(employee_id);

-- ---------- Paramètres de paie (taux CNSS + options) ----------
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  cnss_employee_rate NUMERIC(6, 3) NOT NULL DEFAULT 5.5,   -- part salariale (%)
  cnss_employer_rate NUMERIC(6, 3) NOT NULL DEFAULT 16.0,  -- part patronale agrégée (%)
  cnss_ceiling NUMERIC(18, 2) NOT NULL DEFAULT 600000,     -- plafond mensuel cotisable
  -- Réduction d'IUTS par charge de famille (% du montant d'impôt), plafonnée par charge_reduction_max.
  iuts_charge_reduction_rate NUMERIC(6, 3) NOT NULL DEFAULT 0,
  iuts_charge_reduction_max INTEGER NOT NULL DEFAULT 0,
  -- Part non imposable de l'indemnité de transport (au-delà : imposable).
  transport_nontaxable_cap NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Barème IUTS (tranches, éditable) ----------
CREATE TABLE IF NOT EXISTS public.payroll_iuts_brackets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lower_bound NUMERIC(18, 2) NOT NULL DEFAULT 0,
  upper_bound NUMERIC(18, 2),                 -- NULL = tranche supérieure ouverte
  rate NUMERIC(6, 3) NOT NULL DEFAULT 0,      -- taux (%)
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iuts_brackets_company ON public.payroll_iuts_brackets(company_id, position);

-- ---------- Bulletins de paie ----------
CREATE TABLE IF NOT EXISTS public.hr_payslips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  base_salary NUMERIC(18, 2) NOT NULL DEFAULT 0,
  gross NUMERIC(18, 2) NOT NULL DEFAULT 0,
  taxable_base NUMERIC(18, 2) NOT NULL DEFAULT 0,
  cnss_employee NUMERIC(18, 2) NOT NULL DEFAULT 0,
  cnss_employer NUMERIC(18, 2) NOT NULL DEFAULT 0,
  iuts NUMERIC(18, 2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'paid')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS idx_hr_payslips_company_period
  ON public.hr_payslips(company_id, period_year, period_month);

-- ---------- Rubriques de bulletin (primes / retenues) ----------
CREATE TABLE IF NOT EXISTS public.hr_payslip_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payslip_id UUID NOT NULL REFERENCES public.hr_payslips(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('earning', 'deduction')),
  label TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  taxable BOOLEAN NOT NULL DEFAULT true,       -- entre dans la base IUTS
  cnss_base BOOLEAN NOT NULL DEFAULT true,     -- entre dans la base CNSS
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_payslip_lines_payslip ON public.hr_payslip_lines(payslip_id);

-- ---------- updated_at ----------
DROP TRIGGER IF EXISTS set_updated_at ON public.hr_employees;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.hr_employees FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.hr_contracts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.hr_contracts FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.hr_leaves;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.hr_leaves FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.payroll_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payroll_settings FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.hr_payslips;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.hr_payslips FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ---------- RLS par entreprise ----------
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_iuts_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payslip_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hr_employees','hr_contracts','hr_leaves','payroll_settings',
    'payroll_iuts_brackets','hr_payslips','hr_payslip_lines'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())) WITH CHECK (is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids()));',
      t || '_all', t);
  END LOOP;
END;
$$;

-- ============================================================================
-- Seed des paramètres de paie (défauts Burkina — À FAIRE VALIDER). Idempotent.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.seed_payroll_defaults(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payroll_settings (company_id) VALUES (p_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  -- Barème IUTS mensuel par défaut (à vérifier au CGI Burkina en vigueur).
  IF NOT EXISTS (SELECT 1 FROM public.payroll_iuts_brackets WHERE company_id = p_company_id) THEN
    INSERT INTO public.payroll_iuts_brackets (company_id, lower_bound, upper_bound, rate, position)
    VALUES
      (p_company_id, 0,      30000,  0.0,  1),
      (p_company_id, 30000,  50000,  12.1, 2),
      (p_company_id, 50000,  80000,  13.9, 3),
      (p_company_id, 80000,  120000, 15.7, 4),
      (p_company_id, 120000, 170000, 18.4, 5),
      (p_company_id, 170000, 250000, 21.7, 6),
      (p_company_id, 250000, NULL,   25.0, 7);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_seed_on_enable()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.hr_module_enabled = true AND COALESCE(OLD.hr_module_enabled, false) = false THEN
    PERFORM public.seed_payroll_defaults(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hr_seed_on_enable_trigger ON public.companies;
CREATE TRIGGER hr_seed_on_enable_trigger
  AFTER UPDATE OF hr_module_enabled ON public.companies
  FOR EACH ROW EXECUTE PROCEDURE public.hr_seed_on_enable();

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.companies WHERE hr_module_enabled = true LOOP
    PERFORM public.seed_payroll_defaults(r.id);
  END LOOP;
END;
$$;

-- ============================================================================
-- Auto-posting comptable d'un bulletin validé (journal PAIE). Idempotent + sûr.
--   Débit 661 (rémunérations brut) + 664 (charges patronales)
--   Crédit 431 (CNSS salariale + patronale) + 447 (IUTS) + 427 (autres retenues)
--          + 422 (net à payer)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accounting_sync_payslip(p_payslip_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ps RECORD; v_enabled BOOLEAN; v_journal UUID; v_fy UUID; v_entry UUID;
  v_acc UUID; v_pos INT := 0; v_date DATE;
BEGIN
  SELECT * INTO ps FROM public.hr_payslips WHERE id = p_payslip_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.accounting_entries
   WHERE company_id = ps.company_id AND source_type = 'payslip' AND source_id = p_payslip_id;

  SELECT accounting_module_enabled INTO v_enabled FROM public.companies WHERE id = ps.company_id;
  IF NOT COALESCE(v_enabled, false) OR ps.status = 'draft' THEN RETURN; END IF;

  SELECT id INTO v_journal FROM public.accounting_journals WHERE company_id = ps.company_id AND code = 'PAIE';
  IF v_journal IS NULL THEN RETURN; END IF;

  v_date := make_date(ps.period_year, ps.period_month, 1)
            + (interval '1 month' - interval '1 day');  -- dernier jour du mois
  SELECT id INTO v_fy FROM public.accounting_fiscal_years
   WHERE company_id = ps.company_id AND v_date BETWEEN start_date AND end_date
   ORDER BY start_date DESC LIMIT 1;

  INSERT INTO public.accounting_entries
    (company_id, fiscal_year_id, journal_id, entry_date, reference, label, source_type, source_id, created_by)
  VALUES
    (ps.company_id, v_fy, v_journal, v_date,
     to_char(v_date, 'YYYY-MM'),
     'Paie ' || to_char(v_date, 'MM/YYYY'), 'payslip', ps.id, ps.created_by)
  RETURNING id INTO v_entry;

  -- Débit 661 brut
  v_acc := accounting_resolve_account(ps.company_id, '661');
  IF v_acc IS NOT NULL AND ps.gross > 0 THEN
    v_pos := v_pos + 1;
    INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
    VALUES (ps.company_id, v_entry, v_acc, 'Rémunérations brutes', ps.gross, 0, v_pos);
  END IF;
  -- Débit 664 charges patronales
  v_acc := accounting_resolve_account(ps.company_id, '664');
  IF v_acc IS NOT NULL AND ps.cnss_employer > 0 THEN
    v_pos := v_pos + 1;
    INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
    VALUES (ps.company_id, v_entry, v_acc, 'Charges sociales patronales', ps.cnss_employer, 0, v_pos);
  END IF;
  -- Crédit 431 CNSS (salariale + patronale)
  v_acc := accounting_resolve_account(ps.company_id, '431');
  IF v_acc IS NOT NULL AND (ps.cnss_employee + ps.cnss_employer) > 0 THEN
    v_pos := v_pos + 1;
    INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
    VALUES (ps.company_id, v_entry, v_acc, 'CNSS à payer', 0, ps.cnss_employee + ps.cnss_employer, v_pos);
  END IF;
  -- Crédit 447 IUTS
  v_acc := accounting_resolve_account(ps.company_id, '447');
  IF v_acc IS NOT NULL AND ps.iuts > 0 THEN
    v_pos := v_pos + 1;
    INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
    VALUES (ps.company_id, v_entry, v_acc, 'IUTS à reverser', 0, ps.iuts, v_pos);
  END IF;
  -- Crédit 427 autres retenues
  IF ps.other_deductions > 0 THEN
    v_acc := accounting_resolve_account(ps.company_id, '427');
    IF v_acc IS NOT NULL THEN
      v_pos := v_pos + 1;
      INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
      VALUES (ps.company_id, v_entry, v_acc, 'Autres retenues', 0, ps.other_deductions, v_pos);
    END IF;
  END IF;
  -- Crédit 422 net à payer
  v_acc := accounting_resolve_account(ps.company_id, '422');
  IF v_acc IS NOT NULL AND ps.net_pay > 0 THEN
    v_pos := v_pos + 1;
    INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
    VALUES (ps.company_id, v_entry, v_acc, 'Net à payer', 0, ps.net_pay, v_pos);
  END IF;

  PERFORM accounting_finalize_entry(v_entry);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_accounting_payslip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN PERFORM accounting_sync_payslip(COALESCE(NEW.id, OLD.id));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS accounting_payslip_sync ON public.hr_payslips;
CREATE TRIGGER accounting_payslip_sync
  AFTER INSERT OR UPDATE OF status, gross, cnss_employee, cnss_employer, iuts, other_deductions, net_pay
  ON public.hr_payslips
  FOR EACH ROW EXECUTE PROCEDURE public.trg_accounting_payslip();
