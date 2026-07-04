/** Types du module Comptabilité (SYSCOHADA — Système Normal). */

export type AccountingAccount = {
  id: string;
  code: string;
  label: string;
  accountClass: number;
  parentCode: string | null;
  isActive: boolean;
};

export type AccountingJournalKind =
  | "sales"
  | "purchases"
  | "cash"
  | "bank"
  | "od"
  | "payroll";

export type AccountingJournal = {
  id: string;
  code: string;
  label: string;
  kind: AccountingJournalKind;
  isActive: boolean;
  position: number;
};

export type AccountingFiscalYear = {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
};

export type AccountingSourceType =
  | "manual"
  | "sale"
  | "purchase"
  | "expense"
  | "payslip";

export type AccountingEntryLine = {
  id: string;
  accountCode: string;
  accountLabel: string;
  label: string | null;
  debit: number;
  credit: number;
  position: number;
};

export type AccountingEntry = {
  id: string;
  entryDate: string;
  journalCode: string;
  journalLabel: string;
  reference: string | null;
  label: string;
  sourceType: AccountingSourceType;
  sourceId: string | null;
  lines: AccountingEntryLine[];
  totalDebit: number;
  totalCredit: number;
};

export type AccountingSettings = {
  vatEnabled: boolean;
  vatRate: number;
  accountClient: string;
  accountSupplier: string;
  accountSales: string;
  accountPurchases: string;
  accountVatCollected: string;
  accountVatDeductible: string;
  accountCash: string;
  accountBank: string;
  accountMobileMoney: string;
};

/** Ligne saisie manuellement (formulaire) avant envoi au RPC. */
export type ManualEntryLineInput = {
  accountId: string;
  label: string;
  debit: number;
  credit: number;
};
