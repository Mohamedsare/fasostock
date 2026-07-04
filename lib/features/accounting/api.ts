"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  AccountingAccount,
  AccountingEntry,
  AccountingEntryLine,
  AccountingFiscalYear,
  AccountingJournal,
  AccountingJournalKind,
  AccountingSettings,
  AccountingSourceType,
  ManualEntryLineInput,
} from "./types";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Premier élément d'une relation Supabase (objet ou tableau selon la cardinalité). */
function one<T>(rel: unknown): T | null {
  if (Array.isArray(rel)) return (rel[0] as T | undefined) ?? null;
  return (rel as T | null) ?? null;
}

export async function listAccountingAccounts(companyId: string): Promise<AccountingAccount[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("accounting_accounts")
    .select("id, code, label, account_class, parent_code, is_active")
    .eq("company_id", companyId)
    .order("code", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      code: String(r.code ?? ""),
      label: String(r.label ?? ""),
      accountClass: toNum(r.account_class),
      parentCode: r.parent_code != null ? String(r.parent_code) : null,
      isActive: r.is_active !== false,
    };
  });
}

export async function listAccountingJournals(companyId: string): Promise<AccountingJournal[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("accounting_journals")
    .select("id, code, label, kind, is_active, position")
    .eq("company_id", companyId)
    .order("position", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      code: String(r.code ?? ""),
      label: String(r.label ?? ""),
      kind: (String(r.kind ?? "od") as AccountingJournalKind),
      isActive: r.is_active !== false,
      position: toNum(r.position),
    };
  });
}

export async function listAccountingFiscalYears(companyId: string): Promise<AccountingFiscalYear[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("accounting_fiscal_years")
    .select("id, code, start_date, end_date, status")
    .eq("company_id", companyId)
    .order("start_date", { ascending: false });
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      code: String(r.code ?? ""),
      startDate: String(r.start_date ?? ""),
      endDate: String(r.end_date ?? ""),
      status: String(r.status ?? "open") === "closed" ? "closed" : "open",
    };
  });
}

/**
 * Vrai si le plan comptable de l'entreprise est amorcé (au moins un compte).
 * Sert à afficher un bouton « Initialiser la comptabilité » en dernier recours
 * (le trigger DB amorce normalement à l'activation par le super admin).
 */
export async function accountingIsSeeded(companyId: string): Promise<boolean> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("accounting_accounts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (error) throw mapSupabaseError(error);
  return (count ?? 0) > 0;
}

/** Amorce (idempotent) le plan comptable / journaux / exercice pour l'entreprise. */
export async function seedAccounting(companyId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("seed_accounting_defaults", { p_company_id: companyId });
  if (error) throw mapSupabaseError(error);
}

export async function listAccountingEntries(params: {
  companyId: string;
  from: string;
  to: string;
  journalId: string | null;
}): Promise<AccountingEntry[]> {
  const supabase = createClient();
  let q = supabase
    .from("accounting_entries")
    .select(
      "id, entry_date, reference, label, source_type, source_id, " +
        "journal:accounting_journals(code, label), " +
        "lines:accounting_entry_lines(id, label, debit, credit, position, account:accounting_accounts(code, label))",
    )
    .eq("company_id", params.companyId)
    .gte("entry_date", params.from)
    .lte("entry_date", params.to);
  if (params.journalId) q = q.eq("journal_id", params.journalId);
  const { data, error } = await q
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw mapSupabaseError(error);

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const r = row;
    const journal = one<Record<string, unknown>>(r.journal);
    const rawLines = Array.isArray(r.lines) ? (r.lines as Record<string, unknown>[]) : [];
    const lines: AccountingEntryLine[] = rawLines
      .map((l) => {
        const account = one<Record<string, unknown>>(l.account);
        return {
          id: String(l.id),
          accountCode: account?.code != null ? String(account.code) : "",
          accountLabel: account?.label != null ? String(account.label) : "",
          label: l.label != null ? String(l.label) : null,
          debit: toNum(l.debit),
          credit: toNum(l.credit),
          position: toNum(l.position),
        };
      })
      .sort((a, b) => a.position - b.position);
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    return {
      id: String(r.id),
      entryDate: String(r.entry_date ?? ""),
      journalCode: journal?.code != null ? String(journal.code) : "",
      journalLabel: journal?.label != null ? String(journal.label) : "",
      reference: r.reference != null ? String(r.reference) : null,
      label: String(r.label ?? ""),
      sourceType: (String(r.source_type ?? "manual") as AccountingSourceType),
      sourceId: r.source_id != null ? String(r.source_id) : null,
      lines,
      totalDebit,
      totalCredit,
    };
  });
}

