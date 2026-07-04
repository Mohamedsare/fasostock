-- ============================================================================
-- Comptabilité C3 — Génération AUTOMATIQUE des écritures depuis les modules
-- (Ventes / Achats / Dépenses). Écritures idempotentes (purge + recréation par
-- document source). Robustesse : le passage comptable ne doit JAMAIS bloquer une
-- vente/achat/dépense → wrappers avec EXCEPTION + vérification d'équilibre interne.
-- N'agit que si companies.accounting_module_enabled = true.
-- ============================================================================

-- Résolution d'un compte par code (dans l'entreprise).
CREATE OR REPLACE FUNCTION public.accounting_resolve_account(p_company UUID, p_code TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.accounting_accounts
  WHERE company_id = p_company AND code = p_code AND is_active
  LIMIT 1;
$$;

-- Code de compte de trésorerie selon le mode de règlement + paramètres entreprise.
CREATE OR REPLACE FUNCTION public.accounting_treasury_code(
  p_cash TEXT, p_bank TEXT, p_mobile TEXT, p_method TEXT
)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_method, 'cash'))
    WHEN 'mobile_money' THEN p_mobile
    WHEN 'card' THEN p_bank
    WHEN 'bank' THEN p_bank
    WHEN 'transfer' THEN p_bank
    ELSE p_cash
  END;
$$;

-- Contrôle d'équilibre interne : supprime l'écriture si non équilibrée / < 2 lignes.
CREATE OR REPLACE FUNCTION public.accounting_finalize_entry(p_entry UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_d NUMERIC(18,4); v_c NUMERIC(18,4); v_n INT;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*)
    INTO v_d, v_c, v_n FROM public.accounting_entry_lines WHERE entry_id = p_entry;
  IF v_n < 2 OR round(v_d,2) <> round(v_c,2) THEN
    DELETE FROM public.accounting_entries WHERE id = p_entry;
  END IF;
END;
$$;

