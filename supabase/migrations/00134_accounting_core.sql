-- ============================================================================
-- Module COMPTABILITÉ — SYSCOHADA révisé, Système Normal (partie double).
-- Socle C1 : plan comptable, journaux, exercices, écritures équilibrées + saisie.
-- 100 % additif. RLS par entreprise (comme le reste du schéma).
-- ============================================================================

-- ---------- Exercices comptables (fiscal years) ----------
CREATE TABLE IF NOT EXISTS public.accounting_fiscal_years (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                       -- ex. « 2026 »
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_fiscal_year_code ON public.accounting_fiscal_years(company_id, code);
CREATE INDEX IF NOT EXISTS idx_acc_fiscal_year_company ON public.accounting_fiscal_years(company_id);

-- ---------- Journaux ----------
CREATE TABLE IF NOT EXISTS public.accounting_journals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                       -- VT, AC, CA, BQ, OD, PAIE
  label TEXT NOT NULL,
  -- Nature du journal (ventes / achats / trésorerie / opérations diverses / paie).
  kind TEXT NOT NULL DEFAULT 'od' CHECK (kind IN ('sales', 'purchases', 'cash', 'bank', 'od', 'payroll')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_journal_code ON public.accounting_journals(company_id, code);
CREATE INDEX IF NOT EXISTS idx_acc_journal_company ON public.accounting_journals(company_id);

-- ---------- Plan comptable ----------
CREATE TABLE IF NOT EXISTS public.accounting_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                       -- ex. « 411 », « 4431 »
  label TEXT NOT NULL,
  account_class SMALLINT NOT NULL CHECK (account_class BETWEEN 1 AND 9),
  parent_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_account_code ON public.accounting_accounts(company_id, code);
CREATE INDEX IF NOT EXISTS idx_acc_account_company ON public.accounting_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_acc_account_class ON public.accounting_accounts(company_id, account_class);

-- ---------- Paramètres comptables (comptes par défaut, TVA) ----------
CREATE TABLE IF NOT EXISTS public.accounting_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  vat_enabled BOOLEAN NOT NULL DEFAULT false,
  vat_rate NUMERIC(6, 3) NOT NULL DEFAULT 18.0,
  -- Codes de comptes par défaut pour l'auto-génération (C3). Résolus vers un id au moment du passage d'écriture.
  account_client TEXT NOT NULL DEFAULT '411',
  account_supplier TEXT NOT NULL DEFAULT '401',
  account_sales TEXT NOT NULL DEFAULT '701',
  account_purchases TEXT NOT NULL DEFAULT '601',
  account_vat_collected TEXT NOT NULL DEFAULT '4431',
  account_vat_deductible TEXT NOT NULL DEFAULT '4452',
  account_cash TEXT NOT NULL DEFAULT '571',
  account_bank TEXT NOT NULL DEFAULT '521',
  account_mobile_money TEXT NOT NULL DEFAULT '551',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Écritures (en-tête) ----------
CREATE TABLE IF NOT EXISTS public.accounting_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year_id UUID REFERENCES public.accounting_fiscal_years(id) ON DELETE SET NULL,
  journal_id UUID NOT NULL REFERENCES public.accounting_journals(id) ON DELETE RESTRICT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,                           -- n° de pièce
  label TEXT NOT NULL,                      -- libellé de l'écriture
  -- Origine : saisie manuelle ou générée depuis un module (vente/achat/dépense/paie).
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'sale', 'purchase', 'expense', 'payslip')),
  source_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acc_entry_company_date ON public.accounting_entries(company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_acc_entry_journal ON public.accounting_entries(journal_id);
CREATE INDEX IF NOT EXISTS idx_acc_entry_fy ON public.accounting_entries(fiscal_year_id);
-- Idempotence de l'auto-génération : une seule écriture par document source.
CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_entry_source
  ON public.accounting_entries(company_id, source_type, source_id)
  WHERE source_type <> 'manual' AND source_id IS NOT NULL;

-- ---------- Lignes d'écriture ----------
CREATE TABLE IF NOT EXISTS public.accounting_entry_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES public.accounting_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  label TEXT,
  debit NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Une ligne est soit au débit soit au crédit, jamais les deux ni aucune.
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX IF NOT EXISTS idx_acc_line_entry ON public.accounting_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_acc_line_account ON public.accounting_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_acc_line_company ON public.accounting_entry_lines(company_id);

-- ---------- updated_at auto (trigger générique du schéma initial) ----------
DROP TRIGGER IF EXISTS set_updated_at ON public.accounting_fiscal_years;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounting_fiscal_years
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.accounting_journals;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounting_journals
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.accounting_accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounting_accounts
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.accounting_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounting_settings
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.accounting_entries;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounting_entries
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ---------- Contrôle d'équilibre (partie double) : ΣDébit = ΣCrédit, ≥ 2 lignes ----------
-- Contrainte différée : vérifiée au COMMIT (après insertion de toutes les lignes).
CREATE OR REPLACE FUNCTION public.accounting_check_entry_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry UUID := COALESCE(NEW.entry_id, OLD.entry_id);
  v_debit NUMERIC(18, 2);
  v_credit NUMERIC(18, 2);
  v_count INTEGER;
BEGIN
  -- L'en-tête a-t-il été supprimé (cascade) ? Alors rien à vérifier.
  IF NOT EXISTS (SELECT 1 FROM public.accounting_entries WHERE id = v_entry) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
    INTO v_debit, v_credit, v_count
    FROM public.accounting_entry_lines
    WHERE entry_id = v_entry;

  -- Écriture en cours de suppression (plus aucune ligne) : on laisse passer.
  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'Écriture comptable %: au moins deux lignes sont requises (partie double).', v_entry;
  END IF;

  IF round(v_debit, 2) <> round(v_credit, 2) THEN
    RAISE EXCEPTION 'Écriture comptable % non équilibrée : débit=% ≠ crédit=%.', v_entry, v_debit, v_credit;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS accounting_entry_balance_check ON public.accounting_entry_lines;
CREATE CONSTRAINT TRIGGER accounting_entry_balance_check
  AFTER INSERT OR UPDATE OR DELETE ON public.accounting_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE PROCEDURE public.accounting_check_entry_balance();

-- ============================================================================
-- RLS : périmètre par entreprise. L'app + les RPC gèrent view/manage.
-- ============================================================================
ALTER TABLE public.accounting_fiscal_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acc_fiscal_years_all" ON public.accounting_fiscal_years FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
) WITH CHECK (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "acc_journals_all" ON public.accounting_journals FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
) WITH CHECK (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "acc_accounts_all" ON public.accounting_accounts FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
) WITH CHECK (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "acc_settings_all" ON public.accounting_settings FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
) WITH CHECK (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "acc_entries_all" ON public.accounting_entries FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
) WITH CHECK (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);
CREATE POLICY "acc_entry_lines_all" ON public.accounting_entry_lines FOR ALL USING (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
) WITH CHECK (
  is_super_admin() OR company_id IN (SELECT * FROM current_user_company_ids())
);

