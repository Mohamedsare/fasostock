import { escapeCsv } from "@/lib/utils/csv";
import type { ProSheetCell } from "@/lib/utils/spreadsheet-export-pro";
import type { PurchaseListItem } from "./types";

const PURCHASE_HEADERS = [
  "Date",
  "Boutique",
  "Fournisseur",
  "Référence",
  "Statut",
  "Total",
] as const;

export function purchasesToSpreadsheetMatrix(rows: PurchaseListItem[]): {
  headers: string[];
  rows: ProSheetCell[][];
} {
  const data: ProSheetCell[][] = rows.map((r) => [
    new Date(r.createdAt).toISOString().slice(0, 19).replace("T", " "),
    r.storeName,
    r.supplierName,
    r.reference ?? "",
    r.status,
    Number(r.total),
  ]);
  return { headers: [...PURCHASE_HEADERS], rows: data };
}

function formatPurchaseDateFr(isoLike: string): string {
  try {
    return new Date(isoLike).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return isoLike;
  }
}

export function purchasesToCsv(rows: PurchaseListItem[]): string {
  const { headers, rows: matrix } = purchasesToSpreadsheetMatrix(rows);
  const lines = matrix.map((line) =>
    line
      .map((v, i) => {
        if (i === 0 && typeof v === "string") {
          return escapeCsv(formatPurchaseDateFr(v));
        }
        return typeof v === "number" ? String(v) : escapeCsv(String(v ?? ""));
      })
      .join(","),
  );
  return [headers.map(escapeCsv).join(","), ...lines].join("\n");
}