-- ---------------------------------------------------------------- VENTES ----
CREATE OR REPLACE FUNCTION public.accounting_sync_sale(p_sale_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s RECORD; st RECORD; pm RECORD;
  v_enabled BOOLEAN; v_journal UUID; v_fy UUID; v_entry UUID;
  v_net NUMERIC(18,4); v_tax NUMERIC(18,4); v_total NUMERIC(18,4);
  v_paid NUMERIC(18,4); v_unpaid NUMERIC(18,4); v_over NUMERIC(18,4);
  v_acc UUID; v_pos INT := 0;
BEGIN
  SELECT * INTO s FROM public.sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.accounting_entries
   WHERE company_id = s.company_id AND source_type = 'sale' AND source_id = p_sale_id;

  SELECT accounting_module_enabled INTO v_enabled FROM public.companies WHERE id = s.company_id;
  IF NOT COALESCE(v_enabled, false) OR s.status <> 'completed' THEN RETURN; END IF;

  SELECT * INTO st FROM public.accounting_settings WHERE company_id = s.company_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT id INTO v_journal FROM public.accounting_journals WHERE company_id = s.company_id AND code = 'VT';
  IF v_journal IS NULL THEN RETURN; END IF;

  v_net := COALESCE(s.subtotal,0) - COALESCE(s.discount,0);
  v_tax := COALESCE(s.tax,0);
  v_total := v_net + v_tax;
  IF v_total <= 0 THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.sale_payments WHERE sale_id = p_sale_id;
  v_unpaid := GREATEST(v_total - v_paid, 0);
  v_over := GREATEST(v_paid - v_total, 0);

  SELECT id INTO v_fy FROM public.accounting_fiscal_years
   WHERE company_id = s.company_id AND s.created_at::date BETWEEN start_date AND end_date
   ORDER BY start_date DESC LIMIT 1;

  INSERT INTO public.accounting_entries
    (company_id, fiscal_year_id, journal_id, entry_date, reference, label, source_type, source_id, created_by)
  VALUES
    (s.company_id, v_fy, v_journal, s.created_at::date, s.sale_number,
     'Vente ' || s.sale_number, 'sale', s.id, s.created_by)
  RETURNING id INTO v_entry;

  -- Débit trésorerie par mode de règlement
  FOR pm IN
    SELECT method::text AS method, SUM(amount) AS amt
      FROM public.sale_payments WHERE sale_id = p_sale_id GROUP BY method
  LOOP
    v_acc := accounting_resolve_account(
      s.company_id,
      accounting_treasury_code(st.account_cash, st.account_bank, st.account_mobile_money, pm.method));
    IF v_acc IS NOT NULL AND pm.amt > 0 THEN
      v_pos := v_pos + 1;
      INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
      VALUES (s.company_id, v_entry, v_acc, 'Règlement ' || pm.method, pm.amt, 0, v_pos);
    END IF;
  END LOOP;

  -- Débit 411 Clients (part non réglée)
  IF v_unpaid > 0 THEN
    v_acc := accounting_resolve_account(s.company_id, st.account_client);
    IF v_acc IS NOT NULL THEN
      v_pos := v_pos + 1;
      INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
      VALUES (s.company_id, v_entry, v_acc, 'Créance client', v_unpaid, 0, v_pos);
    END IF;
  END IF;

  -- Crédit 701 Ventes (HT)
  v_acc := accounting_resolve_account(s.company_id, st.account_sales);
  IF v_acc IS NOT NULL AND v_net > 0 THEN
    v_pos := v_pos + 1;
    INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
    VALUES (s.company_id, v_entry, v_acc, 'Vente de marchandises', 0, v_net, v_pos);
  END IF;

  -- Crédit 4431 TVA collectée
  IF v_tax > 0 THEN
    v_acc := accounting_resolve_account(s.company_id, st.account_vat_collected);
    IF v_acc IS NOT NULL THEN
      v_pos := v_pos + 1;
      INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
      VALUES (s.company_id, v_entry, v_acc, 'TVA collectée', 0, v_tax, v_pos);
    END IF;
  END IF;

  -- Crédit 419 Clients créditeurs (trop-perçu)
  IF v_over > 0 THEN
    v_acc := accounting_resolve_account(s.company_id, '419');
    IF v_acc IS NOT NULL THEN
      v_pos := v_pos + 1;
      INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
      VALUES (s.company_id, v_entry, v_acc, 'Avance / trop-perçu client', 0, v_over, v_pos);
    END IF;
  END IF;

  PERFORM accounting_finalize_entry(v_entry);
END;
$$;

-- ---------------------------------------------------------------- ACHATS ----
CREATE OR REPLACE FUNCTION public.accounting_sync_purchase(p_purchase_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p RECORD; st RECORD; pm RECORD;
  v_enabled BOOLEAN; v_journal UUID; v_fy UUID; v_entry UUID;
  v_total NUMERIC(18,4); v_paid NUMERIC(18,4); v_unpaid NUMERIC(18,4); v_over NUMERIC(18,4);
  v_acc UUID; v_pos INT := 0;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.accounting_entries
   WHERE company_id = p.company_id AND source_type = 'purchase' AND source_id = p_purchase_id;

  SELECT accounting_module_enabled INTO v_enabled FROM public.companies WHERE id = p.company_id;
  IF NOT COALESCE(v_enabled, false) OR p.status IN ('draft', 'cancelled') THEN RETURN; END IF;

  SELECT * INTO st FROM public.accounting_settings WHERE company_id = p.company_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT id INTO v_journal FROM public.accounting_journals WHERE company_id = p.company_id AND code = 'AC';
  IF v_journal IS NULL THEN RETURN; END IF;

  v_total := COALESCE(p.total, 0);
  IF v_total <= 0 THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.purchase_payments WHERE purchase_id = p_purchase_id;
  v_unpaid := GREATEST(v_total - v_paid, 0);
  v_over := GREATEST(v_paid - v_total, 0);

  SELECT id INTO v_fy FROM public.accounting_fiscal_years
   WHERE company_id = p.company_id AND p.created_at::date BETWEEN start_date AND end_date
   ORDER BY start_date DESC LIMIT 1;

  INSERT INTO public.accounting_entries
    (company_id, fiscal_year_id, journal_id, entry_date, reference, label, source_type, source_id, created_by)
  VALUES
    (p.company_id, v_fy, v_journal, p.created_at::date, p.reference,
     'Achat ' || COALESCE(p.reference, left(p.id::text, 8)), 'purchase', p.id, p.created_by)
  RETURNING id INTO v_entry;

  -- Débit 601 Achats (montant total)
  v_acc := accounting_resolve_account(p.company_id, st.account_purchases);
  IF v_acc IS NOT NULL THEN
    v_pos := v_pos + 1;
    INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
    VALUES (p.company_id, v_entry, v_acc, 'Achat de marchandises', v_total, 0, v_pos);
  END IF;

  -- Crédit trésorerie (part réglée)
  FOR pm IN
    SELECT method::text AS method, SUM(amount) AS amt
      FROM public.purchase_payments WHERE purchase_id = p_purchase_id GROUP BY method
  LOOP
    v_acc := accounting_resolve_account(
      p.company_id,
      accounting_treasury_code(st.account_cash, st.account_bank, st.account_mobile_money, pm.method));
    IF v_acc IS NOT NULL AND pm.amt > 0 THEN
      v_pos := v_pos + 1;
      INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
      VALUES (p.company_id, v_entry, v_acc, 'Règlement fournisseur ' || pm.method, 0, pm.amt, v_pos);
    END IF;
  END LOOP;

  -- Crédit 401 Fournisseurs (part non réglée)
  IF v_unpaid > 0 THEN
    v_acc := accounting_resolve_account(p.company_id, st.account_supplier);
    IF v_acc IS NOT NULL THEN
      v_pos := v_pos + 1;
      INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
      VALUES (p.company_id, v_entry, v_acc, 'Dette fournisseur', 0, v_unpaid, v_pos);
    END IF;
  END IF;

  -- Débit 409 Fournisseurs débiteurs (trop-payé)
  IF v_over > 0 THEN
    v_acc := accounting_resolve_account(p.company_id, '409');
    IF v_acc IS NOT NULL THEN
      v_pos := v_pos + 1;
      INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
      VALUES (p.company_id, v_entry, v_acc, 'Avance / trop-payé fournisseur', v_over, 0, v_pos);
    END IF;
  END IF;

  PERFORM accounting_finalize_entry(v_entry);
END;
$$;

-- -------------------------------------------------------------- DÉPENSES ----
CREATE OR REPLACE FUNCTION public.accounting_sync_expense(p_expense_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  e RECORD; st RECORD;
  v_enabled BOOLEAN; v_journal UUID; v_jcode TEXT; v_fy UUID; v_entry UUID;
  v_amount NUMERIC(18,4); v_charge_code TEXT; v_credit_code TEXT; v_method TEXT;
  v_dacc UUID; v_cacc UUID;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.accounting_entries
   WHERE company_id = e.company_id AND source_type = 'expense' AND source_id = p_expense_id;

  SELECT accounting_module_enabled INTO v_enabled FROM public.companies WHERE id = e.company_id;
  IF NOT COALESCE(v_enabled, false) THEN RETURN; END IF;

  v_amount := COALESCE(e.amount, 0);
  IF v_amount <= 0 THEN RETURN; END IF;

  SELECT * INTO st FROM public.accounting_settings WHERE company_id = e.company_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_method := lower(coalesce(e.payment_method, 'cash'));
  v_jcode := CASE WHEN v_method IN ('bank','card','transfer') THEN 'BQ'
                  WHEN v_method IN ('cash','mobile_money') THEN 'CA'
                  ELSE 'OD' END;
  SELECT id INTO v_journal FROM public.accounting_journals WHERE company_id = e.company_id AND code = v_jcode;
  IF v_journal IS NULL THEN
    SELECT id INTO v_journal FROM public.accounting_journals WHERE company_id = e.company_id AND code = 'OD';
  END IF;
  IF v_journal IS NULL THEN RETURN; END IF;

  -- Compte de charge selon la catégorie (défaut 605 Autres achats)
  v_charge_code := CASE lower(coalesce(e.category, ''))
    WHEN 'loyer' THEN '622'
    WHEN 'salaires' THEN '661'
    WHEN 'transport' THEN '616'
    WHEN 'electricite' THEN '605'
    WHEN 'eau' THEN '605'
    WHEN 'carburant' THEN '605'
    WHEN 'communication' THEN '628'
    WHEN 'telephone' THEN '628'
    WHEN 'internet' THEN '628'
    WHEN 'entretien' THEN '624'
    WHEN 'assurance' THEN '625'
    WHEN 'publicite' THEN '627'
    WHEN 'impots' THEN '641'
    WHEN 'banque' THEN '631'
    WHEN 'formation' THEN '633'
    ELSE '605'
  END;

  v_credit_code := CASE
    WHEN v_method = 'credit' THEN st.account_supplier
    ELSE accounting_treasury_code(st.account_cash, st.account_bank, st.account_mobile_money, v_method)
  END;

  v_dacc := accounting_resolve_account(e.company_id, v_charge_code);
  v_cacc := accounting_resolve_account(e.company_id, v_credit_code);
  IF v_dacc IS NULL OR v_cacc IS NULL THEN RETURN; END IF;

  SELECT id INTO v_fy FROM public.accounting_fiscal_years
   WHERE company_id = e.company_id AND e.expense_date BETWEEN start_date AND end_date
   ORDER BY start_date DESC LIMIT 1;

  INSERT INTO public.accounting_entries
    (company_id, fiscal_year_id, journal_id, entry_date, reference, label, source_type, source_id, created_by)
  VALUES
    (e.company_id, v_fy, v_journal, e.expense_date, e.reference,
     'Dépense ' || COALESCE(NULLIF(btrim(e.label), ''), e.category), 'expense', e.id, e.created_by)
  RETURNING id INTO v_entry;

  INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
  VALUES (e.company_id, v_entry, v_dacc, COALESCE(NULLIF(btrim(e.label), ''), e.category), v_amount, 0, 1);
  INSERT INTO public.accounting_entry_lines(company_id, entry_id, account_id, label, debit, credit, position)
  VALUES (e.company_id, v_entry, v_cacc, 'Règlement ' || v_method, 0, v_amount, 2);

  PERFORM accounting_finalize_entry(v_entry);
END;
$$;

-- ============================================================================
-- Wrappers trigger : ne JAMAIS bloquer l'opération métier (EXCEPTION avalée).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_accounting_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN PERFORM accounting_sync_sale(COALESCE(NEW.id, OLD.id));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_accounting_sale_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN PERFORM accounting_sync_sale(COALESCE(NEW.sale_id, OLD.sale_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_accounting_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN PERFORM accounting_sync_purchase(COALESCE(NEW.id, OLD.id));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_accounting_purchase_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN PERFORM accounting_sync_purchase(COALESCE(NEW.purchase_id, OLD.purchase_id));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_accounting_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN PERFORM accounting_sync_expense(COALESCE(NEW.id, OLD.id));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS accounting_sale_sync ON public.sales;
CREATE TRIGGER accounting_sale_sync
  AFTER INSERT OR UPDATE OF status, subtotal, discount, tax, total ON public.sales
  FOR EACH ROW EXECUTE PROCEDURE public.trg_accounting_sale();

DROP TRIGGER IF EXISTS accounting_sale_payment_sync ON public.sale_payments;
CREATE TRIGGER accounting_sale_payment_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.sale_payments
  FOR EACH ROW EXECUTE PROCEDURE public.trg_accounting_sale_payment();

DROP TRIGGER IF EXISTS accounting_purchase_sync ON public.purchases;
CREATE TRIGGER accounting_purchase_sync
  AFTER INSERT OR UPDATE OF status, total ON public.purchases
  FOR EACH ROW EXECUTE PROCEDURE public.trg_accounting_purchase();

DROP TRIGGER IF EXISTS accounting_purchase_payment_sync ON public.purchase_payments;
CREATE TRIGGER accounting_purchase_payment_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_payments
  FOR EACH ROW EXECUTE PROCEDURE public.trg_accounting_purchase_payment();

DROP TRIGGER IF EXISTS accounting_expense_sync ON public.expenses;
CREATE TRIGGER accounting_expense_sync
  AFTER INSERT OR UPDATE OF amount, category, payment_method, expense_date, label ON public.expenses
  FOR EACH ROW EXECUTE PROCEDURE public.trg_accounting_expense();

-- ============================================================================
-- Backfill à la demande : régénère les écritures d'une période (owner / super admin).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accounting_backfill(p_company_id UUID, p_from DATE, p_to DATE)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r RECORD; v_count INT := 0;
BEGIN
  IF NOT (is_super_admin() OR p_company_id IN (SELECT * FROM current_user_company_ids())) THEN
    RAISE EXCEPTION 'Accès refusé à cette entreprise.';
  END IF;

  FOR r IN SELECT id FROM public.sales
    WHERE company_id = p_company_id AND status = 'completed'
      AND created_at::date BETWEEN p_from AND p_to
  LOOP PERFORM accounting_sync_sale(r.id); v_count := v_count + 1; END LOOP;

  FOR r IN SELECT id FROM public.purchases
    WHERE company_id = p_company_id AND status NOT IN ('draft','cancelled')
      AND created_at::date BETWEEN p_from AND p_to
  LOOP PERFORM accounting_sync_purchase(r.id); v_count := v_count + 1; END LOOP;

  FOR r IN SELECT id FROM public.expenses
    WHERE company_id = p_company_id AND expense_date BETWEEN p_from AND p_to
  LOOP PERFORM accounting_sync_expense(r.id); v_count := v_count + 1; END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accounting_backfill(UUID, DATE, DATE) TO authenticated;