-- ============================================================================
-- Seed : plan comptable SYSCOHADA (noyau), journaux, exercice courant, paramètres.
-- SECURITY DEFINER : contourne la RLS pour amorcer une entreprise en une passe.
-- Idempotent (ON CONFLICT DO NOTHING).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.seed_accounting_defaults(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  -- Journaux
  INSERT INTO public.accounting_journals (company_id, code, label, kind, position)
  SELECT p_company_id, j.code, j.label, j.kind, j.position
  FROM (VALUES
    ('VT', 'Journal des ventes', 'sales', 1),
    ('AC', 'Journal des achats', 'purchases', 2),
    ('CA', 'Journal de caisse', 'cash', 3),
    ('BQ', 'Journal de banque', 'bank', 4),
    ('OD', 'Opérations diverses', 'od', 5),
    ('PAIE', 'Journal de paie', 'payroll', 6)
  ) AS j(code, label, kind, position)
  ON CONFLICT (company_id, code) DO NOTHING;

  -- Plan comptable (noyau SYSCOHADA révisé)
  INSERT INTO public.accounting_accounts (company_id, code, label, account_class)
  SELECT p_company_id, a.code, a.label, left(a.code, 1)::smallint
  FROM (VALUES
    -- Classe 1 — Ressources durables
    ('101', 'Capital'),
    ('104', 'Primes liées au capital social'),
    ('106', 'Réserves'),
    ('110', 'Report à nouveau créditeur'),
    ('119', 'Report à nouveau débiteur'),
    ('120', 'Résultat net : bénéfice'),
    ('129', 'Résultat net : perte'),
    ('131', 'Subventions d''équipement'),
    ('162', 'Emprunts et dettes auprès des établissements de crédit'),
    ('165', 'Dépôts et cautionnements reçus'),
    -- Classe 2 — Actif immobilisé
    ('211', 'Frais de développement'),
    ('213', 'Logiciels et sites internet'),
    ('215', 'Fonds commercial'),
    ('221', 'Terrains'),
    ('231', 'Bâtiments'),
    ('241', 'Matériel et outillage'),
    ('244', 'Matériel et mobilier de bureau'),
    ('245', 'Matériel de transport'),
    ('275', 'Dépôts et cautionnements versés'),
    ('281', 'Amortissements des immobilisations incorporelles'),
    ('284', 'Amortissements du matériel'),
    -- Classe 3 — Stocks
    ('311', 'Marchandises'),
    ('321', 'Matières premières'),
    ('331', 'Matières et fournitures consommables'),
    ('351', 'Produits finis'),
    -- Classe 4 — Tiers
    ('401', 'Fournisseurs'),
    ('408', 'Fournisseurs, factures non parvenues'),
    ('409', 'Fournisseurs débiteurs (avances et acomptes versés)'),
    ('411', 'Clients'),
    ('416', 'Clients douteux ou litigieux'),
    ('419', 'Clients créditeurs (avances et acomptes reçus)'),
    ('421', 'Personnel, avances et acomptes'),
    ('422', 'Personnel, rémunérations dues'),
    ('427', 'Personnel, oppositions'),
    ('431', 'Sécurité sociale (CNSS)'),
    ('447', 'État, impôts retenus à la source (IUTS)'),
    ('4431', 'État, TVA facturée sur ventes'),
    ('4441', 'État, TVA due'),
    ('4449', 'État, crédit de TVA à reporter'),
    ('4452', 'État, TVA récupérable sur achats'),
    ('4453', 'État, TVA récupérable sur immobilisations'),
    ('471', 'Comptes d''attente'),
    -- Classe 5 — Trésorerie
    ('521', 'Banques locales'),
    ('531', 'Chèques postaux'),
    ('551', 'Instruments de monnaie électronique (mobile money)'),
    ('571', 'Caisse'),
    ('585', 'Virements de fonds'),
    -- Classe 6 — Charges
    ('601', 'Achats de marchandises'),
    ('6031', 'Variation des stocks de marchandises'),
    ('602', 'Achats de matières premières et fournitures liées'),
    ('604', 'Achats stockés de matières et fournitures consommables'),
    ('605', 'Autres achats (eau, électricité, carburant)'),
    ('608', 'Achats d''emballages'),
    ('611', 'Transports sur achats'),
    ('612', 'Transports sur ventes'),
    ('616', 'Transport du personnel'),
    ('622', 'Locations et charges locatives'),
    ('624', 'Entretien, réparations et maintenance'),
    ('625', 'Primes d''assurance'),
    ('627', 'Publicité, relations publiques'),
    ('628', 'Frais de télécommunications'),
    ('631', 'Frais bancaires'),
    ('632', 'Rémunérations d''intermédiaires et de conseils'),
    ('633', 'Frais de formation du personnel'),
    ('641', 'Impôts et taxes directs'),
    ('646', 'Droits d''enregistrement'),
    ('651', 'Pertes sur créances clients'),
    ('661', 'Rémunérations directes versées au personnel'),
    ('663', 'Indemnités et avantages divers'),
    ('664', 'Charges sociales (part patronale)'),
    ('668', 'Autres charges sociales'),
    ('671', 'Intérêts des emprunts'),
    ('681', 'Dotations aux amortissements d''exploitation'),
    -- Classe 7 — Produits
    ('701', 'Ventes de marchandises'),
    ('702', 'Ventes de produits finis'),
    ('706', 'Services vendus'),
    ('707', 'Produits accessoires'),
    ('711', 'Subventions d''exploitation'),
    ('758', 'Produits divers'),
    ('771', 'Intérêts de prêts et produits assimilés'),
    ('781', 'Reprises d''amortissements d''exploitation'),
    -- Classe 8 — Autres charges et produits (HAO)
    ('812', 'Valeurs comptables des cessions d''immobilisations'),
    ('822', 'Produits des cessions d''immobilisations'),
    ('848', 'Autres charges HAO'),
    ('858', 'Autres produits HAO'),
    ('88', 'Subventions d''équilibre')
  ) AS a(code, label)
  ON CONFLICT (company_id, code) DO NOTHING;

  -- Paramètres par défaut
  INSERT INTO public.accounting_settings (company_id)
  VALUES (p_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  -- Exercice courant (année civile)
  INSERT INTO public.accounting_fiscal_years (company_id, code, start_date, end_date, status)
  VALUES (
    p_company_id,
    v_year::text,
    make_date(v_year, 1, 1),
    make_date(v_year, 12, 31),
    'open'
  )
  ON CONFLICT (company_id, code) DO NOTHING;
END;
$$;

-- Amorce automatiquement le plan comptable quand le super admin active le module.
CREATE OR REPLACE FUNCTION public.accounting_seed_on_enable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.accounting_module_enabled = true
     AND COALESCE(OLD.accounting_module_enabled, false) = false THEN
    PERFORM public.seed_accounting_defaults(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounting_seed_on_enable_trigger ON public.companies;
CREATE TRIGGER accounting_seed_on_enable_trigger
  AFTER UPDATE OF accounting_module_enabled ON public.companies
  FOR EACH ROW EXECUTE PROCEDURE public.accounting_seed_on_enable();

-- Rattrapage : amorce les entreprises déjà activées (au cas où).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.companies WHERE accounting_module_enabled = true LOOP
    PERFORM public.seed_accounting_defaults(r.id);
  END LOOP;
END;
$$;

-- ============================================================================
-- RPC : passage d'une écriture manuelle équilibrée (chemin d'écriture applicatif).
-- p_lines = jsonb [{ "account_id": uuid, "label": text, "debit": num, "credit": num }, ...]
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accounting_post_entry(
  p_company_id UUID,
  p_journal_id UUID,
  p_entry_date DATE,
  p_label TEXT,
  p_reference TEXT,
  p_lines JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry_id UUID;
  v_fy_id UUID;
  v_debit NUMERIC(18, 2) := 0;
  v_credit NUMERIC(18, 2) := 0;
  v_line JSONB;
  v_pos INTEGER := 0;
  v_d NUMERIC(18, 2);
  v_c NUMERIC(18, 2);
BEGIN
  IF NOT (is_super_admin() OR p_company_id IN (SELECT * FROM current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé à cette entreprise.';
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'Une écriture requiert au moins deux lignes (partie double).';
  END IF;

  -- Somme de contrôle
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_d := COALESCE((v_line->>'debit')::numeric, 0);
    v_c := COALESCE((v_line->>'credit')::numeric, 0);
    v_debit := v_debit + v_d;
    v_credit := v_credit + v_c;
  END LOOP;

  IF round(v_debit, 2) <> round(v_credit, 2) THEN
    RAISE EXCEPTION 'Écriture non équilibrée : total débit % ≠ total crédit %.', v_debit, v_credit;
  END IF;
  IF round(v_debit, 2) = 0 THEN
    RAISE EXCEPTION 'Écriture vide (montants nuls).';
  END IF;

  -- Exercice couvrant la date (facultatif)
  SELECT id INTO v_fy_id
  FROM public.accounting_fiscal_years
  WHERE company_id = p_company_id
    AND p_entry_date BETWEEN start_date AND end_date
  ORDER BY start_date DESC
  LIMIT 1;

  INSERT INTO public.accounting_entries
    (company_id, fiscal_year_id, journal_id, entry_date, reference, label, source_type, created_by)
  VALUES
    (p_company_id, v_fy_id, p_journal_id, COALESCE(p_entry_date, CURRENT_DATE),
     NULLIF(btrim(COALESCE(p_reference, '')), ''), p_label, 'manual', auth.uid())
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_d := COALESCE((v_line->>'debit')::numeric, 0);
    v_c := COALESCE((v_line->>'credit')::numeric, 0);
    IF (v_d > 0 AND v_c > 0) OR (v_d = 0 AND v_c = 0) THEN
      RAISE EXCEPTION 'Chaque ligne doit être soit au débit soit au crédit (montant non nul).';
    END IF;
    v_pos := v_pos + 1;
    INSERT INTO public.accounting_entry_lines
      (company_id, entry_id, account_id, label, debit, credit, position)
    VALUES
      (p_company_id, v_entry_id, (v_line->>'account_id')::uuid,
       NULLIF(btrim(COALESCE(v_line->>'label', '')), ''), v_d, v_c, v_pos);
  END LOOP;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accounting_post_entry(UUID, UUID, DATE, TEXT, TEXT, JSONB) TO authenticated;
