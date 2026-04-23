import { escapeCsv } from "@/lib/utils/csv";
import type { ProSheetCell } from "@/lib/utils/spreadsheet-export-pro";
import type { Supplier } from "./types";

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