/** Passe une écriture manuelle équilibrée via le RPC (validation côté DB). */
export async function postManualEntry(params: {
  companyId: string;
  journalId: string;
  entryDate: string;
  label: string;
  reference: string | null;
  lines: ManualEntryLineInput[];
}): Promise<string> {
  const supabase = createClient();
  const payloadLines = params.lines.map((l) => ({
    account_id: l.accountId,
    label: l.label?.trim() || null,
    debit: Math.max(0, Math.round(l.debit)),
    credit: Math.max(0, Math.round(l.credit)),
  }));
  const { data, error } = await supabase.rpc("accounting_post_entry", {
    p_company_id: params.companyId,
    p_journal_id: params.journalId,
    p_entry_date: params.entryDate,
    p_label: params.label.trim(),
    p_reference: params.reference?.trim() || null,
    p_lines: payloadLines,
  });
  if (error) throw mapSupabaseError(error);
  return String(data ?? "");
}

export async function getAccountingSettings(companyId: string): Promise<AccountingSettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("accounting_settings")
    .select(
      "vat_enabled, vat_rate, account_client, account_supplier, account_sales, account_purchases, account_vat_collected, account_vat_deductible, account_cash, account_bank, account_mobile_money",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    vatEnabled: r.vat_enabled === true,
    vatRate: toNum(r.vat_rate),
    accountClient: String(r.account_client ?? "411"),
    accountSupplier: String(r.account_supplier ?? "401"),
    accountSales: String(r.account_sales ?? "701"),
    accountPurchases: String(r.account_purchases ?? "601"),
    accountVatCollected: String(r.account_vat_collected ?? "4431"),
    accountVatDeductible: String(r.account_vat_deductible ?? "4452"),
    accountCash: String(r.account_cash ?? "571"),
    accountBank: String(r.account_bank ?? "521"),
    accountMobileMoney: String(r.account_mobile_money ?? "551"),
  };
}

export async function updateAccountingSettings(
  companyId: string,
  patch: Partial<AccountingSettings>,
): Promise<void> {
  const supabase = createClient();
  const row: Record<string, unknown> = {};
  if (patch.vatEnabled !== undefined) row.vat_enabled = patch.vatEnabled;
  if (patch.vatRate !== undefined) row.vat_rate = patch.vatRate;
  if (patch.accountClient !== undefined) row.account_client = patch.accountClient.trim();
  if (patch.accountSupplier !== undefined) row.account_supplier = patch.accountSupplier.trim();
  if (patch.accountSales !== undefined) row.account_sales = patch.accountSales.trim();
  if (patch.accountPurchases !== undefined) row.account_purchases = patch.accountPurchases.trim();
  if (patch.accountVatCollected !== undefined) row.account_vat_collected = patch.accountVatCollected.trim();
  if (patch.accountVatDeductible !== undefined) row.account_vat_deductible = patch.accountVatDeductible.trim();
  if (patch.accountCash !== undefined) row.account_cash = patch.accountCash.trim();
  if (patch.accountBank !== undefined) row.account_bank = patch.accountBank.trim();
  if (patch.accountMobileMoney !== undefined) row.account_mobile_money = patch.accountMobileMoney.trim();
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("accounting_settings").update(row).eq("company_id", companyId);
  if (error) throw mapSupabaseError(error);
}

/** Régénère les écritures automatiques d'une période (ventes/achats/dépenses). Renvoie le nombre traité. */
export async function backfillAccounting(companyId: string, from: string, to: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("accounting_backfill", {
    p_company_id: companyId,
    p_from: from,
    p_to: to,
  });
  if (error) throw mapSupabaseError(error);
  return typeof data === "number" ? data : toNum(data);
}

/** Télécharge les états financiers (bilan + résultat + balance) en PDF (rendu serveur). */
export async function downloadAccountingStatementsPdf(params: {
  companyId: string;
  from: string;
  to: string;
}): Promise<void> {
  const res = await fetch("/api/pdf/accounting-statements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try {
      const j = JSON.parse(t) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* texte brut */
    }
    throw new Error(msg || `Échec PDF (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `etats-financiers-${params.from}_${params.to}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Supprime une écriture (les lignes suivent en cascade). Réservé aux écritures manuelles. */
export async function deleteAccountingEntry(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("accounting_entries")
    .delete()
    .eq("id", id)
    .eq("source_type", "manual");
  if (error) throw mapSupabaseError(error);
}
