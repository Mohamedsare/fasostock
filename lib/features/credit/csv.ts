import { format } from "date-fns";
import type { ProSheetCell } from "@/lib/utils/spreadsheet-export-pro";
import { escapeCsv } from "@/lib/utils/csv";
import {
  CREDIT_STATUS_LABELS,
  creditLineStatus,
  daysOverdue,
  downPaymentTotal,
  effectiveDueDate,
  paidTotal,
  remainingTotal,
  repaidAfterSaleTotal,
} from "@/lib/features/credit/credit-math";
import type { CreditSaleRow } from "@/lib/features/credit/types";
import { operationYmd } from "@/lib/utils/operation-datetime";

const CREDIT_SALE_HEADERS = [
  "Référence",
  "Client",
  "Téléphone",
  "Date",
  "Boutique",
  "Total",
  "Acompte (à la vente)",
  "Remboursé (après vente)",
  "Encaissé (total)",
  "Reste",
  "Échéance",
  "Statut",
  "Retard (jours)",
  "Vendeur",
] as const;

export function creditSalesToSpreadsheetMatrix(sales: CreditSaleRow[]): {
  headers: string[];
  rows: ProSheetCell[][];
} {
  const rows: ProSheetCell[][] = sales.map((s) => [
    s.sale_number ?? "",
    s.customer?.name ?? "",
    s.customer?.phone ?? "",
    operationYmd(s.created_at),
    s.store?.name ?? "",
    Number(s.total),
    Number(downPaymentTotal(s)),
    Number(repaidAfterSaleTotal(s)),
    Number(paidTotal(s)),
    Number(remainingTotal(s)),
    format(effectiveDueDate(s), "yyyy-MM-dd"),
    CREDIT_STATUS_LABELS[creditLineStatus(s)],
    daysOverdue(s),
    s.created_by_label ?? "",
  ]);
  return { headers: [...CREDIT_SALE_HEADERS], rows };
}

export function creditSalesToCsv(sales: CreditSaleRow[]): string {
  const { headers, rows } = creditSalesToSpreadsheetMatrix(sales);
  const esc = (v: ProSheetCell) =>
    typeof v === "number" ? String(v) : escapeCsv(String(v ?? ""));
  const lines = rows.map((r) => r.map(esc).join(","));
  return [headers.map(escapeCsv).join(","), ...lines].join("\n");
}
