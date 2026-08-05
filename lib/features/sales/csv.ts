import type { SaleItem } from "./types";
import type { ProSheetCell } from "@/lib/utils/spreadsheet-export-pro";
import { escapeCsv } from "@/lib/utils/csv";
import { saleSellerLabel, saleStoreLabel } from "./sale-display";
import { SETTLEMENT_LABELS, saleSettlement } from "./sale-settlement";

const SALES_HEADERS = [
  "numero",
  "date",
  "boutique",
  "vente_par",
  "client",
  "statut",
  "sous_total",
  "remise",
  "tva",
  "total",
  "acompte",
  "reste_du",
  "reglement",
] as const;

export function salesToSpreadsheetMatrix(
  sales: SaleItem[],
  stores: { id: string; name: string }[] = [],
): { headers: string[]; rows: ProSheetCell[][] } {
  const rows: ProSheetCell[][] = sales.map((s) => {
    const date = s.created_at?.slice(0, 19) ?? "";
    const st = saleSettlement(s);
    return [
      s.sale_number ?? "",
      date,
      saleStoreLabel(s, stores),
      saleSellerLabel(s),
      s.customer?.name ?? "",
      s.status ?? "",
      Number(s.subtotal ?? 0),
      Number(s.discount ?? 0),
      Number(s.tax ?? 0),
      Number(s.total ?? 0),
      st.hasCredit ? st.downPayment : 0,
      st.remaining,
      SETTLEMENT_LABELS[st.kind],
    ];
  });
  return { headers: [...SALES_HEADERS], rows };
}

export function salesToCsv(
  sales: SaleItem[],
  stores: { id: string; name: string }[] = [],
): string {
  const { headers, rows } = salesToSpreadsheetMatrix(sales, stores);
  const esc = (v: ProSheetCell) =>
    typeof v === "number" ? String(v) : escapeCsv(String(v ?? ""));
  const lines = rows.map((r) => r.map(esc).join(","));
  return [headers.map(escapeCsv).join(","), ...lines].join("\n");
}
