import { escapeCsv } from "@/lib/utils/csv";
import type { ProSheetCell } from "@/lib/utils/spreadsheet-export-pro";
import { invoiceDaysLate, invoiceDue } from "./payables-math";
import {
  SUPPLIER_INVOICE_SOURCE_LABELS,
  SUPPLIER_INVOICE_STATUS_LABELS,
  SUPPLIER_PAYMENT_METHOD_LABELS,
  type Supplier,
  type SupplierAccount,
  type SupplierInvoice,
  type SupplierPayment,
} from "./types";

const SUPPLIER_HEADERS = [
  "Nom",
  "Contact",
  "Téléphone",
  "Email",
  "Adresse",
  "Notes",
] as const;

export function suppliersToSpreadsheetMatrix(rows: Supplier[]): {
  headers: string[];
  rows: ProSheetCell[][];
} {
  const data: ProSheetCell[][] = rows.map((s) => [
    s.name,
    s.contact ?? "",
    s.phone ?? "",
    s.email ?? "",
    s.address ?? "",
    s.notes ?? "",
  ]);
  return { headers: [...SUPPLIER_HEADERS], rows: data };
}

export function suppliersToCsv(rows: Supplier[]): string {
  const { headers, rows: matrix } = suppliersToSpreadsheetMatrix(rows);
  const lines = matrix.map((line) => line.map((v) => escapeCsv(String(v ?? ""))).join(","));
  return [headers.map(escapeCsv).join(","), ...lines].join("\n");
}

const ACCOUNT_HEADERS = [
  "Fournisseur",
  "Code",
  "Téléphone",
  "Ville",
  "Délai (j)",
  "Total facturé",
  "Total réglé",
  "Reste à payer",
  "Dont en retard",
  "Sous 7 jours",
  "Avance",
  "Dettes ouvertes",
  "Retard max (j)",
  "Échéance la plus ancienne",
  "Dernier règlement",
  "Plafond",
  "Plafond dépassé",
] as const;

/** Balance fournisseurs — l'export qu'on emmène chez le comptable. */
export function supplierAccountsToSpreadsheetMatrix(rows: SupplierAccount[]): {
  headers: string[];
  rows: ProSheetCell[][];
} {
  const data: ProSheetCell[][] = rows.map((a) => [
    a.name,
    a.code ?? "",
    a.phone ?? "",
    a.city ?? "",
    a.payment_terms_days,
    a.stats.totalDue,
    a.stats.totalPaid,
    a.stats.balance,
    a.stats.overdueAmount,
    a.stats.dueSoonAmount,
    a.stats.creditAvailable,
    a.stats.openInvoices,
    a.daysLate,
    a.stats.oldestDueDate ?? "",
    a.stats.lastPaymentAt ? a.stats.lastPaymentAt.slice(0, 10) : "",
    a.credit_limit,
    a.overLimit ? "OUI" : "",
  ]);
  return { headers: [...ACCOUNT_HEADERS], rows: data };
}

const INVOICE_HEADERS = [
  "Fournisseur",
  "N° pièce",
  "Libellé",
  "Origine",
  "Date",
  "Échéance",
  "Retard (j)",
  "Montant",
  "Réglé",
  "Reste à payer",
  "Statut",
  "Notes",
] as const;

export function supplierInvoicesToSpreadsheetMatrix(rows: SupplierInvoice[]): {
  headers: string[];
  rows: ProSheetCell[][];
} {
  const data: ProSheetCell[][] = rows.map((i) => {
    const late = invoiceDaysLate(i);
    return [
      i.supplierName,
      i.invoiceNumber ?? "",
      i.label ?? "",
      SUPPLIER_INVOICE_SOURCE_LABELS[i.source],
      i.invoiceDate,
      i.dueDate,
      invoiceDue(i) > 0 && late > 0 ? late : 0,
      i.amount,
      i.paidAmount,
      invoiceDue(i),
      SUPPLIER_INVOICE_STATUS_LABELS[i.status],
      i.notes ?? "",
    ];
  });
  return { headers: [...INVOICE_HEADERS], rows: data };
}

const PAYMENT_HEADERS = [
  "Date",
  "Fournisseur",
  "Montant",
  "Imputé",
  "Avance",
  "Mode",
  "Référence",
  "Origine",
  "Notes",
] as const;

export function supplierPaymentsToSpreadsheetMatrix(rows: SupplierPayment[]): {
  headers: string[];
  rows: ProSheetCell[][];
} {
  const data: ProSheetCell[][] = rows.map((p) => [
    p.paidAt.slice(0, 10),
    p.supplierName,
    p.amount,
    p.allocatedAmount,
    Math.max(0, p.amount - p.allocatedAmount),
    SUPPLIER_PAYMENT_METHOD_LABELS[p.method],
    p.reference ?? "",
    p.source === "purchase" ? "Module Achats" : "Espace Fournisseurs",
    p.notes ?? "",
  ]);
  return { headers: [...PAYMENT_HEADERS], rows: data };
}
